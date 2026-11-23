// CONSILIUM terminal desk (paper mode). Market data and the four agents run on this machine,
// straight against Lighter's public API. Answers and agent briefs come from the CONSILIUM desk
// API, or from Claude with your own key (consil key sk-ant-...).
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { convene, snapshot, marketContext, TICKET_USD } from "../../server/council.mjs";
import { makeAi } from "../../server/ai.mjs";

export const VERSION = "0.2.0";
const BAKED_API = "__CONSIL_API__";
const START_CASH = 1000;
const MIN_EVERY_S = 30;
const DESK_TIMEOUT_MS = 3000;

const HOME = process.env.CONSIL_HOME || join(homedir(), ".consilium");
const LEDGER = join(HOME, "ledger.json");
const CONFIG = join(HOME, "config.json");

const tty = (process.stdout.isTTY || Boolean(process.env.FORCE_COLOR)) && !process.env.NO_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { dim: paint("2"), bold: paint("1"), ember: paint("38;5;208"), green: paint("38;5;78"), red: paint("38;5;203"), gold: paint("38;5;179"), cyan: paint("38;5;80") };
const AGENT_COLOR = { scout: c.ember, quant: c.gold, risk: c.green, exec: c.cyan };
const voteColor = (v) => (["BUY", "APPROVE", "READY"].includes(v) ? c.green(v) : ["SELL", "VETO", "BLOCK"].includes(v) ? c.red(v) : c.dim(v));
const pad = (s, n) => s + " ".repeat(Math.max(0, n - String(s).replace(/\x1b\[[0-9;]*m/g, "").length));
const usd = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-");
const pct = (n) => (Number.isFinite(n) ? (n >= 0 ? c.green("+" + n.toFixed(2) + "%") : c.red(n.toFixed(2) + "%")) : "-");
const clearLine = () => { if (tty) process.stdout.write("\r\x1b[2K"); };
const status = (s) => { if (tty) process.stdout.write(c.dim("  " + s) + "\r"); };

// ---------- config ----------
function readConfig() {
  if (!existsSync(CONFIG)) return {};
  try { return JSON.parse(readFileSync(CONFIG, "utf8")); } catch { throw new Error(`config file is unreadable: ${CONFIG}`); }
}
function writeConfig(cfg) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function resolveApi(flagValue, env = process.env, cfg = {}) {
  const baked = BAKED_API.startsWith("__") ? "" : BAKED_API;
  return (flagValue || env.CONSIL_API || cfg.api || baked || "http://127.0.0.1:5120").replace(/\/$/, "");
}

// ---------- desk API ----------
let deskState = null;
async function deskOnline(api) {
  if (deskState !== null) return deskState;
  try {
    const res = await fetch(api + "/v1/health", { signal: AbortSignal.timeout(DESK_TIMEOUT_MS) });
    const d = await res.json();
    deskState = Boolean(res.ok && d.ok);
  } catch {
    deskState = false;
  }
  return deskState;
}
async function deskJson(api, path) {
  const res = await fetch(api + path, { signal: AbortSignal.timeout(60_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `desk answered ${res.status}`);
  return data;
}

// ---------- the desk ----------
export function createDesk({ api, key }) {
  const ai = makeAi(key);

  async function council(sym) {
    const symbol = String(sym || "").toUpperCase();
    if (!symbol) throw new Error("usage: consil council <SYMBOL>");
    if (!ai.hasModel() && (await deskOnline(api))) {
      try { return { ...(await deskJson(api, "/v1/council/" + encodeURIComponent(symbol))).council, source: "desk" }; } catch { /* fall back to local */ }
    }
    let k;
    try {
      k = await convene(symbol);
    } catch (err) {
      if (err.status === 404) throw new Error(`no spot market called ${symbol} (try: consil markets)`);
      throw new Error(`cannot reach Lighter market data (${err.message})`);
    }
    const brief = ai.hasModel() ? await ai.brief(k).catch(() => null) : null;
    return { ...k, brief, source: "local" };
  }

  async function* ask(question, history, agent = "chair") {
    if (ai.hasModel()) {
      yield* ai.askStream(question, history, await marketContext(question), agent);
      return;
    }
    if (!(await deskOnline(api))) {
      throw new Error(`the desk at ${api} is unreachable. Use your own Claude key instead: consil key sk-ant-...`);
    }
    const res = await fetch(api + "/v1/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history, agent }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `desk answered ${res.status}`);
    }
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = raw.match(/^event: (.*)$/m)?.[1];
        const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] || "{}");
        if (event === "text") yield data.text;
        if (event === "error") throw new Error(data.error);
      }
    }
  }

  return { council, ask, markets: () => snapshot(80), aiMode: ai.hasModel() ? "own key" : "desk API" };
}

