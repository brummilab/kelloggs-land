#!/usr/bin/env python3
"""HD art: arched window (level 1). Tall window = tiles 037 (arch) + 045 (panes) + 056 (lower panes + sill),
small window = 037 + 056 (same tiles), so the bars sit where both versions fit.
    python3 tools/hd-art/window.py tiles.json web/hd [preview.png]
Drawn in original pixel units (u 0..16, v 0..48 over the three tiles), evaluated at 4x, fixed palette."""
import json, math, os, sys
from PIL import Image

BLACK=(0,0,0); WHITE=(238,238,238); LBLUE=(125,157,238); BLUE=(0,109,238)
OCH=(206,157,60); BRN=(141,76,0); DBRN=(76,28,0)
CX, CY, R = 7.5, 18.1, 9.0          # arch circle (outer edge of the frame)
L, RT = 0.0, 15.0                    # outer frame left/right
GL, GR, GT, GB = 3.0, 12.0, 12.4, 37.4   # glass opening (top = arch inner)
BARS = [16.5, 21.5, 27.0, 32.5]      # horizontal bars, as in the original (top rows of 045 and 056 are bars)
JOINTS = [13.0, 17.2, 21.2, 26.2, 30.2, 34.2]   # joints between the wooden blocks of the side frames
MUL = 7.5                            # vertical bar

def outer(u, v):
    if u < L or u > RT or v > 38.0: return False
    return v >= CY or math.hypot(u - CX, v - CY) <= R

def glass(u, v):
    if u < GL or u > GR or v > GB: return False
    return v >= CY or math.hypot(u - CX, v - CY) <= R - 3.0 - (0.0 if u < CX else 0.3)

def colour(u, v):
    # sill with a row of small wooden teeth under it
    if 37.6 <= v < 38.6 and -0.2 <= u <= 15.2:
        return OCH if v < 37.9 else DBRN if v > 38.35 else BRN
    if 38.6 <= v < 39.8 and 0.2 <= u <= 14.8:
        k = (u - 0.2) % 2.0
        if math.hypot(k - 1.0, (v - 38.6) * 1.1) < 0.8:
            return OCH if k < 1.0 and v < 39.1 else BRN
    if not outer(u, v): return WHITE
    if glass(u, v):
        top = GT
        for b in BARS + [GT - 0.5]:
            if b < v: top = max(top, b + 0.5)
        if abs(u - MUL) < 0.5:                       # vertical bar
            return OCH if u < MUL - 0.25 else DBRN if u > MUL + 0.25 else BRN
        for b in BARS:
            if abs(v - b) < 0.5:                     # horizontal bars
                return OCH if v < b - 0.25 else DBRN if v > b + 0.25 else BRN
        if v - top < 0.5 or u > GR - 0.6: return BLACK   # shadow of the frame/bars on the glass
        # glass: deep blue, diagonal reflections, a glint in the top-left corner of each pane
        pl = GL if u < MUL else MUL + 0.5
        if math.hypot(u - pl - 0.55, v - top - 0.6) < 0.32: return WHITE
        s = ((u - v * 0.75) / 4.2) % 1.0
        if s < 0.16 or 0.30 < s < 0.36: return LBLUE
        return BLUE
    # frame: lit left/top in ochre, right side brown, dark brown outline on the shadow side, wood joints
    du = min(u - L, RT - u)
    arch = v < CY
    edge = (R - math.hypot(u - CX, v - CY)) if arch else du
    left = u < CX
    if not arch:
        for j in JOINTS:                              # frame built from blocks: dark joint, light edge below it
            if 0 <= v - j < 0.45: return BRN if left else DBRN
            if 0.45 <= v - j < 0.7 and left and edge < 2.0: return (238, 210, 140) if False else OCH
    if left:
        return OCH if edge < 2.0 else BRN
    if edge < 0.35: return DBRN
    return OCH if (arch and edge < 1.2 and u < CX + 3.5) else BRN

def render(n_rows):
    """n_rows 3: tall window (37,45,56); the small one uses the same tiles."""
    img = Image.new('RGB', (64, 64 * n_rows))
    for y in range(64 * n_rows):
        for x in range(64):
            img.putpixel((x, y), colour((x + .5) / 4, (y + .5) / 4))
    return img

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    pal = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    tall = render(3)
    for k, n in enumerate((37, 45, 56)):
        tall.crop((0, k * 64, 64, k * 64 + 64)).save(os.path.join(out, f"t_{d['tiles'][n]['hash']}.png"))
    if len(sys.argv) > 3:
        def orig(n):
            t = Image.new('RGB', (16, 16)); t.putdata([pal[v] for v in d['tiles'][n]['px']]); return t.resize((64, 64), Image.NEAREST)
        c = Image.new("RGB", (64 * 5 + 16, 192), (40, 40, 40))
        for k, n in enumerate((37, 45, 56)): c.paste(orig(n), (0, k * 64)); c.paste(tall.crop((0, k * 64, 64, k * 64 + 64)), (80, k * 64))
        for k, n in enumerate((37, 56)): c.paste(orig(n), (176, 64 + k * 64)); c.paste(tall.crop((0, (0 if n == 37 else 2) * 64, 64, (1 if n == 37 else 3) * 64)), (256, 64 + k * 64))
        c.resize((c.width * 2, c.height * 2), Image.NEAREST).save(sys.argv[3])
