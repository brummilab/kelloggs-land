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

def flake(T):
    M = 4
    C = np.pad(T, ((M, M), (M, M), (0, 0)))
    C[:M] = SKY; C[-M:] = SKY; C[:, :M] = SKY; C[:, -M:] = SKY
    sky = np.all(C == SKY, axis=2)
    lev = np.zeros(C.shape[:2], float)
    for k, c in enumerate(LEVELS, 1): lev[np.all(C == c, axis=2)] = k
    body = lev > 0
    # brightness: black pixels inside take the brightness of their neighbours
    idx = ndimage.distance_transform_edt(~body, return_distances=False, return_indices=True)
    lev = lev[idx[0], idx[1]]
    up = lambda a, s: ndimage.zoom(ndimage.gaussian_filter(a, s), S, order=3, grid_mode=True, mode='nearest')
    outer = up((~sky).astype(float), 0.55) > 0.5                # flake with its outline
    inner = up(body.astype(float), 0.55) > 0.5                  # flake without the outline
    inner &= ndimage.binary_erosion(outer, iterations=2)        # outline at least 2 HD pixels
    L = up(lev, 0.42)                                           # little blur: the crinkles stay
    # light from the top left: distance to the edge and direction of the edge
    dist = ndimage.distance_transform_edt(inner)
    gy, gx = np.gradient(ndimage.gaussian_filter(dist, 2.0)); n = np.hypot(gx, gy) + 1e-6
    facing = (gx + gy) / n / 1.414                               # >0: edge on the top left
    L = L + np.where((dist < 3.5) & (facing > 0.4), 0.9, 0) - np.where((dist < 3.0) & (facing < -0.4), 0.9, 0)
    q = np.clip(np.rint(L), 1, 5).astype(int)
    out = np.zeros(outer.shape + (3,), np.uint8); out[:] = SKY
    out[outer] = BLACK
    pal = np.array(LEVELS, np.uint8)
    out[inner] = pal[q[inner] - 1]
    return out[M * S:-M * S, M * S:-M * S]

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); outdir = sys.argv[2]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    for t in TILES:
        img = flake(pal[np.array(d['tiles'][t]['px']).reshape(16, 16)])
        Image.fromarray(img).save(os.path.join(outdir, f"t_{d['tiles'][t]['hash']}.png"))
    print('tiles', TILES)
