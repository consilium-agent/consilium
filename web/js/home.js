// Homepage: live ticker, live council board, ask console, install tabs, terminal replay.
import { api, askStream, copyText, fmt, signed, logo, AGENT_ICON } from "./common.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SITE = location.origin;

// ---------- ticker in the meta strip ----------
let markets = [];
async function loadMarkets() {
  try {
    markets = (await api("/v1/markets")).markets;
    let i = 0;
    const show = () => {
      const m = markets[i++ % Math.min(8, markets.length)];
      $("tick").textContent = `${m.symbol} ${fmt(m.last)} ${signed(m.change24hPct)}`;
    };
    show();
    setInterval(show, 3000);
  } catch {
    $("tick").textContent = "Markets unavailable";
  }
}
loadMarkets();

// ---------- live council ----------
const BOARD_SYMBOLS = ["NVDA", "SPY", "BTC", "ETH", "SOL"];
const voteClass = (v) => (["BUY", "APPROVE", "READY"].includes(v) ? "good" : ["SELL", "VETO", "BLOCK"].includes(v) ? "bad" : "flat");
const AGENT_VAR = { scout: "--scout", quant: "--quant", risk: "--risk", exec: "--exec" };
let boardSym = "NVDA";

function tabs() {
  $("b-tabs").innerHTML = BOARD_SYMBOLS.map((s) => `<button type="button" aria-pressed="${s === boardSym}" data-s="${s}">${s}</button>`).join("");
}
$("b-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  boardSym = b.dataset.s;
  tabs();
  loadCouncil();
});

async function loadCouncil() {
  $("b-votes").innerHTML = '<div class="skel">Convening the agents</div>';
  $("b-verdict").innerHTML = "";
  try {
    const k = (await api("/v1/council/" + boardSym)).council;
    $("b-pair").textContent = `${k.pair} · Lighter ${k.kind || "spot"}`;
    $("b-sym").innerHTML = `${logo(k.symbol, 52)} ${esc(k.symbol)}`;
    $("b-px").textContent = `${fmt(k.price)} ${k.kind === "perp" ? "USD" : "USDG"} · ${signed(k.change24hPct)} 24h`;
    $("b-votes").innerHTML = ["scout", "quant", "risk", "exec"].map((n) => {
      const v = k.votes[n];
      const text = k.brief?.[n] || Object.entries(v.facts).map(([a, b]) => `${a} ${b}`).join(" · ");
      return `<div class="vote"><span class="n" style="color:var(${AGENT_VAR[n]})"><i class="ava">${AGENT_ICON[n]}</i>${n.toUpperCase()}</span><span class="v ${voteClass(v.vote)}">${v.vote}</span><span class="t">${esc(text)}</span></div>`;
    }).join("");
    const a = k.verdict.action;
    $("b-verdict").innerHTML = `<b class="${a === "HOLD" ? "" : a === "BUY" ? "v good" : "v bad"}" style="border:0">${a}</b><span>${k.verdict.behind}/4 behind · ${esc(k.verdict.reason)}</span>`;
  } catch (err) {
    $("b-votes").innerHTML = `<div class="skel">${esc(err.message)}</div>`;
  }
}
tabs();
const boardIo = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { boardIo.disconnect(); loadCouncil(); } });
boardIo.observe($("board"));

