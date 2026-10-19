#!/usr/bin/env python3
"""HD art: row of leaves on the ground (level 1), tiles 063 064 065 066 067 (level-1 export numbering).
    python3 tools/hd-art/leaves.py tiles.json web/hd [preview.png]
tiles.json: level export (palette + tile pixels), see tools/hd-art/README.md.
The leaves repeat every 32 original pixels (64/66 left half, 65/67 right half). Each leaf is drawn as a
teardrop (round top, tip down-left) with a curved vein; branch and bottom rows follow the original."""
import json, math, os, sys
from PIL import Image

BLACK=(0,0,0); WHITE=(238,238,238); LIME=(141,238,0); GREEN=(0,174,0); DGREEN=(28,93,28)
YEL=(238,238,93); BRN=(141,76,0); DBRN=(76,28,0); SKY=(0,109,238)
P = 32  # period in original pixels

# leaves in one period: (round-part centre x, centre y, radius, tip x, tip y, front?)
LEAVES = [
    (20.6, 7.0, 2.0, 19.0, 13.0, False),   # back leaves (dark), drawn first
    (9.4, 7.5, 1.9, 8.3, 13.0, False),
    (4.6, 5.8, 4.8, 1.4, 13.9, True),      # A
    (14.7, 5.1, 4.6, 11.2, 13.0, True),    # B
    (26.6, 4.9, 4.6, 22.6, 13.4, True),    # C
]

def leaf_sd(u, v, cx, cy, r, tx, ty):
    """signed distance-ish to a teardrop: circle (cx,cy,r) narrowing to the tip (tx,ty)."""
    ax, ay = tx - cx, ty - cy; L = math.hypot(ax, ay); ax, ay = ax / L, ay / L
    pu, pv = u - cx, v - cy; t = pu * ax + pv * ay
    if t <= 0: return math.hypot(pu, pv) - r
    t = min(t, L); rr = r * max(0.0, 1 - (t / L) ** 1.7) ** 0.75
    qx, qy = cx + ax * t, cy + ay * t
    return math.hypot(u - qx, v - qy) - rr

def vein(u, v, cx, cy, r, tx, ty):
    """distance to the vein: from the top of the leaf curving down to the tip."""
    best = 9
    for k in range(25):
        s = k / 24
        x = cx + 0.3 * r + (tx - cx - 0.3 * r) * s ** 1.3 + 0.6 * math.sin(s * math.pi)
        y = cy - 0.75 * r + (ty - cy + 0.75 * r) * s
        best = min(best, math.hypot(u - x, v - y))
    return best

def period_colour(u, v):
    c = BLACK
    # branch along the top
    if v < 1.6 + 0.35 * math.sin(u * 0.9) : c = DBRN if (v < 0.9 and (u * 0.37) % 3 < 1.7) else BRN
    for (cx, cy, r, tx, ty, front) in LEAVES:
        for off in (-P, 0, P):
            uu = u - off
            d = leaf_sd(uu, v, cx, cy, r, tx, ty)
            if d > 0.45: continue
            if not front:
                c = BLACK if d > -0.3 else DGREEN
                continue
            if d > -0.05: c = BLACK; continue
            # light from the top left: lit side light, shadow side dark green rim
            gx = leaf_sd(uu + .2, v, cx, cy, r, tx, ty) - leaf_sd(uu - .2, v, cx, cy, r, tx, ty)
            gy = leaf_sd(uu, v + .2, cx, cy, r, tx, ty) - leaf_sd(uu, v - .2, cx, cy, r, tx, ty)
            n = math.hypot(gx, gy) or 1; lit = -(gx + gy) / n / 1.414
            if d > -0.6 and lit < 0.2: c = DGREEN; continue
            inner = leaf_sd(uu + 0.8, v + 0.9, cx, cy, r * 0.68, tx + 1.2, ty - 2.0)
            vd = vein(uu, v, cx, cy, r, tx, ty)
            c = LIME if inner < 0 else GREEN
            if vd < 0.32: c = GREEN if inner < 0 else DGREEN
            elif vd < 1.0 and inner < 0 and v < cy + 3.2: c = YEL
            if cx == 4.6 and math.hypot(uu - 3.0, v - 4.9) < 0.55: c = WHITE
    return c

def render_tile(px_orig, x0):
    """64x64 tile: leaves of the period from x0 (orig px); rows 14-15 come from the original where no leaf is."""
    img = Image.new('RGB', (64, 64))
    for y in range(64):
        for x in range(64):
            u, v = x0 + (x + .5) / 4, (y + .5) / 4
            c = period_colour(u, v)
            if v >= 13.75 and c == BLACK:
                c = PAL[px_orig[int(v) * 16 + int((x + .5) / 4)]]
            img.putpixel((x, y), c)
    return img

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); out = sys.argv[2]
    PAL = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    T = {n: d['tiles'][n] for n in (63, 64, 65, 66, 67)}
    tiles = {64: render_tile(T[64]['px'], 0), 66: render_tile(T[66]['px'], 0),
             65: render_tile(T[65]['px'], 16), 67: render_tile(T[67]['px'], 16)}
    # 063: start of the row; like 065, but the sky shows on the left where the original has it
    t63 = render_tile(T[63]['px'], 16)
    for y in range(64):
        for x in range(16):
            o = T[63]['px'][(y // 4) * 16 + x // 4]
            if PAL[o] == SKY: t63.putpixel((x, y), PAL[o])
    tiles[63] = t63
    for n, im in tiles.items(): im.save(os.path.join(out, f"t_{T[n]['hash']}.png"))
    if len(sys.argv) > 3:
        seq = [63, 64, 65, 66, 67, 64, 65, 66]
        hd = Image.new('RGB', (64 * len(seq), 64)); orig = Image.new('RGB', (16 * len(seq), 16))
        for k, n in enumerate(seq):
            hd.paste(tiles[n], (k * 64, 0))
            o = Image.new('RGB', (16, 16)); o.putdata([PAL[v] for v in T[n]['px']]); orig.paste(o, (k * 16, 0))
        c = Image.new('RGB', (hd.width, 136), (40, 40, 40)); c.paste(orig.resize((hd.width, 64), Image.NEAREST), (0, 0)); c.paste(hd, (0, 72))
        c.resize((c.width * 2, c.height * 2), Image.NEAREST).save(sys.argv[3])
