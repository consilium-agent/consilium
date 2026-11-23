# macOS cut of the demo: the web recording inside a Mac browser window, then a Terminal scene
# that replays real `consil` output (captured to t-*.ansi), then the end card.
#   python video/mac/build_mac.py      (needs video/out/consilium-demo.mp4)
import asyncio, html, os, re, subprocess, tempfile
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.dirname(HERE)
DEMO = os.path.join(VIDEO, "out", "consilium-demo.mp4")
OUT = os.path.join(VIDEO, "out", "consilium-demo-mac.mp4")
TMP = tempfile.mkdtemp(prefix="macdemo-")
W, H = 1920, 1080
END_CARD = 3.6
VOICE_ID = "iP95p4xoKVk53GoZ742B"   # ElevenLabs "Chris": casual, conversational
SAY = "On a Mac it's one line to install. Then it's the same four agents, right in Terminal. Bitcoin first, then the crypto markets, and a straight answer from Risk."

run = lambda *a: subprocess.run(a, check=True, capture_output=True)
dur = lambda p: float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).strip())

COLORS = {"2": "dim", "1": "b", "38;5;208": "em", "38;5;78": "ok", "38;5;203": "bad", "38;5;179": "gold", "38;5;80": "cy"}


def ansi_lines(name):
    raw = open(os.path.join(HERE, name), encoding="utf-8").read()
    raw = re.sub(r"\x1b\[2K", "", raw)
    lines = []
    for chunk in raw.split("\n"):
        chunk = chunk.split("\r")[-1]            # drop status lines that were overwritten
        if re.search(r"convening on|asking the desk|loading markets", chunk): continue
        out, open_spans = "", 0
        for part in re.split(r"(\x1b\[[0-9;]*m)", chunk):
            m = re.fullmatch(r"\x1b\[([0-9;]*)m", part)
            if not m:
                out += html.escape(part); continue
            code = m.group(1)
            if code in ("0", ""):
                out += "</span>" * open_spans; open_spans = 0
            elif code in COLORS:
                out += f'<span class="{COLORS[code]}">'; open_spans += 1
        lines.append(out + "</span>" * open_spans)
    while lines and not re.sub("<[^>]+>", "", lines[0]).strip(): lines.pop(0)
    return lines


SCRIPT = [
    ("cmd", "curl -fsSL https://consiliumdesk.xyz/install.sh | sh"),
    ("out", ["installed: /Users/trader/.local/bin/consil", "try: consil council NVDA"]),
    ("cmd", "consil council BTC"), ("out", ansi_lines("t-council.ansi")),
    ("cmd", "consil markets crypto"), ("out", ansi_lines("t-markets.ansi")),
    ("cmd", 'consil ask --agent risk "Would you veto SOL right now?"'), ("stream", ansi_lines("t-ask.ansi")),
]

DESKTOP_CSS = """
*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden}
body{background:radial-gradient(80% 90% at 75% 85%,#4a2312 0%,#1a0f0c 45%,#0b0b10 100%),#0b0b10;font-family:-apple-system,'Helvetica Neue','Segoe UI',sans-serif}
.menubar{position:absolute;left:0;right:0;top:0;height:30px;background:rgba(20,20,22,.55);backdrop-filter:blur(30px);display:flex;align-items:center;padding:0 18px;gap:22px;color:#eee;font-size:14px}
.menubar b{font-weight:700}.menubar .r{margin-left:auto;display:flex;gap:18px;opacity:.9}
.win{position:absolute;left:160px;top:66px;width:1600px;background:#1e1e20;border-radius:12px;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08)}
.bar{height:52px;display:flex;align-items:center;gap:9px;padding:0 18px;background:#2a2a2d;border-bottom:1px solid rgba(255,255,255,.06)}
.dot{width:13px;height:13px;border-radius:50%}.r1{background:#ff5f57}.r2{background:#febc2e}.r3{background:#28c840}
"""


def frame_png(path):
    """Mac desktop with a browser window; the page area (1600x900 at 160,118) is filled by the video."""
    page = f"""<html><head><style>{DESKTOP_CSS}
.url{{margin:0 auto;width:560px;height:32px;border-radius:9px;background:#3a3a3e;color:#ddd;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px}}
.url i{{width:10px;height:12px;border:2px solid #aaa;border-radius:2px;display:inline-block}}
.hole{{width:1600px;height:900px;background:#000}}</style></head><body>
<div class="menubar"><b>Browser</b><span>File</span><span>Edit</span><span>View</span><span>History</span><span>Window</span><span>Help</span><span class="r"><span>Tue 24 Nov</span><span>15:02</span></span></div>
<div class="win"><div class="bar"><span class="dot r1"></span><span class="dot r2"></span><span class="dot r3"></span><div class="url"><i></i>consiliumdesk.xyz</div></div><div class="hole"></div></div>
</body></html>"""
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": W, "height": H})
        pg.set_content(page); pg.wait_for_timeout(300); pg.screenshot(path=path); b.close()


