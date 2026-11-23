// Shared bits for every page: menu, token contract, socials, copy buttons.
// Contract, Pons, chart, X and GitHub links live in /site.json so launch day needs no code change.
export const TOKEN = { ca: "", pons: "", chart: "", x: "", github: "" };  // data-social="pons" uses TOKEN.pons

const burger = document.querySelector(".burger");
const nav = document.getElementById("nav");
burger?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  burger.setAttribute("aria-expanded", String(open));
});
nav?.addEventListener("click", (e) => { if (e.target.closest("a")) { nav.classList.remove("open"); burger?.setAttribute("aria-expanded", "false"); } });

export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const old = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = old; }, 1400); }
  } catch {
    if (btn) btn.textContent = "Copy failed";
  }
}

const external = (a, href) => { a.href = href; a.target = "_blank"; a.rel = "noopener"; a.classList.remove("soon"); a.querySelector("em")?.remove(); };
function applySite() {
  if (TOKEN.ca) document.querySelectorAll("[data-ca]").forEach((el) => { el.textContent = TOKEN.ca; });
  const buy = document.getElementById("lb-buy");
  if (buy && TOKEN.pons) external(buy, TOKEN.pons);
  for (const a of document.querySelectorAll("[data-social]")) {
    const href = TOKEN[a.dataset.social];
    if (href) external(a, href);
    else { a.classList.add("soon"); a.title = "Coming at launch"; }
  }
}
applySite();
fetch("/site.json", { cache: "no-store" }).then((r) => r.json()).then((s) => {
  for (const k of Object.keys(TOKEN)) if (typeof s[k] === "string" && /^(https:\/\/|0x[0-9a-fA-F]{40}$|$)/.test(s[k])) TOKEN[k] = s[k];
  applySite();
}).catch(() => {});
for (const btn of [document.getElementById("lb-copy"), ...document.querySelectorAll("[data-copy-ca]")]) {
  btn?.addEventListener("click", (e) => {
    if (!TOKEN.ca) { e.currentTarget.textContent = "CA soon"; return; }
    copyText(TOKEN.ca, e.currentTarget);
  });
}

// Logos: stock tiles and CC0 crypto icons shipped with the site; anything else gets a monogram.
const STOCK_LOGOS = new Set(['AAPL', 'AMD', 'AMZN', 'BABA', 'BE', 'COIN', 'CRCL', 'CRWV', 'GOOGL', 'INTC', 'META', 'MSFT', 'MU', 'NVDA', 'ORCL', 'PLTR', 'QQQ', 'SLV', 'SNDK', 'SPCX', 'SPY', 'TSLA', 'USAR']);
const COIN_LOGOS = new Set(['AAVE', 'BTC', 'ETH', 'LINK', 'SOL', 'TRX', 'UNI', 'XMR', 'XRP', 'ZEC']);
const HUES = [18, 42, 152, 200, 262, 330, 96];
export function logo(sym, size = 28) {
  const s = String(sym || "").toUpperCase();
  const src = COIN_LOGOS.has(s) ? `/img/coin/${s.toLowerCase()}.svg` : STOCK_LOGOS.has(s) ? `/img/tk/${s}.webp` : "";
  if (src) return `<img class="lg" src="${src}" width="${size}" height="${size}" alt="" loading="lazy">`;
  const hue = HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return `<span class="lg mono" style="--s:${size}px;--h:${hue}" aria-hidden="true">${s.slice(0, s.length > 3 ? 2 : 3)}</span>`;
}
// One small glyph per agent: SCOUT a rising line, QUANT a wave, RISK a shield, EXEC a bolt.
export const AGENT_ICON = {
  scout: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  quant: '<svg viewBox="0 0 24 24"><path d="M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  risk: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  exec: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

export const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "-");
export const signed = (n) => (Number.isFinite(n) ? (n >= 0 ? "+" : "") + n.toFixed(2) + "%" : "-");

export async function api(path, init) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Streams /v1/ask; calls onText for each chunk. Returns the full answer.
export async function askStream(question, history, onText, agent = "chair", rules = undefined) {
  const res = await fetch("/v1/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history, agent, rules }) });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `The desk answered ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let answer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = raw.match(/^event: (.*)$/m)?.[1];
      const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] || "{}");
      if (ev === "text") { answer += data.text; onText(data.text); }
      if (ev === "error") throw new Error(data.error);
    }
  }
  return answer;
}
