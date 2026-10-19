#!/usr/bin/env python3
"""HD art: the slope of level 1 that goes up from the bridge to the stone pillars (tiles 152, 153, 158, 159, 160,
166, 167, 168, 178, 179, 184) and the pillar shadow piece 155. In the original the slope is the leaf row laid
diagonally over the dark side of the pillars. Here:
  - stones (and the branch under the leaves) like the stone pillars (masonry.py): every stone found between the
    mortar lines and redrawn smooth at 4x with its own colour bands, light rim, dark rim on the shadow side, grain;
  - sky / dark gaps with smooth edges (foliage.redraw);
  - the leaves: in the original the slope is the leaf row (tiles 064/065) with every pixel column moved up by
    half its x position. Here the leaves of the HD leaf row (leaves.py) sit at those moved places, but keep
    their shape (not slanted), so they join the leaf row at both ends; the branch on top follows the slope.
    python3 tools/hd-art/slope.py tiles.json map.json web/hd"""
import json, os, sys, collections
import numpy as np
from scipy import ndimage
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leafstyle, leaves, math
from foliage import redraw

BLACK, WHITE, YEL, OCH, BRN, DBRN, SKY = (0,0,0), (238,238,238), (238,238,93), (206,157,60), (141,76,0), (76,28,0), (0,109,238)
RAMP = [WHITE, YEL, OCH, BRN, DBRN, BLACK]
STONE = {WHITE, YEL, OCH, BRN}
S = 4
TILES = [152, 153, 155, 158, 159, 160, 166, 167, 168, 178, 179, 184]
AREAS = [(27, 34, 41, 44), (147, 33, 155, 40)]   # map tiles x0, y0, x1, y1: the slope, a pillar with 155

def lum(c): return RAMP.index(c) if c in RAMP else 9

def stones(C, hd):
    """masonry.py's stone redraw, for all stone pixels of C, drawn into the 4x image hd"""
    stone = np.zeros(C.shape[:2], bool)
    for c in STONE: stone |= np.all(C == c, axis=2)
    lab, n = ndimage.label(stone)
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        inside = lab == k
        area = inside.sum()
        m0 = np.kron(inside.astype(float), np.ones((S, S)))
        if area < 4:
            hd[m0 > 0] = np.kron(C, np.ones((S, S, 1), np.uint8))[m0 > 0]; continue
        mb = (ndimage.gaussian_filter(m0, 1.6) > 0.5) & ndimage.binary_dilation(m0 > 0, iterations=2)
        cols = [c for c in RAMP if np.any(np.all(C[inside] == c, axis=1))]
        near = ndimage.distance_transform_edt(~inside, return_distances=False, return_indices=True)
        Cn = C[near[0], near[1]]
        bestv = None; out_c = np.zeros(mb.shape + (3,), np.uint8)
        for c in cols:
            ind = np.all(Cn == c, axis=2).astype(float)
            U = ndimage.zoom(ndimage.gaussian_filter(ind, 0.45, mode='nearest'), S, order=3, mode='nearest', grid_mode=True)
            if bestv is None: bestv = U; out_c[:] = c
            else: sel = U > bestv; bestv[sel] = U[sel]; out_c[sel] = c
        if area >= 12:
            dist = ndimage.distance_transform_edt(mb)
            gy, gx = np.gradient(ndimage.gaussian_filter(dist, 1.0)); nrm = np.hypot(gx, gy) + 1e-6
            facing = (-gx / nrm) * -0.7071 + (-gy / nrm) * -0.7071
            for yy, xx in zip(*np.nonzero((dist <= 1.8) & (facing > 0.45))):
                c = tuple(out_c[yy, xx])
                if c in (YEL, OCH, BRN): out_c[yy, xx] = RAMP[RAMP.index(c) - 1]
            for yy, xx in zip(*np.nonzero((dist <= 1.6) & (facing < -0.45))):
                c = tuple(out_c[yy, xx]); out_c[yy, xx] = RAMP[min(len(RAMP) - 2, RAMP.index(c) + 2)] if c in RAMP else c
            rng = np.random.default_rng(k * 7919 + 13)
            pits = (rng.random(mb.shape) < 0.008) & (dist > 4)
            pits = ndimage.binary_dilation(pits, structure=np.array([[0,0,0],[0,1,1],[0,0,0]]))
            for yy, xx in zip(*np.nonzero(pits)):
                c = tuple(out_c[yy, xx])
                if c in (YEL, OCH, BRN): out_c[yy, xx] = RAMP[RAMP.index(c) + 1]
        hd[mb] = out_c[mb]
    return hd

