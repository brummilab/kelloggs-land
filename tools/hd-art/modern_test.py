#!/usr/bin/env python3
"""Test scene: one piece of level 1 (bridge, slope, stone pillars, clouds, cornflakes) in a modern, smooth 2D
style instead of pixel art: vector shapes with gradients, soft shadows and smooth edges, a background with
hills. Only the surroundings; no characters. The layout (where the ground, bridge, pillars, clouds, flakes are)
follows the original level map; coordinates below are level pixels of the original.
    python3 tools/hd-art/modern_test.py out.png [width]      (needs python playwright + chromium)"""
import math, random, sys

VB = (312, 466, 400, 286)          # view box: x, y, w, h in level pixels
rnd = random.Random(7)

def f(v): return f'{v:.2f}'

def catmull(pts, closed=True):
    """smooth closed path through points (Catmull-Rom -> cubic Bezier)"""
    n = len(pts); d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if closed else '')

def leaf(x, y, length, ang, width=0.42, shade='leafG', flip=1):
    """teardrop leaf hanging from (x, y), angle in degrees (90 = straight down)"""
    a = math.radians(ang); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
    w = length * width
    tip = (x + ux * length, y + uy * length)
    p = lambda s, t: (x + ux * s + vx * t, y + uy * s + vy * t)
    b1, b2 = p(length * 0.35, w), p(length * 0.35, -w)
    c = (f'M{f(x)},{f(y)} C{f(p(-length*0.08, w*0.9)[0])},{f(p(-length*0.08, w*0.9)[1])} {f(b1[0])},{f(b1[1])} '
         f'{f(p(length*0.62, w*0.8)[0])},{f(p(length*0.62, w*0.8)[1])} S{f(tip[0])},{f(tip[1])} {f(tip[0])},{f(tip[1])} '
         f'C{f(p(length*0.62, -w*0.8)[0])},{f(p(length*0.62, -w*0.8)[1])} {f(b2[0])},{f(b2[1])} '
         f'{f(p(-length*0.08, -w*0.9)[0])},{f(p(-length*0.08, -w*0.9)[1])} {f(x)},{f(y)} Z')
    vein = p(length * 0.85, w * 0.12 * flip)
    hl = p(length * 0.3, -w * 0.45 * flip)
    return (f'<g transform="rotate({f(rnd.uniform(-4,4))} {f(x)} {f(y)})">'
            f'<path d="{c}" fill="url(#{shade})" stroke="#174d14" stroke-width="0.55"/>'
            f'<path d="M{f(x)},{f(y)} Q{f(p(length*0.5, w*0.25*flip)[0])},{f(p(length*0.5, w*0.25*flip)[1])} {f(vein[0])},{f(vein[1])}" '
            f'stroke="#2c7d1e" stroke-width="0.5" fill="none" opacity="0.8"/>'
            f'<ellipse cx="{f(hl[0])}" cy="{f(hl[1])}" rx="{f(length*0.16)}" ry="{f(w*0.22)}" fill="#fbffd0" opacity="0.55" '
            f'transform="rotate({f(ang)} {f(hl[0])} {f(hl[1])})"/></g>')

def leaf_edge(points, step=5.2, size=(10.5, 14)):
    """lush leafy edge along a polyline (the top of the ground): dark band, root, overlapping leaves"""
    out = []
    pl = ' '.join(f'{f(x)},{f(y)}' for x, y in points)
    out.append(f'<polyline points="{pl}" fill="none" stroke="#1b4d17" stroke-width="13" stroke-linejoin="round" '
               f'stroke-linecap="round" transform="translate(0,5)"/>')
    out.append(f'<polyline points="{pl}" fill="none" stroke="url(#rootG)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>')
    leaves_back, leaves_front = [], []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L / step))
        for i in range(n):
            t = (i + rnd.uniform(0.1, 0.9)) / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 1.2
            back = rnd.random() < 0.45
            ang = rnd.choice([70, 110]) + rnd.uniform(-14, 14)
            ln = rnd.uniform(*size) * (0.8 if back else 1)
            s = leaf(x, y, ln, ang, shade='leafDark' if back else rnd.choice(['leafG', 'leafG', 'leafG2']),
                     flip=1 if ang < 90 else -1)
            (leaves_back if back else leaves_front).append(s)
    return ''.join(out + leaves_back + leaves_front)

