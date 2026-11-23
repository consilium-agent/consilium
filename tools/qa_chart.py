# Live chart check: BTC 1m, zoom with the wheel, pan with a drag, then wait for a live update.
from playwright.sync_api import sync_playwright
import pathlib
out = pathlib.Path(__file__).resolve().parent.parent / "_shots"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1440, "height": 900}, bypass_csp=True).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:5120/app?s=BTC", wait_until="networkidle")
    pg.wait_for_timeout(4000)
    pg.click("#res [data-r='1m']"); pg.wait_for_timeout(3000)
    pg.screenshot(path=str(out / "chart-1.png"))
    box = pg.locator("#chart").bounding_box()
    cx, cy = box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.45
    pg.mouse.move(cx, cy)
    for _ in range(6): pg.mouse.wheel(0, -240); pg.wait_for_timeout(80)
    pg.mouse.down(); pg.mouse.move(cx + 260, cy, steps=12); pg.mouse.up()
    pg.mouse.move(cx - 120, cy - 40)
    pg.wait_for_timeout(1200)
    pg.screenshot(path=str(out / "chart-2-zoom-pan.png"))
    legend1 = pg.inner_text("#legend")
    pg.click("#now"); pg.wait_for_timeout(11000)
    print("legend after live ticks:", pg.inner_text("#legend"))
    print("errors", errs)
    b.close()
