// Live candlestick chart (TradingView Lightweight Charts, vendored). Drag to pan, scroll or
// pinch to zoom; the last candle updates every few seconds from /v1/candles.
import { api, fmt } from "./common.js";

const LIVE_MS = 5000;
const HISTORY = 400;
const UP = "#3fbf8a";
const DOWN = "#ef5a45";

export function createLiveChart(el, legend) {
  const LC = window.LightweightCharts;
  if (!LC) {
    el.textContent = "Chart library failed to load.";
    return { load() {}, fit() {}, live() {} };
  }
  const chart = LC.createChart(el, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: "#8a867f", fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
    grid: { vertLines: { color: "rgba(236,232,225,.05)" }, horzLines: { color: "rgba(236,232,225,.05)" } },
    rightPriceScale: { borderColor: "rgba(236,232,225,.12)", scaleMargins: { top: 0.08, bottom: 0.24 } },
    timeScale: { borderColor: "rgba(236,232,225,.12)", timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8 },
    crosshair: { mode: LC.CrosshairMode.Normal, vertLine: { color: "rgba(236,232,225,.3)", labelBackgroundColor: "#1b1b1e" }, horzLine: { color: "rgba(236,232,225,.3)", labelBackgroundColor: "#1b1b1e" } },
    handleScroll: true,
    handleScale: true,
  });
  const candles = chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceLineColor: "#e2531c" });
  const volume = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
  chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

  let sym = null;
  let res = "1h";
  let last = null;
  let timer = null;
  let token = 0;

  const toBar = (c) => ({ time: Math.floor(c.t / 1000), open: +c.o, high: +c.h, low: +c.l, close: +c.c });
  const toVol = (c) => ({ time: Math.floor(c.t / 1000), value: +c.v || 0, color: +c.c >= +c.o ? "rgba(63,191,138,.35)" : "rgba(239,90,69,.35)" });
  const precision = (p) => (p >= 1000 ? 1 : p >= 10 ? 2 : p >= 1 ? 3 : p >= 0.01 ? 5 : 8);

  function showLegend(bar, vol) {
    if (!legend || !bar) return;
    const ch = ((bar.close / bar.open - 1) * 100).toFixed(2);
    const cls = bar.close >= bar.open ? "chg-up" : "chg-dn";
    legend.innerHTML = `<b>${sym}</b> <span>${res}</span> O <span>${fmt(bar.open, precision(bar.open))}</span> H <span>${fmt(bar.high, precision(bar.open))}</span> L <span>${fmt(bar.low, precision(bar.open))}</span> C <span class="${cls}">${fmt(bar.close, precision(bar.open))} (${ch >= 0 ? "+" : ""}${ch}%)</span>${vol != null ? ` V <span>${fmt(vol, 0)}</span>` : ""}`;
  }
  chart.subscribeCrosshairMove((p) => {
    const bar = p.seriesData?.get(candles);
    const v = p.seriesData?.get(volume);
    showLegend(bar || last?.bar, bar ? v?.value : last?.vol);
  });

  async function load(symbol, resolution = res) {
    sym = symbol;
    res = resolution;
    const my = ++token;
    clearInterval(timer);
    const { candles: rows } = await api(`/v1/candles/${sym}?res=${res}&count=${HISTORY}`);
    if (my !== token) return;
    const bars = rows.map(toBar).filter((b, i, a) => i === 0 || b.time > a[i - 1].time);
    const p = precision(bars.at(-1)?.close || 1);
    candles.applyOptions({ priceFormat: { type: "price", precision: p, minMove: 1 / 10 ** p } });
    candles.setData(bars);
    volume.setData(rows.map(toVol).filter((b, i, a) => i === 0 || b.time > a[i - 1].time));
    last = { bar: bars.at(-1), vol: +rows.at(-1)?.v || 0 };
    showLegend(last.bar, last.vol);
    chart.timeScale().fitContent();
    timer = setInterval(() => tick(my), LIVE_MS);
  }

  // Pull the newest candles and update in place; a new period appends a bar.
  async function tick(my) {
    if (document.hidden || my !== token) return;
    try {
      const { candles: rows } = await api(`/v1/candles/${sym}?res=${res}&count=10`);
      if (my !== token) return;
      for (const c of rows) {
        const bar = toBar(c);
        if (last?.bar && bar.time < last.bar.time) continue;
        candles.update(bar);
        volume.update(toVol(c));
        last = { bar, vol: +c.v || 0 };
      }
      showLegend(last.bar, last.vol);
    } catch { /* keep the last picture; next tick retries */ }
  }

  return {
    load,
    fit: () => chart.timeScale().fitContent(),
    live: () => chart.timeScale().scrollToRealTime(),
  };
}
