// CONSILIUM desk server: static site + public read API + streamed Q&A.
//   node server/server.mjs            (PORT, default 5120)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { convene, snapshot, marketContext, normalizeRules, RULE_BOUNDS, DEFAULT_RULES } from "./council.mjs";
import { getCandles, marketBySymbol } from "./lighter.mjs";
import { makeAi, MODEL, AGENTS } from "./ai.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 5120;
const HOST = process.env.HOST || "127.0.0.1";
const VERSION = "0.1.0";

// ANTHROPIC_API_KEY=off runs the desk without the model (rules only), e.g. in tests.
const KEY_FILE = join(homedir(), ".anthropic_key");
const ENV_KEY = process.env.ANTHROPIC_API_KEY;
const KEY = ENV_KEY === "off" ? "" : ENV_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8").trim() : "");
const { askStream, brief, hasModel } = makeAi(KEY);

const MAX_QUESTION = 600;
const MAX_HISTORY = 8;
const ASK_LIMIT = { n: 20, windowMs: 10 * 60_000 };
const API_LIMIT = { n: 240, windowMs: 60_000 };
const BRIEF_TTL = 90_000;
const BRIEF_LIMIT = { n: 40, windowMs: 10 * 60_000 };

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".mp4": "video/mp4", ".woff2": "font/woff2",
  ".zip": "application/zip", ".exe": "application/vnd.microsoft.portable-executable", ".sh": "text/plain; charset=utf-8",
  ".ps1": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};
const PAGES = { "/": "index.html", "/app": "app.html", "/docs": "docs.html", "/download": "download.html" };

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'self'",
};

// Fixed-window counters per IP and bucket.
const hits = new Map();
function limited(ip, bucket, { n, windowMs }) {
  const key = bucket + ":" + ip;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.start > windowMs) { hits.set(key, { start: now, count: 1 }); return false; }
  h.count += 1;
  return h.count > n;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h.start > 15 * 60_000) hits.delete(k); }, 60_000).unref();

const clientIp = (req) => (process.env.TRUST_PROXY ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") || req.socket.remoteAddress || "?";

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, data) => send(res, status, JSON.stringify(data), { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
const fail = (res, status, error) => json(res, status, { ok: false, error });

async function readBody(req, max = 16_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw Object.assign(new Error("invalid JSON"), { status: 400 }); }
}

// Briefs are cached per market, rule set and vote pattern; a fresh one is only written when
// the votes change or the cache is older than BRIEF_TTL. Custom rule sets share a per-IP budget.
const briefs = new Map();
async function councilWithBrief(symbol, rules, { wantBrief = true, ip = "?" } = {}) {
  const c = await convene(symbol, rules);
  if (!wantBrief) return { ...c, brief: null };
  const slot = c.symbol + ":" + JSON.stringify(c.rules);
  const key = c.verdict.action + ":" + c.votes.scout.vote + c.votes.quant.vote + c.votes.risk.vote + c.votes.exec.vote;
  const hit = briefs.get(slot);
  if (hit && hit.key === key && Date.now() - hit.at < BRIEF_TTL) return { ...c, brief: hit.brief };
  if (c.custom && limited(ip, "brief", BRIEF_LIMIT)) return { ...c, brief: hit?.key === key ? hit.brief : null };
  const b = await brief(c).catch((err) => { console.error("brief failed:", err.status || "", err.message); return null; });
  if (b) {
    briefs.set(slot, { key, at: Date.now(), brief: b });
    if (briefs.size > 500) briefs.delete(briefs.keys().next().value);
  }
  return { ...c, brief: b };
}
const rulesFrom = (params) => normalizeRules(Object.fromEntries(Object.keys(RULE_BOUNDS).filter((k) => params.has(k)).map((k) => [k, params.get(k)])));

function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  const out = h
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-MAX_HISTORY);
  while (out.length && out[0].role !== "user") out.shift();
  // Roles must alternate and end on an assistant turn before the new question.
  const alt = [];
  for (const m of out) if (!alt.length || alt[alt.length - 1].role !== m.role) alt.push(m);
  if (alt.length && alt[alt.length - 1].role === "user") alt.pop();
  return alt;
}

async function ask(req, res, ip) {
  if (limited(ip, "ask", ASK_LIMIT)) return fail(res, 429, "Too many questions. Try again in a few minutes.");
  const body = await readBody(req);
  const question = String(body.question || "").trim();
  if (!question) return fail(res, 400, "question is required");
  if (question.length > MAX_QUESTION) return fail(res, 400, `question is longer than ${MAX_QUESTION} characters`);
  const agent = body.agent == null ? "chair" : String(body.agent).toLowerCase();
  if (!AGENTS[agent]) return fail(res, 400, `agent must be one of ${Object.keys(AGENTS).join(", ")}`);
  if (!hasModel()) return fail(res, 503, "The desk model is offline.");
  const context = await marketContext(question, normalizeRules(body.rules && typeof body.rules === "object" ? body.rules : {}));
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", connection: "keep-alive" });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  emit("context", { councils: context.councils.map((c) => ({ symbol: c.symbol, action: c.verdict.action, behind: c.verdict.behind })) });
  let closed = false;
  req.on("close", () => { closed = true; });
  try {
    for await (const text of askStream(question, cleanHistory(body.history), context, agent)) {
      if (closed) break;
      emit("text", { text });
    }
    emit("done", { model: MODEL, agent });
  } catch (err) {
    console.error("ask failed:", err.status || "", err.message);
    emit("error", { error: err.status === 429 ? "The desk is busy. Try again in a minute." : "The desk could not answer right now." });
  }
  res.end();
}

