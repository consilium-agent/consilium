// Site settings + admin login (ported from VOLUND/GOVERNOR). The admin panel sets the contract, Pons and chart
// links, X and GitHub; every page reads them from /site.json, so launch day needs no redeploy.
// Password: ADMIN_PASSWORD, or DATA_DIR/admin-password.txt (a random one is written on first start).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const FILE = path.join(DIR, "site.json");
const SESSION_MS = 12 * 3600e3;
const LOGIN_LIMIT = 10;            // attempts per IP per hour
export const DEFAULTS = { ca: "", pons: "", chart: "", x: "", github: "" };

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
function link(value, what, hosts) {
  const u = String(value ?? "").trim();
  if (!u) return "";
  let parsed;
  try { parsed = new URL(u); } catch { throw bad(`${what}: not a valid link.`); }
  if (parsed.protocol !== "https:") throw bad(`${what} must start with https://`);
  if (hosts && !hosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith("." + h))) throw bad(`${what} must be a link on ${hosts.join(" or ")}.`);
  if (/["'<>\s]/.test(u)) throw bad(`${what}: invalid characters.`);
  return u.slice(0, 200);
}

let S = { ...DEFAULTS };
let PASS = "";
const SESS = new Map();            // token -> expiry
const TRIES = new Map();           // ip -> [timestamps]

// fallbackFile seeds the settings on first start (the web/site.json shipped with the release)
export function initSite(fallbackFile) {
  fs.mkdirSync(DIR, { recursive: true });
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* first start */ }
  if (!saved && fallbackFile) { try { saved = JSON.parse(fs.readFileSync(fallbackFile, "utf8")); } catch { /* none */ } }
  S = { ...DEFAULTS, ...(saved || {}) };
  PASS = process.env.ADMIN_PASSWORD || "";
  const pf = path.join(DIR, "admin-password.txt");
  if (!PASS) {
    try { PASS = fs.readFileSync(pf, "utf8").trim(); } catch { PASS = crypto.randomBytes(12).toString("base64url"); fs.writeFileSync(pf, PASS + "\n", { mode: 0o600 }); }
  }
}

export const siteSettings = () => ({ ...S });

// Only known keys, each checked, so a bad form can never break the site.
export function updateSettings(patch = {}) {
  const next = { ...S };
  if (patch.ca != null) { const c = String(patch.ca).trim(); if (c && !isAddr(c)) throw bad("Contract must be a 0x address (42 characters) or empty."); next.ca = c; }
  if (patch.pons != null) next.pons = link(patch.pons, "Pons link");
  if (patch.chart != null) next.chart = link(patch.chart, "Chart link");
  if (patch.x != null) {
    const raw = String(patch.x).trim();
    const handle = raw.replace(/^@/, "").replace(/^https:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/[/?#].*$/, "");
    if (raw && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw bad("X: a handle like @ConsiliumDesk or an x.com profile link.");
    next.x = raw ? `https://x.com/${handle}` : "";
  }
  if (patch.github != null) next.github = link(patch.github, "GitHub link", ["github.com"]);
  S = next;
  fs.writeFileSync(FILE, JSON.stringify(S, null, 1));
  return { ...S };
}

export function login(ip, pw) {
  const now = Date.now();
  const tries = (TRIES.get(ip) || []).filter((t) => now - t < 3600e3);
  if (tries.length >= LOGIN_LIMIT) throw Object.assign(new Error("Too many attempts. Try again in an hour."), { status: 429 });
  TRIES.set(ip, [...tries, now]);
  const a = Buffer.from(String(pw || "")), b = Buffer.from(PASS);
  if (!PASS || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw Object.assign(new Error("Wrong password."), { status: 401 });
  const t = crypto.randomBytes(24).toString("base64url");
  SESS.set(t, now + SESSION_MS);
  return t;
}
const tokenOf = (req) => /(?:^|;\s*)consil_admin=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie || "")?.[1] || null;
export const logout = (req) => { const t = tokenOf(req); if (t) SESS.delete(t); };
export function isAdmin(req) {
  const t = tokenOf(req), exp = t && SESS.get(t);
  if (!exp || exp < Date.now()) { if (t) SESS.delete(t); return false; }
  return true;
}
export const cookie = (t, maxAge = SESSION_MS / 1000) =>
  `consil_admin=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