// ---------- paper ledger ----------
export function emptyLedger() { return { cash: START_CASH, positions: {}, fills: [] }; }
function loadLedger() {
  if (!existsSync(LEDGER)) return emptyLedger();
  try { return JSON.parse(readFileSync(LEDGER, "utf8")); } catch { throw new Error(`ledger file is unreadable: ${LEDGER}`); }
}
function saveLedger(l) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

// Applies a verdict to the paper ledger and returns a new ledger; the old one is not changed.
export function applyVerdict(ledger, k, now = Date.now()) {
  const pos = ledger.positions[k.symbol] || { qty: 0, cost: 0 };
  const price = k.votes.exec.facts.avgPrice || k.price;
  if (k.verdict.action === "BUY" && pos.qty === 0 && ledger.cash >= TICKET_USD) {
    const qty = TICKET_USD / price;
    return {
      cash: ledger.cash - TICKET_USD,
      positions: { ...ledger.positions, [k.symbol]: { qty, cost: TICKET_USD } },
      fills: [...ledger.fills, { at: now, symbol: k.symbol, side: "BUY", qty, price, usd: TICKET_USD, behind: k.verdict.behind }],
    };
  }
  if (k.verdict.action === "SELL" && pos.qty > 0) {
    const proceeds = pos.qty * price;
    const { [k.symbol]: _sold, ...rest } = ledger.positions;
    return {
      cash: ledger.cash + proceeds,
      positions: rest,
      fills: [...ledger.fills, { at: now, symbol: k.symbol, side: "SELL", qty: pos.qty, price, usd: proceeds, pnl: proceeds - pos.cost, behind: k.verdict.behind }],
    };
  }
  return ledger;
}

// ---------- commands ----------
function banner(desk) {
  console.log(c.ember("   ____ ___  _   _ ____ ___ _"));
  console.log(c.ember("  / ___/ _ \\| \\ | / ___|_ _| |".padEnd(36)) + c.dim("four agents. one trade."));
  console.log(c.ember(" | |  | | | |  \\| \\___ \\| || |".padEnd(36)) + c.dim(`v${VERSION} · paper mode`));
  console.log(c.ember(" | |__| |_| | |\\  |___) | || |___".padEnd(36)) + c.dim(`answers: ${desk.aiMode}`));
  console.log(c.ember("  \\____\\___/|_| \\_|____/___|_____|"));
  console.log();
}

async function cmdMarkets(desk, filter) {
  status("loading markets from Lighter…");
  const want = String(filter || "").toLowerCase().replace(/s$/, "");
  const list = (await desk.markets()).filter((m) => (want === "crypto" || want === "stock" ? m.asset === want : true));
  clearLine();
  console.log(c.dim("  SYMBOL          LAST       24H     24H VOLUME   MARKET"));
  for (const m of list) {
    const kind = m.asset === "crypto" ? c.gold(`crypto ${m.kind}`) : c.dim("stock token");
    console.log(`  ${pad(c.bold(m.symbol), 9)} ${usd(m.last).padStart(13)}   ${pad(pct(m.change24hPct), 8)} ${("$" + m.dayVolumeUsd.toLocaleString("en-US")).padStart(13)}   ${kind}`);
  }
}

export function formatCouncil(k) {
  const out = [`  ${c.bold(k.symbol)} ${c.dim("@")} ${usd(k.price)} ${k.kind === "perp" ? "USD (perp)" : "USDG"}  ${pct(k.change24hPct)}`, ""];
  for (const name of ["scout", "quant", "risk", "exec"]) {
    const v = k.votes[name];
    const line = k.brief?.[name] || Object.entries(v.facts).map(([a, b]) => `${a}=${b}`).join("  ");
    out.push(`  ${AGENT_COLOR[name]("▲ " + name.toUpperCase().padEnd(6))} ${pad(voteColor(v.vote), 8)} ${c.dim(line)}`);
  }
  const a = k.verdict.action;
  const tag = a === "HOLD" ? c.dim("HOLD") : a === "BUY" ? c.green("BUY") : c.red("SELL");
  out.push("", `  ${c.bold("VERDICT")}  ${tag}  ${k.verdict.behind}/4 behind · quorum ${k.quorum} · ${k.verdict.reason}`);
  if (k.brief?.chair) out.push(`  ${c.dim(k.brief.chair)}`);
  return out.join("\n");
}

async function cmdCouncil(desk, sym) {
  status(`convening on ${String(sym || "").toUpperCase()}…`);
  const k = await desk.council(sym);
  clearLine();
  console.log(formatCouncil(k));
  return k;
}

