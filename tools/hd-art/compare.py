#!/usr/bin/env python3
"""Side-by-side comparison of a level area: original (4x nearest) vs. with the HD tiles from web/hd.
    python3 tools/hd-art/compare.py tiles.json map.json x0 y0 x1 y1 out.png [web/hd]
tiles.json / map.json: level export (palette, tile pixels + hashes, map grid of tile numbers)."""
import json, os, sys
from PIL import Image
tj, mj, x0, y0, x1, y1, out = sys.argv[1:8]; hd = sys.argv[8] if len(sys.argv) > 8 else 'web/hd'
x0, y0, x1, y1 = map(int, (x0, y0, x1, y1))
d = json.load(open(tj)); m = json.load(open(mj)); pal = d['pal']
rgb = lambda c: (c & 255, (c >> 8) & 255, (c >> 16) & 255)
files = {f.split('t_')[-1][:8]: os.path.join(r, f) for r, _, fs in os.walk(hd) for f in fs if 't_' in f and f.endswith('.png')}
W, H = (x1 - x0) * 64, (y1 - y0) * 64
a, b = Image.new('RGB', (W, H)), Image.new('RGB', (W, H))
for y in range(y0, y1):
    for x in range(x0, x1):
        i = m['grid'][y][x]
        if i < 0: continue
        t = d['tiles'][i]; im = Image.new('RGB', (16, 16)); im.putdata([rgb(pal[v]) for v in t['px']])
        o = im.resize((64, 64), Image.NEAREST); a.paste(o, ((x - x0) * 64, (y - y0) * 64))
        b.paste(Image.open(files[t['hash']]).convert('RGB') if t['hash'] in files else o, ((x - x0) * 64, (y - y0) * 64))
c = Image.new('RGB', (W * 2 + 16, H), (40, 40, 40)); c.paste(a, (0, 0)); c.paste(b, (W + 16, 0))
s = min(1, 1600 / c.width); c.resize((int(c.width * s), int(c.height * s)), Image.LANCZOS if s < 1 else Image.NEAREST).save(out)
