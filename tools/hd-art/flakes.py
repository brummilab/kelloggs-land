#!/usr/bin/env python3
"""HD art: the cornflakes to collect in level 1 (tiles 124, 151, 154, 157 and the dark toasted one, 135).
Like the cloud: the brightness of the original (dark brown .. white) is blurred a little and cut into clean,
smooth colour bands, so the crinkled look of the flake stays where it is; smooth black outline, a light rim
on the top left and a darker rim on the bottom right.
    python3 tools/hd-art/flakes.py tiles.json web/hd"""
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image

SKY=(0,109,238); BLACK=(0,0,0); DBRN=(76,28,0); BRN=(141,76,0); OCH=(206,157,60); YEL=(238,238,93); WHITE=(238,238,238)
LEVELS = [DBRN, BRN, OCH, YEL, WHITE]          # brightness 1..5
TILES = [124, 135, 151, 154, 157]
S = 4

def flake(T, seed=0):
    """one flake: smooth outline from the original; inside a curved, bumpy surface (a dome plus soft bumps and
    the bright / dark parts of the original as hills / dips), lit from the top left and cut into the five
    brown-yellow-white bands; toasted (darker) edge all around, a few shiny sugar spots on the bumps"""
    M = 4
    C = np.pad(T, ((M, M), (M, M), (0, 0)))
    C[:M] = SKY; C[-M:] = SKY; C[:, :M] = SKY; C[:, -M:] = SKY
    sky = np.all(C == SKY, axis=2)
    lev = np.zeros(C.shape[:2], float)
    for k, c in enumerate(LEVELS, 1): lev[np.all(C == c, axis=2)] = k
    body = lev > 0
    base = lev[body].mean()                                    # how golden / toasted this flake is
    idx = ndimage.distance_transform_edt(~body, return_distances=False, return_indices=True)
    lev = lev[idx[0], idx[1]]
    up = lambda a, s: ndimage.zoom(ndimage.gaussian_filter(a, s), S, order=3, grid_mode=True, mode='nearest')
    outer = up((~sky).astype(float), 0.55) > 0.5
    inner = up(body.astype(float), 0.55) > 0.5
    inner &= ndimage.binary_erosion(outer, iterations=2)
    dist = ndimage.distance_transform_edt(inner)
    rng = np.random.default_rng(seed)
    bumps = sum(ndimage.gaussian_filter(rng.standard_normal(inner.shape), s) * s * 0.9 for s in (1.6, 3.2))
    orig = up(lev, 1.0) - base                                 # light parts of the original become hills
    h = 9.0 * (1 - np.exp(-dist / 7.0)) + 2.2 * bumps + 2.0 * orig
    h = ndimage.gaussian_filter(h, 1.0)
    gy, gx = np.gradient(h)
    nz = 1.0 / np.sqrt(gx * gx + gy * gy + 1)
    shade = (-gx * -0.6 + -gy * -0.6 + 1.0 * 0.53) * nz        # light from the top left and the front
    t = (shade - 0.53) * 4.0                                   # -1 (turned away) .. +1 (facing the light)
    t -= 0.6 * np.clip(1 - dist / 4.5, 0, 1)                   # toasted edge
    L = base + 0.45 + 1.15 * t
    q = np.clip(np.rint(L), 1, 4).astype(int)                  # white only for the glints
    # sugar glints: small white spots on bright bumps
    glint = (q >= 4) & (ndimage.gaussian_filter(rng.random(inner.shape), 0.8) > 0.555) & (dist > 4) & (t > 0.3)
    q[glint & (base > 2)] = 5
    out = np.zeros(outer.shape + (3,), np.uint8); out[:] = SKY
    out[outer] = BLACK
    pal = np.array(LEVELS, np.uint8)
    out[inner] = pal[q[inner] - 1]
    return out[M * S:-M * S, M * S:-M * S]

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); outdir = sys.argv[2]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    for t in TILES:
        img = flake(pal[np.array(d['tiles'][t]['px']).reshape(16, 16)], seed=t)
        Image.fromarray(img).save(os.path.join(outdir, f"t_{d['tiles'][t]['hash']}.png"))
    print('tiles', TILES)
