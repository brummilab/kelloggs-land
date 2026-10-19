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
        b = max(1.0, np.ptp(q) / 2 + 0.3)
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
                if (d > -0.55 and lit < 0.1) or (d > -0.85 and lit < -0.4): hd[y, x] = DGREEN; continue
                inner = leaf_sd(u + 0.45, v + 0.5, cx, cy, r * 0.42, tx + 0.2, ty + 0.2)
                # vein: along the axis from the round part to the tip, slightly curved
                t = ((u - cx) * ax + (v - cy) * ay) / (L * L)
                px, py = cx + ax * t, cy + ay * t
                bend = 0.35 * math.sin(max(0, min(1, t)) * math.pi)
                vd = abs((u - px) * (-ay) / L + (v - py) * (ax / L) - bend)
                col = LIME if inner < 0 else GREEN
                nz = noise(int(u * 2), int(v * 2), seed)
                if inner < 0 and nz < 0.08: col = YEL
                elif inner >= 0 and nz < 0.08: col = LIME
                elif nz > 0.94: col = GREEN if col == LIME else DGREEN
                if -0.2 < t < 1.0 and vd < 0.22: col = GREEN if inner < 0 else DGREEN
                hd[y, x] = col
    return hd
