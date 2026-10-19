#!/usr/bin/env python3
"""Test scene: one piece of level 1 (bridge, slope, stone pillars, clouds, cornflakes) in the look of modern 2D
jump'n'runs: bold, clean, rounded shapes, bright saturated colours, cel shading (base colour, a light band on
the top left, a shade band on the bottom right, a thin outline in a darker tone of the same colour), soft depth in
the background. Only the surroundings; no characters. The layout (ground, bridge, pillars, clouds, flakes, block)
follows the original level map; all coordinates are level pixels of the original.
    python3 tools/hd-art/modern_test.py out.png [width]      (needs python playwright + chromium)"""
import math, random, sys

VB = (312, 466, 400, 286)          # view box: x, y, w, h in level pixels
rnd = random.Random(11)
_id = [0]

def f(v): return f'{v:.2f}'
def nid(p='c'):
    _id[0] += 1; return f'{p}{_id[0]}'

def smooth(pts, closed=True):
    """smooth path through points (Catmull-Rom as cubic Bezier)"""
    n = len(pts); d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    for i in (range(n) if closed else range(n - 1)):
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if closed else '')

def rrect(x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    return (f'M{f(x+r)},{f(y)} H{f(x+w-r)} Q{f(x+w)},{f(y)} {f(x+w)},{f(y+r)} V{f(y+h-r)} Q{f(x+w)},{f(y+h)} {f(x+w-r)},{f(y+h)} '
            f'H{f(x+r)} Q{f(x)},{f(y+h)} {f(x)},{f(y+h-r)} V{f(y+r)} Q{f(x)},{f(y)} {f(x+r)},{f(y)} Z')

def cel(d, base, light, shade, line, s=2.6, h=1.4, lw=0.8, extra=''):
    """cel shaded shape: shade band bottom right, light band top left, outline in a darker tone"""
    c = nid()
    return (f'<clipPath id="{c}"><path d="{d}"/></clipPath>'
            f'<g clip-path="url(#{c})"><path d="{d}" fill="{shade}"/>'
            f'<path d="{d}" fill="{light}" transform="translate({-s},{-s})"/>'
            f'<path d="{d}" fill="{base}" transform="translate({h - s},{h - s})"/>{extra}</g>'
            + (f'<path d="{d}" fill="none" stroke="{line}" stroke-width="{lw}" stroke-linejoin="round"/>' if lw else ''))

def shine(x, y, rx, ry, rot=-30, op=0.85):
    return f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(ry)}" fill="#ffffff" opacity="{op}" transform="rotate({rot} {f(x)} {f(y)})"/>'

# ---------------------------------------------------------------- pieces
def sky():
    X, Y, W, H = VB
    return (f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="url(#sky)"/>'
            f'<circle cx="{X + 40}" cy="{Y + 20}" r="90" fill="url(#sunglow)"/>')

def hills():
    X, Y, W, H = VB; out = []
    # far: soft pale mountains
    pts = [(X - 20, 760), (X + 10, 650), (X + 70, 610), (X + 130, 640), (X + 190, 600), (X + 260, 632), (X + 330, 596),
           (X + 400, 640), (X + 430, 760)]
    out.append(f'<path d="{smooth(pts, closed=False)} Z" fill="#b9d8f2"/>')
    out.append(f'<path d="{smooth(pts, closed=False)} Z" fill="#d6eafb" transform="translate(-3,-2)" opacity="0.55"/>')
    # mid: rounded green hills, cel shaded, one behind the other
    for (cx, top, r, col) in [(330, 690, 46, 0), (402, 702, 40, 1), (470, 694, 50, 0), (705, 680, 44, 1), (640, 710, 40, 0)]:
        d = f'M{f(cx - r * 1.4)},770 C{f(cx - r * 1.2)},{f(top + 6)} {f(cx - r * 0.5)},{f(top)} {f(cx)},{f(top)} C{f(cx + r * 0.5)},{f(top)} {f(cx + r * 1.2)},{f(top + 6)} {f(cx + r * 1.4)},770 Z'
        base, light, shade = (('#7fcf6b', '#b2ec8a', '#5fae57') if col == 0 else ('#6cc06a', '#a2e386', '#4f9f55'))
        out.append(cel(d, base, light, shade, '#3f8a49', s=3.2, h=1.6, lw=0.6))
    # round trees on the hills
    for (tx, ty, r) in [(318, 700, 6.5), (338, 694, 5), (412, 706, 5.5), (692, 688, 6), (716, 694, 5)]:
        out.append(f'<rect x="{f(tx - 1)}" y="{f(ty)}" width="2" height="9" rx="1" fill="#8a5a2b"/>')
        out.append(cel(f'M{f(tx)},{f(ty - 2*r)} a{f(r)},{f(r)} 0 1 1 -0.01,0 Z', '#4fb85a', '#86de74', '#38934a', '#2d7a3c', s=2, h=1.1, lw=0.6))
    return ''.join(out)

