// Live desk: a watchlist re-voted on a timer with the reader's own rules, a council card,
// an activity log, a browser paper ledger and a chat with any of the four agents.
import { api, askStream, fmt, signed, logo, AGENT_ICON } from "./common.js";
import { createLiveChart } from "./chart.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const START = 1000;
const MAX_LOG = 120;
const WATCH_CONCURRENCY = 3;
const KEYS = { ledger: "consilium.ledger.v1", rules: "consilium.rules.v1", watch: "consilium.watch.v1" };
const AGENT_ROLE = {
  chair: "The chair speaks for all four agents and the verdict.",
  scout: "SCOUT judges direction only: EMA20 against EMA50 and the 24h move.",
  quant: "QUANT judges stretch only: RSI14 against your buy and sell lines.",
  risk: "RISK holds the veto: spread, volume and volatility against your limits.",
  exec: "EXEC judges the fill: your ticket size against the live order book.",
};
const RULE_UI = [
  ["quorum", "Quorum", "agents needed", 1, null],
  ["emaGapPct", "SCOUT", "EMA gap %", 0.01, "scout"],
  ["rsiBuy", "QUANT", "buy under RSI", 1, "quant"],
  ["rsiSell", "QUANT", "sell over RSI", 1, "quant"],
  ["maxSpreadBps", "RISK", "max spread, bps", 1, "risk"],
  ["maxVolPct", "RISK", "max hourly volatility %", 0.1, "risk"],
  ["minVolumeUsd", "RISK", "min 24h volume $", 1000, "risk"],
  ["ticketUsd", "EXEC", "ticket, USDG", 10, "exec"],
  ["maxSlipBps", "EXEC", "max slippage, bps", 1, "exec"],
];
const PRESETS = {
  cautious: { quorum: 4, emaGapPct: 0.25, rsiBuy: 30, rsiSell: 70, maxSpreadBps: 20, maxVolPct: 2, minVolumeUsd: 20000, ticketUsd: 150, maxSlipBps: 25 },
  aggressive: { quorum: 2, emaGapPct: 0.08, rsiBuy: 42, rsiSell: 58, maxSpreadBps: 80, maxVolPct: 6, minVolumeUsd: 1000, ticketUsd: 400, maxSlipBps: 100 },
};

const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: memory only */ } },
};

let markets = [];
let defaults = {};
let bounds = {};
let rules = store.get(KEYS.rules, {});
let watch = store.get(KEYS.watch, ["NVDA", "SPY", "BTC", "ETH", "SOL"]);
let sym = new URLSearchParams(location.search).get("s")?.toUpperCase() || watch[0] || "NVDA";
let ledger = store.get(KEYS.ledger, { cash: START, positions: {}, fills: [] });
let res = "1h";
let timer = null;
let agent = "chair";
const latest = {};      // symbol -> last council
const lastAction = {};  // symbol -> last verdict action, for the log

