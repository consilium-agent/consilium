import { test } from "node:test";
import assert from "node:assert/strict";
import { tally, walk, QUORUM_SIZE } from "../server/council.mjs";
import { applyVerdict, emptyLedger, resolveApi, formatCouncil } from "../cli/src/consil.mjs";

const v = (scout, quant, risk, exec) => ({ scout: { vote: scout }, quant: { vote: quant }, risk: { vote: risk }, exec: { vote: exec } });

test("trades when three agents agree on a direction", () => {
  const r = tally(v("BUY", "HOLD", "APPROVE", "READY"));
  assert.equal(r.action, "BUY");
  assert.equal(r.behind, QUORUM_SIZE);
});

test("risk veto wins even with every other agent behind the trade", () => {
  assert.equal(tally(v("BUY", "BUY", "VETO", "READY")).action, "HOLD");
});

test("exec block stops the trade", () => {
  assert.equal(tally(v("SELL", "SELL", "APPROVE", "BLOCK")).action, "HOLD");
});

test("scout and quant pointing opposite ways means no direction", () => {
  const r = tally(v("BUY", "SELL", "APPROVE", "READY"));
  assert.equal(r.action, "HOLD");
  assert.match(r.reason, /No direction/);
});

test("all four agreeing still reports four behind", () => {
  assert.equal(tally(v("SELL", "SELL", "APPROVE", "READY")).behind, 4);
});

test("walk fills across levels and measures slippage against mid", () => {
  const w = walk([{ price: 100, size: 1 }, { price: 101, size: 5 }], 250, 99.9);
  assert.ok(w.filled);
  assert.ok(w.avgPrice > 100 && w.avgPrice < 101);
  assert.ok(w.slippageBps > 0);
});

test("walk reports unfilled when the book is too thin", () => {
  assert.equal(walk([{ price: 100, size: 1 }], 250, 100).filled, false);
});

const council = (action, price = 100) => ({
  symbol: "NVDA", price, quorum: 3, change24hPct: 1,
  votes: { scout: { vote: "BUY", facts: {} }, quant: { vote: "HOLD", facts: {} }, risk: { vote: "APPROVE", facts: {} }, exec: { vote: "READY", facts: { avgPrice: price } } },
  verdict: { action, behind: 3, reason: "3 of 4 agents agree." },
});

test("paper buy then sell returns a new ledger each time and books the pnl", () => {
  const start = emptyLedger();
  const afterBuy = applyVerdict(start, council("BUY", 100), 1);
  assert.notEqual(afterBuy, start);
  assert.equal(start.cash, 1000, "original ledger is not mutated");
  assert.equal(afterBuy.cash, 750);
  assert.equal(afterBuy.positions.NVDA.qty, 2.5);
  const afterSell = applyVerdict(afterBuy, council("SELL", 110), 2);
  assert.equal(afterSell.positions.NVDA, undefined);
  assert.equal(afterSell.fills.at(-1).pnl, 25);
  assert.equal(afterSell.cash, 1025);
});

test("hold and repeated buys leave the ledger unchanged", () => {
  const start = emptyLedger();
  assert.equal(applyVerdict(start, council("HOLD")), start);
  const once = applyVerdict(start, council("BUY"));
  assert.equal(applyVerdict(once, council("BUY")), once);
});

test("api resolution prefers flag, then env, then config", () => {
  assert.equal(resolveApi("https://a.x/", { CONSIL_API: "https://b.x" }, { api: "https://c.x" }), "https://a.x");
  assert.equal(resolveApi(undefined, { CONSIL_API: "https://b.x" }, { api: "https://c.x" }), "https://b.x");
  assert.equal(resolveApi(undefined, {}, { api: "https://c.x" }), "https://c.x");
});

test("council text shows every agent and the verdict", () => {
  const out = formatCouncil(council("BUY"));
  for (const word of ["SCOUT", "QUANT", "RISK", "EXEC", "VERDICT", "BUY"]) assert.match(out, new RegExp(word));
});

import { normalizeRules, DEFAULT_RULES } from "../server/council.mjs";

test("rules are clamped to their ranges and junk falls back to defaults", () => {
  const r = normalizeRules({ quorum: 9, maxSpreadBps: -5, rsiBuy: "abc", ticketUsd: "300", extra: 1 });
  assert.equal(r.quorum, 4);
  assert.equal(r.maxSpreadBps, 2);
  assert.equal(r.rsiBuy, DEFAULT_RULES.rsiBuy);
  assert.equal(r.ticketUsd, 300);
  assert.equal(r.extra, undefined);
});

test("crossed RSI lines reset to the defaults", () => {
  const r = normalizeRules({ rsiBuy: 50, rsiSell: 50 });
  assert.equal(r.rsiBuy, DEFAULT_RULES.rsiBuy);
  assert.equal(r.rsiSell, DEFAULT_RULES.rsiSell);
});

test("a stricter quorum turns a 3-of-4 trade into a hold", () => {
  const votes = { scout: { vote: "BUY" }, quant: { vote: "HOLD" }, risk: { vote: "APPROVE" }, exec: { vote: "READY" } };
  assert.equal(tally(votes, 3).action, "BUY");
  assert.equal(tally(votes, 4).action, "HOLD");
});