# shear of the slope (measured from the original): the leaf row's row r is at level row r + K - X/2 for the
# columns X0S .. X1S; left of it the row is flat at K - X0S/2, right of it at K - X1S/2. Period phase 0.
K, X0S, X1S = 880, 480, 608
def off(X): return K - min(max(X, X0S), X1S) / 2

LIGHTER = {(28,93,28): (0,174,0), (0,174,0): (141,238,0), (141,238,0): (238,238,93)}
DARKER = {(141,238,0): (0,174,0), (0,174,0): (28,93,28), (238,238,93): (141,238,0)}

def leaf_colour(uu, v, lf):
    """colour of one leaf of the leaf row at period coords (uu, v) or None (same drawing as leaves.period_colour)"""
    L = leaves
    (cx, cy), r, (tx, ty) = lf['c'], lf['r'], lf['tip']
    d = L.leaf_sd(uu, v, cx, cy, r, tx, ty)
    if d > 0.45: return None
    if d > -0.05: return BLACK
    gx = L.leaf_sd(uu + .2, v, cx, cy, r, tx, ty) - L.leaf_sd(uu - .2, v, cx, cy, r, tx, ty)
    gy = L.leaf_sd(uu, v + .2, cx, cy, r, tx, ty) - L.leaf_sd(uu, v - .2, cx, cy, r, tx, ty)
    n = math.hypot(gx, gy) or 1; lit = -(gx + gy) / n / 1.414
    if lf.get('back'):
        c = L.GREEN if (d > -0.6 and lit > 0.3) else L.DGREEN
        if L.vein(uu, v, cx, cy, r, tx, ty, 0.3) < 0.25: c = BLACK
        return c
    if d > -0.6 and lit < 0.2: return L.DGREEN
    inner = L.leaf_sd(uu + 0.8, v + 0.9, cx, cy, r * lf['lit'], tx + 1.2, ty - 2.0)
    vd = L.vein(uu, v, cx, cy, r, tx, ty, lf['bend'])
    c = L.LIME if inner < 0 else L.GREEN
    nz = L.noise(int(uu * 2), int(v * 2), lf['seed'])
    if inner < 0 and nz < 0.16: c = L.YEL
    elif inner >= 0 and nz < 0.10: c = L.LIME
    elif nz > 0.93: c = DARKER.get(c, c)
    if vd < 0.32: c = L.GREEN if inner < 0 else L.DGREEN
    elif vd < 1.0 and inner < 0 and v < cy + 3.2: c = L.YEL
    if 'spot' in lf and math.hypot(uu - lf['spot'][0], v - lf['spot'][1]) < 0.55: c = L.WHITE
    return c