// Lets follow-up questions in the interactive desk refer to a council that was just shown.
function councilTurns(k) {
  const votes = ["scout", "quant", "risk", "exec"].map((n) => `${n.toUpperCase()} ${k.votes[n].vote}${k.brief?.[n] ? ": " + k.brief[n] : ""}`).join("\n");
  return [
    { role: "user", content: `Run the council on ${k.symbol}.` },
    { role: "assistant", content: `${k.symbol} at ${k.price} USDG.\n${votes}\nVERDICT ${k.verdict.action}, ${k.verdict.behind}/4 behind: ${k.verdict.reason}` },
  ];
}

async function cmdAsk(desk, question, history = [], agent = "chair") {
  if (!question) throw new Error('usage: consil ask "your question"');
  status("asking the desk…");
  let answer = "";
  let started = false;
  for await (const text of desk.ask(question, history, agent)) {
    if (!started) { clearLine(); process.stdout.write("  " + c.ember((agent === "chair" ? "consil" : agent) + " › ")); started = true; }
    answer += text;
    process.stdout.write(text.replace(/\n/g, "\n  "));
  }
  process.stdout.write("\n");
  history.push({ role: "user", content: question }, { role: "assistant", content: answer });
}

async function cmdWatch(desk, sym, everyS) {
  if (!sym) throw new Error("usage: consil watch <SYMBOL> [--every 60]");
  const every = Math.max(MIN_EVERY_S, Number(everyS) || 60);
  console.log(c.dim(`  watching ${sym.toUpperCase()} every ${every}s · paper ticket ${TICKET_USD} USDG · Ctrl+C to stop`));
  for (;;) {
    try {
      const k = await desk.council(sym);
      const before = loadLedger();
      const after = applyVerdict(before, k);
      const votes = ["scout", "quant", "risk", "exec"].map((n) => AGENT_COLOR[n](n[0].toUpperCase()) + ":" + voteColor(k.votes[n].vote)).join(" ");
      let note = c.dim(k.verdict.reason);
      if (after !== before) {
        saveLedger(after);
        const f = after.fills[after.fills.length - 1];
        note = (f.side === "BUY" ? c.green("PAPER BUY ") : c.red("PAPER SELL ")) + `${f.qty.toFixed(4)} @ ${usd(f.price)}` + (f.pnl != null ? `  pnl ${usd(f.pnl)}` : "");
      }
      console.log(`  ${c.dim(new Date().toLocaleTimeString())}  ${k.symbol} ${usd(k.price)}  ${votes}  → ${note}`);
    } catch (err) {
      console.log(`  ${c.red("!")} ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, every * 1000));
  }
}

async function cmdLedger(desk, arg) {
  if (arg === "--reset") {
    if (existsSync(LEDGER)) rmSync(LEDGER);
    return console.log(`  ledger reset to ${usd(START_CASH)} USDG paper cash`);
  }
  const l = loadLedger();
  const syms = Object.keys(l.positions);
  const prices = syms.length ? Object.fromEntries((await desk.markets()).map((m) => [m.symbol, m.last])) : {};
  let equity = l.cash;
  console.log(c.dim(`  ${LEDGER}`));
  for (const s of syms) {
    const p = l.positions[s];
    const value = p.qty * (prices[s] || 0);
    equity += value;
    console.log(`  ${pad(c.bold(s), 8)} ${p.qty.toFixed(4)} · cost ${usd(p.cost)} · now ${usd(value)} ${pct((value / p.cost - 1) * 100)}`);
  }
  if (!l.fills.length) console.log(c.dim("  no fills yet. Start one with: consil watch NVDA"));
  for (const f of l.fills.slice(-10)) console.log(c.dim(`  ${new Date(f.at).toLocaleString()}  ${f.side.padEnd(4)} ${f.symbol} ${f.qty.toFixed(4)} @ ${usd(f.price)}`));
  console.log(`  cash ${usd(l.cash)} · equity ${c.bold(usd(equity))} USDG ${pct((equity / START_CASH - 1) * 100)} since start`);
}

function cmdKey(arg) {
  const cfg = readConfig();
  if (!arg) return console.log(cfg.key ? `  key set (${cfg.key.slice(0, 10)}…). Answers use your own Claude key.` : "  no key set. Answers come from the CONSILIUM desk API.\n  set one with: consil key sk-ant-...");
  if (arg === "--clear") {
    const { key: _old, ...rest } = cfg;
    writeConfig(rest);
    return console.log("  key removed. Answers come from the CONSILIUM desk API.");
  }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(arg)) throw new Error("that does not look like an Anthropic API key (sk-ant-...)");
  writeConfig({ ...cfg, key: arg });
  console.log(`  key saved to ${CONFIG} (readable by your user only). Answers now use your own Claude key.`);
}

async function cmdStatus(api, desk) {
  const online = await deskOnline(api);
  let lighter = false;
  try { lighter = (await desk.markets()).length > 0; } catch { lighter = false; }
  const row = (k, ok, note) => console.log(`  ${k.padEnd(14)} ${ok ? c.green("ok  ") : c.red("down")}  ${c.dim(note)}`);
  row("market data", lighter, "api.rh.lighter.xyz (public, read-only)");
  row("desk API", online, api);
  console.log(`  ${"answers".padEnd(14)} ${desk.aiMode}`);
  console.log(`  ${"paper ledger".padEnd(14)} ${LEDGER}`);
  console.log(`  ${"version".padEnd(14)} ${VERSION}`);
}

function help() {
  console.log(`  ${c.bold("consil")} ${c.dim("· AI trading desk for Robinhood Chain stock tokens (paper mode)")}

  consil                            interactive desk
  consil ask "question"             ask the desk anything about the market
  consil ask --agent risk "..."     ask one agent: scout, quant, risk or exec
  consil markets [crypto|stocks]    live markets: stock tokens and crypto
  consil council <SYM>              four agents vote: SCOUT · QUANT · RISK · EXEC
  consil watch <SYM> [--every 60]   paper-trade on the council's verdicts
  consil ledger [--reset]           paper fills, positions and P&L
  consil key [sk-ant-...|--clear]   use your own Claude key for answers
  consil status                     check market data, desk API and key
  consil version

  ${c.dim("--api <url> or CONSIL_API=<url> points at another desk server. NO_COLOR=1 for plain output.")}
  ${c.dim("Paper mode: no orders are sent and no wallet is touched. Not financial advice.")}`);
}

async function interactive(api, desk) {
  banner(desk);
  console.log(c.dim("  Ask anything, or: /council NVDA · /markets · /watch NVDA · /ledger · /status · /help · /exit"));
  console.log();
  const history = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "  " + c.bold("you › ") });
  // Piped input closes readline early; buffered lines still arrive, but prompting would throw.
  let closed = false;
  rl.on("close", () => { closed = true; });
  const prompt = () => { if (!closed) rl.prompt(); };
  prompt();
  for await (const line of rl) {
    const [head, arg] = line.trim().split(/\s+/);
    try {
      if (!head) { /* empty line */ }
      else if (head === "/exit" || head === "/quit") break;
      else if (head === "/help") help();
      else if (head === "/markets") await cmdMarkets(desk, arg);
      else if (head === "/ledger") await cmdLedger(desk, arg);
      else if (head === "/status") await cmdStatus(api, desk);
      else if (head === "/council") history.push(...councilTurns(await cmdCouncil(desk, arg)));
      else if (head === "/watch") { rl.close(); return cmdWatch(desk, arg, 60); }
      else await cmdAsk(desk, line.trim(), history);
    } catch (err) {
      clearLine();
      console.log(`  ${c.red("!")} ${err.message}`);
    }
    console.log();
    prompt();
  }
  rl.close();
}

export async function main(args) {
  const argv = [...args];
  const take = (name) => {
    const i = argv.indexOf("--" + name);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    argv.splice(i, 2);
    return v;
  };
  const cfg = readConfig();
  const api = resolveApi(take("api"), process.env, cfg);
  const every = take("every");
  const agent = (take("agent") || "chair").toLowerCase();
  if (!["chair", "scout", "quant", "risk", "exec"].includes(agent)) throw new Error("--agent must be one of chair, scout, quant, risk, exec");
  const desk = createDesk({ api, key: process.env.CONSIL_ANTHROPIC_KEY || cfg.key || "" });
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case undefined: return interactive(api, desk);
    case "ask": return cmdAsk(desk, rest.join(" ").trim(), [], agent);
    case "markets": return cmdMarkets(desk, rest[0]);
    case "council": return cmdCouncil(desk, rest[0]);
    case "watch": return cmdWatch(desk, rest[0], every ?? rest[1]);
    case "ledger": return cmdLedger(desk, rest[0]);
    case "key": return cmdKey(rest[0]);
    case "status": return cmdStatus(api, desk);
    case "version": case "--version": case "-v": return console.log(VERSION);
    case "help": case "--help": case "-h": return help();
    default:
      if (cmd.startsWith("-")) throw new Error(`unknown option ${cmd} (see consil help)`);
      return cmdAsk(desk, [cmd, ...rest].join(" "));
  }
}
