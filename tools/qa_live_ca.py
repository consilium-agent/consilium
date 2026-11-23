# Opens the front page, saves a contract through the admin API, and checks the page updates without a reload.
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5188"
PW = sys.argv[2] if len(sys.argv) > 2 else "local-test-pw"
CA = "0x" + "c0" * 20
def call(method, path, body, cookie=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method=method, headers={"content-type": "application/json", **({"cookie": cookie} if cookie else {})})
    with urllib.request.urlopen(req) as r: return r.headers.get("set-cookie"), json.loads(r.read())
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(BASE + "/", wait_until="networkidle"); pg.wait_for_timeout(1500)
    before = pg.inner_text(".tb-ca")
    ck, _ = call("POST", "/v1/admin/login", {"password": PW})
    call("PUT", "/v1/admin/settings", {"ca": CA, "pons": "https://pons.example.app/token/" + CA}, ck.split(";")[0])
    t0 = time.time(); after = before
    while time.time() - t0 < 25 and after == before:
        pg.wait_for_timeout(500); after = pg.inner_text(".tb-ca")
    buy = pg.get_attribute(".topbar [data-social=pons]", "href")
    hero = pg.inner_text("#lb-ca")
    print(f"before={before!r} after={after!r} hero={hero!r} buy={buy} updated_in={time.time()-t0:.1f}s")
    b.close()
