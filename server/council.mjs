// The four desk agents. Numbers come from code; the model only explains them.
// SCOUT reads trend, QUANT reads stretch, RISK can veto, EXEC checks the book can take the size.
// Every threshold is a rule the user can change within the bounds below.
import { getMarkets, getCandles, getBook, marketBySymbol } from "./lighter.mjs";
import { ema, rsi, volatilityPct, round } from "./indicators.mjs";

// [default, min, max]
export const RULE_BOUNDS = {
  quorum: [3, 2, 4],
  emaGapPct: [0.15, 0.02, 2],
  rsiBuy: [35, 10, 50],
  rsiSell: [65, 50, 90],
  maxSpreadBps: [40, 2, 300],
  maxVolPct: [3.5, 0.2, 15],
  minVolumeUsd: [5000, 0, 1_000_000],
  ticketUsd: [250, 10, 10_000],
  maxSlipBps: [50, 2, 500],
};
export const DEFAULT_RULES = Object.fromEntries(Object.entries(RULE_BOUNDS).map(([k, [d]]) => [k, d]));
export const QUORUM_SIZE = DEFAULT_RULES.quorum;
export const TICKET_USD = DEFAULT_RULES.ticketUsd;

// Unknown keys are dropped, numbers are clamped, garbage falls back to the default.
export function normalizeRules(input = {}) {
  const out = {};
  for (const [k, [d, lo, hi]] of Object.entries(RULE_BOUNDS)) {
    const v = Number(input[k]);
    out[k] = Number.isFinite(v) && input[k] !== "" && input[k] != null ? Math.min(hi, Math.max(lo, v)) : d;
  }
  out.quorum = Math.round(out.quorum);
  if (out.rsiBuy >= out.rsiSell) { out.rsiBuy = DEFAULT_RULES.rsiBuy; out.rsiSell = DEFAULT_RULES.rsiSell; }
  return out;
}
export const isDefault = (r) => Object.keys(DEFAULT_RULES).every((k) => r[k] === DEFAULT_RULES[k]);

function scout(closes, m, r) {
  const fast = ema(closes, 20);
  const slow = ema(closes, 50);
  if (fast == null || slow == null) return { vote: "HOLD", score: 0, facts: { reason: "not enough candles" } };
  const gapPct = ((fast - slow) / slow) * 100;
  const vote = gapPct > r.emaGapPct && m.change24hPct > -1 ? "BUY" : gapPct < -r.emaGapPct && m.change24hPct < 1 ? "SELL" : "HOLD";
  return { vote, score: round(Math.min(1, Math.abs(gapPct) / 2), 2), facts: { ema20: round(fast, 4), ema50: round(slow, 4), gapPct: round(gapPct, 3), change24hPct: round(m.change24hPct, 2) } };
}

function quant(closes, r) {
  const v = rsi(closes, 14);
  if (v == null) return { vote: "HOLD", score: 0, facts: { reason: "not enough candles" } };
  const vote = v < r.rsiBuy ? "BUY" : v > r.rsiSell ? "SELL" : "HOLD";
  return { vote, score: round(Math.min(1, Math.abs(v - 50) / 30), 2), facts: { rsi14: round(v, 1) } };
}

function risk(closes, m, book, r) {
  const vol = volatilityPct(closes.slice(-24));
  const checks = {
    marketOpen: m.open,
    spreadBps: round(book.spreadBps, 1),
    spreadOk: book.spreadBps <= r.maxSpreadBps,
    dayVolumeUsd: Math.round(m.dayVolumeUsd),
    volumeOk: m.dayVolumeUsd >= r.minVolumeUsd,
    hourlyVolPct: round(vol, 2),
    volOk: vol != null && vol <= r.maxVolPct,
  };
  const ok = checks.marketOpen && checks.spreadOk && checks.volumeOk && checks.volOk;
  return { vote: ok ? "APPROVE" : "VETO", score: ok ? 1 : 0, facts: checks };
}

// Walk the book for an order of `usd` on the given side and measure slippage against mid.
export function walk(levels, usd, mid) {
  let left = usd;
  let qty = 0;
  for (const l of levels) {
    const take = Math.min(left, l.price * l.size);
    qty += take / l.price;
    left -= take;
    if (left <= 1e-9) break;
  }
  if (left > 1e-9 || !qty || !mid) return { filled: false, avgPrice: null, slippageBps: null };
  const avg = usd / qty;
  return { filled: true, avgPrice: avg, slippageBps: Math.abs(avg / mid - 1) * 10_000 };
}

