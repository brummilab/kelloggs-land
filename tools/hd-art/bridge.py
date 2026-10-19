#!/usr/bin/env python3
"""HD art: wooden bridge near the bottom of level 1, drawn by hand as shapes (posts with lanterns, top and
bottom rail, balusters every 16 px, little vines, deck beam, two carved panels, arch with legs). Positions are
measured from the original. The flower next to it (171-174) is redrawn close to the original (foliage.py).
Coordinates: origin = top left of map tile (22, 38) in original pixels, area 112 x 64.
    python3 tools/hd-art/bridge.py tiles.json map.json web/hd"""
import json, math, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foliage import redraw, WOOD, LEAF

SKY=(0,109,238); BLACK=(0,0,0); WHITE=(238,238,238); YEL=(238,238,93); OCH=(206,157,60); BRN=(141,76,0)
DBRN=(76,28,0); LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28)
BLUE=(0,60,141); LBLUE=(125,157,238); LILAC=(222,157,238); PURP=(190,125,206)

def wood_v(u, x0, x1):
    """vertical wooden bar from x0 to x1: lit left edge, dark right edge"""
    t = (u - x0) / (x1 - x0)
    return OCH if t < 0.28 else DBRN if t > 0.8 else BRN

def wood_h(v, y0, y1):
    t = (v - y0) / (y1 - y0)
    return OCH if t < 0.3 else DBRN if t > 0.78 else BRN