def cloud(cx, cy, s):
    blobs = [(-15, 3, 7), (-7, -3, 9), (3, -7, 10.5), (13, -2, 8.5), (21, 4, 6), (-21, 6, 5), (6, 5, 8), (-5, 6, 8)]
    pts = []
    # outline of the union of circles: sample the outer boundary
    for k in range(180):
        a = k / 180 * math.tau; best = 0
        for bx, by, r in blobs:
            # distance along ray from centre (cx,cy) to the far side of this circle
            dx, dy = math.cos(a), math.sin(a)
            ox, oy = -bx * s, -by * s
            b = ox * dx + oy * dy; c = ox * ox + oy * oy - (r * s) ** 2
            disc = b * b - c
            if disc >= 0: best = max(best, -b + math.sqrt(disc))
        pts.append((cx + math.cos(a) * best, cy + min(math.sin(a) * best, 6 * s)))
    d = smooth(pts[::3])
    c = nid()
    return (f'<path d="{d}" fill="#3a5fb0" opacity="0.10" transform="translate(2,3)"/>'
            f'<clipPath id="{c}"><path d="{d}"/></clipPath><g clip-path="url(#{c})">'
            f'<path d="{d}" fill="#d9c8f6"/>'                                         # shade at the bottom
            f'<path d="{d}" fill="#ffffff" transform="translate(-1.2,{f(-4.2*s)})"/>'  # white body
            f'<path d="{d}" fill="#eee4fd" transform="translate(-1.2,{f(-4.2*s)})" opacity="0" /></g>'
            f'<path d="{d}" fill="none" stroke="#b9a6e6" stroke-width="0.75"/>'
            + ''.join(shine(cx + bx * s - r * s * 0.3, cy + by * s - r * s * 0.45, r * s * 0.32, r * s * 0.16, rot=-20, op=0.9)
                      for bx, by, r in blobs[1:4]))

def flake(cx, cy, r, toasted=False, rot=0):
    pts = []
    for k in range(8):
        a = k / 8 * math.tau
        rr = r * (1 + 0.16 * math.sin(k * 2.3 + cx) + 0.08 * math.cos(k * 5.1))
        pts.append((cx + math.cos(a) * rr * 0.86, cy + math.sin(a) * rr * 1.06))
    d = smooth(pts)
    if toasted: col = ('#b8732e', '#dc9b52', '#7e461a', '#4d2709')
    else: col = ('#ffc93a', '#fff09a', '#e08f1c', '#9b5410')
    out = (f'<g transform="rotate({rot} {f(cx)} {f(cy)})">'
           f'<ellipse cx="{f(cx + 1)}" cy="{f(cy + r * 1.45)}" rx="{f(r * 0.75)}" ry="1.2" fill="#123a7a" opacity="0.12"/>'
           + cel(d, *col, s=2.0, h=1.0, lw=0.9)
           + f'<path d="M{f(cx - r*0.35)},{f(cy + r*0.25)} q{f(r*0.35)},{f(-r*0.3)} {f(r*0.7)},{f(r*0.05)}" stroke="{col[2]}" stroke-width="0.7" fill="none" stroke-linecap="round"/>'
           + shine(cx - r * 0.35, cy - r * 0.45, r * 0.32, r * 0.18, op=0.9 if not toasted else 0.4) + '</g>')
    if not toasted:
        sx, sy = cx + r * 1.0, cy - r * 1.2
        out += f'<path d="M{f(sx)},{f(sy-2.6)} Q{f(sx+0.4)},{f(sy-0.4)} {f(sx+2.6)},{f(sy)} Q{f(sx+0.4)},{f(sy+0.4)} {f(sx)},{f(sy+2.6)} Q{f(sx-0.4)},{f(sy+0.4)} {f(sx-2.6)},{f(sy)} Q{f(sx-0.4)},{f(sy-0.4)} {f(sx)},{f(sy-2.6)} Z" fill="#fffbe0"/>'
    return out