async function api(req, res, url) {
  const ip = clientIp(req);
  if (req.method === "OPTIONS") return send(res, 204, "", { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" });
  if (limited(ip, "api", API_LIMIT)) return fail(res, 429, "rate limited");
  const p = url.pathname;
  if (p === "/v1/health") return json(res, 200, { ok: true, version: VERSION, model: hasModel() ? "online" : "offline", mode: "paper" });
  if (p === "/v1/markets") {
    const asset = url.searchParams.get("asset");
    const list = await snapshot(80);
    return json(res, 200, { ok: true, markets: asset === "crypto" || asset === "stock" ? list.filter((m) => m.asset === asset) : list });
  }
  let m = p.match(/^\/v1\/council\/([A-Za-z0-9.]{1,12})$/);
  if (m) return json(res, 200, { ok: true, council: await councilWithBrief(m[1], rulesFrom(url.searchParams), { wantBrief: url.searchParams.get("brief") !== "0", ip }) });
  if (p === "/v1/rules") return json(res, 200, { ok: true, defaults: DEFAULT_RULES, bounds: RULE_BOUNDS });
  m = p.match(/^\/v1\/candles\/([A-Za-z0-9.]{1,12})$/);
  if (m) {
    const mk = await marketBySymbol(m[1].toUpperCase());
    if (!mk) return fail(res, 404, "unknown market");
    const res1 = ["1m", "5m", "15m", "1h", "4h", "1d"].includes(url.searchParams.get("res")) ? url.searchParams.get("res") : "1h";
    const count = Math.max(10, Math.min(500, Number(url.searchParams.get("count")) || 300));
    return json(res, 200, { ok: true, symbol: mk.symbol, pair: mk.pair, res: res1, candles: await getCandles(mk.marketId, res1, count) });
  }
  if (p === "/v1/ask" && req.method === "POST") return ask(req, res, ip);
  return fail(res, 404, "not found");
}

// SITE_URL in production; locally the Host header of a loopback request.
function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const host = String(req.headers.host || "");
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ? `http://${host}` : `http://127.0.0.1:${PORT}`;
}

// Streams files (the Windows app is ~95 MB) and answers byte ranges so video seeking works.
async function file(req, res, base, rel, cache) {
  const path = normalize(join(base, rel));
  if (!path.startsWith(base + sep)) return send(res, 403, "forbidden");
  let s;
  try {
    s = await stat(path);
    if (!s.isFile()) throw new Error("not a file");
  } catch {
    const nf = await readFile(join(WEB, "404.html")).catch(() => "Not found");
    return send(res, 404, nf, { "content-type": "text/html; charset=utf-8" });
  }
  const headers = { ...SECURITY_HEADERS, "content-type": TYPES[extname(path).toLowerCase()] || "application/octet-stream", "cache-control": cache, "accept-ranges": "bytes" };
  if (base === DIST) headers["content-disposition"] = `attachment; filename="${rel.split("/").pop()}"`;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  let start = 0;
  let end = s.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, s.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), s.size - 1) : s.size - 1;
    if (start > end || start >= s.size) {
      res.writeHead(416, { ...headers, "content-range": `bytes */${s.size}` });
      return res.end();
    }
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${s.size}`;
  }
  headers["content-length"] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(path, { start, end });
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/v1/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
    if (url.pathname.startsWith("/dl/")) return await file(req, res, DIST, decodeURIComponent(url.pathname.slice(4)), "no-cache");
    if (url.pathname === "/install.sh" || url.pathname === "/install.ps1") {
      const script = await readFile(join(ROOT, "cli", url.pathname.slice(1)), "utf8");
      return send(res, 200, script.replaceAll("__SITE__", siteOrigin(req)), { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
    }
    if (url.pathname === "/site.json") return await file(req, res, WEB, "site.json", "no-cache");
    const page = PAGES[url.pathname.replace(/\/$/, "") || "/"];
    if (page) return await file(req, res, WEB, page, "no-cache");
    return await file(req, res, WEB, decodeURIComponent(url.pathname), "public, max-age=300");
  } catch (err) {
    console.error(req.method, url.pathname, err.status || 500, err.message);
    if (res.headersSent) return res.end();
    return fail(res, err.status || 502, err.status ? err.message : "upstream error, try again");
  }
});

server.listen(PORT, HOST, () => console.log(`CONSILIUM desk on http://${HOST}:${PORT} (model ${hasModel() ? "online" : "offline"})`));