// ---------- ask console ----------
const history = [];
const log = $("ask-log");
const form = $("ask-form");
const input = $("ask-q");
function bubble(who, text) {
  const el = document.createElement("div");
  el.className = "msg " + (who === "You" ? "me" : "desk");
  el.innerHTML = `<div class="who2">${who}</div><div class="body"></div>`;
  el.querySelector(".body").textContent = text;
  log.append(el);
  log.scrollTop = log.scrollHeight;
  return el.querySelector(".body");
}
async function ask(q) {
  if (!q.trim()) return;
  input.value = "";
  form.querySelector("button").disabled = true;
  $("ask-state").textContent = "Thinking";
  bubble("You", q);
  const body = bubble("Consilium", "");
  const caret = document.createElement("span");
  caret.className = "caret";
  body.after(caret);
  try {
    const answer = await askStream(q, history, (t) => { body.textContent += t; log.scrollTop = log.scrollHeight; });
    history.push({ role: "user", content: q }, { role: "assistant", content: answer });
    $("ask-state").textContent = "Ready";
  } catch (err) {
    body.textContent = err.message;
    $("ask-state").textContent = "Error";
  } finally {
    caret.remove();
    form.querySelector("button").disabled = false;
  }
}
form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
$("chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.textContent); });

// ---------- install tabs ----------
const INSTALL = {
  win: `# PowerShell: installs consil.exe and adds it to your PATH\nirm ${SITE}/install.ps1 | iex\n\nconsil council NVDA`,
  unix: `# needs Node.js 20+\ncurl -fsSL ${SITE}/install.sh | sh\n\nconsil council NVDA`,
  npm: `npm i -g ${SITE}/dl/consil-cli.tgz\n\nconsil council NVDA`,
};
let os = /Win/.test(navigator.platform) ? "win" : "unix";
function showOs() {
  document.querySelectorAll("#os-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.os === os)));
  $("os-cmd").textContent = INSTALL[os];
}
$("os-tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { os = b.dataset.os; showOs(); } });
$("os-copy").addEventListener("click", (e) => copyText(INSTALL[os].split("\n").filter((l) => l && !l.startsWith("#")).join("\n"), e.currentTarget));
showOs();

$("curl").textContent = `curl ${SITE}/v1/council/NVDA\n\ncurl -N ${SITE}/v1/ask \\\n  -H "content-type: application/json" \\\n  -d '{"question":"Should the desk buy NVDA right now?"}'`;

// ---------- terminal replay (a real transcript from the CLI) ----------
function paint(line) {
  let h = esc(line);
  if (line.startsWith("$ ")) return `<span class="t-dim">$</span> <span class="t-b">${h.slice(2)}</span>`;
  h = h.replace(/▲ SCOUT/, '<span class="t-em">▲ SCOUT</span>').replace(/▲ QUANT/, '<span class="t-gold">▲ QUANT</span>')
    .replace(/▲ RISK/, '<span class="t-ok">▲ RISK</span>').replace(/▲ EXEC/, '<span class="t-cy">▲ EXEC</span>')
    .replace(/\b(BUY|APPROVE|READY)\b/g, '<span class="t-ok">$1</span>').replace(/\b(SELL|VETO|BLOCK)\b/g, '<span class="t-bad">$1</span>')
    .replace(/VERDICT/, '<span class="t-b">VERDICT</span>').replace(/(\+\d[\d.,]*%)/g, '<span class="t-ok">$1</span>');
  return h;
}
async function replay() {
  const pre = $("term-out");
  let text;
  try { text = await (await fetch("/media/term.txt")).text(); } catch { return; }
  const lines = text.trimEnd().split("\n");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) { pre.innerHTML = lines.map(paint).join("\n"); return; }
  pre.innerHTML = "";
  for (const line of lines) {
    if (line.startsWith("$ ")) {
      const span = document.createElement("span");
      pre.append(span);
      for (let i = 2; i <= line.length; i++) { span.innerHTML = paint(line.slice(0, i)); await new Promise((r) => setTimeout(r, 38)); }
      pre.append("\n");
      await new Promise((r) => setTimeout(r, 500));
    } else {
      pre.insertAdjacentHTML("beforeend", paint(line) + "\n");
      await new Promise((r) => setTimeout(r, 90));
    }
  }
}
const termIo = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { termIo.disconnect(); replay(); } }, { threshold: 0.3 });
termIo.observe($("term-out"));

// ---------- download sizes ----------
fetch("/dl/manifest.json").then((r) => r.json()).then((m) => {
  for (const f of m.files) document.querySelectorAll(`[data-size="${f.name}"]`).forEach((el) => { el.textContent = `${(f.bytes / 1e6).toFixed(1)} MB · v${m.version}`; });
}).catch(() => {});

// ---------- demo video chapters ----------
const vid = $("vid");
$("chapters").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  vid.currentTime = Number(b.dataset.t) || 0;
  vid.play().catch(() => {});
});