const fullRules = () => ({ ...defaults, ...rules });
const isCustom = () => Object.keys(defaults).some((k) => fullRules()[k] !== defaults[k]);
const ruleQuery = () => Object.entries(rules).filter(([k, v]) => defaults[k] !== v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

// ---------- ledger ----------
function applyVerdict(l, k, now = Date.now()) {
  const pos = l.positions[k.symbol] || { qty: 0, cost: 0 };
  const price = k.votes.exec.facts.avgPrice || k.price;
  const ticket = k.rules?.ticketUsd || 250;
  if (k.verdict.action === "BUY" && pos.qty === 0 && l.cash >= ticket) {
    const qty = ticket / price;
    return { cash: l.cash - ticket, positions: { ...l.positions, [k.symbol]: { qty, cost: ticket } }, fills: [...l.fills, { at: now, symbol: k.symbol, side: "BUY", qty, price }] };
  }
  if (k.verdict.action === "SELL" && pos.qty > 0) {
    const { [k.symbol]: _sold, ...rest } = l.positions;
    return { cash: l.cash + pos.qty * price, positions: rest, fills: [...l.fills, { at: now, symbol: k.symbol, side: "SELL", qty: pos.qty, price, pnl: pos.qty * price - pos.cost }] };
  }
  return l;
}
function renderLedger() {
  queueMicrotask(() => { try { renderKpis(); } catch { /* boot order */ } });
  const px = Object.fromEntries(markets.map((m) => [m.symbol, m.last]));
  let equity = ledger.cash;
  $("pos").innerHTML = Object.entries(ledger.positions).map(([s, p]) => {
    const v = p.qty * (px[s] || 0);
    equity += v;
    const ch = (v / p.cost - 1) * 100;
    return `<div class="rows" style="margin:0"><div><span>${esc(s)} · ${p.qty.toFixed(4)}</span><span class="${ch >= 0 ? "chg-up" : "chg-dn"}">${fmt(v)} · ${signed(ch)}</span></div></div>`;
  }).join("");
  $("eq").textContent = fmt(equity);
  $("eq-sub").textContent = `Start ${fmt(START)} · cash ${fmt(ledger.cash)} · ${signed((equity / START - 1) * 100)}`;
  $("fills").innerHTML = ledger.fills.slice(-25).reverse().map((f) => `<div><span>${new Date(f.at).toLocaleTimeString()} ${f.side} ${esc(f.symbol)}</span><span>${f.qty.toFixed(4)} @ ${fmt(f.price)}</span></div>`).join("") || "<div><span>No fills yet</span><span></span></div>";
}
$("reset").addEventListener("click", () => { ledger = { cash: START, positions: {}, fills: [] }; store.set(KEYS.ledger, ledger); renderLedger(); log("—", "RESET", "", "Paper ledger reset to 1,000 USDG"); });

// ---------- activity log ----------
let logN = 0;
function log(symbol, action, behind, text, fill = false) {
  const box = $("activity");
  if (!logN) box.innerHTML = "";
  logN++;
  const row = document.createElement("div");
  if (fill) row.className = "fill";
  row.innerHTML = `<span>${new Date().toLocaleTimeString()}</span><span class="s">${esc(symbol)}</span><span class="${action === "BUY" ? "chg-up" : action === "SELL" ? "chg-dn" : ""}">${esc(action)}${behind !== "" ? " " + behind + "/4" : ""}</span><span>${esc(text)}</span>`;
  box.prepend(row);
  while (box.children.length > MAX_LOG) box.lastChild.remove();
  $("log-n").textContent = `${logN} events`;
}

// ---------- watchlist ----------
const voteCls = (v) => (["BUY", "APPROVE", "READY"].includes(v) ? "good" : ["SELL", "VETO", "BLOCK"].includes(v) ? "bad" : "");
function renderWatch() {
  $("watch").innerHTML = watch.map((s) => {
    const m = markets.find((x) => x.symbol === s);
    const k = latest[s];
    const dots = k ? ["scout", "quant", "risk", "exec"].map((n) => `<i class="${voteCls(k.votes[n].vote)}" title="${n.toUpperCase()} ${k.votes[n].vote}"></i>`).join("") : "<i></i><i></i><i></i><i></i>";
    const a = k?.verdict.action;
    return `<div class="wrow" role="listitem" tabindex="0" data-s="${esc(s)}" aria-current="${s === sym}">
      ${logo(s, 30)}<b>${esc(s)}${m?.asset === "crypto" ? `<span class="tg c">${m.kind === "perp" ? "PERP" : "CRYPTO"}</span>` : ""}</b><span class="px">${m ? fmt(m.last) : "-"} <span class="${(m?.change24hPct ?? 0) >= 0 ? "chg-up" : "chg-dn"}">${m ? signed(m.change24hPct) : ""}</span></span>
      <span class="dots">${dots}</span><span class="vd ${a === "BUY" ? "chg-up" : a === "SELL" ? "chg-dn" : ""}">${a ? `${a} ${k.verdict.behind}/4` : "…"}</span>
      <button class="x" type="button" data-rm="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></div>`;
  }).join("") || '<div class="skel">Add a market below.</div>';
  const add = $("add");
  const opt = (m) => `<option value="${esc(m.symbol)}">${esc(m.symbol)} · ${fmt(m.last)}${m.kind === "perp" ? " · perp" : ""}</option>`;
  const free = markets.filter((m) => !watch.includes(m.symbol));
  add.innerHTML = '<option value="">+ Add market</option>'
    + `<optgroup label="Stock tokens">${free.filter((m) => m.asset === "stock").map(opt).join("")}</optgroup>`
    + `<optgroup label="Crypto">${free.filter((m) => m.asset === "crypto").map(opt).join("")}</optgroup>`;
}
$("watch").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rm]");
  if (rm) {
    watch = watch.filter((s) => s !== rm.dataset.rm);
    store.set(KEYS.watch, watch);
    if (sym === rm.dataset.rm && watch[0]) select(watch[0]);
    return renderWatch();
  }
  const row = e.target.closest(".wrow");
  if (row) select(row.dataset.s);
});
$("watch").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("wrow")) select(e.target.dataset.s); });
$("add").addEventListener("change", (e) => {
  const s = e.target.value;
  if (!s || watch.includes(s)) return;
  watch = [...watch, s];
  store.set(KEYS.watch, watch);
  renderWatch();
  convene(s, false);
});

