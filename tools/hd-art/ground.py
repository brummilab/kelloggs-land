#!/usr/bin/env python3
"""HD art: mossy rock ground (080 081 / 087 088 / 089 090, repeats every 32x48 px) and the stone cap block (057).
Every rock / stone of the original (pixels between the black cracks) is redrawn at 4x: smooth outline, the
original colour bands of that rock smoothed, a light rim (moss on top) and a dark rim underneath, a little grain.
The pattern is treated as seamless (wrap-around), so the tiles fit each other in every direction.
    python3 tools/hd-art/ground.py tiles.json web/hd [preview.png]"""
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image

BLACK=(0,0,0); WHITE=(238,238,238); YEL=(238,238,93); OCH=(206,157,60); BRN=(141,76,0); DBRN=(76,28,0)
LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28)
LIGHTER = {DBRN: BRN, BRN: OCH, DGREEN: GREEN, GREEN: LIME, OCH: YEL, YEL: WHITE, BLACK: DBRN}
DARKER = {BRN: DBRN, DBRN: BLACK, GREEN: DGREEN, DGREEN: BLACK, OCH: BRN, YEL: OCH, WHITE: YEL, LIME: GREEN}
S = 4

def redraw(period, seed, rim_light=True):
    """period: HxWx3 uint8 RGB (one repeat). Returns the 4x redraw (H*4 x W*4 x 3)."""
    H, W, _ = period.shape
    big = np.tile(period, (3, 3, 1))
    nb = (~np.all(big == BLACK, axis=2)).astype(float)
    # dithered dark parts (dark brown / black checker) belong to the rock, only real gaps are cracks
    stone = ndimage.gaussian_filter(nb, 0.75) > 0.36
    lab, n = ndimage.label(stone)
    lab = lab[H:2 * H, W:2 * W]; C = period
    # work on a padded copy so smoothing wraps around
    P = 6
    Lp = np.pad(lab, P, mode='wrap'); Cp = np.pad(C, ((P, P), (P, P), (0, 0)), mode='wrap')
    out = np.kron(Cp, np.ones((S, S, 1), np.uint8))
    out[:] = BLACK
    rng = np.random.default_rng(seed)
    for k in np.unique(Lp):
        if k == 0: continue
        inside = Lp == k
        area = inside.sum()
        m0 = np.kron(inside.astype(float), np.ones((S, S)))
        if area < 3:
            out[m0 > 0] = np.kron(Cp, np.ones((S, S, 1), np.uint8))[m0 > 0]; continue
        mb = (ndimage.gaussian_filter(m0, 1.7) > 0.5) & ndimage.binary_dilation(m0 > 0, iterations=2)
        solid = inside & ~np.all(Cp == BLACK, axis=2)
        cols = [tuple(c) for c in np.unique(Cp[solid], axis=0)]
        near = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        Cn = Cp[near[0], near[1]]
        best = None; oc = np.zeros(mb.shape + (3,), np.uint8)
        for c in cols:
            ind = np.all(Cn == c, axis=2).astype(float)
            U = ndimage.zoom(ndimage.gaussian_filter(ind, 0.5, mode='nearest'), S, order=3, mode='nearest', grid_mode=True)
            if best is None: best = U; oc[:] = c
            else: sel = U > best; best[sel] = U[sel]; oc[sel] = c
        if area >= 8:
            dist = ndimage.distance_transform_edt(mb)
            gy, gx = np.gradient(ndimage.gaussian_filter(dist, 1.0)); nrm = np.hypot(gx, gy) + 1e-6
            facing = (-gx / nrm) * -0.6 + (-gy / nrm) * -0.8          # light from above, a bit from the left
            for (sel, table) in (((dist <= 1.6) & (facing > 0.45), LIGHTER), ((dist <= 1.8) & (facing < -0.45), DARKER)):
                if not rim_light and table is LIGHTER: continue
                for yy, xx in zip(*np.nonzero(sel)):
                    c = tuple(oc[yy, xx]); oc[yy, xx] = table.get(c, c)
            pits = (rng.random(mb.shape) < 0.01) & (dist > 3.5)
            pits = ndimage.binary_dilation(pits, structure=np.array([[0, 0, 0], [0, 1, 1], [0, 0, 0]]))
            for yy, xx in zip(*np.nonzero(pits)):
                c = tuple(oc[yy, xx]); oc[yy, xx] = DARKER.get(c, c)
        # where the original rock was dithered (dark), keep it dark with a fine half-pixel dither
        dens = ndimage.zoom(ndimage.gaussian_filter((~np.all(Cp == BLACK, axis=2)).astype(float), 0.6), S, order=1, grid_mode=True, mode='nearest')
        yy, xx = np.mgrid[0:mb.shape[0], 0:mb.shape[1]]
        dark = (dens < 0.62) & np.all(oc == DBRN, axis=2) & (((yy // 2) + (xx // 2)) % 2 == 0)
        oc[dark] = BLACK
        out[mb] = oc[mb]
    return out[P * S:(P + H) * S, P * S:(P + W) * S]


def rocks(period, seed):
    """Rounder, more plastic rocks: every rock of the original becomes a lumpy, rounded boulder with the same
    position and size, lit from the top left like a 3D surface: moss on its top, brown flank, dark dithered
    underside, black cracks between the rocks."""
    H, W, _ = period.shape
    big = np.tile(period, (3, 3, 1))
    nb = (~np.all(big == BLACK, axis=2)).astype(float)
    # cracks = solid black areas; the rest is rock. Rocks touch each other, so split them at their narrow
    # waists (watershed on the distance to the cracks, one seed per thick part).
    from skimage.segmentation import watershed
    rock = ndimage.gaussian_filter(nb, 0.9) > 0.22
    dist = ndimage.distance_transform_edt(rock)
    peaks = (dist == ndimage.maximum_filter(dist, size=7)) & (dist > 1.6)
    markers, _ = ndimage.label(peaks)
    lab = watershed(-dist, markers, mask=rock)
    green = np.all(big == GREEN, axis=2) | np.all(big == DGREEN, axis=2)
    blobs = []
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        ys, xs = np.nonzero(lab[sl] == k)
        if len(ys) < 4: continue
        ys = ys + sl[0].start; xs = xs + sl[1].start
        cy, cx = ys.mean() + 0.5, xs.mean() + 0.5
        if not (H <= cy < 2 * H and W <= cx < 2 * W): continue      # keep each rock once (centre in the middle copy)
        cov = np.cov(np.vstack([xs, ys])) + np.eye(2) * 0.3
        ev, evec = np.linalg.eigh(cov)
        a, b = [1.85 * np.sqrt(e) + 0.6 for e in ev]               # ellipse half axes that cover the rock
        mossy = green[ys, xs].mean() if len(ys) else 0
        blobs.append((cx - W, cy - H, a, b, evec, mossy, k))
    blobs.sort(key=lambda t: t[1])                               # lower rocks overlap upper ones
    S_ = S; img = np.zeros((H * S_, W * S_, 3), np.uint8)
    yy, xx = np.mgrid[0:H * S_, 0:W * S_]
    u = (xx + 0.5) / S_; v = (yy + 0.5) / S_
    L = np.array([-0.45, -0.65, 0.62]); L = L / np.linalg.norm(L)
    rng = np.random.default_rng(seed)
    for (cx, cy, a, b, evec, mossy, k) in blobs:
        ph = rng.random(3) * 6.28
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                dx = u - (cx + ox); dy = v - (cy + oy)
                p = np.stack([dx, dy], -1) @ evec                   # into the ellipse frame
                ang = np.arctan2(p[..., 1], p[..., 0])
                wob = 1 + 0.07 * np.sin(3 * ang + ph[0]) + 0.05 * np.sin(5 * ang + ph[1])   # lumpy outline
                r2 = (p[..., 0] / (a * wob)) ** 2 + (p[..., 1] / (b * wob)) ** 2
                inside = r2 < 1
                if not inside.any(): continue
                nz = np.sqrt(np.clip(1 - r2, 0, 1))
                # surface normal (back to screen axes)
                nxy = np.stack([p[..., 0] / (a * a), p[..., 1] / (b * b)], -1) @ evec.T
                nx, ny = nxy[..., 0] * min(a, b), nxy[..., 1] * min(a, b)
                lum = (nx * L[0] + ny * L[1] + nz * L[2]) / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-9)
                c = np.zeros(inside.shape + (3,), np.uint8)
                c[:] = BLACK
                dith = ((yy // 2 + xx // 2) % 2 == 0)
                # dark like the original: the body is dark brown dithered with black, light only on the rim
                c[lum > 0.25] = np.where(dith[lum > 0.25, None], DBRN, BLACK)
                c[lum > 0.74] = DBRN
                rim = (r2 > 0.55) & (lum > 0.66)
                c[rim] = BRN
                # moss: a thin crust on the upper rim, green spots in it
                nn = np.sqrt(nx * nx + ny * ny) + 1e-9
                up = -ny / nn
                lim = 0.70 - 0.3 * mossy
                top = (up > lim) & (r2 > 0.52) & (lum > 0.3)
                c[top] = DGREEN
                g = top & (up > lim + 0.15) & (r2 > 0.75) & (rng.random(inside.shape) < 0.55)
                c[g] = GREEN
                c[(r2 > 0.86) & (lum < 0.3)] = BLACK                 # dark rim on the shadow side
                img[inside] = c[inside]
    return img

def cap(u, v):
    """stone cap block 057: cut stone, wide at the top, narrowing downwards, with bevelled edges:
    light top and left bevel, dark right bevel and underside, front face lit from the top left"""
    def edges(v):
        return 0.5 + 1.8 * (v / 12.5) ** 1.6, 15.0 - 2.4 * (v / 12.5) ** 1.6
    BV = 1.5                                   # bevel width
    if v < 12.6:
        l, r = edges(v)
        if l <= u <= r:
            dl, dr, dt, db = u - l, r - u, v, 12.6 - v
            m = min(dl, dr, dt, db)
            if m < BV:                         # bevel facets
                if m == dt: return WHITE if dt < 0.5 and u < 11 else YEL
                if m == dl: return WHITE if dl < 0.45 and v < 7 else YEL
                if m == dr: return BRN if v < 4 else DBRN
                return DBRN if db > 0.5 else BLACK
            # front face: lit from the top left, a soft highlight and grain
            t = (v - BV) / (12.6 - 2 * BV) * 0.75 + (u - l) / (r - l) * 0.45
            k = (int(u * 2) * 5 + int(v * 2) * 11) % 13
            c = YEL if t < 0.30 else OCH if t < 0.68 else BRN if t < 0.98 else DBRN
            return c
    if 12.6 <= v < 13.9:
        l, r = edges(12.6)
        if l + 0.5 <= u <= r - 0.3: return BLACK
    # gaps between the blocks: in shadow (dark), a thin line of moss along the outer edges
    k = (int(u * 2) * 7 + int(v * 2) * 13) % 17
    if u < 0.6 or u > 15.4 or v > 15.0: return GREEN if k == 0 else DGREEN
    return DBRN if k % 5 == 0 else BLACK

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    T = lambda n: pal[np.array(d['tiles'][n]['px']).reshape(16, 16)]
    grid = [[80, 81], [87, 88], [89, 90]]
    period = np.vstack([np.hstack([T(n) for n in row]) for row in grid])
    hd = rocks(period, 1)
    made = {}
    for r, row in enumerate(grid):
        for c, n in enumerate(row):
            made[n] = Image.fromarray(hd[r * 64:(r + 1) * 64, c * 64:(c + 1) * 64])
    cap_img = Image.new('RGB', (64, 64))
    for y in range(64):
        for x in range(64): cap_img.putpixel((x, y), cap((x + .5) / 4, (y + .5) / 4))
    made[57] = cap_img
    for n, im in made.items(): im.save(os.path.join(out, f"t_{d['tiles'][n]['hash']}.png"))
    if len(sys.argv) > 3:
        o = Image.fromarray(np.tile(period, (1, 2, 1))).resize((256, 192), Image.NEAREST)
        h = Image.fromarray(np.tile(hd, (1, 2, 1)))
        so = Image.fromarray(np.tile(T(57), (2, 2, 1))).resize((128, 128), Image.NEAREST)
        sh = Image.fromarray(np.tile(np.array(made[57]), (2, 2, 1)))
        c = Image.new('RGB', (256 * 2 + 128 * 2 + 48, 192), (40, 40, 40))
        c.paste(o, (0, 0)); c.paste(h, (272, 0)); c.paste(so, (544, 0)); c.paste(sh, (688, 0))
        c.resize((c.width * 2, c.height * 2), Image.NEAREST).save(sys.argv[3])
