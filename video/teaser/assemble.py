# Cuts the seven rendered shots into the teaser, adds bloom, grain and vignette, lays the score under it.
#   python assemble.py        (needs frames/<shot>.mp4 for every shot and score.wav)
import os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, "frames")
OUT = os.path.join(HERE, "..", "out", "consilium-teaser.mp4")
ORDER = ["door", "sand", "peak", "mirror", "sphere", "glyph", "end"]

inputs = []
for s in ORDER:
    p = os.path.join(FR, s + ".mp4")
    if not os.path.exists(p): raise SystemExit(f"missing {p}")
    inputs += ["-i", p]
n = len(ORDER)
chain = "".join(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1[s{i}];" for i in range(n))
chain += "".join(f"[s{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[cut];"
# bloom: a blurred, brightened copy screened back on; then grain, vignette, a fade in from black and out to black
chain += ("[cut]split[a][b];[b]curves=all='0/0 0.6/0.15 1/1',gblur=sigma=26[glow];"
          "[a][glow]blend=all_mode=screen:all_opacity=0.55[bloom];"
          "[bloom]noise=alls=7:allf=t,vignette=PI/4.6,fade=t=in:st=0:d=0.6,fade=t=out:st=29.6:d=1.0,format=yuv420p[v]")
cmd = ["ffmpeg", "-y", *inputs, "-i", os.path.join(HERE, "score.wav"), "-filter_complex", chain,
       "-map", "[v]", "-map", f"{n}:a", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-c:a", "aac", "-b:a", "256k",
       "-shortest", "-movflags", "+faststart", os.path.abspath(OUT)]
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
subprocess.run(cmd, check=True, capture_output=True)
print("teaser:", os.path.abspath(OUT))
