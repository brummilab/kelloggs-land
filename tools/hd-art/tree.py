#!/usr/bin/env python3
"""HD art: the big tree next to the house at the start of level 1 (trunk, edge of the crown, red platforms in
it) and the stone gateway further right. Most of these tiles exist only once. Close-to-the-original redraw like the
climbing-plant wall (foliage.py): every piece keeps its place and colours, outlines become smooth at 4x, light rim.
The whole area is redrawn at once so the pieces fit; the tiles of the crown that are already HD stay as they are.
    python3 tools/hd-art/tree.py tiles.json map.json web/hd"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foliage import redraw, WOOD, LEAF

WHITE=(238,238,238); YEL=(238,238,93)
REDS = {(238, 93, 109), (157, 0, 0), (222, 157, 238), (190, 125, 206)}
AREAS = [  # (x0, y0, x1, y1) in map tiles, tiles to write
    ((10, 19, 24, 40), {75, 76, 78, 79, 82, 83, 84, 85, 86, 95, 100, 105, 106, 107, 108, 109, 110, 111, 112,
                        119, 120, 121, 122, 123, 132, 133, 134, 138, 139, 140, 141, 144, 145, 146, 147, 148, 149,
                        150, 156, 161, 162}),
    ((195, 24, 203, 31), {96, 97, 98, 99, 101, 102, 103, 104, 115, 116, 117, 118, 128, 129, 130, 131}),
]

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    tiles = [pal[np.array(t['px']).reshape(16, 16)] for t in d['tiles']]
    written = []
    for (x0, y0, x1, y1), want in AREAS:
        C = np.zeros(((y1 - y0) * 16, (x1 - x0) * 16, 3), np.uint8)
        for y in range(y0, y1):
            for x in range(x0, x1):
                j = grid[y][x]
                if j >= 0: C[(y - y0) * 16:(y - y0 + 1) * 16, (x - x0) * 16:(x - x0 + 1) * 16] = tiles[j]
        hd = redraw(C, [WOOD | {WHITE, YEL}, LEAF - {WHITE, YEL}, REDS])
        done = set()
        for y in range(y0 + 1, y1 - 1):
            for x in range(x0 + 1, x1 - 1):
                j = grid[y][x]
                if j in want and j not in done:
                    done.add(j)
                    Image.fromarray(hd[(y - y0) * 64:(y - y0 + 1) * 64, (x - x0) * 64:(x - x0 + 1) * 64]).save(
                        os.path.join(out, f"t_{d['tiles'][j]['hash']}.png"))
        written += sorted(done)
    print('tiles', written, len(written))
