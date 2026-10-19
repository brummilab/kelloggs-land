#!/usr/bin/env python3
"""HD art: the last small pieces of the rock ground in level 1.
  - shadow tiles 142 / 143 (rock ground 090 / 089 in the shadow under a stone block or a grass tuft) and 125
    (rock ground 081 with a shadow on its top): the approved HD rock tile, made darker by colour steps; the
    shadow fades out with a fine pattern where the original gets lighter;
  - grass tufts 169 / 170 (two tiles): grass on top, a clump of soil with yellow pebbles underneath. Like the
    climbing-plant wall: every part keeps its place and colours, smooth outlines at 4x, light rim on the top left.
    python3 tools/hd-art/ground_extra.py tiles.json map.json web/hd"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foliage import redraw
from ground import DARKER

BLACK=(0,0,0); YEL=(238,238,93); OCH=(206,157,60); BRN=(141,76,0); DBRN=(76,28,0)
LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28)
SHADOW = {142: 90, 143: 89, 125: 81}           # shadow tile -> rock tile it is made from
DARK_TO = dict(DARKER); DARK_TO[LIME] = GREEN; DARK_TO[YEL] = OCH

def noise(i, j, seed=0):
    h = (int(i) * 374761393 + int(j) * 668265263 + seed * 2246822519) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 0xffffffff

def darken(c, n):
    for _ in range(n): c = DARK_TO.get(c, BLACK if c != BLACK else c)
    return c

def shadow_tile(hd_rock, orig_dark, orig_rock, seed, most=3.0):
    """hd_rock: approved 64x64 HD of the rock tile. The darkness per row comes from the original: how much of
    the rock's colour is gone in that row (0 .. 3 colour steps), blurred, with a fine pattern in between."""
    lum = lambda t: np.array([[sum(p) for p in r] for r in t], float)
    a, b = lum(orig_dark).sum(1), lum(orig_rock).sum(1)
    keep = np.where(b > 0, a / np.maximum(b, 1), 1.0)            # 0 = black row .. 1 = like the rock
    keep = np.convolve(np.pad(keep, 2, mode='edge'), np.ones(5) / 5, mode='valid')
    out = np.zeros_like(hd_rock)
    for y in range(64):
        k = np.interp((y + 0.5) / 4 - 0.5, np.arange(16), keep)
        steps = most * (1 - k)                                       # how many colour steps darker
        for x in range(64):
            n = int(steps) + (1 if noise(x // 2, y // 2, seed) < steps - int(steps) else 0)
            out[y, x] = darken(tuple(hd_rock[y, x]), n)
    return out

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    T = lambda n: pal[np.array(d['tiles'][n]['px']).reshape(16, 16)]
    hdroot = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'hd')
    for t, r in SHADOW.items():
        rock = np.array(Image.open(os.path.join(hdroot, f"t_{d['tiles'][r]['hash']}.png")).convert('RGB'))
        img = shadow_tile(rock, T(t).tolist(), T(r).tolist(), t, 1.4 if t == 125 else 3.0)   # 125: lighter shadow
        Image.fromarray(img).save(os.path.join(out, f"t_{d['tiles'][t]['hash']}.png"))
    # grass tuft: the two tiles with one tile of rock around them, redrawn together
    C = np.vstack([np.hstack([T(n) for n in row]) for row in [[81, 80, 81, 80], [81, 169, 170, 80], [88, 142, 143, 87]]])
    C = C.copy()
    # yellow in the grass (top half, next to green) is a grass highlight, not a pebble
    for y in range(16, 26):
        for x in range(16, 48):
            if tuple(C[y, x]) == YEL: C[y, x] = LIME
    tuft = np.zeros(C.shape[:2], bool); tuft[16:32, 16:48] = True
    Cf = C.copy(); Cf[~tuft] = BLACK                                # only the tuft is redrawn
    hd = redraw(Cf, [{OCH, BRN, DBRN, YEL}, {LIME, GREEN, DGREEN}])
    for i, n in enumerate((169, 170)):
        Image.fromarray(hd[64:128, (i + 1) * 64:(i + 2) * 64]).save(os.path.join(out, f"t_{d['tiles'][n]['hash']}.png"))
    print('tiles', list(SHADOW) + [169, 170])
