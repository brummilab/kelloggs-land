#!/usr/bin/env python3
"""Test scene: the same piece of level 1 (bridge, slope, stone pillars, clouds, cornflakes) in a hand-painted,
illustrated look: organic wobbly shapes with ink lines of varying weight, painted texture on every surface, soft
inner shading, warm light against cool shadows, hazy background layers with fog and light shafts, a blurred dark
foreground. Only the surroundings; no characters. Layout follows the original level map (level pixels).
    python3 tools/hd-art/painted_test.py out.png [width]      (needs python playwright + chromium)"""
import math, random, sys

VB = (312, 466, 400, 286)
rnd = random.Random(5)
_id = [0]
def f(v): return f'{v:.2f}'
def nid(p='c'):
    _id[0] += 1; return f'{p}{_id[0]}'

def smooth(pts, closed=True):
    n = len(pts); d = f'M{f(pts[0][0])},{f(pts[0][1])}'
    for i in (range(n) if closed else range(n - 1)):
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + (' Z' if closed else '')

def blob(x, y, w, h, jit=0.12, n=10, rot=0):
    """irregular rounded blob (stone, cloud puff, bush) around a box"""
    pts = []
    for k in range(n):
        a = k / n * math.tau + rot
        rx, ry = w / 2 * (1 + rnd.uniform(-jit, jit)), h / 2 * (1 + rnd.uniform(-jit, jit))
        c, s = math.cos(a), math.sin(a)
        # squarish: push points towards the corners
        sq = 1 / max(abs(c), abs(s)) ** 0.55
        pts.append((x + w / 2 + c * rx * min(sq, 1.25), y + h / 2 + s * ry * min(sq, 1.25)))
    return smooth(pts)

def stone_path(x, y, w, h):
    """hand-cut stone: a quad with jittered corners and rounded, slightly chipped edges"""
    j = lambda: rnd.uniform(-1.2, 1.2)
    c = [(x + j(), y + j()), (x + w + j(), y + j()), (x + w + j(), y + h + j()), (x + j(), y + h + j())]
    pts = []
    for i in range(4):
        a, b = c[i], c[(i + 1) % 4]
        for t in (0.18, 0.5, 0.82):
            px, py = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            nx, ny = (b[1] - a[1]), -(b[0] - a[0]); L = math.hypot(nx, ny) or 1
            bump = rnd.uniform(-0.5, 0.7) if t == 0.5 else rnd.uniform(-0.3, 0.3)
            pts.append((px + nx / L * bump, py + ny / L * bump))
    return smooth(pts)

def leaf_path(x, y, L, ang, wid=0.38):
    a = math.radians(ang); ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux
    w = L * wid
    p = lambda s, t: (x + ux * s + vx * t, y + uy * s + vy * t)
    pts = [p(0, 0), p(L * 0.15, w * 0.7), p(L * 0.45, w), p(L * 0.78, w * 0.55), p(L, 0),
           p(L * 0.78, -w * 0.55), p(L * 0.45, -w), p(L * 0.15, -w * 0.7)]
    return smooth(pts)