function select(s) {
  sym = s;
  history.replaceState(null, "", "?s=" + s);
  renderWatch();
  renderHead();
  loadCandles();
  if (latest[s]) renderCouncil(latest[s]);
  convene(s, true);
  $("ask-q").placeholder = `Ask ${agent === "chair" ? "the chair" : agent.toUpperCase()} about ${s}`;
}

// ---------- council ----------
async function convene(s, withBrief) {
  const q = ruleQuery();
  const url = `/v1/council/${s}?${q}${q ? "&" : ""}${withBrief ? "" : "brief=0"}`;
  const k = (await api(url)).council;
  // keep a brief we already have when this call skipped it and the votes did not move
  if (!k.brief && latest[s]?.brief && latest[s].verdict.action === k.verdict.action) k.brief = latest[s].brief;
  latest[s] = k;
  if (lastAction[s] !== undefined && lastAction[s] !== k.verdict.action) log(s, k.verdict.action, k.verdict.behind, `Verdict changed from ${lastAction[s]}. ${k.verdict.reason}`);
  else if (lastAction[s] === undefined) log(s, k.verdict.action, k.verdict.behind, k.verdict.reason);
  lastAction[s] = k.verdict.action;
  if ($("auto").checked) {
    const next = applyVerdict(ledger, k);
    if (next !== ledger) {
      ledger = next;
      store.set(KEYS.ledger, ledger);
      const f = ledger.fills[ledger.fills.length - 1];
      log(s, `PAPER ${f.side}`, "", `${f.qty.toFixed(4)} @ ${fmt(f.price)}${f.pnl != null ? ` · pnl ${fmt(f.pnl)}` : ""}`, true);
      renderLedger();
    }
  }
  if (s === sym) renderCouncil(k);
  renderWatch();
  renderKpis();
  return k;
}

// The summary row: equity, positions, how the watchlist is voting, last fill, active rules.
function renderKpis() {
  const px = Object.fromEntries(markets.map((m) => [m.symbol, m.last]));
  const pos = Object.entries(ledger.positions);
  const equity = ledger.cash + pos.reduce((a, [s, p]) => a + p.qty * (px[s] || 0), 0);
  const ch = (equity / START - 1) * 100;
  $("k-eq").textContent = fmt(equity);
  $("k-eq2").innerHTML = `<span class="${ch >= 0 ? "chg-up" : "chg-dn"}">${signed(ch)}</span> since start · cash ${fmt(ledger.cash)}`;
  $("k-pos").textContent = pos.length;
  $("k-pos2").textContent = pos.length ? pos.map(([s, p]) => `${s} ${fmt(p.cost, 0)}`).join(" · ") : "No open trades";
  const v = watch.map((s) => latest[s]?.verdict.action).filter(Boolean);
  const n = (a) => v.filter((x) => x === a).length;
  const [b, s2, h] = [n("BUY"), n("SELL"), n("HOLD")];
  const bar = $("k-vbar").children;
  bar[0].style.flex = b; bar[1].style.flex = s2; bar[2].style.flex = h || (v.length ? 0 : 1);
  $("k-vd").innerHTML = v.length ? `<span class="chg-up">${b} buy</span> · <span class="chg-dn">${s2} sell</span> · ${h} hold of ${watch.length}` : "Waiting for the first vote";
  const f = ledger.fills.at(-1);
  $("k-fill").textContent = f ? `${f.side} ${f.symbol}` : "None yet";
  $("k-fill2").textContent = f ? `${f.qty.toFixed(4)} @ ${fmt(f.price)} · ${new Date(f.at).toLocaleTimeString()}` : ($("auto").checked ? "Auto paper-trade is on" : "Turn on auto paper-trade");
  const r = fullRules();
  const preset = Object.entries(PRESETS).find(([, p]) => Object.keys(p).every((k) => p[k] === r[k]))?.[0];
  $("k-rules").textContent = !isCustom() ? "Default" : preset ? preset[0].toUpperCase() + preset.slice(1) : "Custom";
  $("k-rules2").textContent = `Quorum ${r.quorum} of 4 · spread ≤ ${r.maxSpreadBps} bps · ticket ${r.ticketUsd}`;
}
function renderCouncil(k) {
  const AGENT_VAR = { scout: "--scout", quant: "--quant", risk: "--risk", exec: "--exec" };
  $("b-votes").innerHTML = ["scout", "quant", "risk", "exec"].map((n) => {
    const v = k.votes[n];
    const text = k.brief?.[n] || Object.entries(v.facts).map(([a, b]) => `${a} ${b}`).join(" · ");
    return `<div class="vote"><span class="n" style="color:var(${AGENT_VAR[n]})"><i class="ava">${AGENT_ICON[n]}</i>${n.toUpperCase()}</span><span class="v ${voteCls(v.vote) || "flat"}">${v.vote}</span><span class="t">${esc(text)}</span></div>`;
  }).join("");
  $("b-verdict").innerHTML = `<b class="${k.verdict.action === "BUY" ? "chg-up" : k.verdict.action === "SELL" ? "chg-dn" : ""}">${k.verdict.action}</b><span>${k.verdict.behind}/4 behind · quorum ${k.quorum} · ${esc(k.verdict.reason)}${k.brief?.chair ? "<br>" + esc(k.brief.chair) : ""}</span>`;
  $("d-when").textContent = new Date(k.at).toLocaleTimeString();
  $("rules-tag").hidden = !k.custom;
}

