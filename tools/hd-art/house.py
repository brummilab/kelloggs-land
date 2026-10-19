#!/usr/bin/env python3
"""HD art: house wall details (level 1): moss edge under the roof (027 middle, 044 left end, 028 right end),
corner posts with corner stones (051 left, 055 right), crack in the plaster (054), weed at the wall foot (062).
    python3 tools/hd-art/house.py tiles.json web/hd [preview.png]
Each tile is drawn in original pixel units (u, v 0..16), evaluated at 4x, fixed palette."""
import json, math, os, sys
from PIL import Image

BLACK=(0,0,0); WHITE=(238,238,238); LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28)
YEL=(238,238,93); OCH=(206,157,60); BRN=(141,76,0); DBRN=(76,28,0)

def noise(i, seed=0):
    h = (int(i) * 374761393 + seed * 668265263) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 0xffffffff

# ---- moss hanging from under the roof (repeats every 16 px) ----
def moss_len(u):
    """how far the moss hangs down at u: several tufts of different length"""
    t = u % 16
    tufts = [(1.2, 1.6, 2.2), (4.0, 2.2, 3.4), (7.3, 1.5, 1.6), (9.8, 2.0, 2.9), (13.0, 2.4, 3.8), (15.6, 1.2, 1.4)]
    L = 3.6
    for (c, w, extra) in tufts:
        for cc in (c - 16, c, c + 16):
            dx = (t - cc) / w
            if abs(dx) < 1: L = max(L, 3.6 + extra * math.sqrt(1 - dx * dx))
    return L

DROPS = [(2.0, 7.4, 0.42), (4.6, 8.6, 0.38), (5.6, 10.3, 0.3), (8.6, 6.4, 0.36), (10.5, 8.1, 0.4),
         (11.6, 10.0, 0.3), (13.4, 8.9, 0.42), (14.6, 10.9, 0.3), (0.6, 6.0, 0.34), (7.0, 9.0, 0.3), (12.0, 6.6, 0.3)]

def moss(u, v):
    """colour of the moss at (u, v), or None for plaster"""
    if v < 1.0: return BLACK if noise(int(u * 2), 3) > 0.86 else DGREEN
    L = moss_len(u)
    if v < L:
        if v < 2.0: return GREEN if noise(int(u * 2) * 7 + int(v * 2), 4) > 0.2 else DGREEN
        # tuft shading: light in the middle of a tuft, green at its edges and lower end
        dl = moss_len(u + 0.4) - moss_len(u - 0.4)
        if v > L - 0.6: return GREEN
        if dl > 0.5: return GREEN                      # left flank (rising edge) in shadow
        return LIME if noise(int(u * 2) * 13 + int(v * 2), 5) > 0.12 else GREEN
    for (x, y, r) in DROPS:
        for xx in (x - 16, x, x + 16):
            d = math.hypot(u % 16 - xx, v - y)
            if d < r: return LIME if d < r * 0.6 or v < y else GREEN
    return None

# ---- corner stones and posts ----
def rrect(u, v, x0, y0, x1, y1, r):
    qx = max(x0 + r - u, 0, u - (x1 - r)); qy = max(y0 + r - v, 0, v - (y1 - r))
    return math.hypot(qx, qy) - r

def stone(u, v, x0, y0, x1, y1, side):
    r = min(2.0, (x1 - x0) / 2, (y1 - y0) / 2)
    d = rrect(u, v, x0, y0, x1, y1, r)
    if d > 0: return None
    # round lump lit from the top left: shade by distance from a light point near the top-left
    lx, ly = x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.28
    t = math.hypot((u - lx) / (x1 - x0), (v - ly) / (y1 - y0)) / 0.95
    if side == 'R': t = t * 0.7 + 0.35                         # right side of the house lies in shadow
    if d > -0.45 and (v - y0) > (y1 - y0) * 0.55: return DBRN   # contact shadow at the lower edge
    if side == 'L' and math.hypot(u - x0 - 1.3, v - y0 - 1.2) < 0.45: return WHITE
    return YEL if t < 0.33 else OCH if t < 0.6 else BRN if t < 0.82 else DBRN

def left_post(u, v, long_top):
    """long_top: where the long stone starts in this tile (None = no long stone)"""
    if u < 0.8: return BRN
    if u < 1.6: return OCH if (int(v * 4) % 17) else BRN       # wooden post, lit side with a few grain marks
    c = stone(u, v, 1.6, -0.2, 4.6, 6.8, 'L') if long_top is not None else None
    if long_top is not None:
        c = c or stone(u, v, 1.6, long_top, 8.0, long_top + 7.0, 'L')
    return c