# ------------------------------------------------------------------ defs
DEFS = '''<defs>
 <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#5fa6dc"/><stop offset="0.45" stop-color="#a9d2ea"/><stop offset="0.8" stop-color="#f1e8d6"/><stop offset="1" stop-color="#f7e3c4"/></linearGradient>
 <radialGradient id="sun" cx="0.08" cy="0.0" r="0.9"><stop offset="0" stop-color="#fff4d6" stop-opacity="0.6"/><stop offset="0.3" stop-color="#ffe9c0" stop-opacity="0.15"/><stop offset="1" stop-color="#ffe9c0" stop-opacity="0"/></radialGradient>
 <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6efe2" stop-opacity="0"/><stop offset="0.5" stop-color="#f6efe2" stop-opacity="0.75"/><stop offset="1" stop-color="#f6efe2" stop-opacity="0"/></linearGradient>
 <linearGradient id="shaft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6dc" stop-opacity="0.65"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></linearGradient>
 <linearGradient id="stoneLit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dfa8"/><stop offset="0.45" stop-color="#deac66"/><stop offset="1" stop-color="#a86f3a"/></linearGradient>
 <linearGradient id="stoneMid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8c486"/><stop offset="0.5" stop-color="#c58f52"/><stop offset="1" stop-color="#8c5a35"/></linearGradient>
 <linearGradient id="stoneDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b58d6c"/><stop offset="0.5" stop-color="#8a6252"/><stop offset="1" stop-color="#5b3d3c"/></linearGradient>
 <linearGradient id="gap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c0f0a"/><stop offset="0.6" stop-color="#2f1c17"/><stop offset="1" stop-color="#3d2a2a"/></linearGradient>
 <linearGradient id="woodH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2a766"/><stop offset="0.5" stop-color="#b56f36"/><stop offset="1" stop-color="#6e3b1d"/></linearGradient>
 <linearGradient id="woodV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8b072"/><stop offset="0.45" stop-color="#b36d35"/><stop offset="1" stop-color="#5e3119"/></linearGradient>
 <linearGradient id="leafA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f57a"/><stop offset="0.5" stop-color="#7cc23c"/><stop offset="1" stop-color="#2f7a2a"/></linearGradient>
 <linearGradient id="leafB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8e35e"/><stop offset="0.55" stop-color="#5aa531"/><stop offset="1" stop-color="#245f25"/></linearGradient>
 <linearGradient id="leafC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fa449"/><stop offset="1" stop-color="#1d4a24"/></linearGradient>
 <radialGradient id="flake" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="#fff6c4"/><stop offset="0.35" stop-color="#f7cf5c"/><stop offset="0.8" stop-color="#cf8a2a"/><stop offset="1" stop-color="#8f5418"/></radialGradient>
 <radialGradient id="flakeT" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="#e3a764"/><stop offset="0.5" stop-color="#a45d24"/><stop offset="1" stop-color="#55290f"/></radialGradient>
 <radialGradient id="halo"><stop offset="0" stop-color="#fff2b0" stop-opacity="0.7"/><stop offset="0.45" stop-color="#ffd970" stop-opacity="0.2"/><stop offset="1" stop-color="#ffd970" stop-opacity="0"/></radialGradient>
 <radialGradient id="lamp"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.25" stop-color="#f1dcff" stop-opacity="0.75"/><stop offset="0.6" stop-color="#c9a4ff" stop-opacity="0.22"/><stop offset="1" stop-color="#c9a4ff" stop-opacity="0"/></radialGradient>
 <radialGradient id="glass" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.4" stop-color="#e7d3ff"/><stop offset="1" stop-color="#8a5ad0"/></radialGradient>
 <linearGradient id="qb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7a0a6"/><stop offset="0.5" stop-color="#d9475c"/><stop offset="1" stop-color="#7d1d33"/></linearGradient>
 <radialGradient id="vign" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#1a1020" stop-opacity="0"/><stop offset="1" stop-color="#1a1020" stop-opacity="0.45"/></radialGradient>
 <linearGradient id="cyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1420" stop-opacity="0.35"/><stop offset="0.12" stop-color="#fff0c8" stop-opacity="0.18"/><stop offset="0.35" stop-color="#fff0c8" stop-opacity="0"/><stop offset="0.6" stop-color="#3a2040" stop-opacity="0.22"/><stop offset="1" stop-color="#1a0c1c" stop-opacity="0.7"/></linearGradient>
 <linearGradient id="cloudG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf8"/><stop offset="0.6" stop-color="#f6e9f6"/><stop offset="1" stop-color="#d9c2e6"/></linearGradient>

 <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4" result="t"/>
  <feDisplacementMap in="SourceGraphic" in2="t" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter>
 <filter id="wobbleBig" x="-10%" y="-10%" width="120%" height="120%">
  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="t"/>
  <feDisplacementMap in="SourceGraphic" in2="t" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter>
 <filter id="paint" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="2" result="fine"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="7" result="blot"/>
  <feColorMatrix in="fine" type="matrix" values="0.35 0 0 0 0.75  0.35 0 0 0 0.75  0.35 0 0 0 0.75  0 0 0 0 1" result="fg"/>
  <feColorMatrix in="blot" type="matrix" values="0.5 0 0 0 0.68  0.48 0 0 0 0.68  0.42 0 0 0 0.7  0 0 0 0 1" result="bg"/>
  <feBlend in="SourceGraphic" in2="fg" mode="multiply" result="a"/>
  <feBlend in="a" in2="bg" mode="multiply" result="b"/>
  <feComponentTransfer in="b" result="c"><feFuncR type="linear" slope="1.28"/><feFuncG type="linear" slope="1.28"/><feFuncB type="linear" slope="1.28"/></feComponentTransfer>
  <feComposite in="c" in2="SourceGraphic" operator="in"/></filter>
 <filter id="grainH" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.03 0.9" numOctaves="2" seed="5" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0.6 0 0 0 0.62  0.6 0 0 0 0.6  0.6 0 0 0 0.58  0 0 0 0 1" result="gg"/>
  <feBlend in="SourceGraphic" in2="gg" mode="multiply" result="a"/>
  <feComponentTransfer in="a" result="b"><feFuncR type="linear" slope="1.22"/><feFuncG type="linear" slope="1.22"/><feFuncB type="linear" slope="1.22"/></feComponentTransfer>
  <feComposite in="b" in2="SourceGraphic" operator="in"/></filter>
 <filter id="grainV" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9 0.03" numOctaves="2" seed="6" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0.6 0 0 0 0.62  0.6 0 0 0 0.6  0.6 0 0 0 0.58  0 0 0 0 1" result="gg"/>
  <feBlend in="SourceGraphic" in2="gg" mode="multiply" result="a"/>
  <feComponentTransfer in="a" result="b"><feFuncR type="linear" slope="1.22"/><feFuncG type="linear" slope="1.22"/><feFuncB type="linear" slope="1.22"/></feComponentTransfer>
  <feComposite in="b" in2="SourceGraphic" operator="in"/></filter>
 <filter id="b04"><feGaussianBlur stdDeviation="0.4"/></filter>
 <filter id="b1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1"/></filter>
 <filter id="b2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>
 <filter id="b4" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
 <filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
</defs>'''

