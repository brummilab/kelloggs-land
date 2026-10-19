#!/usr/bin/env python3
"""HD art: red thatched roof (level 1), 3 rows x (left end, middle, right end):
    014 015 016 / 017 018 019 / 035 020 021   (level-1 export numbering)
    python3 tools/hd-art/roof.py tiles.json web/hd [preview.png]
The roof is drawn as many single straws: dark under the ridge, red in the middle, pink at the eaves with light
tips; every straw has its own width, brightness, waviness and length. The middle tiles repeat every 16 original
pixels like in the original, so the straws are laid out over one 16-pixel period (seamless)."""
import json, math, os, sys
from PIL import Image

BLACK=(0,0,0); WHITE=(238,238,238); OCH=(206,157,60); BRN=(141,76,0); DBRN=(76,28,0)
DRED=(157,0,0); PINK=(238,93,109)
RAMP = [BLACK, DBRN, DRED, PINK, WHITE]
P = 16.0

def noise(i, seed=0):
    h = (int(i) * 374761393 + seed * 668265263) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 0xffffffff

# straw bundles in one period: each bundle has its own width, how far the dark and the red reach down
# (pointed drips like in the original), brightness and where its light tip sits
N = 7
BUNDLES = []
for j in range(N):
    BUNDLES.append(dict(x=(j + 0.5 + (noise(j, 1) - 0.5) * 0.5) * P / N, w=P / N * (0.9 + 0.25 * noise(j, 2)),
                        b1=8.0 + 5.0 * noise(j, 3), d1=2.5 + 3.5 * noise(j, 8),
                        b2=20.5 + 5.5 * noise(j, 4), d2=3.0 + 5.0 * noise(j, 9),
                        end=41.0 + 1.4 * noise(j, 5), och=noise(j, 6) > 0.5, tip=noise(j, 7) > 0.08,
                        ph=noise(j, 10) * 6.28))

def step(c, k):
    return RAMP[max(0, min(len(RAMP) - 1, RAMP.index(c) + k))]

def colour(u, v, part):
    # ridge: dark band with a twisted rope (ochre / dark red), black shadow under it
    if v < 2.6:
        if v < 0.5 or v > 2.1: return BLACK if v > 2.1 else DBRN
        k = (u * 1.3 + v * 1.6) % 3.0
        return OCH if k < 0.9 else DRED if k < 1.7 else DBRN
    uu = u % P
    best = None
    for s in BUNDLES:
        dx = (uu - s['x'] + P / 2) % P - P / 2
        dx -= 0.15 * math.sin(v * 0.45 + s['ph'])
        if best is None or abs(dx) / s['w'] < abs(best[0]) / best[1]['w']: best = (dx, s)
    dx, s = best
    f = dx / s['w']                                   # -0.5 .. 0.5 across the bundle
    if v > s['end'] + 0.3 * math.cos(f * 6):
        if v < s['end'] + 1.3: return DRED if (int(u * 2) + int(v * 2)) % 3 else DBRN
        if v < 45.0: return DBRN if (int(u * 2) % 5) else BLACK
        return BLACK
    taper = max(0.0, 1 - 2 * abs(f)) ** 1.4           # drips are pointed: longest in the middle of the bundle
    if v < s['b1'] + s['d1'] * taper:
        c = DBRN if (v > 3.2 or abs(f) < 0.3) else BLACK
        if s['och'] and -0.15 < f < 0.15 and (v + s['ph']) % 5.0 < 1.6: return OCH
    elif v < s['b2'] + s['d2'] * taper:
        c = DRED
    else:
        c = PINK
    # texture: small specks like in the original (half-pixel grid, own pattern)
    nz = noise(int(u * 2) * 131 + int(v * 2) * 7919, 11)
    if c == DRED and nz < 0.05: c = PINK
    elif c == PINK and nz < 0.025: c = DRED
    elif c == DBRN and nz < 0.04: c = DRED
    if f > 0.36: c = step(c, -1)                      # shadow line between bundles
    # light tip: a small hook at the lower end of the bundle
    if s['tip'] and ((-0.45 < f < -0.1 and s['end'] - 3.2 < v < s['end'] - 0.2) or
                     (-0.45 < f < 0.3 and s['end'] - 1.1 < v < s['end'] - 0.2)): c = WHITE
    # gable ends
    if part == 'L':
        if u < 0.6: return WHITE if v > 18 and (int(v * 2) % 3) else OCH if v > 3 else DBRN
        if u < 1.2 and c != WHITE: return step(c, 1)
    if part == 'R':
        if u > 15.3: return BLACK
        if u > 14.7: return DBRN if v < s['end'] else c
    return c

def render(part):
    img = Image.new('RGB', (64, 192))
    for y in range(192):
        for x in range(64):
            img.putpixel((x, y), colour((x + .5) / 4, (y + .5) / 4, part))
    return img

TILES = {'L': (14, 17, 35), 'M': (15, 18, 20), 'R': (16, 19, 21)}

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    pal = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    cols = {p: render(p) for p in TILES}
    for p, ns in TILES.items():
        for k, n in enumerate(ns):
            cols[p].crop((0, k * 64, 64, k * 64 + 64)).save(os.path.join(out, f"t_{d['tiles'][n]['hash']}.png"))
    if len(sys.argv) > 3:
        order = ['L', 'M', 'M', 'M', 'R']
        o = Image.new('RGB', (16 * 5, 48)); hd = Image.new('RGB', (64 * 5, 192))
        for k, p in enumerate(order):
            hd.paste(cols[p], (k * 64, 0))
            for r, n in enumerate(TILES[p]):
                t = Image.new('RGB', (16, 16)); t.putdata([pal[v] for v in d['tiles'][n]['px']]); o.paste(t, (k * 16, r * 16))
        c = Image.new('RGB', (64 * 10 + 16, 192), (40, 40, 40)); c.paste(o.resize((320, 192), Image.NEAREST), (0, 0)); c.paste(hd, (336, 0))
        c.resize((c.width * 2, c.height * 2), Image.NEAREST).save(sys.argv[3])