def stone_column(x, top, bottom, width):
    """a round stone pillar: rows of blocks, lit from the left, the right side in shadow"""
    out = [f'<rect x="{f(x)}" y="{f(top - 20)}" width="{f(width)}" height="{f(bottom - top + 20)}" fill="#5a3616"/>']
    y = top - 20; row = 0
    while y < bottom:
        h = rnd.uniform(9.5, 12.5)
        xx = x - (rnd.uniform(4, 9) if row % 2 else 0)
        while xx < x + width:
            w = rnd.uniform(11, 19)
            tone = rnd.choice(['stoneA', 'stoneA', 'stoneB', 'stoneC'])
            out.append(f'<rect x="{f(xx + 0.7)}" y="{f(y + 0.7)}" width="{f(w - 1.4)}" height="{f(h - 1.4)}" rx="2.2" fill="url(#{tone})"/>')
            out.append(f'<path d="M{f(xx+1.6)},{f(y+h-2)} L{f(xx+1.6)},{f(y+1.6)} L{f(xx+w-2)},{f(y+1.6)}" stroke="#fff6cf" '
                       f'stroke-width="0.7" fill="none" opacity="0.6" stroke-linecap="round"/>')
            if rnd.random() < 0.12:            # a crack
                cx = xx + rnd.uniform(3, w - 3)
                out.append(f'<path d="M{f(cx)},{f(y+1)} l{f(rnd.uniform(-1.5,1.5))},{f(h*0.35)} l{f(rnd.uniform(-1.5,1.5))},{f(h*0.3)}" '
                           f'stroke="#7a4a1c" stroke-width="0.5" fill="none"/>')
            xx += w
        y += h; row += 1
    # round shading: light on the left, deep shadow on the right
    out.append(f'<rect x="{f(x)}" y="{f(top - 20)}" width="{f(width)}" height="{f(bottom - top + 20)}" fill="url(#cylG)"/>')
    return f'<g clip-path="url(#col{int(x)})">' + ''.join(out) + '</g>'

def cloud(cx, cy, s):
    blobs = [(-14, 2, 7), (-6, -3, 9), (4, -6, 10), (13, -2, 8), (20, 3, 6), (-19, 5, 5), (7, 4, 8), (-4, 5, 8)]
    circ = ''.join(f'<circle cx="{f(cx + bx * s)}" cy="{f(cy + by * s)}" r="{f(r * s)}"/>' for bx, by, r in blobs)
    return (f'<g filter="url(#soft)" opacity="0.97"><g fill="url(#cloudG{int(cx)})">{circ}</g></g>'
            f'<defs><linearGradient id="cloudG{int(cx)}" gradientUnits="userSpaceOnUse" x1="0" y1="{f(cy - 16*s)}" x2="0" y2="{f(cy + 13*s)}">'
            f'<stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#fbf3ff"/>'
            f'<stop offset="0.8" stop-color="#e7d2f6"/><stop offset="1" stop-color="#c6a3e3"/></linearGradient></defs>')

def flake(cx, cy, r, toasted=False, rot=0):
    pts = []
    for k in range(9):
        a = k / 9 * math.tau
        rr = r * rnd.uniform(0.72, 1.12)
        pts.append((cx + math.cos(a) * rr * 0.8, cy + math.sin(a) * rr * 1.05))
    g = 'flakeT' if toasted else 'flakeG'
    sparkle = '' if toasted else (
        f'<path d="M{f(cx+r*0.9)},{f(cy-r*1.3)} l0.8,2 2,0.8 -2,0.8 -0.8,2 -0.8,-2 -2,-0.8 2,-0.8 Z" fill="#fffde8"/>')
    return (f'<g transform="rotate({rot} {f(cx)} {f(cy)})"><ellipse cx="{f(cx)}" cy="{f(cy + r*1.9)}" rx="{f(r*0.7)}" ry="1.1" fill="#000" opacity="0.12"/>'
            f'<path d="{catmull(pts)}" fill="url(#{g})" stroke="#6b3a10" stroke-width="0.6"/>'
            f'<path d="{catmull([(cx - r*0.35, cy - r*0.55), (cx + r*0.1, cy - r*0.7), (cx - r*0.05, cy - r*0.2), (cx - r*0.45, cy - r*0.1)])}" '
            f'fill="#fff8d0" opacity="{0.25 if toasted else 0.65}"/>'
            f'<path d="M{f(cx - r*0.3)},{f(cy + r*0.3)} q{f(r*0.3)},{f(-r*0.2)} {f(r*0.55)},{f(r*0.15)}" stroke="#a5651e" stroke-width="0.5" fill="none" opacity="0.7"/>'
            f'</g>{sparkle}')

