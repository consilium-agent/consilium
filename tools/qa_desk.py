# Drives the live desk: first load, a rules preset, then a question to RISK.
from playwright.sync_api import sync_playwright
import pathlib
out = pathlib.Path(__file__).resolve().parent.parent / "_shots"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1440, "height": 900}, bypass_csp=True).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://127.0.0.1:5120/app", wait_until="networkidle")
    pg.wait_for_function("document.querySelector('#b-verdict b')", timeout=60000)
    pg.wait_for_timeout(9000)
    pg.screenshot(path=str(out / "desk-1.png"))
    pg.click(".ptabs [data-tab=rules]"); pg.click(".presets [data-p=cautious]")
    pg.wait_for_timeout(9000)
    pg.screenshot(path=str(out / "desk-2-rules.png"))
    pg.click(".ptabs [data-tab=agents]"); pg.click("#agent-pick [data-a=risk]")
    pg.fill("#ask-q", "Would you veto this market under my rules?"); pg.press("#ask-q", "Enter")
    pg.wait_for_function("!document.getElementById('ask-q').disabled", timeout=90000)
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(out / "desk-3-risk.png"))
    print("errors", errs)
    b.close()
