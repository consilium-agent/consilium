# Renders the logo sheet and the standalone brand PNGs.
import sys, pathlib
from playwright.sync_api import sync_playwright
here = pathlib.Path(__file__).parent
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.goto((here / "sheet.html").as_uri(), wait_until="networkidle"); pg.wait_for_timeout(800)
    pg.screenshot(path=str(here / "logo-sheet.png"), full_page=True)
    for name, sel in [("lockup-light", ".p.light .lock"), ("lockup-dark", ".p.dark .lock"), ("token", ".coin")]:
        pg.locator(sel).first.screenshot(path=str(here / f"{name}.png"), omit_background=False)
    icon = b.new_page(viewport={"width": 1024, "height": 1024})
    icon.set_content(f'<body style="margin:0"><img src="{(here.parent/"web/img/mark.svg").as_uri()}" style="width:1024px;height:1024px;display:block">'); icon.wait_for_timeout(300)
    icon.screenshot(path=str(here / "mark-1024.png"))
    b.close()
print("ok")
