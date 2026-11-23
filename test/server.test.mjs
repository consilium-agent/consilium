// Boots the real server on a spare port with the model switched off.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, [fileURLToPath(new URL("../server/server.mjs", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: "off", ADMIN_PASSWORD: "test-pass-123", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "consil-")) }, stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + "/v1/health")).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => proc?.kill());

test("health reports paper mode and the model state", async () => {
  const d = await (await fetch(BASE + "/v1/health")).json();
  assert.equal(d.ok, true);
  assert.equal(d.mode, "paper");
  assert.equal(d.model, "offline");
});

test("ask without a model answers 503, not a hang", async () => {
  const r = await fetch(BASE + "/v1/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "hi" }) });
  assert.equal(r.status, 503);
});

test("ask validates the question", async () => {
  const empty = await fetch(BASE + "/v1/ask", { method: "POST", body: "{}" });
  assert.equal(empty.status, 400);
  const long = await fetch(BASE + "/v1/ask", { method: "POST", body: JSON.stringify({ question: "x".repeat(700) }) });
  assert.equal(long.status, 400);
  const bad = await fetch(BASE + "/v1/ask", { method: "POST", body: "{nope" });
  assert.equal(bad.status, 400);
});

test("unknown api route is a JSON 404", async () => {
  const r = await fetch(BASE + "/v1/nope");
  assert.equal(r.status, 404);
  assert.equal((await r.json()).ok, false);
});

test("downloads cannot escape the dist folder", async () => {
  const r = await fetch(BASE + "/dl/..%2Fpackage.json");
  assert.ok(r.status === 403 || r.status === 404);
});

test("install scripts point at this site", async () => {
  const sh = await (await fetch(BASE + "/install.sh")).text();
  assert.match(sh, new RegExp(`SITE="\\$\\{CONSIL_SITE:-${BASE.replace(/[.]/g, "\\.")}\\}"`));
  assert.doesNotMatch(sh, /__SITE__/);
});

test("pages carry security headers", async () => {
  const r = await fetch(BASE + "/");
  assert.match(r.headers.get("content-security-policy") || "", /default-src 'self'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});

test("ask rejects an unknown agent", async () => {
  const r = await fetch(BASE + "/v1/ask", { method: "POST", body: JSON.stringify({ question: "hi", agent: "oracle" }) });
  assert.equal(r.status, 400);
});

test("rules endpoint lists defaults and ranges", async () => {
  const d = await (await fetch(BASE + "/v1/rules")).json();
  assert.equal(d.defaults.quorum, 3);
  assert.deepEqual(d.bounds.quorum, [3, 2, 4]);
});

test("media answers byte ranges", async () => {
  const r = await fetch(BASE + "/media/term.txt", { headers: { range: "bytes=0-9" } });
  assert.equal(r.status, 206);
  assert.equal((await r.text()).length, 10);
});

test("markets can be filtered to crypto or stocks", async () => {
  const c = await (await fetch(BASE + "/v1/markets?asset=crypto")).json();
  assert.ok(c.markets.length > 0, "crypto markets listed");
  assert.ok(c.markets.every((m) => m.asset === "crypto"));
  const s = await (await fetch(BASE + "/v1/markets?asset=stock")).json();
  assert.ok(s.markets.every((m) => m.asset === "stock"));
});

test("admin rejects a wrong password and unauthenticated settings", async () => {
  const bad = await fetch(BASE + "/v1/admin/login", { method: "POST", body: JSON.stringify({ password: "nope" }) });
  assert.equal(bad.status, 401);
  const anon = await fetch(BASE + "/v1/admin/settings");
  assert.equal(anon.status, 401);
});

test("admin can set the contract and X, and /site.json shows them", async () => {
  const login = await fetch(BASE + "/v1/admin/login", { method: "POST", body: JSON.stringify({ password: "test-pass-123" }) });
  assert.equal(login.status, 200);
  const jar = login.headers.get("set-cookie").split(";")[0];
  const put = (body) => fetch(BASE + "/v1/admin/settings", { method: "PUT", headers: { cookie: jar }, body: JSON.stringify(body) });
  assert.equal((await put({ ca: "not-an-address" })).status, 400);
  assert.equal((await put({ github: "https://evil.example/x" })).status, 400);
  const ok = await put({ ca: "0x" + "ab".repeat(20), x: "@ConsiliumDesk" });
  assert.equal(ok.status, 200);
  const site = await (await fetch(BASE + "/site.json")).json();
  assert.equal(site.ca, "0x" + "ab".repeat(20));
  assert.equal(site.x, "https://x.com/ConsiliumDesk");
});