def terminal_clip(path_mp4):
    """Renders the Terminal scene frame by frame (headless timers crawl while recording), so the
    typing and streaming run at a fixed, readable pace. Returns the clip length in seconds."""
    page = f"""<html><head><style>{DESKTOP_CSS}
.win{{top:70px;left:210px;width:1500px;height:930px;background:rgba(18,18,20,.96)}}
.title{{flex:1;text-align:center;color:#aaa;font-size:14px;margin-right:60px}}
pre{{padding:18px 22px;height:878px;overflow:hidden;color:#e6e6e6;font:17px/1.5 Menlo,'SF Mono','JetBrains Mono',monospace;white-space:pre-wrap;word-break:break-word}}
.ps{{color:#28c840}}.dim{{color:#8a8a8a}}.b{{color:#fff;font-weight:700}}.em{{color:#ff8a3d}}.ok{{color:#57d68d}}.bad{{color:#ff6b5a}}.gold{{color:#e2b453}}.cy{{color:#5fc8ee}}
.cur{{display:inline-block;width:10px;height:20px;background:#e6e6e6;vertical-align:-4px}}
</style></head><body>
<div class="menubar"><b>Terminal</b><span>Shell</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span><span class="r"><span>Tue 24 Nov</span><span>15:03</span></span></div>
<div class="win"><div class="bar"><span class="dot r1"></span><span class="dot r2"></span><span class="dot r3"></span><span class="title">trader — consil — zsh — 140×38</span></div><pre id="o"></pre></div>
<script>
const o=document.getElementById('o');
// show `body` (+ cursor) and drop whole lines from the top until it fits; returns the kept body
window.show=(body,cursor)=>{{o.innerHTML=body+(cursor?'<span class="cur"></span>':'');let kept=body;
 while(o.scrollHeight>o.clientHeight){{const i=kept.indexOf('\\n');if(i<0)break;kept=kept.slice(i+1);o.innerHTML=kept+(cursor?'<span class="cur"></span>':'')}}return kept}};
</script></body></html>"""
    frames_dir = os.path.join(TMP, "tf"); os.makedirs(frames_dir, exist_ok=True)
    ps = '<span class="ps">trader@mbp</span> <span class="dim">~ %</span> '
    shots = []   # (png, seconds)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": W, "height": H})
        pg.set_content(page); pg.wait_for_timeout(300)
        body = ""

        def snap(text, sec, cursor=False):
            nonlocal body
            body = pg.evaluate("([t, c]) => window.show(t, c)", [text, cursor])
            path = os.path.join(frames_dir, f"{len(shots):05d}.png")
            pg.screenshot(path=path); shots.append((path, sec))

        snap(ps, 0.8, True)
        for kind, v in SCRIPT:
            if kind == "cmd":
                start = body if body.endswith(ps) else body + ps
                for i in range(2, len(v) + 2, 2):
                    snap(start + html.escape(v[:i]), 0.055, True)
                snap(start + html.escape(v) + "\n", 0.5)
            elif kind == "out":
                for line in v:
                    snap(body + line + "\n", 0.08)
                snap(body + ps, 1.6, True)
            else:
                for line in v:
                    acc, base = "", body
                    toks = re.findall(r"<[^>]+>|[^<\s]+\s*|\s+", line)
                    words = 0
                    for t in toks:
                        acc += t
                        if t.startswith("<"): continue
                        words += 1
                        if words % 3 == 0: snap(base + acc, 0.09)
                    snap(base + acc + "\n", 0.1)
                snap(body + ps, 2.2, True)
        b.close()
    lst = os.path.join(TMP, "frames.txt")
    with open(lst, "w") as f:
        for path, sec in shots: f.write(f"file '{path}'\nduration {sec:.3f}\n")
        f.write(f"file '{shots[-1][0]}'\n")
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "19", "-preset", "medium", path_mp4)
    return sum(sec for _, sec in shots)


async def tts(text, path):
    """ElevenLabs (same voice as the web demo); the key is read from ~/.elevenlabs_key."""
    import json, urllib.request
    key = open(os.path.join(os.path.expanduser("~"), ".elevenlabs_key"), encoding="utf-8").read().strip()
    body = json.dumps({"text": text, "model_id": "eleven_v4",
                       "voice_settings": {"stability": 0.38, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True}}).encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128", data=body,
                                 headers={"xi-api-key": key, "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())


def main():
    total = dur(DEMO)
    frame = os.path.join(TMP, "frame.png"); frame_png(frame)
    web = os.path.join(TMP, "web.mp4")
    run("ffmpeg", "-y", "-i", frame, "-t", f"{total - END_CARD:.2f}", "-i", DEMO, "-filter_complex",
        "[1:v]scale=1600:900,fps=30[v];[0:v][v]overlay=160:118,format=yuv420p[o]", "-map", "[o]", "-map", "1:a",
        "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-c:a", "aac", "-ar", "48000", "-ac", "2", web)
    silent = os.path.join(TMP, "term-silent.mp4"); td = terminal_clip(silent)
    vo = os.path.join(TMP, "vo.mp3"); asyncio.run(tts(SAY, vo))
    term = os.path.join(TMP, "term.mp4")
    run("ffmpeg", "-y", "-i", silent, "-i", vo, "-filter_complex", "[1:a]apad[a]", "-map", "0:v", "-map", "[a]",
        "-t", f"{td:.2f}", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", term)
    end = os.path.join(TMP, "end.mp4")
    run("ffmpeg", "-y", "-ss", f"{total - END_CARD:.2f}", "-i", DEMO, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "19", "-c:a", "aac", "-ar", "48000", "-ac", "2", end)
    # concat filter (re-encode): stream copy mixed the image clip's timebase and stretched it
    run("ffmpeg", "-y", "-i", web, "-i", term, "-i", end, "-filter_complex",
        "[0:v]setpts=PTS-STARTPTS,fps=30[v0];[1:v]setpts=PTS-STARTPTS,fps=30[v1];[2:v]setpts=PTS-STARTPTS,fps=30[v2];"
        "[0:a]asetpts=PTS-STARTPTS[a0];[1:a]asetpts=PTS-STARTPTS[a1];[2:a]asetpts=PTS-STARTPTS[a2];"
        "[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a];[a]loudnorm=I=-14:TP=-1.5:LRA=11[an]",
        "-map", "[v]", "-map", "[an]", "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", OUT)
    print("mac demo:", OUT, round(dur(OUT), 1), "s")


if __name__ == "__main__":
    main()