def grass_cap(points, depth=9.0, scallop=8.0, top=True):
    """chunky grass / leaf edge along the ground line: bumpy top, rounded leaf-like drips hanging down, cel
    shaded; a vein in every drip keeps the leaves of the original"""
    # sample the polyline every 0.5 px
    seq = []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L / 0.5))
        for i in range(n): seq.append((x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n))
    seq.append(points[-1])
    total = len(seq) * 0.5
    topline = [(x, y - 3.0 - 0.7 * math.sin(i * 0.5 * 0.9)) for i, (x, y) in enumerate(seq)]
    bottom = []
    drips = []
    for i, (x, y) in enumerate(seq):
        s = i * 0.5
        ph = (s % scallop) / scallop
        k = int(s // scallop)
        dep = depth * (0.8 + 0.35 * ((k * 37) % 7) / 6)
        bottom.append((x, y + 2.5 + dep * math.sin(math.pi * ph) ** 0.6))
        if abs(ph - 0.5) < 0.26 and i % 4 == 0 and abs(ph - 0.5) < 0.02 + 0.25: pass
    for k in range(int(total // scallop)):
        i = int((k + 0.5) * scallop / 0.5)
        if i < len(seq): drips.append((seq[i], depth * (0.8 + 0.35 * ((k * 37) % 7) / 6)))
    pts = topline[::4] + [topline[-1]] + list(reversed(bottom))[::4] + [bottom[0]]
    d = smooth(pts)
    out = [f'<path d="{d}" fill="#14350f" opacity="0.35" transform="translate(1.2,2.6)"/>']   # soft shadow on the stone
    veins = ''.join(f'<path d="M{f(x)},{f(y + 1)} q{f(-1.2)},{f(dep * 0.5)} {f(0.2)},{f(dep + 0.8)}" stroke="#2f8a24" stroke-width="0.75" fill="none" stroke-linecap="round" opacity="0.8"/>'
                    for (x, y), dep in drips)
    band = ''.join(f'<path d="M{f(x - scallop * 0.42)},{f(y + 2.4)} Q{f(x)},{f(y + 4.6)} {f(x + scallop * 0.42)},{f(y + 2.4)}" stroke="#58b836" stroke-width="0.7" fill="none" opacity="0.9"/>'
                   for (x, y), dep in drips)
    tl = ' '.join(f'{f(x)},{f(y + 0.6)}' for x, y in topline[::6])
    out.append(cel(d, '#5ec83a', '#a8f05a', '#2f9a2c', '#1d5e1a', s=-2.4, h=-1.2, lw=0.85,
                   extra=veins + band + f'<polyline points="{tl}" fill="none" stroke="#d9ff8a" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>'))
    if top:   # little sprouts and flowers on top
        for k in range(0, len(seq), 22):
            x, y = topline[k]
            if rnd.random() < 0.5:
                out.append(f'<path d="M{f(x)},{f(y + 0.5)} q-1,-3 -2.6,-4.2 M{f(x)},{f(y + 0.5)} q0.6,-3.4 2.2,-4.6" stroke="#2f9a2c" stroke-width="1" fill="none" stroke-linecap="round"/>')
    return ''.join(out)

def stone_block(x, y, w, h, tone):
    v = rnd.choice([0, 0, 1, 2])
    tone = tone + ('' if v == 0 else str(v))
    pal = {'lit1': ('#f3c86a', '#ffe8a6', '#d39b44', '#8a5a22'), 'lit2': ('#fad57c', '#fff1bd', '#dfa951', '#8a5a22'),
           'mid1': ('#e2b057', '#f6d58b', '#bf8537', '#7b4d1c'), 'mid2': ('#ecbf66', '#fbe09b', '#c99141', '#7b4d1c'),
           'dark1': ('#b3843f', '#cfa05b', '#8e6029', '#5a3613'), 'dark2': ('#bf904a', '#d9ab66', '#986a30', '#5a3613'),'lit':  ('#f7cf73', '#ffecb0', '#d9a24a', '#8a5a22'),
           'mid':  ('#e8b85e', '#f9db93', '#c58c3c', '#7b4d1c'),
           'dark': ('#b98a44', '#d4a660', '#93652c', '#5a3613')}[tone]
    d = rrect(x + 0.6, y + 0.6, w - 1.2, h - 1.2, 3.2)
    dots = ''.join(f'<circle cx="{f(x + rnd.uniform(4, w - 4))}" cy="{f(y + rnd.uniform(5, h - 4))}" r="{f(rnd.uniform(0.35, 0.6))}" fill="{pal[2]}" opacity="0.8"/>'
                   for _ in range(rnd.randint(0, 3)))
    return cel(d, *pal, s=2.0, h=1.1, lw=0.7, extra=dots) + (shine(x + 4, y + 3.2, 1.8, 0.9, rot=-15, op=0.6) if not tone.startswith('dark') else '')

def column(x, top, bottom, w, clip):
    out = [f'<g clip-path="url(#{clip})">', f'<path d="{rrect(x, top - 30, w, bottom - top + 40, 4)}" fill="#6b4220"/>']
    y = top - 30; row = 0
    while y < bottom:
        h = 15.5
        xs = [x - (w * 0.27 if row % 2 else 0)]
        while xs[-1] < x + w: xs.append(xs[-1] + w * 0.5)
        for a, b in zip(xs, xs[1:]):
            cx = (a + b) / 2 - x
            tone = 'lit' if cx < w * 0.4 else 'mid' if cx < w * 0.72 else 'dark'
            out.append(stone_block(a, y, b - a, h, tone))
        y += h; row += 1
    # round column: a soft dark band on the right edge
    out.append(f'<rect x="{f(x + w * 0.8)}" y="{top - 30}" width="{f(w * 0.2)}" height="{bottom - top + 40}" fill="url(#colShade)"/>')
    out.append('</g>')
    return ''.join(out)

def bridge():
    out = ['<g>']
    wood = ('#c9773a', '#eda35e', '#9a5222', '#5a2d0e')
    # arch under the deck: thick rounded beam
    arch = 'M362,680 C374,656 426,656 438,680 L432,683 C421,665 379,665 368,683 Z'
    out.append(cel(arch, *wood, s=1.6, h=0.9, lw=0.8))
    for k in range(5):                                  # posts between arch and deck
        px = 377 + k * 11.5
        py = 680 - 22 * (1 - ((px - 400) / 38) ** 2)
        out.append(cel(rrect(px - 1.5, 650, 3, max(2, py - 650), 1.2), *wood, s=1, h=0.5, lw=0.6))
    # deck: two chunky beams with plank ends
    out.append(cel(rrect(346, 641, 118, 11, 3), '#b8672d', '#de9152', '#8c4519', '#4e250b', s=1.8, h=1, lw=0.8))
    for k in range(9):
        cx = 354 + k * 12.6
        out.append(f'<circle cx="{f(cx)}" cy="646.6" r="1.6" fill="#f2b56e" stroke="#6a3410" stroke-width="0.5"/>')
    out.append(cel(rrect(344, 635.5, 122, 6, 2.6), *wood, s=1.4, h=0.8, lw=0.8))
    # railing
    for k in range(8):
        bx = 366 + k * 11
        out.append(cel(rrect(bx - 1.6, 617, 3.2, 19, 1.4), *wood, s=1, h=0.6, lw=0.6))
    for k in range(4):                                  # vines winding up the railing
        bx = 366 + k * 22
        out.append(f'<path d="M{bx + 1},634 C{bx + 6},631 {bx + 3},625 {bx + 9},623 S{bx + 13},618 {bx + 16},617" stroke="#3aa52c" stroke-width="1.1" fill="none" stroke-linecap="round"/>')
        out.append(cel(f'M{bx + 8},623.5 q3,-3.5 5.5,-1 q-2.5,3 -5.5,1 Z', '#6fd545', '#b6f37a', '#3e9f2e', '#226d1d', s=0.8, h=0.4, lw=0.5))
    out.append(cel(rrect(350, 612.5, 110, 5, 2.4), *wood, s=1.4, h=0.8, lw=0.8))
    for px in (355, 455):                               # posts with lanterns
        out.append(cel(rrect(px - 2.8, 609, 5.6, 29, 1.8), *wood, s=1.4, h=0.8, lw=0.8))
        out.append(f'<circle cx="{px}" cy="600" r="11" fill="url(#lampGlow)"/>')
        out.append(cel(f'M{px - 4.2},606 C{px - 5},600 {px - 2},595 {px},593 C{px + 2},595 {px + 5},600 {px + 4.2},606 Z',
                       '#b78cff', '#f2e8ff', '#7d4fd6', '#4b2a8a', s=1.2, h=0.6, lw=0.7))
        out.append(shine(px - 1.6, 598.5, 1.1, 2.2, rot=10, op=0.95))
        out.append(cel(rrect(px - 4.6, 605.5, 9.2, 3, 1.2), '#6a3a16', '#94582a', '#4a250b', '#2e1606', s=0.6, h=0.3, lw=0.5))
        out.append(f'<path d="M{px - 1.8},593.6 L{px},590.4 L{px + 1.8},593.6 Z" fill="#6a3a16" stroke="#2e1606" stroke-width="0.4"/>')
    out.append('</g>')
    return ''.join(out)

def qblock(x, y):
    d = rrect(x + 0.3, y + 0.3, 15.4, 15.4, 3.4)
    return (f'<path d="{d}" fill="#123a7a" opacity="0.15" transform="translate(1.5,2.5)"/>'
            + cel(d, '#f05a78', '#ffa2b4', '#b82a4c', '#6e0f27', s=2.2, h=1.2, lw=0.9)
            + f'<text x="{x + 8.2}" y="{y + 12.6}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="12" '
              f'text-anchor="middle" fill="#ffffff" stroke="#8a1832" stroke-width="1.6" paint-order="stroke">?</text>'
            + shine(x + 4, y + 3.4, 2.2, 1.0, rot=-20, op=0.75))

def flower(x, y, s=1.0, col=('#ff7fb6', '#ffc2de', '#e04f93', '#a12a66')):
    out = [f'<path d="M{f(x)},{f(y + 2*s)} q{f(0.8*s)},{f(4*s)} {f(-0.4*s)},{f(8*s)}" stroke="#2f9a2c" stroke-width="{f(1.1*s)}" fill="none" stroke-linecap="round"/>']
    for k in range(5):
        a = k / 5 * math.tau - math.pi / 2
        px, py = x + math.cos(a) * 2.9 * s, y + math.sin(a) * 2.9 * s
        out.append(cel(f'M{f(px)},{f(py - 2.2*s)} a{f(2.2*s)},{f(2.2*s)} 0 1 1 -0.01,0 Z', *col, s=0.9 * s, h=0.5 * s, lw=0.5))
    out.append(cel(f'M{f(x)},{f(y - 1.7*s)} a{f(1.7*s)},{f(1.7*s)} 0 1 1 -0.01,0 Z', '#ffd43c', '#fff2a0', '#e0a01a', '#8a5a10', s=0.7 * s, h=0.4 * s, lw=0.5))
    return ''.join(out)

def bush(x, y, s=1.0):
    d = smooth([(x - 10*s, y), (x - 9*s, y - 5*s), (x - 5*s, y - 8*s), (x, y - 10*s), (x + 5*s, y - 8.5*s), (x + 9*s, y - 5*s), (x + 10*s, y)])
    return cel(d, '#4fc04a', '#93ea70', '#2f9234', '#1c6022', s=-2.2, h=-1.2, lw=0.7) + shine(x - 4*s, y - 7*s, 2*s, 1*s, op=0.5)

def floor():
    X, Y, W, H = VB
    out = [cel(rrect(X - 4, 739, W + 8, 20, 2), '#8a5528', '#a86c38', '#6a3e1a', '#3e220c', s=-1.6, h=-0.8, lw=0)]
    for k in range(int(W / 9)):
        px = X + k * 9 + rnd.uniform(0, 5); py = rnd.uniform(745, 751); r = rnd.uniform(1.6, 2.6)
        out.append(cel(f'M{f(px)},{f(py - r)} a{f(r)},{f(r * 0.75)} 0 1 1 -0.01,0 Z', '#f0c66a', '#fff0b0', '#c98f36', '#6e4614', s=0.8, h=0.4, lw=0.4))
    out.append(grass_cap([(X - 6, 739), (X + W + 6, 739)], depth=4.0, scallop=7.0))
    return ''.join(out)

# ---------------------------------------------------------------- scene
def scene():
    X, Y, W, H = VB
    s = [f'''<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f9cff"/><stop offset="0.55" stop-color="#78c4ff"/><stop offset="1" stop-color="#c9f0ff"/></linearGradient>
  <radialGradient id="sunglow"><stop offset="0" stop-color="#fffbe0" stop-opacity="0.22"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/></radialGradient>
  <radialGradient id="lampGlow"><stop offset="0" stop-color="#f7ecff" stop-opacity="0.9"/><stop offset="0.5" stop-color="#e0c8ff" stop-opacity="0.35"/><stop offset="1" stop-color="#e0c8ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="colShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1404" stop-opacity="0"/><stop offset="1" stop-color="#2a1404" stop-opacity="0.55"/></linearGradient>
  <linearGradient id="recess" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2210"/><stop offset="1" stop-color="#24140a"/></linearGradient>
</defs>''']
    s.append(sky()); s.append(hills())
    s.append(cloud(368, 512, 1.6)); s.append(cloud(640, 494, 1.5))
    # floating leaf platform with a small earth clump underneath
    s.append(cel(smooth([(484, 514), (512, 512), (540, 514), (532, 524), (514, 530), (494, 524)]),
                 '#a8642e', '#cf8a48', '#7c4319', '#45230a', s=1.4, h=0.8, lw=0.8))
    s.append(grass_cap([(482, 514), (512, 512), (542, 514)], depth=6.5, scallop=7.5, top=False))
    # cornflakes
    s.append(flake(488, 487, 5.6, toasted=True, rot=12))
    for (cx, cy, r, rot) in [(422, 584, 6.0, -15), (404, 599, 5.6, 20), (441, 601, 6.6, 5)]:
        s.append(flake(cx, cy, r, rot=rot))
    s.append(qblock(352, 560))
    # bushes in the gap under the bridge (background)
    s.append(bush(392, 737, 1.3)); s.append(bush(414, 738, 1.0))
    # ground blocks
    right = [(432, 646), (480, 646), (608, 582), (690, 582), (690, 740), (432, 740)]
    left = [(300, 646), (368, 646), (368, 740), (300, 740)]
    for name, poly in (('L', left), ('R', right)):
        pts = ' '.join(f'{x},{y}' for x, y in poly)
        s.append(f'<clipPath id="clip{name}"><polygon points="{pts}"/></clipPath>')
        s.append(f'<polygon points="{pts}" fill="url(#recess)"/>')
    for x, side, w in [(304, 'L', 60), (446, 'R', 54), (510, 'R', 54), (574, 'R', 54), (638, 'R', 50)]:
        cid = nid('col')
        s.append(f'<clipPath id="{cid}"><path d="{rrect(x, 500, w, 260, 5)}"/></clipPath>')
        s.append(f'<g clip-path="url(#clip{side})">' + column(x, 600, 742, w, cid) + '</g>')
    # bridge, then the grass edges on top (they overlap the bridge ends)
    s.append(bridge())
    s.append(grass_cap([(296, 642), (369, 642)]))
    s.append(grass_cap([(431, 642), (480, 642), (608, 578), (693, 578)]))
    # leaves hanging down the cliff edges
    for (vx, vy, n) in [(368, 652, 4), (431, 652, 3), (692, 588, 6)]:
        pts = [(vx + 1.6 * math.sin(k * 1.3), vy + k * 7) for k in range(n)]
        s.append(f'<path d="{smooth(pts, closed=False)}" stroke="#2f8a24" stroke-width="1" fill="none"/>')
        for k, (px, py) in enumerate(pts):
            sgn = 1 if k % 2 else -1
            s.append(cel(f'M{f(px)},{f(py)} q{f(sgn*4.5)},{f(-1)} {f(sgn*5.5)},{f(3.2)} q{f(-sgn*3)},{f(1.6)} {f(-sgn*5.5)},{f(-3.2)} Z',
                         '#5ec83a', '#a8f05a', '#2f9a2c', '#1d5e1a', s=0.9, h=0.5, lw=0.55))
    s.append(flower(331, 630, 1.0))
    s.append(flower(600, 571, 0.8, ('#ffd23c', '#fff3a0', '#e39a1a', '#8a5a10')))
    s.append(flower(660, 570, 0.8))
    s.append(floor())
    body = ''.join(s)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X} {Y} {W} {H}" width="{W}" height="{H}">'
            f'<clipPath id="view"><rect x="{X}" y="{Y}" width="{W}" height="{H}"/></clipPath><g clip-path="url(#view)">{body}</g></svg>')

if __name__ == '__main__':
    out = sys.argv[1]; width = int(sys.argv[2]) if len(sys.argv) > 2 else 1920
    svg = scene()
    open(out.rsplit('.', 1)[0] + '.svg', 'w').write(svg)
    from playwright.sync_api import sync_playwright
    X, Y, W, H = VB; height = round(width * H / W)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': width, 'height': height})
        sized = svg.replace(f'width="{W}" height="{H}"', f'width="{width}" height="{height}"', 1)
        pg.set_content(f'<html><body style="margin:0">{sized}</body></html>')
        pg.screenshot(path=out)
        b.close()
    print(out, width, height)
