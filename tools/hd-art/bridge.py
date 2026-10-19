#!/usr/bin/env python3
"""HD art: wooden bridge with railing and arch near the bottom of level 1 (tiles 171-177, 180-183, 185, 186; each
used once). Same close-to-the-original redraw as the climbing-plant wall (tools/hd-art/foliage.py): every piece keeps
its place and colours, outlines become smooth at 4x, light rim top left. Drawn as one area so the pieces fit.
    python3 tools/hd-art/bridge.py tiles.json map.json web/hd"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foliage import redraw, WOOD, LEAF, BLACK, SKY

PINK = {(238, 93, 109), (157, 0, 0), (222, 157, 238), (190, 125, 206), (125, 157, 238), (0, 60, 141)}
TILES = {171, 172, 173, 174, 175, 176, 177, 180, 181, 182, 183, 185, 186}

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); grid = json.load(open(sys.argv[2]))['grid']; out = sys.argv[3]
    pal = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    tiles = [pal[np.array(t['px']).reshape(16, 16)] for t in d['tiles']]
    pos = {}
    for y, r in enumerate(grid):
        for x, i in enumerate(r):
            if i in TILES and i not in pos: pos[i] = (x, y)
    xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]
    x0, x1, y0, y1 = min(xs) - 1, max(xs) + 2, min(ys) - 1, max(ys) + 2
    C = np.zeros(((y1 - y0) * 16, (x1 - x0) * 16, 3), np.uint8)
    for y in range(y0, y1):
        for x in range(x0, x1):
            j = grid[y][x]
            if j >= 0: C[(y - y0) * 16:(y - y0 + 1) * 16, (x - x0) * 16:(x - x0 + 1) * 16] = tiles[j]
    WOODX = WOOD | {(238, 238, 238), (238, 238, 93)}
    LEAFX = LEAF - {(238, 238, 238), (238, 238, 93)}
    hd = redraw(C, [WOODX, LEAFX, PINK])
    for i, (x, y) in pos.items():
        Image.fromarray(hd[(y - y0) * 64:(y - y0 + 1) * 64, (x - x0) * 64:(x - x0 + 1) * 64]).save(
            os.path.join(out, f"t_{d['tiles'][i]['hash']}.png"))
    print('tiles', sorted(pos))
