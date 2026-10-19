#!/usr/bin/env python3
"""Leaves in the style of the leaf row (tools/hd-art/leaves.py) for other foliage: every leaf of the original
(connected green pixels) is measured (centre, direction, length, width, which end is pointed) and drawn again as
a teardrop with a light inner part, a vein, flecks and a dark outline. Used by foliage.py and tree.py."""
import math
import numpy as np
from scipy import ndimage

BLACK=(0,0,0); WHITE=(238,238,238); LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28); YEL=(238,238,93)
LEAFCOLS = [LIME, GREEN, DGREEN, YEL]

def find_leaves(C, min_area=8):
    """C: HxWx3 original colours. Returns a list of leaves (centre, round-part centre, radius, tip, seed)."""
    # all leaf pixels; leaves that touch are split at their narrow waist (watershed, one seed per leaf body)
    from skimage.segmentation import watershed
    m = np.zeros(C.shape[:2], bool)
    for c in LEAFCOLS: m |= np.all(C == c, axis=2)
    dist = ndimage.distance_transform_edt(m)
    peaks = (dist == ndimage.maximum_filter(dist, size=5)) & (dist >= 1.9)
    markers, _ = ndimage.label(ndimage.binary_dilation(peaks))
    lab = watershed(-dist, markers, mask=m)
    n = lab.max()
    out = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < min_area: continue
        pts = np.stack([xs + 0.5, ys + 0.5], 1)
        c = pts.mean(0)
        cov = np.cov((pts - c).T) + np.eye(2) * 0.05
        ev, evec = np.linalg.eigh(cov)
        e = evec[:, 1]                                  # long axis
        p = (pts - c) @ e
        q = (pts - c) @ evec[:, 0]
        a = max(-p.min(), p.max()) + 0.4
        # which end is pointed: the end where the leaf is narrower
        lo = p < -a * 0.35; hi = p > a * 0.35
        wlo = np.ptp(q[lo]) if lo.sum() > 1 else 0; whi = np.ptp(q[hi]) if hi.sum() > 1 else 0
        tipdir = e if whi < wlo else -e
        a *= 1.1                                        # a bit bigger than measured: leaves overlap like in the original
        b = max(1.0, np.ptp(q) / 2 + 0.3) * 1.12
        r = b * 1.02
        rc = c - tipdir * a * 0.22
        tip = c + tipdir * (a * 0.98)
        out.append((tuple(c), tuple(rc), r, tuple(tip), k))
    return out

def leaf_sd(u, v, cx, cy, r, tx, ty):
    ax, ay = tx - cx, ty - cy; L = math.hypot(ax, ay) or 1; ax, ay = ax / L, ay / L
    pu, pv = u - cx, v - cy; t = pu * ax + pv * ay
    if t <= 0: return math.hypot(pu, pv) - r
    t = min(t, L); rr = r * max(0.0, 1 - (t / L) ** 1.7) ** 0.75
    return math.hypot(u - cx - ax * t, v - cy - ay * t) - rr

def noise(i, j, seed=0):
    h = (int(i) * 374761393 + int(j) * 668265263 + seed * 2246822519) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) / 0xffffffff

def draw_leaves(hd, leaves, S=4):
    """draw the leaves (original-pixel coordinates) into the 4x image hd, lower leaves on top"""
    H, W = hd.shape[:2]
    for (c, rc, r, tip, seed) in sorted(leaves, key=lambda l: l[0][1]):
        cx, cy = rc; tx, ty = tip
        x0 = int(max(0, (min(cx - r, tx) - 1.5) * S)); x1 = int(min(W, (max(cx + r, tx) + 1.5) * S))
        y0 = int(max(0, (min(cy - r, ty) - 1.5) * S)); y1 = int(min(H, (max(cy + r, ty) + 1.5) * S))
        ax, ay = tx - cx, ty - cy; L = math.hypot(ax, ay) or 1
        for y in range(y0, y1):
            for x in range(x0, x1):
                u, v = (x + 0.5) / S, (y + 0.5) / S
                d = leaf_sd(u, v, cx, cy, r, tx, ty)
                if d > 0.3: continue
                if d > -0.25: hd[y, x] = BLACK; continue
                # light from the top left: dark rim on the shadow side
                gx = leaf_sd(u + .2, v, cx, cy, r, tx, ty) - leaf_sd(u - .2, v, cx, cy, r, tx, ty)
                gy = leaf_sd(u, v + .2, cx, cy, r, tx, ty) - leaf_sd(u, v - .2, cx, cy, r, tx, ty)
                n = math.hypot(gx, gy) or 1; lit = -(gx + gy) / n / 1.414
                # darker like the original: wide dark rim on the shadow side, small light part
                if (d > -0.95 and lit < 0.25) or (d > -2.4 and lit < -0.05): hd[y, x] = DGREEN; continue
                inner = leaf_sd(u + 0.55, v + 0.6, cx, cy, r * 0.32, tx + 0.3, ty + 0.3)
                # vein: along the axis from the round part to the tip, slightly curved
                t = ((u - cx) * ax + (v - cy) * ay) / (L * L)
                px, py = cx + ax * t, cy + ay * t
                bend = 0.35 * math.sin(max(0, min(1, t)) * math.pi)
                vd = abs((u - px) * (-ay) / L + (v - py) * (ax / L) - bend)
                col = LIME if inner < 0 else GREEN
                nz = noise(int(u * 2), int(v * 2), seed)
                if inner < 0 and nz < 0.05: col = YEL
                elif inner >= 0 and nz < 0.08: col = LIME
                elif nz > 0.94: col = GREEN if col == LIME else DGREEN
                if -0.2 < t < 1.0 and vd < 0.22: col = GREEN if inner < 0 else DGREEN
                hd[y, x] = col
    return hd


