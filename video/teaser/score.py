# Synthesised score for the 30.6 s teaser: drone, wind, a riser into the door flood, a hit on every cut,
# a low pulse under the middle and an ember tone when the centre block lights. No samples, no licences.
#   python score.py out.wav
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
LEN = 30.6
CUTS = [7.5, 11.5, 15.5, 19.0, 23.0, 27.0]
rng = np.random.default_rng(7)
t = np.arange(int(SR * LEN)) / SR
mix = np.zeros((len(t), 2))


def bp(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=4):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def env(start, attack, decay, n=None):
    e = np.zeros(len(t))
    i0 = int(start * SR)
    a = max(1, int(attack * SR))
    idx = np.arange(len(t) - i0)
    e[i0:] = np.minimum(idx / a, 1.0) * np.exp(-np.maximum(idx - a, 0) / (decay * SR))
    return e


def add(sig, gain=1.0, pan=0.0):
    mix[:, 0] += sig * gain * (1 - max(pan, 0))
    mix[:, 1] += sig * gain * (1 + min(pan, 0))


# drone: two low sines + a fifth, slow swell, ducked after the end hit
swell = np.clip(t / 6, 0, 1) * np.where(t < 27, 1, np.exp(-(t - 27) / 1.2))
drone = (np.sin(2 * np.pi * 55 * t) + 0.6 * np.sin(2 * np.pi * 82.5 * t) + 0.25 * np.sin(2 * np.pi * 110.3 * t)) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.15 * t))
add(lp(drone, 400) * swell, 0.16)

# wind: band-passed noise, stereo
for ch, pan in ((0, -0.6), (1, 0.6)):
    w = bp(rng.standard_normal(len(t)), 300, 2400) * (0.5 + 0.5 * np.sin(2 * np.pi * (0.07 + ch * 0.03) * t + ch))
    add(w * np.clip(t / 3, 0, 1) * np.where(t < 7.5, 1, 0.45) * np.where(t < 27, 1, np.exp(-(t - 27))), 0.035, pan)

# riser into the door flood (4.5 -> 7.5 s): noise swept up, plus a rising tone
r0, r1 = 4.3, 7.5
m = (t >= r0) & (t < r1)
k = np.zeros(len(t)); k[m] = ((t[m] - r0) / (r1 - r0)) ** 2.2
noise = rng.standard_normal(len(t))
riser = np.zeros(len(t))
for i, (lo, hi) in enumerate([(200, 800), (600, 2000), (1500, 5000), (3000, 9000)]):
    band = bp(noise, lo, hi)
    riser += band * np.clip(k * 4 - i, 0, 1)
tone_f = 110 + 330 * k
tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * k
add((riser * 0.5 + tone * 0.4) * k, 0.22)


# hits: sub boom + noise crack + body; the first one (door flood) is the biggest
def hit(at, size):
    boom = np.sin(2 * np.pi * (48 * np.exp(-np.maximum(t - at, 0) * 3) + 32) * (t - at)) * env(at, 0.004, 0.9 * size)
    crack = bp(rng.standard_normal(len(t)), 900, 7000) * env(at, 0.001, 0.08 * size)
    body = lp(rng.standard_normal(len(t)), 600) * env(at, 0.002, 0.35 * size)
    return boom * 0.9 + crack * 0.35 + body * 0.5


for i, c in enumerate(CUTS):
    add(hit(c, 1.6 if i == 0 else (1.25 if c == 27.0 else 0.8)), 0.55 if i == 0 else 0.38)
    if i:  # a short reverse swell into each later cut
        s = (t >= c - 0.6) & (t < c)
        sw = np.zeros(len(t)); sw[s] = ((t[s] - (c - 0.6)) / 0.6) ** 3
        add(bp(rng.standard_normal(len(t)), 500, 4000) * sw, 0.06)

# pulse: a low heartbeat between the flood and the end card
for b in np.arange(8.0, 26.6, 1.0):
    add(np.sin(2 * np.pi * 42 * (t - b)) * env(b, 0.005, 0.18), 0.22)

# ember tone: when the centre block lights in the end card (~28 s)
e0 = 28.0
ember = (np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1320 * t) + 0.25 * np.sin(2 * np.pi * 1760 * t)) * env(e0, 0.02, 1.6)
add(ember, 0.07, 0.1)

# room: a long, dark reverb on everything
ir_len = int(SR * 3.2)
ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / (SR * 0.8))
ir = lp(ir, 3500) / np.sqrt(np.sum(ir ** 2))
wet = np.stack([fftconvolve(mix[:, c], ir)[: len(t)] for c in range(2)], axis=1)
out = mix * 0.75 + wet * 0.45
fade = np.clip((LEN - t) / 1.2, 0, 1)[:, None] * np.clip(t / 0.4, 0, 1)[:, None]
out *= fade
out /= np.max(np.abs(out)) / 0.89
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else "score.wav", SR, (out * 32767).astype(np.int16))
print("score written", LEN, "s")