def scene():
    X, Y, W, H = VB
    s = []
    s.append(f'''<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f5fe0"/><stop offset="0.6" stop-color="#4b9ff5"/><stop offset="1" stop-color="#a8e0ff"/></linearGradient>
  <radialGradient id="sun" cx="0.12" cy="0.05" r="0.7"><stop offset="0" stop-color="#fff6c8" stop-opacity="0.35"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>
  <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ccfd8"/><stop offset="1" stop-color="#bfe3ea"/></linearGradient>
  <linearGradient id="hillNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6bb878"/><stop offset="1" stop-color="#8fcda0"/></linearGradient>
  <linearGradient id="leafG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4ff6a"/><stop offset="0.45" stop-color="#6fd432"/><stop offset="1" stop-color="#23861f"/></linearGradient>
  <linearGradient id="leafG2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff25a"/><stop offset="0.5" stop-color="#55bf2c"/><stop offset="1" stop-color="#1c741b"/></linearGradient>
  <linearGradient id="leafDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4fa22c"/><stop offset="1" stop-color="#16511a"/></linearGradient>
  <linearGradient id="rootG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5422"/><stop offset="1" stop-color="#5b3312"/></linearGradient>
  <linearGradient id="stoneA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe7a0"/><stop offset="0.5" stop-color="#e8bf62"/><stop offset="1" stop-color="#c08a36"/></linearGradient>
  <linearGradient id="stoneB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d688"/><stop offset="0.5" stop-color="#dcab52"/><stop offset="1" stop-color="#ad7429"/></linearGradient>
  <linearGradient id="stoneC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset="0.5" stop-color="#efcb72"/><stop offset="1" stop-color="#c99540"/></linearGradient>
  <linearGradient id="cylG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1c05" stop-opacity="0.5"/><stop offset="0.12" stop-color="#fff2c0" stop-opacity="0.28"/><stop offset="0.32" stop-color="#fff2c0" stop-opacity="0.05"/><stop offset="0.55" stop-color="#2a1404" stop-opacity="0.3"/><stop offset="0.8" stop-color="#1a0a00" stop-opacity="0.65"/><stop offset="1" stop-color="#0d0500" stop-opacity="0.88"/></linearGradient>
  <linearGradient id="recess" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#120800"/><stop offset="1" stop-color="#2e1a08"/></linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d08a46"/><stop offset="0.5" stop-color="#a5612a"/><stop offset="1" stop-color="#6d3a14"/></linearGradient>
  <linearGradient id="woodV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d89552"/><stop offset="0.5" stop-color="#a5612a"/><stop offset="1" stop-color="#6a3712"/></linearGradient>
  <radialGradient id="flakeG" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff2a8"/><stop offset="0.45" stop-color="#f1c04e"/><stop offset="1" stop-color="#b56f1c"/></radialGradient>
  <radialGradient id="flakeT" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#d79a4e"/><stop offset="0.5" stop-color="#94531c"/><stop offset="1" stop-color="#55270a"/></radialGradient>
  <linearGradient id="qG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a9c"/><stop offset="0.5" stop-color="#e2405e"/><stop offset="1" stop-color="#9c1a36"/></linearGradient>
  <radialGradient id="glass" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#e3c9ff"/><stop offset="1" stop-color="#8c5cd6"/></radialGradient>
  <radialGradient id="glow" r="0.5"><stop offset="0" stop-color="#f4e6ff" stop-opacity="0.8"/><stop offset="1" stop-color="#f4e6ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="shadeDown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#4a3a8a" flood-opacity="0.25"/></filter>
  <filter id="drop" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="1.2" dy="2" stdDeviation="1.4" flood-color="#000" flood-opacity="0.35"/></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="blur1"><feGaussianBlur stdDeviation="0.9"/></filter>
</defs>''')
    # sky, sun light, hills
    s.append(f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="url(#sky)"/><rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="url(#sun)"/>')
    far = [(X - 10, 760)] + [(X + i * 20, 668 + 18 * math.sin(i * 0.9) + 8 * math.sin(i * 2.3)) for i in range(0, 22)] + [(X + W + 10, 760)]
    s.append(f'<path d="{catmull(far, closed=False)} L{X + W + 10},{Y + H + 10} L{X - 10},{Y + H + 10} Z" fill="url(#hillFar)"/>')
    near = [(X - 10, 760)] + [(X + i * 26, 704 + 14 * math.sin(i * 1.3 + 1) + 6 * math.sin(i * 3.1)) for i in range(0, 17)] + [(X + W + 10, 760)]
    s.append(f'<path d="{catmull(near, closed=False)} L{X + W + 10},{Y + H + 10} L{X - 10},{Y + H + 10} Z" fill="url(#hillNear)"/>')
    for tx in (330, 395, 418, 700, 708):                      # small round trees on the near hills
        ty = 704 + 14 * math.sin((tx - X) / 26 * 1.3 + 1) - 2
        s.append(f'<rect x="{tx - 0.8}" y="{ty - 4}" width="1.6" height="6" fill="#4f7a3c"/>'
                 f'<circle cx="{tx}" cy="{ty - 7}" r="5" fill="#4f9a55"/><circle cx="{tx - 1.5}" cy="{ty - 8.5}" r="2.5" fill="#7cc27b"/>')
    # clouds (where the original has them)
    s.append(cloud(368, 512, 1.65)); s.append(cloud(640, 494, 1.55))
    # floating leaf platform (original tiles 091-094 at x 480..544, y 512)
    s.append(f'<path d="M482,515 Q512,509 542,515" stroke="url(#rootG)" stroke-width="3" fill="none" stroke-linecap="round"/>')
    s.append(leaf_edge([(484, 514), (512, 512), (540, 514)], step=4.8, size=(9, 12)))
    # cornflakes
    s.append(flake(487, 486, 6.0, toasted=True, rot=10))
    for (cx, cy, r, rot) in [(422, 584, 6.4, -15), (404, 598, 6.0, 20), (441, 600, 7.0, 5)]:
        s.append(flake(cx, cy, r, rot=rot))
    # question block
    s.append(f'<g filter="url(#drop)"><rect x="352.5" y="560.5" width="15" height="15" rx="2.6" fill="url(#qG)" stroke="#5c0c1e" stroke-width="0.7"/>'
             f'<rect x="353.6" y="561.6" width="12.8" height="3.2" rx="1.4" fill="#fff" opacity="0.28"/>'
             f'<text x="360" y="572.6" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="11.5" text-anchor="middle" '
             f'fill="#fff" stroke="#6a0f24" stroke-width="0.9" paint-order="stroke">?</text></g>')
    # ground blocks: dark recess behind the pillars, pillars, shadow under the leafy edge
    right = [(432, 646), (480, 646), (608, 582), (690, 582), (690, 738), (432, 738)]
    left = [(300, 646), (368, 646), (368, 738), (300, 738)]
    for name, poly in (('L', left), ('R', right)):
        pts = ' '.join(f'{x},{y}' for x, y in poly)
        s.append(f'<clipPath id="clip{name}"><polygon points="{pts}"/></clipPath>')
        s.append(f'<polygon points="{pts}" fill="url(#recess)"/>')
    cols = [(306, 'L'), (448, 'R'), (512, 'R'), (576, 'R'), (640, 'R')]
    for x, side in cols:
        w = 52 if side == 'R' else 56
        top = 560
        s.append(f'<clipPath id="col{int(x)}"><rect x="{x}" y="{top}" width="{w}" height="200" rx="3"/></clipPath>')
        s.append(f'<g clip-path="url(#clip{side})">' + stone_column(x, top + 10, 740, w) + '</g>')
    for poly in (left, right):
        top = [p for p in poly if p[1] < 700]
        pl = ' '.join(f'{f(x)},{f(y + 10)}' for x, y in top)
        cid = 'L' if poly is left else 'R'
        s.append(f'<g clip-path="url(#clip{cid})"><polyline points="{pl}" stroke="#000" stroke-width="16" opacity="0.45" fill="none" filter="url(#blur3)"/></g>')
    # bridge (original x 352..464): arch, beam, deck, railing, lanterns
    s.append('<g filter="url(#drop)">')
    s.append('<path d="M364,676 Q400,648 436,676" stroke="url(#wood)" stroke-width="7" fill="none" stroke-linecap="round"/>')
    s.append('<path d="M364,676 Q400,648 436,676" stroke="#f0b06a" stroke-width="1" fill="none" opacity="0.6" transform="translate(0,-2.6)"/>')
    for k in range(6):                                          # spandrel posts between arch and beam
        px = 372 + k * 11.2; py = 676 - 28 * (1 - ((px - 400) / 36) ** 2) * 0.98
        s.append(f'<rect x="{f(px - 1.4)}" y="652" width="2.8" height="{f(max(0, py - 652))}" fill="url(#woodV)"/>')
    s.append('<rect x="349" y="640" width="112" height="12" rx="2" fill="url(#wood)"/>')
    for k in range(9):                                          # carved diamonds on the beam
        cx = 356 + k * 12.3
        s.append(f'<path d="M{f(cx)},643 l3,3 -3,3 -3,-3 Z" fill="#f2c27a" stroke="#6a3712" stroke-width="0.5"/>')
    s.append('<rect x="347" y="636" width="116" height="5" rx="1.5" fill="url(#wood)"/>')
    for k in range(15):                                         # planks
        s.append(f'<line x1="{348 + k * 7.7}" y1="636.4" x2="{348 + k * 7.7}" y2="640.6" stroke="#5a2e0e" stroke-width="0.5"/>')
    for k in range(8):                                          # balusters
        bx = 366 + k * 11
        s.append(f'<rect x="{bx - 1.2}" y="616" width="2.4" height="20" rx="0.8" fill="url(#woodV)"/>')
    for k in range(4):                                          # struts with a vine
        bx = 366 + k * 22
        s.append(f'<path d="M{bx + 2},634 L{bx + 13},618" stroke="#7a4218" stroke-width="1.6" stroke-linecap="round"/>'
                 f'<path d="M{bx + 2},634 Q{bx + 4},626 {bx + 8},625 T{bx + 13},618" stroke="#4caf2c" stroke-width="0.8" fill="none"/>'
                 f'<circle cx="{bx + 8}" cy="625" r="1.2" fill="#7fd848"/>')
    s.append('<rect x="352" y="613" width="106" height="3.4" rx="1.6" fill="url(#wood)"/>')
    for px in (355, 455):                                       # posts + lanterns
        s.append(f'<rect x="{px - 2.2}" y="611" width="4.4" height="26" rx="1" fill="url(#woodV)"/>'
                 f'<circle cx="{px}" cy="603" r="9" fill="url(#glow)"/>'
                 f'<path d="M{px - 3.4},606 Q{px - 4},599 {px},596 Q{px + 4},599 {px + 3.4},606 Z" fill="url(#glass)" stroke="#3b1f6a" stroke-width="0.6"/>'
                 f'<rect x="{px - 3.6}" y="606" width="7.2" height="2.2" rx="0.8" fill="#4a2a12"/>'
                 f'<path d="M{px - 1.5},594.6 h3 l-1.5,-2 z" fill="#4a2a12"/>')
    s.append('</g>')
    # leafy edges on top of the ground (after the bridge so the leaves overlap its ends)
    s.append(leaf_edge([(300, 642), (366, 642)]))
    s.append(leaf_edge([(434, 642), (480, 642), (608, 578), (692, 578)]))
    # hanging vines down the cliff edges
    for (vx, vy, n) in [(367, 650, 5), (690, 584, 7), (434, 650, 3)]:
        for k in range(n):
            s.append(leaf(vx + math.sin(k) * 1.5, vy + k * 7, 6.5, 90 + (25 if k % 2 else -25), shade='leafG2'))
    # flower on the left
    for k in range(5):
        a = k / 5 * math.tau - math.pi / 2
        s.append(f'<ellipse cx="{f(330 + math.cos(a) * 3.2)}" cy="{f(630 + math.sin(a) * 3.2)}" rx="2.6" ry="1.7" '
                 f'transform="rotate({f(math.degrees(a))} {f(330 + math.cos(a) * 3.2)} {f(630 + math.sin(a) * 3.2)})" fill="#ff8fc0" stroke="#b03a78" stroke-width="0.4"/>')
    s.append('<circle cx="330" cy="630" r="1.6" fill="#ffd23c" stroke="#b07a10" stroke-width="0.4"/>'
             '<path d="M330,632 Q331,637 329,641" stroke="#3f8f2a" stroke-width="0.8" fill="none"/>')
    # grass floor at the bottom (original tile 187, y 736)
    s.append(f'<rect x="{X}" y="736" width="{W}" height="20" fill="#6b3f17"/><rect x="{X}" y="736" width="{W}" height="5" fill="#3d9b2a"/>')
    for k in range(int(W / 3)):
        gx = X + k * 3 + rnd.uniform(0, 2)
        s.append(f'<path d="M{f(gx)},739 q{f(rnd.uniform(-1,1))},-3 {f(rnd.uniform(-1.5,1.5))},{f(-rnd.uniform(3,6))}" stroke="#8fe24a" stroke-width="0.9" fill="none"/>')
    for k in range(int(W / 7)):
        s.append(f'<ellipse cx="{f(X + k * 7 + rnd.uniform(0, 4))}" cy="{f(rnd.uniform(744, 750))}" rx="{f(rnd.uniform(1.4, 2.4))}" ry="1.2" fill="#e9c065" stroke="#8a5a1e" stroke-width="0.4"/>')
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
        pg.set_content(f'<html><body style="margin:0">{svg.replace(f"width=\"{W}\" height=\"{H}\"", f"width=\"{width}\" height=\"{height}\"")}</body></html>')
        pg.screenshot(path=out)
        b.close()
    print(out, width, height)