def right_post(u, v, has_short=True, long_top=8.0):
    if u > 15.2: return DBRN
    if u > 14.4: return BRN if (int(v * 4) % 13) else DBRN
    c = stone(u, v, 11.6, -0.2, 14.4, 6.8, 'R') if has_short else None
    return c or stone(u, v, 8.0, long_top, 14.4, long_top + 7.0, 'R')

# ---- crack in the plaster ----
CRACK = [((3.4, 1.0), (3.6, 4.6)), ((3.6, 4.6), (3.3, 8.0)), ((3.3, 8.0), (3.6, 11.8)),
         ((3.6, 4.6), (7.0, 4.4)), ((7.0, 4.4), (9.6, 4.9)), ((9.6, 4.9), (13.2, 4.5)),
         ((3.5, 2.6), (5.6, 1.6)), ((5.6, 1.6), (8.4, 2.4)), ((5.0, 3.0), (6.2, 3.3))]

def seg(u, v, a, b):
    (ax, ay), (bx, by) = a, b; dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(u - ax - t * dx, v - ay - t * dy), t

def crack(u, v):
    best = 9
    for k, (a, b) in enumerate(CRACK):
        d, t = seg(u, v, a, b)
        w = 0.28 * (1 - 0.6 * t) if k in (0, 3, 6) else 0.2 * (1 - 0.7 * t)
        best = min(best, d / max(w, 0.06))
    return BRN if best < 0.6 else OCH if best < 1.25 else None

# ---- weed at the foot of the wall ----
BLADES = [  # base x, top x, top y, width, colour (green blade or dry ochre stalk)
    (6.2, 6.0, 0.2, 0.55, 'g'), (5.0, 4.0, 3.2, 0.5, 'o'), (7.4, 9.0, 6.2, 0.5, 'o'), (8.4, 11.8, 9.0, 0.45, 'o'),
    (9.2, 12.4, 11.2, 0.5, 'g'), (4.4, 1.4, 9.6, 0.5, 'o'), (3.2, 0.6, 12.4, 0.45, 'o'), (10.6, 14.6, 12.6, 0.45, 'o'),
    (7.0, 7.8, 2.8, 0.5, 'g'), (5.8, 3.0, 11.0, 0.45, 'g')]

def weed(u, v):
    c = None
    for (bx, tx, ty, w, kind) in BLADES:
        for k in range(41):           # curve from the base (bx,16) to the top (tx,ty), bending outward
            s = k / 40
            x = bx + (tx - bx) * s ** 1.6; y = 16 - (16 - ty) * s
            ww = w * (1 - 0.75 * s)
            if math.hypot(u - x, v - y) < ww:
                if kind == 'g': c = LIME if u < x else GREEN
                else: c = YEL if u < x - ww * 0.3 else OCH
    if v > 14.6 and 2.5 < u < 12.5 and c is None and noise(int(u * 2), 9) > 0.45: c = DGREEN
    return c

def tile_colour(n, u, v):
    if n == 27: return moss(u, v) or WHITE
    if n == 44:
        c = left_post(u, v, 8.0) if v > 2.6 else (BRN if u < 0.8 else None)
        if c and v > 2.6 and u >= 1.6 and v < 8.0: c = None        # no short stone under the moss
        return c or moss(u, v) or WHITE
    if n == 28:
        if u > 15.2: return DBRN
        c = right_post(u, v, has_short=False, long_top=9.0) if v > 8.6 else None
        return c or moss(u, v) or (BRN if u > 14.4 else WHITE)
    if n == 51: return left_post(u, v, 8.0) or WHITE
    if n == 55: return right_post(u, v) or WHITE
    if n == 54: return crack(u, v) or WHITE
    if n == 62: return weed(u, v) or WHITE

NUMS = (27, 44, 28, 51, 55, 54, 62)

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    pal = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    made = {}
    for n in NUMS:
        img = Image.new('RGB', (64, 64))
        for y in range(64):
            for x in range(64):
                img.putpixel((x, y), tile_colour(n, (x + .5) / 4, (y + .5) / 4))
        img.save(os.path.join(out, f"t_{d['tiles'][n]['hash']}.png")); made[n] = img
    if len(sys.argv) > 3:
        c = Image.new('RGB', (len(NUMS) * 72, 136 + 8), (40, 40, 40))
        for k, n in enumerate(NUMS):
            t = Image.new('RGB', (16, 16)); t.putdata([pal[v] for v in d['tiles'][n]['px']])
            c.paste(t.resize((64, 64), Image.NEAREST), (k * 72, 0)); c.paste(made[n], (k * 72, 72))
        c.resize((c.width * 2, c.height * 2), Image.NEAREST).save(sys.argv[3])