def neighbour_sets(grid):
    """for every tile id and every direction: the set of tile ids that are ever its neighbour there"""
    nb = {}
    H, W = len(grid), len(grid[0])
    for y in range(H):
        for x in range(W):
            t = grid[y][x]
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if (dx or dy) and 0 <= y + dy < H and 0 <= x + dx < W:
                        nb.setdefault(t, {}).setdefault((dx, dy), set()).add(grid[y + dy][x + dx])
    return nb

def fit_leaves(leaves, x0, y0, grid, nb):
    """a tile looks the same everywhere it is used, so a leaf may only reach into a neighbour tile when that
    neighbour is always the same (both ways). Otherwise the leaf is made smaller / moved so it stays inside its
    own tile, instead of being cut off at the tile edge."""
    out = []
    for (c, rc, r, tip, seed) in leaves:
        hx, hy = int(c[0] // 16), int(c[1] // 16)
        H = grid[y0 + hy][x0 + hx]
        def ok(dx, dy):
            N = grid[y0 + hy + dy][x0 + hx + dx]
            return nb[H].get((dx, dy)) == {N} and nb[N].get((-dx, -dy)) == {H}
        m = 0.45
        L = hx * 16 + m if not ok(-1, 0) else -1e9; R = hx * 16 + 16 - m if not ok(1, 0) else 1e9
        T = hy * 16 + m if not ok(0, -1) else -1e9; B = hy * 16 + 16 - m if not ok(0, 1) else 1e9
        bx0, bx1 = min(rc[0] - r, tip[0]), max(rc[0] + r, tip[0])
        by0, by1 = min(rc[1] - r, tip[1]), max(rc[1] + r, tip[1])
        # diagonals: if the leaf reaches a corner tile that is not always the same, keep it out vertically
        for dx, dy, cond in ((-1, -1, bx0 < hx * 16 and by0 < hy * 16), (1, -1, bx1 > hx * 16 + 16 and by0 < hy * 16),
                             (-1, 1, bx0 < hx * 16 and by1 > hy * 16 + 16), (1, 1, bx1 > hx * 16 + 16 and by1 > hy * 16 + 16)):
            if cond and not ok(dx, dy):
                if dy < 0: T = max(T, hy * 16 + m)
                else: B = min(B, hy * 16 + 16 - m)
        s = min(1.0, (R - L) / (bx1 - bx0), (B - T) / (by1 - by0))
        ox, oy = (bx0 + bx1) / 2, (by0 + by1) / 2
        f = lambda p: (ox + (p[0] - ox) * s, oy + (p[1] - oy) * s)
        c2, rc2, tip2 = f(c), f(rc), f(tip)
        nb0, nb1 = ox + (bx0 - ox) * s, ox + (bx1 - ox) * s
        mb0, mb1 = oy + (by0 - oy) * s, oy + (by1 - oy) * s
        sx = (L - nb0) if nb0 < L else (R - nb1) if nb1 > R else 0
        sy = (T - mb0) if mb0 < T else (B - mb1) if mb1 > B else 0
        g = lambda p: (p[0] + sx, p[1] + sy)
        out.append((g(c2), g(rc2), r * s, g(tip2), seed))
    return out

def leaf_free(C):
    """the original without its leaves: every leaf pixel takes the colour of the nearest non-leaf pixel
    (branches, dark gaps, sky), so nothing of the old leaves shows where a new leaf is smaller"""
    m = np.zeros(C.shape[:2], bool)
    for c in LEAFCOLS: m |= np.all(C == c, axis=2)
    idx = ndimage.distance_transform_edt(m, return_distances=False, return_indices=True)
    return C[idx[0], idx[1]]

def render(C, x0, y0, grid, redraw, families=None):
    """C: original colours of the map area starting at map tile (x0, y0). Branches / sky redrawn, leaves new."""
    nb = neighbour_sets(grid)
    hd = redraw(leaf_free(C), families)
    return draw_leaves(hd, fit_leaves(find_leaves(C), x0, y0, grid, nb))
