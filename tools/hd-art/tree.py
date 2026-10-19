#!/usr/bin/env python3
"""HD art: the big tree next to the house at the start of level 1 (trunk, edge of the crown, red platforms in
it) and the stone gateway further right. Most of these tiles exist only once. Close-to-the-original redraw like the
climbing-plant wall (foliage.py): every piece keeps its place and colours, outlines become smooth at 4x, light rim.
The whole area is redrawn at once so the pieces fit; the tiles of the crown that are already HD stay as they are.
    python3 tools/hd-art/tree.py tiles.json map.json web/hd"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foliage import redraw, WOOD, LEAF
import math

WHITE=(238,238,238); YEL=(238,238,93)
REDS = {(238, 93, 109), (157, 0, 0), (222, 157, 238), (190, 125, 206)}
AREAS = [  # (x0, y0, x1, y1) in map tiles, tiles to write
    ((10, 19, 24, 40), {75, 76, 78, 79, 82, 83, 84, 85, 86, 95, 100, 105, 106, 107, 108, 109, 110, 111, 112,
                        119, 120, 121, 122, 123, 132, 133, 134, 138, 139, 140, 141, 144, 145, 146, 147, 148, 149,
                        150, 156, 161, 162}),
    ((195, 24, 203, 31), {96, 97, 98, 99, 101, 102, 103, 104, 115, 116, 117, 118, 128, 129, 130, 131}),
]

BLACK=(0,0,0); OCH=(206,157,60); BRN=(141,76,0); DBRN=(76,28,0)
LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28)

def noise(i, j, seed=0):
    h = (int(i) * 374761393 + int(j) * 668265263 + seed * 2246822519) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 0xffffffff

def seg(u, v, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(u - ax - t * dx, v - ay - t * dy), t

# trunk geometry in original pixels of area 1 (origin = map tile (10, 19)), measured from the original
TL, TR = 105.5, 140.0                       # left / right edge of the trunk
HOLE = (121.8, 205.0, 4.0, 8.0)            # knot hole: centre, half width, half height
# the branch on the left: a thin, slightly crooked branch with small twigs (polylines with width at start/end)
BRANCH = [
    ([(106.5, 205.6), (100.5, 204.4), (95.0, 203.0), (90.0, 202.2), (85.0, 201.4)], 1.5, 0.55),   # main branch
    ([(95.5, 203.0), (92.5, 199.8), (89.8, 197.4), (87.6, 195.0)], 0.65, 0.22),                   # twig up
    ([(90.0, 202.2), (87.5, 199.2), (85.0, 196.8)], 0.5, 0.2),                                    # second twig up
    ([(86.8, 201.7), (83.4, 201.3), (80.8, 200.2)], 0.45, 0.18),                                  # tip
    ([(99.5, 204.2), (98.6, 206.0), (97.4, 207.6)], 0.4, 0.18),                                   # small twig down
]

def trunk_edges(v):
    l = TL - max(0.0, 184.0 - v) * 1.2        # widens into the crown at the top
    r = TR + max(0.0, v - 310.0) * 0.55 + max(0.0, 184.0 - v) * 0.3   # root flare / crown fork
    return l, r

def trunk(u, v):
    """smooth, round trunk lit from the left: dark outline, ochre, wide white bark with ochre marks, ochre,
    brown, dark brown with fine dither, black on the shadow side"""
    for (pts, w0, w1) in BRANCH:
        n = len(pts) - 1
        for i in range(n):
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            d, t = seg(u, v, ax, ay, bx, by)
            w = w0 + (w1 - w0) * (i + t) / n
            if d < w:
                # side of the branch: above (lit) or below (shadow)
                nx, ny = -(by - ay), (bx - ax)
                ln = math.hypot(nx, ny) or 1
                side = ((u - ax) * nx + (v - ay) * ny) / ln          # > 0 below the branch
                if d > w - 0.3: return DBRN
                if side < -w * 0.35: return (238, 238, 238) if w > 0.9 else OCH
                if side < w * 0.15: return OCH
                return BRN
    if v < 168: return None
    l, r = trunk_edges(v)
    if not (l <= u <= r): return None
    cx, cy, rx, ry = HOLE
    dh = math.hypot((u - cx) / rx, (v - cy) / ry)
    if dh < 1.0:
        if dh < 0.72: return BLACK if dh < 0.6 or (u < cx) else DBRN
        return (238, 238, 238) if (u > cx and v > cy - 2) else OCH if u > cx else DBRN
    t = (u - l) / (r - l)
    t += 0.035 * math.sin(v * 0.33 + 7.0 * noise(int(u * 1.5), 0, 3))          # wavy bark ridges
    mark = noise(int(u * 2), int(v / 1.6), 5)                                    # vertical bark marks
    if t < 0.03: return DBRN
    if t < 0.08: return BRN
    if t < 0.14: return OCH
    if t < 0.43: return OCH if mark < 0.13 else (238, 238, 238)
    if t < 0.56: return BRN if mark < 0.10 else OCH
    if t < 0.70: return DBRN if mark < 0.14 else BRN
    if t < 0.86:
        return BLACK if mark < 0.10 else (DBRN if (int(u * 2) + int(v * 2)) % 2 else BRN)
    return BLACK if (int(u * 2) + int(v * 2)) % 2 else DBRN

def overlay_trunk(hd, C, x0, y0):
    """draw the trunk over the redraw of area 1; leaves (and the house, whose tiles are not written) stay in front"""
    H, W = hd.shape[:2]
    leaf = {LIME, GREEN, DGREEN}
    for y in range(H):
        v = (y + 0.5) / 4
        if v < 168: continue
        for x in range(W):
            u = (x + 0.5) / 4
            c = trunk(u, v)
            o = tuple(C[int(v), int(u)])
            if c is None:
                # remove the original branch where the new one is drawn (no ghost lines), keep its leaf
                if 76 <= u <= TL and 192 <= v <= 210 and o not in leaf and tuple(hd[y, x]) not in leaf:
                    hd[y, x] = (0, 109, 238)
                continue
            if tuple(hd[y, x]) in leaf and o in leaf: continue
            # where the trunk forks into the crown (above about v 186) the original's fork stays; the new trunk
            # fades in over 18 px with a fine pattern, so there is no straight seam
            if v < 186:
                if o in leaf or o == (0, 109, 238) or tuple(hd[y, x]) == (0, 109, 238): continue
                if noise(x, y, 11) > (v - 168) / 18.0: continue
                if o in (DBRN, BLACK) and not (TL - 2 <= u <= TR + 1): continue
            hd[y, x] = c

PINK=(238,93,109); DRED=(157,0,0); YELC=(238,238,93); WHITEC=(238,238,238)

# stones of the gateway (left half, x0, y0, x1, y1 in original pixels; mirrored for the right half),
# measured from the original; the keystone sits in the middle
GATE_STONES = [(10, 0, 20, 4.5), (21, 0, 32, 4.2),                    # small stones along the top
               (0, 0, 7.5, 10), (0, 11, 7, 18), (0, 19, 6.5, 27.5), (0, 28.5, 6.8, 37), (0, 38, 6.2, 48),
               (0, 49, 6.5, 56), (1, 54.5, 10.5, 64),                  # left jamb
               (8, 5, 24, 11.6), (9.5, 12.8, 24.5, 17.6),              # lintel and the step below it
               (7, 19, 19.5, 25), (8, 27.5, 18.5, 35), (9, 39, 17.5, 48.5), (3, 44, 11.5, 50.5),
               (10, 48.5, 17.5, 54.5), (7, 56.5, 20, 63.5)]            # stones beside the door
KEYSTONE = (24.6, 5.6, 38.8, 16.4)
GROW = 0.95

def stone_lump(u, v, x0, y0, x1, y1):
    """rounded stone, lit from the top left like a dome; every stone a little different (brightness, grain,
    some with a crack, some with moss on top); returns a colour or None"""
    r = min(2.6, (x1 - x0) / 2, (y1 - y0) / 2)
    qx = max(x0 + r - u, 0, u - (x1 - r)); qy = max(y0 + r - v, 0, v - (y1 - r))
    d = math.hypot(qx, qy) - r
    if d > 0: return None
    if d > -0.45: return DBRN
    sid = int(x0 * 7 + y0 * 13)                                         # stone identity for its variations
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (u - cx) / ((x1 - x0) / 2), (v - cy) / ((y1 - y0) / 2)     # -1..1 across the stone
    lum = 0.45 - 0.45 * hx - 0.55 * hy - 0.3 * (hx * hx + hy * hy)
    lum += (noise(sid, 1, 21) - 0.5) * 0.3                               # some stones lighter, some darker
    # more shadow like the original: stones next to the dark door opening and low stones lie in shadow
    ao = max(0.0, 1 - max(0.0, 18.5 - min(u, 64 - u)) / 9.0) if v > 12 else 0.0
    lum -= 0.35 * ao + 0.12 * max(0.0, (v - 40) / 24)
    # moss on the top of some stones
    if noise(sid, 2, 22) < 0.35 and hy < -0.55 + 0.25 * math.sin(u * 2.1 + sid) and d < -0.45:
        return GREEN if (noise(int(u * 2), int(v * 2), 23) < 0.35 and lum > 0) else DGREEN
    # a crack in some stones
    if noise(sid, 3, 24) < 0.3:
        k = (u - cx) * 0.8 - (v - cy) + 0.5 * math.sin(u * 3 + sid)
        if abs(k) < 0.22 and abs(hx) < 0.7: return DBRN
    # grain: small darker pits
    if noise(int(u * 2), int(v * 2), sid) < 0.06: lum -= 0.35
    if lum > 0.2 and math.hypot(hx + 0.35, hy + 0.4) < 0.24: return WHITEC   # glint
    if lum < -0.2: return DBRN if (int(u * 2) + int(v * 2)) % 2 else BRN     # deep shadow, dithered like the original
    return WHITEC if lum > 0.9 else YELC if lum > 0.5 else OCH if lum > 0.15 else BRN

def gate_plants(u, v):
    """a little life on the gate: ivy hanging from the top left, grass tufts at the foot of the jambs"""
    # ivy: a wavy stem with small leaves
    if u < 14 and v < 30:
        sx = 3.0 + 1.6 * math.sin(v * 0.35) + v * 0.12
        if abs(u - sx) < 0.35: return DGREEN
        for k in range(6):
            ly = 3 + k * 4.4
            lx = 3.0 + 1.6 * math.sin(ly * 0.35) + ly * 0.12 + (1.4 if k % 2 else -1.4)
            dl = math.hypot((u - lx) / 1.25, (v - ly) / 0.85)
            if dl < 1: return DGREEN if dl > 0.7 else (LIME if (u - lx) + (v - ly) < 0 else GREEN)
    # grass tufts at the bottom of both jambs
    for bx in (4.0, 11.0, 53.0, 60.0):
        if v > 59:
            for j, (dx, h) in enumerate([(-1.0, 4.0), (0.0, 5.5), (1.0, 3.5)]):
                t = (64 - v) / h
                if 0 <= t <= 1 and abs(u - (bx + dx + dx * t * 0.8)) < 0.4 * (1 - t) + 0.1:
                    return LIME if t > 0.4 else GREEN
    return None

def gate(Cg):
    """stone gateway with the red door (tiles 096-131 of area 2): 64 x 64 original pixels -> 256 x 256.
    Rounded stones lit from the top left around a dark opening, keystone with a red gem, two pointed red
    door panels per row with the highlight on the outer side."""
    S = 4
    img = np.zeros((64 * S, 64 * S, 3), np.uint8)
    for y in range(64 * S):
        for x in range(64 * S):
            u, v = (x + 0.5) / S, (y + 0.5) / S
            c = gate_plants(u, v)
            if c is not None:
                img[y, x] = c; continue
            uu = u if u < 32 else 64 - u                                 # mirrored right half
            for st in GATE_STONES:
                g = GROW                                                 # stones a bit bigger: tight joints
                c = stone_lump(uu, v, st[0] - g, st[1] - g, st[2] + g, st[3] + g) or c
                if c: break
            if c is None:
                k = KEYSTONE
                # keystone: wide on top, narrowing downwards
                if k[1] <= v <= k[3]:
                    w = (k[2] - k[0]) / 2 - max(0, v - 11.5) * 0.9
                    if abs(u - 31.7) <= w:
                        c = stone_lump(u, v, 31.7 - w, k[1], 31.7 + w, k[3]) or DBRN
                        g = math.hypot((u - 31.7) / 2.2, (v - 14.3) / 1.2)
                        if g < 1: c = BLACK if g > 0.8 else PINK if (u < 31.4 and v < 14.4) else DRED
            if c is None:
                c = BLACK if (int(u * 2) + int(v * 2)) % 3 else DBRN    # dark wall / opening
                # door panels: pointed red lenses, darker dithered red around them
                # the two door wings almost meet in the middle, like in the original
                # door wings like the original: pointed, the upper and the lower wings almost meet each
                # other (only a short dark gap between them), black gap in the middle
                for (cx, cy, hw, hh, out) in [(24.8, 31.5, 5.8, 15.0, -1), (38.7, 31.5, 5.8, 15.0, 1),
                                              (24.8, 64.5, 5.8, 12.5, -1), (38.7, 64.5, 5.8, 12.5, 1)]:
                    f = abs(u - cx) / hw + ((v - cy) / hh) ** 2
                    if f < 1:
                        side = (u - cx) * out
                        if f > 0.9: c = BLACK
                        elif f > 0.62 or side < -1.2: c = DRED if (int(u * 2) + int(v * 2)) % 2 else DBRN
                        elif side > 1.3 and abs(v - cy) < hh * 0.55: c = PINK
                        else: c = DRED
            img[y, x] = c
    return img

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    tiles = [pal[np.array(t['px']).reshape(16, 16)] for t in d['tiles']]
    written = []
    import os as _os
    for (x0, y0, x1, y1), want in AREAS:
        if _os.environ.get('ONLY_GATE') and x0 != 195: continue
        C = np.zeros(((y1 - y0) * 16, (x1 - x0) * 16, 3), np.uint8)
        for y in range(y0, y1):
            for x in range(x0, x1):
                j = grid[y][x]
                if j >= 0: C[(y - y0) * 16:(y - y0 + 1) * 16, (x - x0) * 16:(x - x0 + 1) * 16] = tiles[j]
        hd = redraw(C, [WOOD | {WHITE, YEL}, LEAF - {WHITE, YEL}, REDS])
        if x0 == 10: overlay_trunk(hd, C, x0, y0)
        if x0 == 195:
            gx0, gy0 = (197 - x0) * 16, (26 - y0) * 16
            hd[gy0 * 4:(gy0 + 64) * 4, gx0 * 4:(gx0 + 64) * 4] = gate(None)
        done = set()
        for y in range(y0 + 1, y1 - 1):
            for x in range(x0 + 1, x1 - 1):
                j = grid[y][x]
                if j in want and j not in done:
                    done.add(j)
                    Image.fromarray(hd[(y - y0) * 64:(y - y0 + 1) * 64, (x - x0) * 64:(x - x0 + 1) * 64]).save(
                        os.path.join(out, f"t_{d['tiles'][j]['hash']}.png"))
        written += sorted(done)
    print('tiles', written, len(written))
