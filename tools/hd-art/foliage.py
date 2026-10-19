#!/usr/bin/env python3
"""HD art: climbing-plant wall (level 1): tiles 038-043 and 046-050. Close to the original: every leaf and every
branch piece is kept where it is, with its own colour bands, but drawn with smooth outlines at 4x (like the rock
ground). Leaves get a light rim on the top left and a dark rim on the bottom right.
    python3 tools/hd-art/foliage.py tiles.json map.json web/hd [preview.png]"""
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image

BLACK=(0,0,0); SKY=(0,109,238); WHITE=(238,238,238); YEL=(238,238,93); OCH=(206,157,60); BRN=(141,76,0)
DBRN=(76,28,0); LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28)
LEAF = {LIME, GREEN, DGREEN, YEL, WHITE}
WOOD = {OCH, BRN, DBRN}
LIGHTER = {DGREEN: GREEN, GREEN: LIME, BRN: OCH, DBRN: BRN}
DARKER = {LIME: GREEN, GREEN: DGREEN, OCH: BRN, BRN: DBRN, YEL: LIME}
TILES = [38, 39, 40, 41, 42, 43, 46, 47, 48, 49, 50]
S = 4

def redraw(C):
    """C: HxWx3 original colours of an area. Returns the 4x redraw."""
    H, W, _ = C.shape
    fam = np.zeros((H, W), np.int8)
    for c in LEAF: fam[np.all(C == c, axis=2)] = 1
    for c in WOOD: fam[np.all(C == c, axis=2)] = 2
    out = np.kron(C, np.ones((S, S, 1), np.uint8))
    sky = np.kron(np.all(C == SKY, axis=2), np.ones((S, S), bool))
    out[:] = BLACK; out[sky] = SKY
    # smooth the sky / black boundary too
    skym = ndimage.gaussian_filter(sky.astype(float), 1.6) > 0.5
    out[skym] = SKY; out[~skym] = BLACK
    for f in (2, 1):                                   # branches first, leaves on top
        lab, n = ndimage.label(fam == f)
        for k in range(1, n + 1):
            inside = lab == k
            area = inside.sum()
            m0 = np.kron(inside.astype(float), np.ones((S, S)))
            if area < 3:
                out[m0 > 0] = np.kron(C, np.ones((S, S, 1), np.uint8))[m0 > 0]; continue
            mb = (ndimage.gaussian_filter(m0, 1.5) > 0.5) & ndimage.binary_dilation(m0 > 0, iterations=2)
            cols = [tuple(c) for c in np.unique(C[inside], axis=0)]
            near = ndimage.distance_transform_edt(~inside, return_distances=False, return_indices=True)
            Cn = C[near[0], near[1]]
            best = None; oc = np.zeros(mb.shape + (3,), np.uint8)
            for c in cols:
                ind = np.all(Cn == c, axis=2).astype(float)
                U = ndimage.zoom(ndimage.gaussian_filter(ind, 0.5, mode='nearest'), S, order=3, mode='nearest', grid_mode=True)
                if best is None: best = U; oc[:] = c
                else: sel = U > best; best[sel] = U[sel]; oc[sel] = c
            if area >= 6:
                dist = ndimage.distance_transform_edt(mb)
                gy, gx = np.gradient(ndimage.gaussian_filter(dist, 1.0)); nrm = np.hypot(gx, gy) + 1e-6
                facing = (-gx / nrm) * -0.7071 + (-gy / nrm) * -0.7071
                for (sel, table) in (((dist <= 1.6) & (facing > 0.45), LIGHTER), ((dist <= 0.9) & (facing < -0.6), DARKER)):
                    for yy, xx in zip(*np.nonzero(sel)):
                        c = tuple(oc[yy, xx]); oc[yy, xx] = table.get(c, c)
            out[mb] = oc[mb]
    return out

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    tiles = [pal[np.array(t['px']).reshape(16, 16)] for t in d['tiles']]
    Hm, Wm = len(grid), len(grid[0])
    best = {}
    for y in range(1, Hm - 1):
        for x in range(1, Wm - 1):
            i = grid[y][x]
            if i in TILES:
                sc = sum(grid[y + dy][x + dx] in TILES for dy in (-1, 0, 1) for dx in (-1, 0, 1))
                if i not in best or sc > best[i][0]: best[i] = (sc, x, y)
    made = {}
    for i, (_, tx, ty) in best.items():
        M = 1                                          # one tile of context around
        C = np.zeros(((2 * M + 1) * 16, (2 * M + 1) * 16, 3), np.uint8)
        for dy in range(-M, M + 1):
            for dx in range(-M, M + 1):
                j = grid[ty + dy][tx + dx]
                C[(dy + M) * 16:(dy + M + 1) * 16, (dx + M) * 16:(dx + M + 1) * 16] = tiles[j] if j >= 0 else 0
        hd = redraw(C)
        made[i] = Image.fromarray(hd[M * 64:(M + 1) * 64, M * 64:(M + 1) * 64])
        made[i].save(os.path.join(out, f"t_{d['tiles'][i]['hash']}.png"))
    print('tiles', sorted(made))
