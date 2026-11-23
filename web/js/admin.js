// Admin panel: log in, then edit the contract, Pons/chart links, X and GitHub shown across the site.
const $ = (id) => document.getElementById(id);
const FIELDS = ["ca", "pons", "chart", "x", "github"];

async function call(method, path, body) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
function show(loggedIn) {
  $("login").hidden = loggedIn;
  $("panel").hidden = !loggedIn;
}
function fill(s) { for (const f of FIELDS) $("f-" + f).value = s[f] || ""; }

async function load() {
  try { fill((await call("GET", "/v1/admin/settings")).settings); show(true); }
  catch { show(false); }
}

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-msg").textContent = "";
  try { await call("POST", "/v1/admin/login", { password: $("pw").value }); $("pw").value = ""; await load(); }
  catch (err) { $("login-msg").textContent = err.message; }
});
$("panel").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("save-msg");
  msg.className = "kick"; msg.textContent = "Saving…";
  try {
    const patch = Object.fromEntries(FIELDS.map((f) => [f, $("f-" + f).value]));
    fill((await call("PUT", "/v1/admin/settings", patch)).settings);
    msg.className = "kick chg-up"; msg.textContent = "Saved. The site shows it on the next page load.";
  } catch (err) {
    if (err.status === 401) show(false);
    msg.className = "kick chg-dn"; msg.textContent = err.message;
  }
});
$("logout").addEventListener("click", async () => { await call("POST", "/v1/admin/logout").catch(() => {}); show(false); });
load();
