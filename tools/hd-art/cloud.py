#!/usr/bin/env python3
"""HD art: the pink cloud of level 1 (6 x 2 tiles: 002-007 over 008-013). The original builds its soft shading
from dithered pixels (checkerboards of white / lilac / purple / light blue). Here the brightness of the
original is blurred and drawn again as clean, smooth colour bands, inside a smoothed outline; the light blue
stays as a thin rim against the sky. Shape and light come from the original.
    python3 tools/hd-art/cloud.py tiles.json web/hd [preview.png]"""
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image

SKY=(0,109,238); LBLUE=(125,157,238); PURP=(190,125,206); LILAC=(222,157,238); WHITE=(238,238,238)
LEVEL = {SKY: 0, LBLUE: 1, PURP: 2, LILAC: 3, WHITE: 4}
TOP, BOTTOM = [2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13]
S = 4

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    T = lambda n: pal[np.array(d['tiles'][n]['px']).reshape(16, 16)]
    cloud = np.vstack([np.hstack([T(n) for n in TOP]), np.hstack([T(n) for n in BOTTOM])])
    M = 8                                                    # sky margin so the outline can be smoothed
    C = np.pad(cloud, ((M, M), (M, M), (0, 0)), mode='constant')
    C[:M] = SKY; C[-M:] = SKY; C[:, :M] = SKY; C[:, -M:] = SKY
    lev = np.zeros(C.shape[:2], float)
    for c, k in LEVEL.items(): lev[np.all(C == c, axis=2)] = k
    inside = lev > 0
    # outline: smooth the cloud mask at 4x
    m4 = ndimage.zoom(ndimage.gaussian_filter(inside.astype(float), 0.6), S, order=3, grid_mode=True, mode='nearest') > 0.5
    # brightness inside: blur away the dither, then cut into clean bands
    lb = ndimage.gaussian_filter(np.where(inside, np.maximum(lev, 2.0), 1.0), 0.95)   # inside: at least purple
    L4 = ndimage.zoom(lb, S, order=3, grid_mode=True, mode='nearest')
    img = np.zeros(m4.shape + (3,), np.uint8); img[:] = SKY
    bands = [(3.35, WHITE), (2.75, LILAC), (-9, PURP)]
    for thr, col in reversed(bands):
        img[m4 & (L4 > thr)] = col
    # thin light-blue rim against the sky
    # edge like the original: a lilac rim, the outermost pixels light blue
    rim = m4 & ~ndimage.binary_erosion(m4, iterations=4)
    img[rim & (L4 < 3.35)] = LILAC
    rim2 = m4 & ~ndimage.binary_erosion(m4, iterations=2)
    img[rim2] = LBLUE                                         # outermost pixel always light blue
    hd = img[M * S:-M * S, M * S:-M * S]
    for r, row in enumerate((TOP, BOTTOM)):
        for c, n in enumerate(row):
            Image.fromarray(hd[r * 64:(r + 1) * 64, c * 64:(c + 1) * 64]).save(os.path.join(out, f"t_{d['tiles'][n]['hash']}.png"))
    if len(sys.argv) > 3:
        o = Image.fromarray(cloud).resize((96 * 4, 32 * 4), Image.NEAREST)
        h = Image.fromarray(hd)
        cv = Image.new('RGB', (96 * 4, 32 * 8 + 8), (40, 40, 40)); cv.paste(o, (0, 0)); cv.paste(h, (0, 32 * 4 + 8))
        cv.resize((cv.width * 2, cv.height * 2), Image.NEAREST).save(sys.argv[3])