def slope_leaves(hd, x0, y0):
    """branch along the slope and the leaves of the leaf row at their sheared places; x0, y0: map tile of hd"""
    H, W = hd.shape[:2]
    for y in range(H):
        for x in range(W):
            X, Y = x0 * 16 + (x + .5) / S, y0 * 16 + (y + .5) / S
            if not (X0S - 40 <= X <= X1S + 40): continue
            vp = Y - off(X)
            # branch on top (as in leaves.period_colour), sloping with the hill
            if -0.6 < vp < 1.6 + 0.35 * math.sin(X * 0.9):
                if vp >= 0 or tuple(hd[y, x]) != SKY:
                    hd[y, x] = DBRN if (vp < 0.9 and (X * 0.37) % 3 < 1.7) else BRN
    items = []
    for k in range(X0S // 32 - 3, X1S // 32 + 3):
        for lf in leaves.LEAVES:
            Xc = k * 32 + lf['c'][0]
            # on the slope itself the leaves point both ways, like in the original: the small middle leaf and the
            # back leaves point down to the right (the flat leaf row at both ends stays as it is)
            if X0S + 12 < Xc < X1S - 12 and (lf.get('seed') == 2 or lf.get('back')):
                (cx, cy), (tx, ty) = lf['c'], lf['tip']
                lf = dict(lf, tip=(cx + (cx - tx) + 0.8, ty - 0.4), bend=-lf.get('bend', 0))
            items.append((k * 32, off(Xc), lf))
    for (dx, dy, lf) in items:                         # in the order of leaves.LEAVES (back leaves first)
        (cx, cy), r, (tx, ty) = lf['c'], lf['r'], lf['tip']
        ux0 = int(((dx + min(cx - r, tx) - 1) - x0 * 16) * S); ux1 = int(((dx + max(cx + r, tx) + 1) - x0 * 16) * S)
        vy0 = int(((dy + min(cy - r, ty) - 1) - y0 * 16) * S); vy1 = int(((dy + max(cy + r, ty) + 1) - y0 * 16) * S)
        for y in range(max(0, vy0), min(H, vy1)):
            for x in range(max(0, ux0), min(W, ux1)):
                X, Y = x0 * 16 + (x + .5) / S, y0 * 16 + (y + .5) / S
                c = leaf_colour(X - dx, Y - dy, lf)
                if c is not None: hd[y, x] = c
    return hd

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    tiles = [pal[np.array(t['px']).reshape(16, 16)] for t in d['tiles']]
    nb = leafstyle.neighbour_sets(grid)
    made = {}
    for (x0, y0, x1, y1) in AREAS:
        C = np.zeros(((y1 - y0) * 16, (x1 - x0) * 16, 3), np.uint8)
        for y in range(y0, y1):
            for x in range(x0, x1):
                C[(y - y0) * 16:(y - y0 + 1) * 16, (x - x0) * 16:(x - x0 + 1) * 16] = tiles[grid[y][x]]
        bg = C.copy()                                # leaves of the original -> dark gap behind the new leaves
        green = np.zeros(C.shape[:2], bool)
        for c in [(141, 238, 0), (0, 174, 0), (28, 93, 28)]: green |= np.all(C == c, axis=2)
        # yellow is also a stone colour: only yellow flecks inside a leaf belong to the leaf
        yel = np.all(C == YEL, axis=2) & ndimage.binary_dilation(green, iterations=1)
        bg[green | yel] = BLACK
        hd = redraw(bg, [{DBRN}])                    # sky / black / dark mortar with smooth edges
        hd = stones(bg, hd)
        if x0 == 27: hd = slope_leaves(hd, x0, y0)
        # every tile from the occurrence in this area with the most neighbours of this set
        pick = {}
        for y in range(y0 + 1, y1 - 1):
            for x in range(x0 + 1, x1 - 1):
                i = grid[y][x]
                if i in TILES and i not in made:
                    sc = sum(grid[y + dy][x + dx] in TILES for dy in (-1, 0, 1) for dx in (-1, 0, 1))
                    if i not in pick or sc > pick[i][0]: pick[i] = (sc, x, y)
        for i, (_, x, y) in pick.items():
            made[i] = hd[(y - y0) * 64:(y - y0 + 1) * 64, (x - x0) * 64:(x - x0 + 1) * 64]
            Image.fromarray(made[i]).save(os.path.join(out, f"t_{d['tiles'][i]['hash']}.png"))
    print('tiles', sorted(made), 'missing', sorted(set(TILES) - set(made)))
