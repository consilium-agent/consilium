# Screenshots the running site section by section and prints page errors.
#   python -I tools/qa_shots.py [url] [w] [h]
import sys, pathlib
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5120/"
w = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
h = int(sys.argv[3]) if len(sys.argv) > 3 else 900
out = pathlib.Path(__file__).resolve().parent.parent / "_shots"
tag = "d" if w > 800 else "m"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": w, "height": h})
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)))
    pg.on("console", lambda m: errs.append("console " + m.text) if m.type == "error" else None)
    pg.goto(url, wait_until="networkidle")
    pg.wait_for_timeout(1500); pg.screenshot(path=str(out / f"{tag}-00-building.png"))
    pg.wait_for_timeout(5000); pg.screenshot(path=str(out / f"{tag}-01-hero.png"))
    for i, sel in enumerate(["#problem", "#agents .step:nth-child(1)", "#agents .step:nth-child(3)", "#council", "#ask", "#terminal", "#download", "#api", "#numbers", "#roadmap", ".cta"], 2):
        pg.eval_on_selector(sel, "e => e.scrollIntoView({block: 'start'})")
        pg.wait_for_timeout(4200)
        pg.screenshot(path=str(out / f"{tag}-{i:02d}-{sel.strip('#.').split()[0]}.png"))
    print("scrollWidth", pg.evaluate("document.documentElement.scrollWidth"), "viewport", w)
    print("\n".join(errs) or "no errors")
    b.close()
