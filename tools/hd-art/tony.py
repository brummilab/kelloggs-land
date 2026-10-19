#!/usr/bin/env python3
"""Tools for hand-drawn HD sprites of Tony (drawn by hand in LibreSprite, not by these scripts).

Tony has 26 own frames (0x00-0x18 and 0x2d); the frames 0x32-0x4a are the same frames mirrored. A sprite is
found by its content id (gfxHash over colour index + opacity, see web/scene.js), so every frame needs its own
file s_<id>.png at 4x size (width*4 x height*4, RGBA, transparent outside the figure).

    # 1. sprite export from your own game copy (scratch file, not part of the repo)
    node tools/hd-art/export-sprites.mjs <game folder> sprites.json
    # 2. 4x templates to draw over (original pixels, nearest neighbour) + list of frames
    python3 tools/hd-art/tony.py templates sprites.json <folder>
    # 3. check the drawn frames, write them and their mirrored versions to web/hd
    python3 tools/hd-art/tony.py apply <folder with drawn s_*.png> web/hd
    # 4. comparison image: Tony at the start of level 1, original | HD
    python3 tools/hd-art/tony.py compare sprites.json tiles.json map.json <hd dir> out.png

tools/hd-art/tony_frames.json lists every frame: number, size, anchor, id and the id of its mirrored twin."""
import json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, 'tony_frames.json')
OWN = list(range(0x00, 0x19)) + [0x2d]          # Tony's own frames; k + 0x32 is the mirrored twin (not for 0x2d)
S = 4

def gfx_hash(idx, alpha, w, h):
    x = (0x811c9dc5 ^ (w * 31 + h)) & 0xffffffff
    for i, a in zip(idx, alpha):
        for b in (i, 255 if a else 0):
            x ^= b; x = (x * 0x01000193) & 0xffffffff
    return '%08x' % x

