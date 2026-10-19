#!/usr/bin/env python3
"""HD art: the floating leaf platform of level 1 (tiles 091 left end, 092 / 093 middle, 094 right end).
In the original it is the leaf row (tiles 064 / 065) with sky underneath and with cut-off ends. Here it uses the
leaves of the leaf row (leaves.py), so both look the same; where the original shows sky (below the leaves, at
both ends) the sky is drawn with a smooth edge, and the leaves keep their round shape and tips instead of being
cut off.
    python3 tools/hd-art/leaf_platform.py tiles.json web/hd"""
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leaves

SKY = (0, 109, 238); BLACK = (0, 0, 0)
KNOWN = {(0, 0, 0), (238, 238, 238), (238, 238, 93), (206, 157, 60), (141, 76, 0), (76, 28, 0), (141, 238, 0),
         (0, 174, 0), (28, 93, 28)}
# the small back leaf at the right end of the period would reach into the next tile, which is not always the
# same tile here (093 can be followed by 091, 092 or 094), so the platform leaves it out
PLEAVES = [l for l in leaves.LEAVES if l['c'][0] < 30]
TILES = {91: 0, 92: 0, 93: 16, 94: 16}      # tile -> x0 in the 32 px period of the leaf row

def tile(px, x0, lv):
    leaves.PAL = PAL
    img = np.array(leaves.render_tile(px, x0, lv))
    o = np.array([PAL[v] for v in px], np.uint8).reshape(16, 16, 3)
    # sky of the original (incl. its blue edge pixels), padded so the edge can be smoothed
    sky = np.array([[tuple(c) not in KNOWN for c in r] for r in o], float)
    sk = np.pad(sky, 2, mode='edge')
    m = ndimage.zoom(ndimage.gaussian_filter(sk, 0.8), 4, order=3, grid_mode=True, mode='nearest')[8:-8, 8:-8] > 0.5
    black = np.all(img == BLACK, axis=2)
    img[m & black] = SKY
    # a thin black line stays between leaves and sky (outline), so only black away from the leaves turns blue
    leaf = ~np.all(img == BLACK, axis=2) & ~np.all(img == SKY, axis=2)
    near = ndimage.binary_dilation(leaf, iterations=1)
    img[m & black & near] = BLACK
    return img

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    PAL = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    for t, x0 in TILES.items():
        lv = PLEAVES
        if t == 91:   # left end: the first leaf moves a little to the right so it is not cut at the tile edge
            lv = [dict(l, c=(l['c'][0] + 1.0, l['c'][1]), r=l['r'] * 0.92, tip=(l['tip'][0] + 1.6, l['tip'][1]))
                  if l['c'][0] < 6 and not l.get('back') else l for l in PLEAVES]
        if t == 94:   # right end: no leaf of the next period peeks in
            lv = [l for l in PLEAVES if l['c'][0] > 10]
        Image.fromarray(tile(d['tiles'][t]['px'], x0, lv)).save(os.path.join(out, f"t_{d['tiles'][t]['hash']}.png"))
    print('tiles', list(TILES))