function exec(book, side, r) {
  if (side === "HOLD") return { vote: "STANDBY", score: 0, facts: { reason: "no direction to size" } };
  const w = walk(side === "BUY" ? book.asks : book.bids, r.ticketUsd, book.mid);
  const ok = w.filled && w.slippageBps <= r.maxSlipBps;
  return { vote: ok ? "READY" : "BLOCK", score: ok ? 1 : 0, facts: { ticketUsd: r.ticketUsd, side, avgPrice: round(w.avgPrice, 4), slippageBps: round(w.slippageBps, 1), filled: w.filled } };
}

// Direction comes from SCOUT and QUANT. A trade needs `quorum` agents behind it,
// and RISK's veto or EXEC's block always wins.
export function tally(votes, quorum = QUORUM_SIZE) {
  const dirs = [votes.scout.vote, votes.quant.vote].filter((v) => v !== "HOLD");
  const side = dirs.length && dirs.every((d) => d === dirs[0]) ? dirs[0] : "HOLD";
  const behind = [
    votes.scout.vote === side,
    votes.quant.vote === side,
    votes.risk.vote === "APPROVE",
    votes.exec.vote === "READY",
  ].filter(Boolean).length;
  if (side === "HOLD") return { action: "HOLD", side, behind, reason: "No direction: SCOUT and QUANT do not point the same way." };
  if (votes.risk.vote === "VETO") return { action: "HOLD", side, behind, reason: "RISK vetoed. A veto cannot be outvoted." };
  if (votes.exec.vote !== "READY") return { action: "HOLD", side, behind, reason: "EXEC cannot fill the ticket inside the slippage limit." };
  if (behind < quorum) return { action: "HOLD", side, behind, reason: `Only ${behind} of 4 agents agree; quorum is ${quorum}.` };
  return { action: side, side, behind, reason: `${behind} of 4 agents agree.` };
}

export async function convene(symbol, rulesInput) {
  const r = normalizeRules(rulesInput);
  const m = await marketBySymbol(String(symbol || "").toUpperCase());
  if (!m) throw Object.assign(new Error("unknown market"), { status: 404 });
  const [candles, book] = await Promise.all([getCandles(m.marketId, "1h", 120), getBook(m.marketId)]);
  const closes = candles.map((c) => Number(c.c)).filter(Number.isFinite);
  const votes = { scout: scout(closes, m, r), quant: quant(closes, r), risk: risk(closes, m, book, r) };
  const lead = votes.scout.vote !== "HOLD" ? votes.scout.vote : votes.quant.vote;
  votes.exec = exec(book, lead, r);
  return {
    symbol: m.symbol,
    pair: m.pair,
    asset: m.asset,
    kind: m.kind,
    price: m.last,
    mid: round(book.mid, 4),
    change24hPct: round(m.change24hPct, 2),
    votes,
    verdict: tally(votes, r.quorum),
    quorum: r.quorum,
    rules: r,
    custom: !isDefault(r),
    at: Date.now(),
  };
}

// What the model sees for a question: the top markets plus a council for any symbol it names.
export async function marketContext(question, rules) {
  const all = await getMarkets();
  const words = new Set(String(question).toUpperCase().match(/\b[A-Z]{1,6}\b/g) || []);
  const named = all.filter((m) => words.has(m.symbol)).slice(0, 2);
  const councils = (await Promise.all(named.map((m) => convene(m.symbol, rules).catch(() => null)))).filter(Boolean);
  const list = await snapshot(60);
  // the top stocks and the top crypto, so either kind of question has context
  const markets = [...list.filter((m) => m.asset === "stock").slice(0, 8), ...list.filter((m) => m.asset === "crypto").slice(0, 8)];
  return { markets, councils };
}

export async function snapshot(limit = 12) {
  const list = await getMarkets();
  return list.filter((m) => m.open).slice(0, limit).map((m) => ({
    symbol: m.symbol, pair: m.pair, asset: m.asset, kind: m.kind, last: m.last, change24hPct: round(m.change24hPct, 2), dayVolumeUsd: Math.round(m.dayVolumeUsd), tier: m.tier,
  }));
}
