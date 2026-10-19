#!/usr/bin/env python3
"""HD art: yellow door with four studs (level 1), 2x3 tiles, plus the knob variants (red/blue).
    python3 tools/hd-art/door.py web/hd [preview.png]
Writes 64x64 tiles t_<hash>.png for original tiles 052 053 058 059 060 061 113 114 (level-1 export numbering).
Drawn in original pixel units (u, v) evaluated at 4x, fixed palette, no anti-aliasing."""
import math, sys, os
from PIL import Image

BLACK=(0,0,0); WHITE=(238,238,238); PINK=(238,93,109); DRED=(157,0,0); LILAC=(222,157,238)
YEL=(238,238,93); OCH=(206,157,60); BRN=(141,76,0); DBRN=(76,28,0)
LBLUE=(125,157,238); BLUE=(0,109,238); DBLUE=(0,60,141)

def ell_top(u, cx, cy, a, b):
    dx = (u - cx) / a
    return cy - b * math.sqrt(max(0.0, 1 - dx * dx)) if abs(dx) < 1 else cy

def door(u, v):
    if v >= 47:  # bottom row: frame steps one pixel inward
        w = min(u, 32 - u)
        return BLACK if w < 1 else DBRN if w < 2 else BRN if w < 3 else OCH if w < 4 else YEL
    w = min(u, 32 - u)
    # outline with rounded top corners
    cr = 2.5
    if v < 1 or w < 1: return BLACK
    if v < cr + 1 and w < cr + 1 and math.hypot(cr + 1 - w, cr + 1 - v) > cr: return BLACK
    edge = min(w - 1, v - 1, (cr - math.hypot(cr + 1 - w, cr + 1 - v)) if (v < cr + 1 and w < cr + 1) else 9)
    if w < 2 or v < ell_top(u, 16, 8.5, 15, 5.5):
        return DBRN if edge < 1 and (w + v < 7.5) else BRN
    if w < 3 or v < ell_top(u, 16, 12.5, 13.5, 5.5):
        return OCH
    return YEL

def stud(u, v, cx, cy, c):
    d = math.hypot(u - cx, v - cy)
    if d < 1.55:
        if math.hypot(u - (cx - .55), v - (cy - .55)) < .45: return WHITE
        return DRED if (u - cx) + (v - cy) > .35 else PINK
    if d < 2.45: return BLACK
    if d < 2.95: return BRN if v < cy else OCH
    return c

def knob(u, v, cx, cy, c, body, dark, hi):
    d = math.hypot(u - cx, v - cy)
    if d < 2.55:
        if v > cy + 1.55: return BLACK
        if math.hypot(u - (cx - .9), v - (cy - .8)) < .5: return WHITE
        if math.hypot(u - (cx - .7), v - (cy - .6)) < 1.0: return hi
        return dark if (u - cx) * .6 + (v - cy) > .9 or d > 2.1 and u > cx else body
    if d < 3.1: return BRN if v < cy + 1 else BLACK if v < cy + 2.4 else OCH
    if d < 3.6 and v > cy + 1.5: return OCH
    return c

STUDS = [(12.5, 13.5), (19.5, 13.5), (12.5, 20.5), (19.5, 20.5)]

def render(kind=None):
    img = Image.new('RGB', (128, 192))
    for y in range(192):
        for x in range(128):
            u, v = (x + .5) / 4, (y + .5) / 4
            c = door(u, v)
            for (sx, sy) in STUDS: c = stud(u, v, sx, sy, c)
            if kind == 'red': c = knob(u, v, 7.5, 27.5, c, PINK, DRED, LILAC)
            if kind == 'blue': c = knob(u, v, 7.5, 27.5, c, BLUE, DBLUE, LBLUE)
            img.putpixel((x, y), c)
    return img

if __name__ == '__main__':
    out = sys.argv[1]
    plain, red, blue = render(), render('red'), render('blue')
    names = {  # tile number -> (image, col, row, content hash of the original tile)
        52: (plain, 0, 0, 'f97ebcc1'), 53: (plain, 1, 0, 'a3fc956d'), 58: (plain, 0, 1, 'ef46435b'), 59: (plain, 1, 1, '2539bb8b'),
        60: (plain, 0, 2, '488e7d40'), 61: (plain, 1, 2, '9e3a3192'), 113: (red, 0, 1, '58b25f05'), 114: (blue, 0, 1, 'b78a9bc0')}
    for n, (im, cx, cy, h) in names.items():
        im.crop((cx * 64, cy * 64, cx * 64 + 64, cy * 64 + 64)).save(os.path.join(out, f't_{h}.png'))
    if len(sys.argv) > 2:
        prev = Image.new('RGB', (128 * 3 + 16, 192), (40, 40, 40))
        for i, im in enumerate((plain, red, blue)): prev.paste(im, (i * 136, 0))
        prev.resize((prev.width * 2, prev.height * 2), Image.NEAREST).save(sys.argv[2])