def seg(u, v, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(u - ax - t * dx, v - ay - t * dy), t

POSTS = [(1.6, 6.2), (96.8, 101.4)]
def lantern(u, v, cx):
    """lantern like the original: round-topped head with a black outline, blue frame, lilac/purple glass with
    a white glint, narrowing at the bottom into the post"""
    if v < 0.2 or v > 11.8: return None
    if v < 3.6:
        d = math.hypot(u - cx, v - 3.6) - 3.4            # round top
    elif v < 9.0:
        d = abs(u - cx) - (3.4 - (v - 3.6) * 0.15)       # body, slightly narrowing
    else:
        d = abs(u - cx) - (2.2 - (v - 9.0) * 0.4)        # tail into the post
    if d > 0: return None
    if d > -0.45: return BLACK
    if d > -1.15 or v > 9.2 or abs(u - cx) < 0.3 or abs(v - 6.2) < 0.3: return BLUE   # frame and glazing bars
    if math.hypot(u - cx + 1.3, v - 3.3) < 0.75: return WHITE
    return LILAC if (u < cx and v < 6.2) else PURP

def colour(u, v):
    # lanterns and posts
    for (x0, x1) in POSTS:
        cx = (x0 + x1) / 2
        c = lantern(u, v, cx)
        if c: return c
        if x0 <= u <= x1 and 11 <= v <= 32.5:
            if 12.5 <= v <= 15.5 or 28.5 <= v <= 31.5:          # green rings
                return LIME if u < cx - 0.5 else GREEN if u < x1 - 0.8 else DGREEN
            return wood_v(u, x0, x1)
    # vines hanging from the top rail (leaf with a yellow tip)
    vines = [(7.0, 15.0, 13.0, 9.5)] + [(26 + 16 * k, 9.5, 31 + 16 * k, 14.5) for k in range(5)]
    for (ax, ay, bx, by) in vines:
        d, t = seg(u, v, ax, ay, bx, by)
        w = 1.0 - 0.3 * t
        if d < w:
            tip = t > 0.78 if by > ay else t < 0.22
            if d > w - 0.35: return DGREEN                      # dark outline like the original
            return YEL if tip else (LIME if d < 0.25 else GREEN)
    # top rail and bottom rail
    if 6.2 < u < 96.8:
        if 4.2 <= v <= 9.0: return wood_h(v, 4.2, 9.0)
        if 9.0 < v <= 9.8: return DBRN if (u % 16) > 1 else BRN       # shadow under the rail
        if 27.8 <= v <= 32.4: return wood_h(v, 27.8, 32.4)
    # balusters
    for k in range(5):
        x0 = 17 + 16 * k
        if x0 <= u <= x0 + 4.2 and 9.0 <= v <= 27.8: return wood_v(u, x0, x0 + 4.2)
    # arch block (tiles 180-183, 185, 186): x 16..80
    if 16 <= u <= 80 and v >= 32.4:
        cx, cy, a, b = 48.5, 64.5, 28.6, 19.4
        r_in = ((u - cx) / a) ** 2 + ((v - cy) / b) ** 2
        r_out = ((u - cx) / (a + 4.2)) ** 2 + ((v - cy) / (b + 4.2)) ** 2
        if r_in < 1: return SKY                                       # opening
        if v < 36.0: return wood_h(v, 32.4, 36.0) if v > 32.9 else BLACK   # deck beam
        if r_out < 1 or v > 44.5 and (u < 20.5 or u > 76.5):
            # arch ring: light along the inner edge on the left, dark on the right
            if r_in < 1.12: return OCH if u < cx else DBRN
            return BRN if r_out < 0.96 else DBRN
        # carved panels with a groove frame and a carved light line following the arch
        if 45.6 <= u <= 51.4: return wood_v(u, 45.6, 51.4)               # middle post between the panels
        px0, px1 = (20.6, 45.6) if u < 45.6 else (51.4, 76.4)
        if v < 36.8 or u < px0 + 0.8 or u > px1 - 0.8: return DBRN       # groove around the panel
        # inside the panels: the original carvings (dotted texture, knot, the light band along the arch),
        # upscaled smoothly
        if PANEL is not None:
            return tuple(PANEL[min(PANEL.shape[0] - 1, int((v - 32) * 4)), min(PANEL.shape[1] - 1, int((u - 16) * 4))])
        return BRN
    return None

PANEL = None

def smooth_up(C, S=4):
    from scipy import ndimage
    cols = [tuple(c) for c in np.unique(C.reshape(-1, 3), axis=0)]
    best = None; out = np.zeros((C.shape[0] * S, C.shape[1] * S, 3), np.uint8)
    for c in cols:
        ind = np.all(C == c, axis=2).astype(float)
        U = ndimage.zoom(ndimage.gaussian_filter(ind, 0.5, mode='nearest'), S, order=3, mode='nearest', grid_mode=True)
        if best is None: best = U; out[:] = c
        else: sel = U > best; best[sel] = U[sel]; out[sel] = c
    return out

TILE_POS = {163: (0, 0), 164: (1, 0), 165: (6, 0), 175: (0, 1), 176: (1, 1), 177: (6, 1),
            180: (1, 2), 181: (2, 2), 182: (3, 2), 183: (4, 2), 185: (1, 3), 186: (4, 3)}
FLOWER = {171, 172, 173, 174}

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    tiles = [pal[np.array(t['px']).reshape(16, 16)] for t in d['tiles']]
    PANEL = smooth_up(np.hstack([tiles[i] for i in (180, 181, 182, 183)]))
    for n, (tx, ty) in TILE_POS.items():
        img = Image.new('RGB', (64, 64))
        orig = tiles[n]
        for y in range(64):
            for x in range(64):
                u, v = tx * 16 + (x + .5) / 4, ty * 16 + (y + .5) / 4
                c = colour(u, v)
                if c is None:                                          # nothing of the bridge here: sky
                    c = SKY if tuple(orig[y // 4, x // 4]) == SKY or ty < 2 else tuple(orig[y // 4, x // 4])
                img.putpixel((x, y), c)
        img.save(os.path.join(out, f"t_{d['tiles'][n]['hash']}.png"))
    # the flower: close-to-the-original redraw of its area
    pos = {}
    for y, r in enumerate(grid):
        for x, i in enumerate(r):
            if i in FLOWER and i not in pos: pos[i] = (x, y)
    xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]
    x0, x1, y0, y1 = min(xs) - 1, max(xs) + 2, min(ys) - 1, max(ys) + 2
    C = np.zeros(((y1 - y0) * 16, (x1 - x0) * 16, 3), np.uint8)
    for y in range(y0, y1):
        for x in range(x0, x1):
            j = grid[y][x]
            if j >= 0: C[(y - y0) * 16:(y - y0 + 1) * 16, (x - x0) * 16:(x - x0 + 1) * 16] = tiles[j]
    PINK = {(238, 93, 109), (157, 0, 0), (222, 157, 238), (190, 125, 206), (125, 157, 238), (0, 60, 141)}
    hd = redraw(C, [WOOD | {(238, 238, 238), (238, 238, 93)}, LEAF - {(238, 238, 238), (238, 238, 93)}, PINK])
    for i, (x, y) in pos.items():
        Image.fromarray(hd[(y - y0) * 64:(y - y0 + 1) * 64, (x - x0) * 64:(x - x0 + 1) * 64]).save(
            os.path.join(out, f"t_{d['tiles'][i]['hash']}.png"))
    print('done')