INK = '#3a2014'

def painted(d, fill, dark='#3b2116', light='#fff3cf', ink=INK, ink_w=0.9, ao=3.2, ao_op=0.7, hl_op=0.55, extra=''):
    """one painted shape: fill, soft dark inner edge (volume), a light inner edge on the top left, ink line"""
    c = nid()
    return (f'<clipPath id="{c}"><path d="{d}"/></clipPath><g clip-path="url(#{c})">'
            f'<path d="{d}" fill="{fill}"/>{extra}'
            f'<path d="{d}" fill="none" stroke="{dark}" stroke-width="{ao}" opacity="{ao_op}" filter="url(#b1)" transform="translate(-0.6,-0.6)"/>'
            f'<path d="{d}" fill="none" stroke="{light}" stroke-width="1.6" opacity="{hl_op}" filter="url(#b04)" transform="translate(1.1,1.1)"/></g>'
            + (f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="{ink_w}" stroke-linejoin="round" opacity="0.9"/>' if ink_w else ''))

# ------------------------------------------------------------------ background
def background():
    X, Y, W, H = VB; s = []
    s.append(f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="url(#sky)"/>')
    # far: hazy rock spires and mesas
    far = []
    for (x, w, h) in [(318, 18, 120), (342, 30, 70), (372, 14, 95), (520, 40, 60), (566, 16, 110), (590, 28, 76), (660, 22, 130), (690, 34, 88)]:
        top = 760 - h - 40
        pts = [(x - w * 0.15, 760), (x + w * 0.05, top + h * 0.35), (x + w * 0.1, top + 6), (x + w * 0.45, top), (x + w * 0.8, top + 4),
               (x + w * 0.95, top + h * 0.3), (x + w * 1.15, 760)]
        far.append(f'<path d="{smooth(pts)}" fill="#c3cfd6"/>')
        far.append(f'<path d="{smooth(pts)}" fill="#dfe3e2" transform="translate(-2.5,0)" opacity="0.6"/>')
    s.append(f'<g filter="url(#wobbleBig)" opacity="0.9">{"".join(far)}</g>')
    s.append(f'<rect x="{X}" y="650" width="{W}" height="80" fill="url(#fog)"/>')
    # mid: rolling hills with tufted trees, desaturated, a bit soft
    mid = []
    hill = [(X - 10, 760), (X, 700), (X + 60, 688), (X + 120, 706), (X + 190, 690), (X + 260, 704), (X + 330, 686), (X + 410, 700), (X + 420, 760)]
    mid.append(f'<path d="{smooth(hill)}" fill="#86ab7e"/>')
    for k in range(16):
        tx = X + 8 + k * 26 + rnd.uniform(-6, 6); ty = 690 + 12 * math.sin(k * 1.7) + 4
        mid.append(f'<path d="M{f(tx)},{f(ty + 12)} q1,-8 0,-14" stroke="#6d6a58" stroke-width="1.4" fill="none"/>')
        for j in range(3):
            mid.append(f'<path d="{blob(tx - 7 + j * 3.5, ty - 12 - j * 2.5, 9 - j, 7 - j * 0.6, 0.2)}" fill="{["#5f8f62", "#78a86f", "#94c07f"][j]}"/>')
    s.append(f'<g filter="url(#b04)"><g filter="url(#wobble)">{"".join(mid)}</g></g>')
    s.append(f'<rect x="{X}" y="700" width="{W}" height="60" fill="url(#fog)" opacity="0.8"/>')
    # light shafts from the top left
    for (x0, w0, op) in [(330, 26, 0.3), (378, 16, 0.22), (430, 34, 0.2), (520, 20, 0.14)]:
        s.append(f'<path d="M{x0},{Y - 10} L{x0 + w0},{Y - 10} L{x0 + w0 + 180},{Y + 300} L{x0 + 120},{Y + 300} Z" fill="url(#shaft)" opacity="{op}" filter="url(#b4)"/>')
    s.append(f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="url(#sun)"/>')
    return ''.join(s)

def cloud(cx, cy, sc):
    puffs = [(-17, 2, 14, 10), (-7, -5, 18, 15), (5, -9, 20, 17), (17, -3, 16, 13), (26, 3, 12, 9), (-25, 5, 10, 7), (-4, 4, 26, 10), (14, 5, 18, 8)]
    body = ''.join(f'<path d="{blob(cx + px * sc - w * sc / 2, cy + py * sc - h * sc / 2, w * sc, h * sc, 0.1, 12)}"/>' for px, py, w, h in puffs)
    c = nid()
    return (f'<g filter="url(#wobble)"><clipPath id="{c}">{body}</clipPath>'
            f'<g fill="#8a6fae" opacity="0.15" transform="translate(2,3)" filter="url(#b2)">{body}</g>'
            f'<g clip-path="url(#{c})"><rect x="{cx - 50 * sc}" y="{cy - 30 * sc}" width="{100 * sc}" height="{50 * sc}" fill="url(#cloudG)"/>'
            f'<g fill="#e7d3ef" opacity="0.9" transform="translate(0,{f(5 * sc)})" filter="url(#b2)">{body}</g>'
            f'<g fill="#ffffff" opacity="0.95" transform="translate(-1.5,{f(-1.5 * sc)})" filter="url(#b1)">{body}</g></g>'
            '</g>')

# ------------------------------------------------------------------ ground: pillars
def pillar(x, top, bottom, w):
    out = []
    y = top; row = 0
    while y < bottom:
        h = rnd.uniform(15, 21)
        xx = x - (rnd.uniform(5, 10) if row % 2 else rnd.uniform(0, 3))
        while xx < x + w:
            bw = rnd.uniform(18, 30)
            cxr = (xx + bw / 2 - x) / w
            fill = 'url(#stoneLit)' if cxr < 0.5 else 'url(#stoneMid)'
            d = stone_path(xx + 0.9, y + 0.9, bw - 1.8, h - 1.8)
            extra = ''
            if rnd.random() < 0.35:   # moss on the top of the stone
                mx = xx + rnd.uniform(2, bw - 6)
                extra += f'<path d="{blob(mx, y, rnd.uniform(5, 9), 3.2, 0.3)}" fill="#7da348" opacity="0.85"/>'
            if rnd.random() < 0.25:   # crack
                cx = xx + rnd.uniform(4, bw - 4)
                extra += f'<path d="M{f(cx)},{f(y + 1)} l{f(rnd.uniform(-2, 2))},{f(h * 0.4)} l{f(rnd.uniform(-2, 2))},{f(h * 0.35)}" stroke="#5a3420" stroke-width="0.55" fill="none"/>'
            for _ in range(rnd.randint(1, 4)):   # pits
                extra += f'<circle cx="{f(xx + rnd.uniform(3, bw - 3))}" cy="{f(y + rnd.uniform(3, h - 3))}" r="{f(rnd.uniform(0.35, 0.8))}" fill="#6b4126" opacity="0.6"/>'
            out.append(painted(d, fill, dark='#40201a' if cxr > 0.6 else '#6e3a1e', extra=extra, ink_w=0.75, ao=3.4))
            xx += bw
        y += h; row += 1
    return ''.join(out)

def ground():
    s = []
    right = [(432, 648), (480, 648), (608, 584), (690, 584), (690, 742), (432, 742)]
    left = [(296, 648), (368, 648), (368, 742), (296, 742)]
    for name, poly in (('L', left), ('R', right)):
        pts = ' '.join(f'{x},{y}' for x, y in poly)
        s.append(f'<clipPath id="g{name}"><polygon points="{pts}"/></clipPath>')
        s.append(f'<polygon points="{pts}" fill="url(#gap)"/>')
    for x, side, w in [(302, 'L', 62), (447, 'R', 54), (511, 'R', 54), (575, 'R', 54), (639, 'R', 49)]:
        cid = nid('p')
        s.append(f'<clipPath id="{cid}"><path d="{blob(x, 560, w, 190, 0.02, 16)}"/></clipPath>')
        s.append(f'<g clip-path="url(#g{side})"><g clip-path="url(#{cid})" filter="url(#paint)">'
                 f'<rect x="{x - 5}" y="560" width="{w + 10}" height="190" fill="#4a2a1c"/>{pillar(x, 566, 745, w)}'
                 f'<rect x="{x - 5}" y="560" width="{w + 10}" height="190" fill="url(#cyl)"/></g></g>')
        # cool shadow under the overhanging leaves
    for poly, nm in ((left, 'L'), (right, 'R')):
        top = [p for p in poly if p[1] < 700]
        pl = ' '.join(f'{f(x)},{f(y + 12)}' for x, y in top)
        s.append(f'<g clip-path="url(#g{nm})"><polyline points="{pl}" stroke="#1d0f14" stroke-width="22" opacity="0.6" fill="none" filter="url(#b4)"/></g>')
    return ''.join(s)

# ------------------------------------------------------------------ foliage
def foliage_edge(points, density=1.0, size=1.0):
    """lush edge of leaves along the top of the ground: dark back leaves, mid leaves, bright backlit front leaves"""
    seq = []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L))
        for i in range(n): seq.append((x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n))
    layers = {0: [], 1: [], 2: []}
    pl = ' '.join(f'{f(x)},{f(y)}' for x, y in points)
    base = (f'<polyline points="{pl}" fill="none" stroke="#24451c" stroke-width="10" stroke-linejoin="round" transform="translate(0,4)"/>'
            f'<polyline points="{pl}" fill="none" stroke="#6b3d1f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')
    for i in range(0, len(seq), max(1, int(3 / density))):
        x, y = seq[i]
        for layer, (cnt, Ls, fills) in enumerate([(1, (8, 12), ['url(#leafC)']), (1, (8, 13), ['url(#leafB)']), (1, (7, 12), ['url(#leafA)', 'url(#leafB)'])]):
            if rnd.random() < 0.65:
                L = rnd.uniform(*Ls) * size
                ang = rnd.choice([rnd.uniform(40, 80), rnd.uniform(100, 140), rnd.uniform(-60, -20), rnd.uniform(200, 240)])
                if layer == 0: ang = rnd.uniform(-170, -10) if rnd.random() < 0.5 else ang
                ox, oy = x + rnd.uniform(-1.5, 1.5), y + rnd.uniform(-1, 2.5) + layer * 0.8
                d = leaf_path(ox, oy, L, ang, rnd.uniform(0.32, 0.42))
                a = math.radians(ang)
                vein = f'<path d="M{f(ox)},{f(oy)} Q{f(ox + math.cos(a) * L * 0.5 - math.sin(a) * 0.8)},{f(oy + math.sin(a) * L * 0.5 + math.cos(a) * 0.8)} {f(ox + math.cos(a) * L * 0.9)},{f(oy + math.sin(a) * L * 0.9)}" stroke="#2c5e1f" stroke-width="0.45" fill="none" opacity="0.7"/>'
                layers[layer].append(painted(d, rnd.choice(fills), dark='#173b16', light='#f4ffc0', ink='#1f3d17',
                                             ink_w=0.55 if layer else 0, ao=2.2, ao_op=0.55, hl_op=0.5 if layer == 2 else 0.25, extra=vein))
    return (f'<g filter="url(#wobble)">{base}<g opacity="0.95">{"".join(layers[0])}</g>'
            f'<g filter="url(#paint)">{"".join(layers[1])}{"".join(layers[2])}</g></g>')

def vines(x, y, n, side=1):
    out = []
    pts = [(x + 1.8 * math.sin(k * 1.1) * side, y + k * 6.5) for k in range(n)]
    out.append(f'<path d="{smooth(pts, closed=False)}" stroke="#2d5a20" stroke-width="0.9" fill="none"/>')
    for k, (px, py) in enumerate(pts):
        sg = 1 if k % 2 else -1
        out.append(painted(leaf_path(px, py, rnd.uniform(5, 7.5), 90 + sg * rnd.uniform(35, 60), 0.4), 'url(#leafB)',
                           dark='#173b16', ink='#1f3d17', ink_w=0.5, ao=1.6, ao_op=0.5, hl_op=0.4))
    return f'<g filter="url(#wobble)">{"".join(out)}</g>'

# ------------------------------------------------------------------ bridge
def plank(x, y, w, h, vertical=False):
    d = stone_path(x, y, w, h) if not vertical else stone_path(x, y, w, h)
    extra = ''
    if not vertical:
        for _ in range(rnd.randint(0, 2)):
            nx = x + rnd.uniform(2, w - 2)
            extra += f'<circle cx="{f(nx)}" cy="{f(y + h / 2)}" r="0.55" fill="#2c1a10"/><circle cx="{f(nx - 0.2)}" cy="{f(y + h / 2 - 0.2)}" r="0.2" fill="#c9b19a"/>'
    return painted(d, 'url(#woodV)' if vertical else 'url(#woodH)', dark='#3a1a0c', light='#ffe1b0', ink_w=0.7, ao=2.4, ao_op=0.6, hl_op=0.5, extra=extra)

def bridge():
    s = ['<g filter="url(#wobble)">']
    # arch made of curved segments
    segs = []
    for k in range(7):
        t0, t1 = k / 7, (k + 1) / 7
        def P(t, r):
            a = math.pi * (1 - t)
            return (400 + math.cos(a) * 36 * r, 684 - math.sin(a) * 26 * r)
        pts = [P(t0, 1.0), P((t0 + t1) / 2, 1.0), P(t1, 1.0), P(t1, 0.8), P((t0 + t1) / 2, 0.8), P(t0, 0.8)]
        segs.append(painted(smooth(pts), 'url(#woodH)', dark='#3a1a0c', light='#ffe1b0', ink_w=0.7, ao=2.2))
    s.append(f'<g filter="url(#grainV)">{"".join(segs)}</g>')
    posts = ''.join(plank(372 + k * 11.2 - 1.6, 651, 3.2, max(3, 684 - 26 * math.sqrt(max(0, 1 - ((372 + k * 11.2 - 400) / 36) ** 2)) - 651), True) for k in range(6))
    s.append(f'<g filter="url(#grainV)">{posts}</g>')
    # deck: beam + planks
    beam = plank(344, 641, 122, 11)
    s.append(f'<g filter="url(#grainH)">{beam}</g>')
    carv = ''.join(f'<path d="M{f(352 + k * 12.8)},646.6 l2.6,-2.6 2.6,2.6 -2.6,2.6 Z" fill="#7a4220" stroke="#3a1a0c" stroke-width="0.4" opacity="0.85"/>' for k in range(9))
    s.append(carv)
    pl = ''.join(plank(342 + k * 8.4, 635.4 + rnd.uniform(-0.4, 0.4), 8.6, 6) for k in range(15))
    s.append(f'<g filter="url(#grainH)">{pl}</g>')
    # railing
    bal = ''.join(plank(366 + k * 11 - 1.6 + rnd.uniform(-0.4, 0.4), 617, 3.2, 19, True) for k in range(8))
    s.append(f'<g filter="url(#grainV)">{bal}</g>')
    for k in range(4):       # vines on the railing
        bx = 366 + k * 22
        s.append(f'<path d="M{bx + 1},634 C{bx + 6},631 {bx + 3},625 {bx + 9},623 S{bx + 13},618 {bx + 16},617" stroke="#2f6a22" stroke-width="1" fill="none"/>')
        s.append(painted(leaf_path(bx + 8, 623.5, 6, -40), 'url(#leafA)', dark='#173b16', ink='#1f3d17', ink_w=0.45, ao=1.5))
        s.append(painted(leaf_path(bx + 4, 629, 5, 150), 'url(#leafB)', dark='#173b16', ink='#1f3d17', ink_w=0.45, ao=1.5))
    s.append(f'<g filter="url(#grainH)">{plank(349, 612, 112, 5.4)}</g>')
    # rope lashings where rail meets the posts
    for px in (355, 455):
        s.append(f'<g filter="url(#grainV)">{plank(px - 3, 608, 6, 31, True)}</g>')
        for j in range(3):
            s.append(f'<path d="M{px - 3.2},{612.5 + j * 1.3} l6.4,1.1" stroke="#d9c08a" stroke-width="0.8" stroke-linecap="round"/>')
    s.append('</g>')
    # lanterns (glow over everything)
    for px in (355, 455):
        s.append(f'<circle cx="{px}" cy="599" r="22" fill="url(#lamp)" opacity="0.8"/>')
        s.append(painted(f'M{px - 4.6},606 C{px - 5.6},599 {px - 2.4},594 {px},592 C{px + 2.4},594 {px + 5.6},599 {px + 4.6},606 Z',
                         'url(#glass)', dark='#5a2f9a', light='#ffffff', ink='#2a1440', ink_w=0.7, ao=1.6, ao_op=0.5, hl_op=0.9))
        s.append(painted(f'M{px - 5},605.4 h10 v3 h-10 Z', 'url(#woodH)', ink_w=0.6, ao=1))
        s.append(f'<path d="M{px - 2},592.6 L{px},589 L{px + 2},592.6 Z" fill="#5a3018" stroke="{INK}" stroke-width="0.5"/>')
    return ''.join(s)

# ------------------------------------------------------------------ items
def flake(cx, cy, r, toasted=False, rot=0):
    pts = []
    for k in range(9):
        a = k / 9 * math.tau
        rr = r * (1 + 0.18 * math.sin(k * 2.1 + cx) + 0.08 * math.cos(k * 4.7))
        pts.append((cx + math.cos(a) * rr * 0.85, cy + math.sin(a) * rr * 1.05))
    d = smooth(pts)
    extra = (f'<path d="M{f(cx - r * 0.4)},{f(cy + r * 0.2)} q{f(r * 0.4)},{f(-r * 0.35)} {f(r * 0.8)},{f(r * 0.05)}" stroke="#9a5a1c" stroke-width="0.6" fill="none"/>'
             f'<path d="M{f(cx - r * 0.1)},{f(cy - r * 0.6)} q{f(r * 0.25)},{f(r * 0.3)} {f(r * 0.1)},{f(r * 0.7)}" stroke="#b77426" stroke-width="0.45" fill="none" opacity="0.8"/>')
    out = ''
    if not toasted: out += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 3)}" fill="url(#halo)"/>'
    out += (f'<g transform="rotate({rot} {f(cx)} {f(cy)})" filter="url(#wobble)">'
            + painted(d, 'url(#flakeT)' if toasted else 'url(#flake)', dark='#7a3e10', light='#fffbe0', ink='#4a2408', ink_w=0.75, ao=2.4, ao_op=0.55, hl_op=0.8, extra=extra)
            + '</g>')
    if not toasted:
        sx, sy = cx + r * 1.05, cy - r * 1.25
        out += f'<path d="M{f(sx)},{f(sy - 3)} Q{f(sx + 0.4)},{f(sy - 0.4)} {f(sx + 3)},{f(sy)} Q{f(sx + 0.4)},{f(sy + 0.4)} {f(sx)},{f(sy + 3)} Q{f(sx - 0.4)},{f(sy + 0.4)} {f(sx - 3)},{f(sy)} Q{f(sx - 0.4)},{f(sy - 0.4)} {f(sx)},{f(sy - 3)} Z" fill="#fffbe6" opacity="0.95"/>'
    return out

def qblock(x, y):
    d = stone_path(x, y, 16, 16)
    q = (f'<text x="{x + 8.2}" y="{y + 12.6}" font-family="Georgia, serif" font-weight="700" font-size="12.5" text-anchor="middle" '
         f'fill="#fff4ea" stroke="#5c1022" stroke-width="1.3" paint-order="stroke">?</text>')
    return (f'<path d="{d}" fill="#2a1830" opacity="0.25" transform="translate(1.5,2.5)" filter="url(#b1)"/>'
            f'<g filter="url(#wobble)"><g filter="url(#paint)">' + painted(d, 'url(#qb)', dark='#4a0c1e', light='#ffe0e4', ink='#3a0814', ink_w=0.9, ao=3, hl_op=0.7) + f'</g>{q}</g>')

def flower(x, y, s=1.0, petal='#f58cc0', mid='#ffd23c'):
    out = [f'<path d="M{f(x)},{f(y + 2 * s)} q{f(0.8 * s)},{f(4 * s)} {f(-0.4 * s)},{f(8 * s)}" stroke="#2f6a22" stroke-width="{f(1 * s)}" fill="none"/>']
    for k in range(5):
        a = k / 5 * math.tau - math.pi / 2
        out.append(painted(leaf_path(x, y, 4.2 * s, math.degrees(a), 0.5), petal, dark='#8a2a5a', light='#ffffff', ink='#6a1a44', ink_w=0.45, ao=1.4, hl_op=0.6))
    out.append(painted(blob(x - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s, 0.1), mid, dark='#9a6010', ink='#6a4008', ink_w=0.4, ao=1))
    return f'<g filter="url(#wobble)">{"".join(out)}</g>'

def floating_island():
    soil = smooth([(482, 515), (512, 512), (542, 515), (536, 523), (522, 531), (506, 532), (492, 525)])
    roots = ''.join(f'<path d="M{f(500 + k * 7)},{f(527 + (k % 2) * 2)} q{f(rnd.uniform(-3, 3))},6 {f(rnd.uniform(-2, 2))},{f(rnd.uniform(8, 13))}" stroke="#5a3420" stroke-width="0.9" fill="none"/>' for k in range(4))
    return (f'<g filter="url(#wobble)">{roots}<g filter="url(#paint)">' + painted(soil, 'url(#woodH)', dark='#3a1a0c', ink_w=0.8, ao=3) + '</g></g>'
            + foliage_edge([(481, 514), (512, 511), (543, 514)], density=1.2, size=0.85))

def foreground():
    """dark, blurred plants in front of the scene (depth)"""
    X, Y, W, H = VB; out = []
    for (bx, by, n, sc) in [(X - 6, Y + H + 4, 14, 1.6), (X + W + 6, Y + H + 8, 12, 1.5)]:
        for k in range(n):
            ang = rnd.uniform(-160, -20)
            out.append(f'<path d="{leaf_path(bx + rnd.uniform(-8, 8), by - rnd.uniform(0, 14), rnd.uniform(26, 44) * sc / 1.5, ang, 0.32)}" fill="{rnd.choice(["#1c2a1a", "#22331f", "#2a3d24"])}"/>')
    return f'<g filter="url(#b4)" opacity="0.92">{"".join(out)}</g>'

def floor():
    X, Y, W, H = VB
    soil = f'M{X - 4},740 H{X + W + 4} V760 H{X - 4} Z'
    pebbles = ''.join(painted(blob(X + k * 8 + rnd.uniform(0, 4), rnd.uniform(744, 750), rnd.uniform(3, 5), rnd.uniform(2, 3), 0.2), 'url(#stoneLit)',
                              ink_w=0.4, ao=1.2, ao_op=0.5) for k in range(int(W / 8)))
    return (f'<g filter="url(#paint)"><path d="{soil}" fill="#6b4024"/>{pebbles}</g>'
            + foliage_edge([(X - 6, 740), (X + W + 6, 740)], density=1.3, size=0.8))

def scene():
    X, Y, W, H = VB
    s = [DEFS, background(), cloud(368, 512, 1.15), cloud(640, 494, 1.05)]
    s.append(floating_island())
    s.append(flake(488, 487, 5.6, toasted=True, rot=12))
    for (cx, cy, r, rot) in [(422, 584, 6.2, -15), (404, 599, 5.8, 20), (441, 601, 6.8, 5)]:
        s.append(flake(cx, cy, r, rot=rot))
    s.append(qblock(352, 560))
    s.append(ground())
    s.append(bridge())
    s.append(foliage_edge([(294, 643), (370, 643)]))
    s.append(foliage_edge([(430, 643), (480, 643), (608, 579), (694, 579)]))
    s.append(vines(369, 650, 5)); s.append(vines(431, 650, 4, -1)); s.append(vines(691, 586, 7))
    s.append(flower(331, 632, 1.0)); s.append(flower(602, 574, 0.85, '#ffe36a', '#f08a2a')); s.append(flower(662, 573, 0.9))
    s.append(floor())
    s.append(foreground())
    s.append(f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="url(#vign)"/>')
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
        pg.wait_for_timeout(500)
        pg.screenshot(path=out)
        b.close()
    print(out, width, height)