def load(path):
    d = json.load(open(path))
    pal = [((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']]
    return pal, {s['k']: s for s in d['sprites']}

def rgba(s, pal):
    a = np.zeros((s['h'], s['w'], 4), np.uint8)
    idx = np.array(s['idx']).reshape(s['h'], s['w']); al = np.array(s['alpha']).reshape(s['h'], s['w'])
    for y in range(s['h']):
        for x in range(s['w']):
            if al[y, x]: a[y, x] = (*pal[idx[y, x]], 255)
    return a

def templates(sprites, outdir):
    pal, sp = load(sprites)
    os.makedirs(outdir, exist_ok=True)
    frames = []
    for k in OWN:
        s = sp[k]; h = gfx_hash(s['idx'], s['alpha'], s['w'], s['h'])
        f = dict(k=k, w=s['w'], h=s['h'], hx=s['hx'], hy=s['hy'], hash=h)
        t = sp.get(k + 0x32) if k < 0x19 else None
        if t is not None:
            A = np.array(s['idx']).reshape(s['h'], s['w']); B = np.array(t['idx']).reshape(t['h'], t['w'])
            if B.shape == A.shape and (A[:, ::-1] == B).all():
                f['mirror_k'] = k + 0x32; f['mirror_hash'] = gfx_hash(t['idx'], t['alpha'], t['w'], t['h'])
        frames.append(f)
        Image.fromarray(rgba(s, pal)).resize((s['w'] * S, s['h'] * S), Image.NEAREST).save(
            os.path.join(outdir, f"{k:02x}_s_{h}.png"))
    # colours Tony uses in the original (for the palette check)
    used = sorted({pal[i] for k in OWN for i, a in zip(sp[k]['idx'], sp[k]['alpha']) if a})
    json.dump({'frames': frames, 'palette': used}, open(FRAMES, 'w'), indent=1)
    print(len(frames), 'templates in', outdir, '-', sum('mirror_hash' in f for f in frames), 'with a mirrored twin')

def apply(indir, hddir):
    info = json.load(open(FRAMES)); frames = {f['hash']: f for f in info['frames']}
    palette = {tuple(c) for c in info['palette']}
    done = 0
    for name in sorted(os.listdir(indir)):
        m = re.search(r's_([0-9a-f]{8})\.png$', name)
        if not m or m.group(1) not in frames: continue
        f = frames[m.group(1)]
        im = Image.open(os.path.join(indir, name)).convert('RGBA')
        want = (f['w'] * S, f['h'] * S)
        if im.size != want:
            print(f"{name}: size {im.size}, expected {want} - skipped"); continue
        a = np.array(im)
        a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)          # transparent or not, nothing in between
        vis = a[..., 3] > 0
        cols = {tuple(c) for c in a[vis][:, :3]}
        off = cols - palette
        n_off = sum(int(np.all(a[vis][:, :3] == c, axis=1).sum()) for c in off)
        note = f", {len(off)} colour(s) not in Tony's original palette ({n_off} px)" if off else ''
        Image.fromarray(a).save(os.path.join(hddir, f"s_{f['hash']}.png"))
        if 'mirror_hash' in f:
            Image.fromarray(a[:, ::-1].copy()).save(os.path.join(hddir, f"s_{f['mirror_hash']}.png"))
        print(f"{f['k']:02x}: ok{' + mirrored ' + format(f['mirror_k'], '02x') if 'mirror_hash' in f else ''}{note}")
        done += 1
    print(done, 'frames written; now run tools/hd-index.py')

def compare(sprites, tiles_json, map_json, hddir, out, scene=''):
    """Tony at the start of level 1 and a row of his frames on the ground: original | HD (HD sprite where one
    exists, otherwise the original frame scaled up). With a 6th argument (scene): a 16 x 9 tile scene for the
    comparison page, written as <scene>_original.png and <scene>_hd.png."""
    pal, sp = load(sprites)
    d = json.load(open(tiles_json)); grid = json.load(open(map_json))['grid']
    tp = np.array([((c & 255), (c >> 8) & 255, (c >> 16) & 255) for c in d['pal']], np.uint8)
    info = json.load(open(FRAMES))
    X0, Y0, X1, Y1 = (14, 34, 40, 41) if not scene else (17, 32, 33, 41)   # map tiles; ground at y 640
    W, H = (X1 - X0) * 16, (Y1 - Y0) * 16
    bo = np.zeros((H, W, 3), np.uint8); bh = np.zeros((H * S, W * S, 3), np.uint8)
    for y in range(Y0, Y1):
        for x in range(X0, X1):
            t = d['tiles'][grid[y][x]]; px = tp[np.array(t['px']).reshape(16, 16)]
            bo[(y - Y0) * 16:(y - Y0 + 1) * 16, (x - X0) * 16:(x - X0 + 1) * 16] = px
            p = os.path.join(hddir, f"t_{t['hash']}.png")
            hd = np.array(Image.open(p).convert('RGB')) if os.path.exists(p) else np.kron(px, np.ones((S, S, 1), np.uint8))
            bh[(y - Y0) * 64:(y - Y0 + 1) * 64, (x - X0) * 64:(x - X0 + 1) * 64] = hd
    O = Image.fromarray(bo).resize((W * S, H * S), Image.NEAREST).convert('RGBA'); Hd = Image.fromarray(bh).convert('RGBA')
    show = [0x00, 0x02, 0x05, 0x09, 0x0b, 0x0c, 0x0e, 0x11, 0x13, 0x16, 0x2d, 0x34]   # 0x34: mirrored frame
    if scene: show = [0x00, 0x05, 0x0b, 0x0e, 0x11, 0x16, 0x34]
    fr = {f['k']: f for f in info['frames']}
    for n, k in enumerate(show):
        own = fr.get(k) or next(f for f in info['frames'] if f.get('mirror_k') == k)
        s = sp[k]; h = own['hash'] if k in fr else own['mirror_hash']
        o = Image.fromarray(rgba(s, pal)).resize((s['w'] * S, s['h'] * S), Image.NEAREST)
        p = os.path.join(hddir, f"s_{h}.png")
        hi = Image.open(p).convert('RGBA') if os.path.exists(p) else o
        x = (24 + n * 34) * S; y = (640 - Y0 * 16 - s['hy']) * S
        O.alpha_composite(o, (x, y)); Hd.alpha_composite(hi, (x, y))
    if scene:
        O.convert('RGB').save(f'{scene}_original.png', optimize=True); Hd.convert('RGB').save(f'{scene}_hd.png', optimize=True)
    c = Image.new('RGB', (O.width, O.height * 2 + 16), (40, 40, 40))
    c.paste(O.convert('RGB'), (0, 0)); c.paste(Hd.convert('RGB'), (0, O.height + 16))
    c.save(out)

if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    {'templates': templates, 'apply': apply, 'compare': compare}[cmd](*args)
