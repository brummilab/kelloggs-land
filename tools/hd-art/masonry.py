#!/usr/bin/env python3
"""HD art: stone pillars / masonry (level 1). Every stone of the original is found (joined pixels between the
mortar lines) and redrawn at 4x as one clean stone: rounded corners, light edge on the lit side, shadow edge
on the other, flat body colour. Colours per stone come from the original stone (brightest, most common, darkest).
    python3 tools/hd-art/masonry.py tiles.json map.json web/hd [preview.png]
tiles.json / map.json: level export (see tools/hd-art/README.md)."""
import json, os, sys, collections
import numpy as np
from scipy import ndimage
from PIL import Image

WALL = [22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 69, 70, 71, 72, 73, 74, 77]
BLACK, WHITE, YEL, OCH, BRN, DBRN, SKY = (0,0,0), (238,238,238), (238,238,93), (206,157,60), (141,76,0), (76,28,0), (0,109,238)
RAMP = [WHITE, YEL, OCH, BRN, DBRN, BLACK]  # light -> dark
STONE = {WHITE, YEL, OCH, BRN}
MORTAR = {DBRN, BLACK}
S = 4; M = 4  # scale, margin (orig px)

def lum(c): return RAMP.index(c) if c in RAMP else 9

def main():
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    H, W = len(grid), len(grid[0])
    tiles = [np.array(t['px']).reshape(16, 16) for t in d['tiles']]
    big = np.zeros((H * 16, W * 16), np.int32)
    for y in range(H):
        for x in range(W):
            i = grid[y][x]
            if i >= 0: big[y*16:y*16+16, x*16:x*16+16] = tiles[i]
    col = np.array(pal, np.uint8)[big]                          # RGB of the whole level, original size
    iswall = np.zeros((H * 16, W * 16), bool)
    for y in range(H):
        for x in range(W):
            if grid[y][x] in WALL: iswall[y*16:y*16+16, x*16:x*16+16] = True
    stone = np.zeros(big.shape, bool)
    for c in STONE: stone |= np.all(col == c, axis=2)
    stone &= iswall
    lab, n = ndimage.label(stone)
    # per stone colours
    info = {}
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        msk = lab[sl] == k; cs = [tuple(v) for v in col[sl][msk]]
        cnt = collections.Counter(cs)
        light = min(cnt, key=lum); dark = max(cnt, key=lum); body = cnt.most_common(1)[0][0]
        if body == light and len(cnt) > 1: body = sorted(cnt, key=lum)[1] if cnt[sorted(cnt, key=lum)[1]] * 3 > cnt[light] else body
        ys, xs = np.nonzero(msk); cy, cx = ys.mean(), xs.mean()
        hy, hx = np.nonzero(np.array([[c == light for c in row] for row in [[tuple(v) for v in r] for r in col[sl]]]) & msk)
        v = np.array([hx.mean() - cx, hy.mean() - cy]) if len(hx) else np.zeros(2)
        Ld = v / np.linalg.norm(v) if np.linalg.norm(v) > 0.6 else np.array([-0.7071, -0.7071])
        info[k] = (light, body, dark, Ld, msk.sum())
    # pick one occurrence per wall tile: the one with the most wall neighbours
    best = {}
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            i = grid[y][x]
            if i in WALL:
                sc = sum(grid[y+dy][x+dx] in WALL for dy in (-1, 0, 1) for dx in (-1, 0, 1))
                if i not in best or sc > best[i][0]: best[i] = (sc, x, y)
    hashes = {i: d['tiles'][i]['hash'] for i in WALL}
    made = {}
    for i, (_, tx, ty) in best.items():
        y0, x0 = ty * 16 - M, tx * 16 - M; h = w = 16 + 2 * M
        L = lab[max(0, y0):y0 + h, max(0, x0):x0 + w]; C = col[max(0, y0):y0 + h, max(0, x0):x0 + w]
        if L.shape != (h, w): continue
        Cb = np.kron(C, np.ones((S, S, 1), np.uint8))           # nearest 4x: mortar and anything else
        img = Cb.copy()
        # mortar: smooth the mortar colour from the neighbours (no blocky steps)
        for k in np.unique(L):
            if k == 0: continue
            light, body, dark, Ld, area = info[k]
            m0 = np.kron((L == k).astype(float), np.ones((S, S)))
            if area < 4:
                continue  # tiny bits stay as they are
            mb = ndimage.gaussian_filter(m0, 1.6) > 0.5
            mb &= ndimage.binary_dilation(m0 > 0, iterations=2)
            # inside the stone: the original colour bands of this stone, upscaled smoothly (straight, clean bands)
            Ck = C.copy(); inside = L == k
            cols = [c for c in RAMP if np.any(np.all(C[inside] == c, axis=1))]
            bestv = None; out_c = np.zeros(mb.shape + (3,), np.uint8)
            near = ndimage.distance_transform_edt(~inside, return_distances=False, return_indices=True)
            Cn = C[near[0], near[1]]                         # stone colour spread outward, so edges are not dragged to mortar
            for c in cols:
                ind = np.all(Cn == c, axis=2).astype(float)
                U = ndimage.zoom(ndimage.gaussian_filter(ind, 0.45, mode='nearest'), S, order=3, mode='nearest', grid_mode=True)
                if bestv is None: bestv = U; out_c[:] = c
                else: sel = U > bestv; bestv[sel] = U[sel]; out_c[sel] = c
            # HD detail on top of the original bands: thin bright edge (white only 2 px), a dark line along the
            # shadow edge, and a light stone grain (small pits) on the flat body
            if area >= 12:
                dist = ndimage.distance_transform_edt(mb)
                gy, gx = np.gradient(ndimage.gaussian_filter(dist, 1.0)); nrm = np.hypot(gx, gy) + 1e-6
                facing = (-gx / nrm) * -0.7071 + (-gy / nrm) * -0.7071
                # crisp light rim on the lit side: one step brighter than what is there
                rim = (dist <= 1.8) & (facing > 0.45)
                for yy, xx in zip(*np.nonzero(rim)):
                    c = tuple(out_c[yy, xx])
                    if c in (YEL, OCH, BRN): out_c[yy, xx] = RAMP[RAMP.index(c) - 1]
                sel = (dist <= 1.6) & (facing < -0.45)
                for yy, xx in zip(*np.nonzero(sel)):
                    c = tuple(out_c[yy, xx]); out_c[yy, xx] = RAMP[min(len(RAMP) - 2, RAMP.index(c) + 2)] if c in RAMP else c
                rng = np.random.default_rng(k * 7919 + 13)
                pits = (rng.random(mb.shape) < 0.008) & (dist > 4)
                pits = ndimage.binary_dilation(pits, structure=np.array([[0,0,0],[0,1,1],[0,0,0]]))
                for yy, xx in zip(*np.nonzero(pits)):
                    c = tuple(out_c[yy, xx])
                    if c in (YEL, OCH, BRN): out_c[yy, xx] = RAMP[RAMP.index(c) + 1]
            # stones that lost their area to the mortar keep the outline of the original
            rm = (m0 > 0) & ~mb
            img[rm] = Cb[rm]
            nb = ndimage.binary_dilation(mb, iterations=1) & ~mb & (m0 > 0)
            img[mb] = out_c[mb]
        # pixels that were stone in the original but now belong to no smoothed stone -> mortar colour around
        made[i] = Image.fromarray(img[M*S:(M+16)*S, M*S:(M+16)*S])
        made[i].save(os.path.join(out, f't_{hashes[i]}.png'))
    print('tiles', sorted(made))
    if len(sys.argv) > 4:
        # preview: the area of the first choice of tile 30, 8x5 tiles
        _, tx, ty = best[30]; x0, y0 = tx - 2, ty - 1
        o = Image.new('RGB', (8 * 64, 5 * 64)); hd = Image.new('RGB', (8 * 64, 5 * 64))
        for yy in range(5):
            for xx in range(8):
                i = grid[y0 + yy][x0 + xx]
                t = Image.fromarray(np.array(pal, np.uint8)[tiles[i]]).resize((64, 64), Image.NEAREST)
                o.paste(t, (xx * 64, yy * 64)); hd.paste(made.get(i, t), (xx * 64, yy * 64))
        c = Image.new('RGB', (o.width * 2 + 16, o.height), (40, 40, 40)); c.paste(o, (0, 0)); c.paste(hd, (o.width + 16, 0))
        c.save(sys.argv[4])

main()