async function tick() {
  $("tick-state").textContent = "Voting…";
  try {
    await convene(sym, true);
    const rest = watch.filter((s) => s !== sym);
    for (let i = 0; i < rest.length; i += WATCH_CONCURRENCY) {
      await Promise.all(rest.slice(i, i + WATCH_CONCURRENCY).map((s) => convene(s, false).catch(() => null)));
    }
    $("tick-state").textContent = `Last vote ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    $("tick-state").textContent = err.message;
  }
}
function schedule() {
  clearInterval(timer);
  const on = $("live").checked;
  $("live-pill").hidden = !on;
  if (on) timer = setInterval(() => { if (!document.hidden) tick(); }, Number($("every").value) * 1000);
}
$("run").addEventListener("click", tick);
$("live").addEventListener("change", schedule);
$("every").addEventListener("change", schedule);
$("auto").addEventListener("change", (e) => log("—", e.target.checked ? "AUTO ON" : "AUTO OFF", "", e.target.checked ? "BUY and SELL verdicts now paper-trade" : "Verdicts no longer trade"));

// ---------- market head + candles ----------
function renderHead() {
  const m = markets.find((x) => x.symbol === sym);
  $("d-sym").textContent = sym;
  $("d-logo").innerHTML = logo(sym, 58);
  $("d-pair").textContent = m ? `${m.pair} · Lighter ${m.kind} · ${m.asset === "crypto" ? "crypto" : "stock token"}` : sym;
  $("d-px").textContent = m ? `${fmt(m.last)} ${m.kind === "perp" ? "USD" : "USDG"} · ${signed(m.change24hPct)} 24h · $${m.dayVolumeUsd.toLocaleString("en-US")} volume` : "";
}
const chart = createLiveChart($("chart"), $("legend"));
const loadCandles = () => chart.load(sym, res).catch(() => { $("legend").textContent = "Chart data unavailable"; });
$("res").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "fit") return chart.fit();
  if (b.id === "now") return chart.live();
  res = b.dataset.r;
  document.querySelectorAll("#res button[data-r]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  loadCandles();
});

// ---------- rules editor ----------
function renderRules() {
  const r = fullRules();
  $("rules").innerHTML = RULE_UI.map(([k, who, label, step, color]) => {
    const [, lo, hi] = bounds[k];
    return `<div class="rule${r[k] !== defaults[k] ? " changed" : ""}" data-k="${k}">
      <label for="r-${k}"><span>${color ? `<span class="who3" style="color:var(--${color})">${who}</span>` : `<span class="who3">${who}</span>`}${label}</span><b>${k === "minVolumeUsd" ? "$" + Number(r[k]).toLocaleString("en-US") : r[k]}</b></label>
      <input id="r-${k}" type="range" min="${lo}" max="${hi}" step="${step}" value="${r[k]}">
    </div>`;
  }).join("") + '<button class="btn sm" type="button" id="r-reset">Reset to default</button>';
}
let ruleTimer = null;
$("rules").addEventListener("input", (e) => {
  const row = e.target.closest(".rule");
  if (!row) return;
  const k = row.dataset.k;
  rules = { ...rules, [k]: Number(e.target.value) };
  if (rules.rsiBuy >= rules.rsiSell) rules = { ...rules, [k === "rsiBuy" ? "rsiSell" : "rsiBuy"]: k === "rsiBuy" ? Math.min(bounds.rsiSell[2], rules.rsiBuy + 1) : Math.max(bounds.rsiBuy[1], rules.rsiSell - 1) };
  store.set(KEYS.rules, rules);
  const r = fullRules();
  row.querySelector("b").textContent = k === "minVolumeUsd" ? "$" + r[k].toLocaleString("en-US") : r[k];
  row.classList.toggle("changed", r[k] !== defaults[k]);
  // re-vote shortly after the slider stops moving
  clearTimeout(ruleTimer);
  ruleTimer = setTimeout(() => { log("—", "RULES", "", `${k} set to ${r[k]}`); tick(); }, 700);
});
$("rules").addEventListener("click", (e) => {
  if (e.target.id !== "r-reset") return;
  rules = {};
  store.set(KEYS.rules, rules);
  renderRules();
  log("—", "RULES", "", "Back to the default rules");
  tick();
});
document.querySelector(".presets").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  rules = PRESETS[b.dataset.p] ? { ...PRESETS[b.dataset.p] } : {};
  store.set(KEYS.rules, rules);
  renderRules();
  log("—", "PRESET", "", `${b.textContent} rules loaded`);
  tick();
});

// ---------- tabs ----------
document.querySelector(".ptabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  document.querySelectorAll(".ptabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  for (const t of ["agents", "rules", "ledger"]) $("tab-" + t).hidden = t !== b.dataset.tab;
  if (b.dataset.tab === "ledger") renderLedger();
});

// ---------- agent chat ----------
const chats = { chair: [], scout: [], quant: [], risk: [], exec: [] };
const logBox = $("ask-log");
function bubble(who, text, color) {
  const el = document.createElement("div");
  el.className = "msg " + (who === "You" ? "me" : "desk");
  el.innerHTML = `<div class="who2"${color ? ` style="color:var(--${color})"` : ""}>${esc(who)}</div><div class="body"></div>`;
  el.querySelector(".body").textContent = text;
  logBox.append(el);
  logBox.scrollTop = logBox.scrollHeight;
  return el.querySelector(".body");
}
$("agent-pick").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  agent = b.dataset.a;
  document.querySelectorAll("#agent-pick button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("agent-role").textContent = AGENT_ROLE[agent];
  $("ask-q").placeholder = `Ask ${agent === "chair" ? "the chair" : agent.toUpperCase()} about ${sym}`;
});
$("ask-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("ask-q");
  let q = input.value.trim();
  if (!q) return;
  input.value = "";
  const who = agent;
  bubble("You", q);
  if (!new RegExp(`\\b${sym}\\b`, "i").test(q)) q = `${q} (about ${sym})`;
  const custom = isCustom() ? " (I am using custom rules.)" : "";
  const body = bubble(who === "chair" ? "Chair" : who.toUpperCase(), "", who === "chair" ? null : who);
  input.disabled = true;
  try {
    const a = await askStream(q + custom, chats[who], (t) => { body.textContent += t; logBox.scrollTop = logBox.scrollHeight; }, who, fullRules());
    chats[who].push({ role: "user", content: q + custom }, { role: "assistant", content: a });
  } catch (err) {
    body.textContent = err.message;
  } finally {
    input.disabled = false;
    input.focus();
  }
});

// ---------- boot ----------
async function boot() {
  const [r, m] = await Promise.all([api("/v1/rules"), api("/v1/markets")]);
  defaults = r.defaults;
  bounds = r.bounds;
  markets = m.markets;
  watch = watch.filter((s) => markets.some((x) => x.symbol === s));
  if (!watch.includes(sym) && markets.some((x) => x.symbol === sym)) watch = [sym, ...watch];
  if (!watch.length) watch = markets.slice(0, 5).map((x) => x.symbol);
  if (!watch.includes(sym)) sym = watch[0];
  store.set(KEYS.watch, watch);
  renderRules();
  renderWatch();
  renderHead();
  renderLedger();
  loadCandles();
  $("ask-q").placeholder = `Ask the chair about ${sym}`;
  await tick();
  schedule();
  setInterval(async () => {
    try { markets = (await api("/v1/markets")).markets; renderWatch(); renderHead(); renderLedger(); } catch { /* keep last */ }
  }, 30_000);
}
boot().catch((err) => { $("b-votes").innerHTML = `<div class="skel">${esc(err.message)}</div>`; });
