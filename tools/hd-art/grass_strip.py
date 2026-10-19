#!/usr/bin/env python3
"""HD art: grass floor strip at the bottom of level 1 (tile 187). Same bands as the original
(grass on top, dark green, soil band with yellow pebbles, brown underneath), with single grass blades along the
top edge and round pebbles, every one a little different within the 16-pixel repeat.
    python3 tools/hd-art/grass_strip.py tiles.json web/hd [preview.png]"""
import json, math, os, sys
from PIL import Image

BLACK=(0,0,0); LIME=(141,238,0); DGREEN=(28,93,28); YEL=(238,238,93); OCH=(206,157,60)
BRN=(141,76,0); DBRN=(76,28,0); GREEN=(0,174,0)

def noise(i, seed=0):
    h = (int(i) * 374761393 + seed * 668265263) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 0xffffffff

# grass blades along the top: x, height of the tip above the grass line (y = 2), lean
BLADES = [(0.6, 1.6, 0.3), (2.1, 2.0, -0.2), (3.3, 1.3, 0.4), (4.6, 2.1, 0.1), (6.0, 1.5, -0.3), (7.2, 1.9, 0.3),
          (8.5, 1.4, -0.1), (9.8, 2.1, 0.2), (11.1, 1.6, -0.3), (12.4, 2.0, 0.3), (13.6, 1.4, -0.2), (14.9, 1.8, 0.1)]
# pebbles in the soil band: x, y, radius
# a row of yellow pebbles every 4 px like in the original, each a little different
PEBBLES = [(1.5, 11.9, 1.45), (5.6, 12.0, 1.30), (9.5, 11.85, 1.5), (13.5, 12.05, 1.35)]

def colour(u, v):
    # grass blades sticking up
    if v < 2.0:
        for (x, h, lean) in BLADES:
            for xx in (x - 16, x, x + 16):
                t = (2.0 - v) / h                      # 0 at the base .. 1 at the tip
                if 0 <= t <= 1 and abs(u - (xx + lean * t)) < 0.55 * (1 - t) + 0.08:
                    return YEL if (u < xx + lean * t and t > 0.35) else LIME if t > 0.15 else GREEN
        return None                                      # sky / background
    if v < 2.6: return YEL if (int(u * 2) % 5 == 1) else LIME     # sunlit top of the turf
    if v < 4.0: return LIME if noise(int(u * 2) * 7 + int(v * 2), 1) > 0.08 else GREEN
    if v < 5.0: return GREEN if noise(int(u * 2) * 3 + int(v * 2), 2) > 0.3 else DGREEN
    if v < 7.0: return DGREEN
    if v < 8.0:                                          # roots hanging into the soil
        return DBRN if (u * 1.7 + noise(int(u), 3)) % 2.0 < 0.9 else DGREEN
    # soil band with pebbles
    for (x, y, r) in PEBBLES:
        for xx in (x - 16, x, x + 16):
            d = math.hypot(u - xx, (v - y) * 1.15)
            if d < r:
                if d > r - 0.38 and (v - y) + (u - xx) > 0.25: return BRN
                return YEL if (u - xx) + (v - y) < -0.2 else OCH
    if v < 9.0: return DBRN if (int(u * 2) + int(v * 2)) % 2 else BRN
    if v < 10.0: return BRN
    if v < 13.6: return OCH if v < 12.8 else BRN if (int(u * 2) % 3 == 0) else OCH
    if v < 14.0: return OCH
    return BRN if v < 15.4 else DBRN

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    pal = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    orig = d['tiles'][187]['px']
    img = Image.new('RGB', (64, 64))
    for y in range(64):
        for x in range(64):
            c = colour((x + .5) / 4, (y + .5) / 4)
            if c is None: c = pal[orig[(y // 4) * 16 + x // 4]] if y >= 8 else (0, 109, 238)   # behind the blades: sky
            img.putpixel((x, y), c)
    img.save(os.path.join(out, f"t_{d['tiles'][187]['hash']}.png"))
    if len(sys.argv) > 3:
        o = Image.new('RGB', (16, 16)); o.putdata([pal[v] for v in orig])
        c = Image.new('RGB', (64 * 4, 64 * 2 + 8), (40, 40, 40))
        for k in range(4): c.paste(o.resize((64, 64), Image.NEAREST), (k * 64, 0)); c.paste(img, (k * 64, 72))
        c.resize((c.width * 3, c.height * 3), Image.NEAREST).save(sys.argv[3])
