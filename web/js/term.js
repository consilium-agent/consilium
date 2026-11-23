// The live CLI on the front page: the same commands as the terminal app, answered by the desk API.
import { api, askStream, fmt, signed } from "./common.js";

const out = document.getElementById("cli-out");
const form = document.getElementById("cli-form");
const input = document.getElementById("cli-in");
if (out && form && input) start();

function start() {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const AGENTS = ["chair", "scout", "quant", "risk", "exec"];
  const COLOR = { scout: "t-em", quant: "t-gold", risk: "t-ok", exec: "t-cy" };
  const history = [];
  const typed = [];
  let cursor = 0;
  let busy = false;

  const line = (html = "") => { out.insertAdjacentHTML("beforeend", html + "\n"); out.scrollTop = out.scrollHeight; };
  const vote = (v) => (["BUY", "APPROVE", "READY"].includes(v) ? `<span class="t-ok">${v}</span>` : ["SELL", "VETO", "BLOCK"].includes(v) ? `<span class="t-bad">${v}</span>` : `<span class="t-dim">${v}</span>`);
  const pad = (s, n) => s + " ".repeat(Math.max(0, n - s.length));

  function banner() {
    line('<span class="t-em">consil</span> <span class="t-dim">v0.1.0 · live desk · paper mode</span>');
    line('<span class="t-dim">type</span> help <span class="t-dim">or try</span> council NVDA');
    line();
  }

  const COMMANDS = {
    help() {
      line("  council &lt;SYM&gt;            four agents vote on one market");
      line("  markets [crypto|stocks]  live markets: stock tokens and crypto");
      line("  ask [--agent risk] ...   ask the desk, or one agent");
      line("  agents                   who sits on the council");
      line("  install                  get the app for your terminal");
      line("  clear");
      line('<span class="t-dim">  anything else is sent to the desk as a question</span>');
    },
    agents() {
      line(`  <span class="t-em">SCOUT</span>  trend: EMA20 vs EMA50 on 1h candles`);
      line(`  <span class="t-gold">QUANT</span>  stretch: RSI14, under 35 buy, over 65 sell`);
      line(`  <span class="t-ok">RISK</span>   limits: spread, volume, volatility. Holds the veto`);
      line(`  <span class="t-cy">EXEC</span>   book: fills a 250 USDG ticket within 50 bps`);
      line(`  <span class="t-dim">a trade needs 3 of 4 behind it</span>`);
    },
    install() {
      line('<span class="t-dim"># Windows</span>');
      line(`irm ${esc(location.origin)}/install.ps1 | iex`);
      line('<span class="t-dim"># macOS / Linux</span>');
      line(`curl -fsSL ${esc(location.origin)}/install.sh | sh`);
    },
    clear() { out.innerHTML = ""; },
    async markets(args) {
      const want = (args[0] || "").toLowerCase().replace(/s$/, "");
      const { markets } = await api("/v1/markets" + (want === "crypto" || want === "stock" ? `?asset=${want}` : ""));
      line('<span class="t-dim">  SYMBOL        LAST      24H     VOLUME</span>');
      for (const m of markets.slice(0, 12)) {
        const ch = signed(m.change24hPct);
        line(`  <span class="t-b">${pad(esc(m.symbol), 8)}</span>${fmt(m.last).padStart(10)}  <span class="${m.change24hPct >= 0 ? "t-ok" : "t-bad"}">${ch.padStart(7)}</span>  ${("$" + m.dayVolumeUsd.toLocaleString("en-US")).padStart(12)}  <span class="t-dim">${m.asset === "crypto" ? m.kind : "stock"}</span>`);
      }
    },
    async council(args) {
      const sym = (args[0] || "").toUpperCase();
      if (!sym) return line('<span class="t-bad">usage: council NVDA</span>');
      line(`<span class="t-dim">  convening on ${esc(sym)}…</span>`);
      const k = (await api("/v1/council/" + encodeURIComponent(sym))).council;
      line(`  <span class="t-b">${esc(k.symbol)}</span> <span class="t-dim">@</span> ${fmt(k.price)} USDG  <span class="${k.change24hPct >= 0 ? "t-ok" : "t-bad"}">${signed(k.change24hPct)}</span>`);
      for (const n of ["scout", "quant", "risk", "exec"]) {
        const v = k.votes[n];
        const why = k.brief?.[n] || Object.entries(v.facts).map(([a, b]) => `${a}=${b}`).join(" ");
        line(`  <span class="${COLOR[n]}">▲ ${pad(n.toUpperCase(), 6)}</span> ${vote(v.vote)}${" ".repeat(Math.max(1, 8 - v.vote.length))}<span class="t-dim">${esc(why)}</span>`);
      }
      const a = k.verdict.action;
      line(`  <span class="t-b">VERDICT</span>  ${a === "HOLD" ? '<span class="t-dim">HOLD</span>' : vote(a)}  ${k.verdict.behind}/4 behind · ${esc(k.verdict.reason)}`);
      history.push({ role: "user", content: `Run the council on ${k.symbol}.` }, { role: "assistant", content: `${k.symbol}: ${["scout", "quant", "risk", "exec"].map((n) => `${n.toUpperCase()} ${k.votes[n].vote}`).join(", ")}. VERDICT ${a}, ${k.verdict.reason}` });
    },
    async ask(args) {
      let agent = "chair";
      const i = args.indexOf("--agent");
      if (i > -1) { agent = (args[i + 1] || "").toLowerCase(); args.splice(i, 2); }
      if (!AGENTS.includes(agent)) return line(`<span class="t-bad">agent must be one of ${AGENTS.join(", ")}</span>`);
      const q = args.join(" ").trim();
      if (!q) return line('<span class="t-bad">usage: ask why would RISK veto AMD?</span>');
      const label = agent === "chair" ? "consil" : agent;
      out.insertAdjacentHTML("beforeend", `  <span class="t-em">${label} ›</span> `);
      const span = document.createElement("span");
      out.append(span);
      const answer = await askStream(q, history.slice(-8), (t) => { span.textContent += t; out.scrollTop = out.scrollHeight; }, agent);
      line();
      history.push({ role: "user", content: q }, { role: "assistant", content: answer });
    },
  };

  async function run(raw) {
    const text = raw.trim().replace(/^consil\s+/i, "");
    line(`<span class="t-dim">$</span> <span class="t-b">consil ${esc(text)}</span>`);
    if (!text) return;
    const [cmd, ...args] = text.split(/\s+/);
    const fn = COMMANDS[cmd.toLowerCase()];
    busy = true;
    input.disabled = true;
    try {
      if (fn) await fn(args);
      else await COMMANDS.ask([cmd, ...args]);
    } catch (err) {
      line(`<span class="t-bad">  ! ${esc(err.message)}</span>`);
    } finally {
      busy = false;
      input.disabled = false;
      if (document.activeElement === document.body) input.focus({ preventScroll: true });
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const v = input.value;
    input.value = "";
    if (v.trim()) { typed.push(v); cursor = typed.length; }
    run(v);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && cursor > 0) { input.value = typed[--cursor]; e.preventDefault(); }
    if (e.key === "ArrowDown") { cursor = Math.min(typed.length, cursor + 1); input.value = typed[cursor] || ""; e.preventDefault(); }
  });
  document.querySelectorAll("[data-cli]").forEach((b) => b.addEventListener("click", () => { if (!busy) run(b.dataset.cli); }));

  banner();
  // Show it working once the hero is on screen.
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(() => { if (!busy) run("council NVDA"); }, 1400); }
  });
  io.observe(out);
}
