# One screenshot of a page after an optional click.  python -I tools/qa_page.py url out.png [w] [h] [clickSelector] [waitMs]
import sys
from playwright.sync_api import sync_playwright
url, out = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
h = int(sys.argv[4]) if len(sys.argv) > 4 else 900
click = sys.argv[5] if len(sys.argv) > 5 else ""
wait = int(sys.argv[6]) if len(sys.argv) > 6 else 2500
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": w, "height": h})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url, wait_until="networkidle")
    if click: pg.click(click)
    pg.wait_for_timeout(wait)
    pg.screenshot(path=out, full_page=w < 800)
    print("scrollW", pg.evaluate("document.documentElement.scrollWidth"), "errors", errs)
    b.close()
