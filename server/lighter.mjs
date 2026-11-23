// Public market data from Lighter's Robinhood Chain exchange: stock tokens and crypto on spot
// (quoted in USDG) plus crypto perpetuals. Read-only: no keys, no signing.
const API = process.env.LIGHTER_API || "https://api.rh.lighter.xyz";
const MARKETS_TTL = 20_000;
const BOOK_TTL = 3_000;
const CANDLE_TTL = 4_000; // short so live charts move; Lighter is hit at most once per key per 4 s
export const LIQUID_USD = 100_000;
export const ENABLED_USD = 5_000;

const cache = new Map();

async function get(path, attempt = 0) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const res = await fetch(API + path, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`lighter ${res.status} ${path}`);
    return await res.json();
  } catch (err) {
    if (attempt < 1) return get(path, attempt + 1);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Serve a fresh value, or the last good one while a refresh runs / when Lighter fails.
async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  if (hit?.pending) return hit.value ?? hit.pending;
  const pending = load()
    .then((value) => { cache.set(key, { at: Date.now(), value }); return value; })
    .catch((err) => {
      const prev = cache.get(key);
      cache.set(key, { at: prev?.at ?? 0, value: prev?.value });
      if (prev?.value !== undefined) return prev.value;
      throw err;
    });
  cache.set(key, { ...(hit || {}), pending });
  return hit?.value ?? pending;
}

function tierOf(vol) {
  if (vol >= LIQUID_USD) return "liquid";
  if (vol >= ENABLED_USD) return "thin";
  return "illiquid";
}

// Crypto assets listed on Lighter RH. Everything else on spot is a stock token or fund.
export const CRYPTO = new Set(["BTC", "ETH", "SOL", "XRP", "HYPE", "SUI", "ENA", "ZRO", "VVV", "TRX", "NEAR", "XMR", "WLD", "AAVE", "LINK", "LIT", "PUMP", "XPL", "UNI", "ZEC", "PONS"]);

function shape(m, kind) {
  const sym = kind === "spot" ? m.symbol.split("/")[0] : m.symbol;
  const dayVolumeUsd = Number(m.daily_quote_token_volume) || 0;
  const tier = tierOf(dayVolumeUsd);
  return {
    symbol: sym,
    pair: kind === "spot" ? m.symbol : `${sym}-PERP`,
    kind,
    asset: CRYPTO.has(sym) ? "crypto" : "stock",
    marketId: m.market_id,
    sizeDecimals: m.size_decimals ?? m.supported_size_decimals,
    priceDecimals: m.price_decimals ?? m.supported_price_decimals,
    minBase: Number(m.min_base_amount),
    minQuote: Number(m.min_quote_amount),
    last: Number(m.last_trade_price) || 0,
    high: Number(m.daily_price_high) || 0,
    low: Number(m.daily_price_low) || 0,
    change24hPct: Number(m.daily_price_change) || 0,
    dayVolumeUsd,
    trades24h: m.daily_trades_count || 0,
    status: m.status,
    open: m.status === "active" && !m.is_frozen,
    tier,
    enabled: tier !== "illiquid" && m.status === "active" && !m.is_frozen,
  };
}

// Spot stock tokens, plus crypto from spot or perp: whichever market trades more for that coin.
export function getMarkets() {
  return cached("markets", MARKETS_TTL, async () => {
    const data = await get("/api/v1/orderBookDetails");
    const bySymbol = new Map();
    for (const m of data.spot_order_book_details || []) {
      if (m.market_type === "spot" && /\/USDG$/.test(m.symbol)) { const s = shape(m, "spot"); bySymbol.set(s.symbol, s); }
    }
    for (const m of data.order_book_details || []) {
      if (m.market_type !== "perp" || !CRYPTO.has(m.symbol)) continue;
      const p = shape(m, "perp");
      const spot = bySymbol.get(p.symbol);
      if (!spot || p.dayVolumeUsd > spot.dayVolumeUsd) bySymbol.set(p.symbol, p);
    }
    return [...bySymbol.values()].sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);
  });
}

export async function marketBySymbol(symbol) {
  const list = await getMarkets();
  return list.find((m) => m.symbol === symbol) || null;
}

const RES_MS = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

export function getCandles(marketId, resolution = "1h", count = 120) {
  const step = RES_MS[resolution];
  if (!step) throw new Error(`bad resolution ${resolution}`);
  const n = Math.max(10, Math.min(500, count | 0));
  return cached(`c:${marketId}:${resolution}:${n}`, CANDLE_TTL, async () => {
    const end = Date.now();
    const start = end - step * (n + 2);
    const q = `market_id=${marketId}&resolution=${resolution}&start_timestamp=${start}&end_timestamp=${end}&count_back=${n}`;
    const data = await get(`/api/v1/candles?${q}`);
    return (data.c || []).map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.V }));
  });
}

export function getBook(marketId) {
  return cached(`b:${marketId}`, BOOK_TTL, async () => {
    const data = await get(`/api/v1/orderBookOrders?market_id=${marketId}&limit=50`);
    const side = (rows) => (rows || []).map((o) => ({ price: Number(o.price), size: Number(o.remaining_base_amount) }));
    const bids = side(data.bids).sort((a, b) => b.price - a.price);
    const asks = side(data.asks).sort((a, b) => a.price - b.price);
    const mid = bids.length && asks.length ? (bids[0].price + asks[0].price) / 2 : bids[0]?.price || asks[0]?.price || 0;
    const spreadBps = bids.length && asks.length && mid ? ((asks[0].price - bids[0].price) / mid) * 10_000 : Infinity;
    return { bids, asks, mid, spreadBps, at: Date.now() };
  });
}
