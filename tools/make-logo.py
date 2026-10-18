#!/usr/bin/env python3
"""Zeichnet das Projektlogo (eigenes Pixel-Design, keine Marken oder Figuren des Spiels).

    python3 tools/make-logo.py   ->  assets/logo.png (512x512), assets/banner.png (1280x320)
"""
import os
from PIL import Image, ImageDraw, ImageFont

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
NAVY, NAVY_D, RED, GOLD, PAPER = (12, 28, 102), (7, 17, 63), (211, 23, 28), (245, 197, 24), (246, 246, 242)
FLAKE = {'o': (110, 52, 14), 'd': (196, 120, 22), 'y': (236, 170, 40), 'l': (255, 222, 120), 'w': (255, 248, 210)}

# Pixel-Flake (16x16), eigene Zeichnung
FLAKE_MAP = [
    '................',
    '.....oooo.......',
    '...ooyyyyoo.....',
    '..oyyllyyyyoo...',
    '.oyllwlyyyyyyo..',
    '.oylwlyyyyyyyyo.',
    'oyyllyyyyydyyyo.',
    'oyyyyyyyyyyyyydo',
    'oyyyydyyyyyyyydo',
    '.oyyyyyyyyydyydo',
    '.oyyyyyydyyyyddo',
    '..oyyyyyyyyyddo.',
    '..oddyyyyyyddo..',
    '...ooddddddoo...',
    '.....oooooo.....',
    '................',
]

# 5x7-Pixelschrift (nur benötigte Zeichen)
FONT = {
    'K': ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
    'E': ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    'L': ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
    'O': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    'G': ['.XXX.', 'X...X', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXXX'],
    'S': ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
    'A': ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
    'N': ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
    'D': ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
    'H': ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
    "'": ['..X..', '..X..', '.X...', '.....', '.....', '.....', '.....'],
    ' ': ['.....'] * 7,
}


def pixel_text(draw, x, y, text, px, color, shadow=None):
    for ch in text:
        g = FONT[ch]
        w = 3 if ch == "'" else 5
        off = 1 if ch == "'" else 0
        for r, row in enumerate(g):
            for c in range(w):
                if row[c + off] == 'X':
                    if shadow:
                        draw.rectangle([x + c * px + px // 2, y + r * px + px // 2, x + (c + 1) * px - 1 + px // 2, y + (r + 1) * px - 1 + px // 2], fill=shadow)
                    draw.rectangle([x + c * px, y + r * px, x + (c + 1) * px - 1, y + (r + 1) * px - 1], fill=color)
        x += (w + 1) * px
    return x


def text_width(text, px):
    return sum(((3 if ch == "'" else 5) + 1) * px for ch in text) - px


def flake(draw, x, y, px):
    for r, row in enumerate(FLAKE_MAP):
        for c, k in enumerate(row):
            if k in FLAKE:
                draw.rectangle([x + c * px, y + r * px, x + (c + 1) * px - 1, y + (r + 1) * px - 1], fill=FLAKE[k])


def frame(draw, box, radius, border):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius, fill=GOLD)
    draw.rounded_rectangle((x0 + border, y0 + border, x1 - border, y1 - border), radius - border, fill=RED)


def badge_hd(draw, x, y, px):
    w = text_width('HD', px) + 4 * px
    h = 7 * px + 4 * px
    draw.rounded_rectangle((x, y, x + w, y + h), px * 2, fill=NAVY_D, outline=GOLD, width=max(2, px // 2))
    pixel_text(draw, x + 2 * px, y + 2 * px, 'HD', px, GOLD)
    return w, h


# Icon 512x512
icon = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(icon)
frame(d, (8, 8, 503, 503), 96, 14)
d.rounded_rectangle((52, 52, 459, 459), 64, fill=NAVY)
flake(d, 96, 70, 20)
w = text_width('HD', 14) + 4 * 14
badge_hd(d, 512 - 64 - w, 512 - 64 - (11 * 14), 14)
icon.save(os.path.join(root, 'assets/logo.png'))

# Banner 1280x320
ban = Image.new('RGB', (1280, 320), NAVY)
d = ImageDraw.Draw(ban)
for i in range(320):  # leichter Verlauf nach oben
    t = 1 - i / 320
    d.line([(0, i), (1280, i)], fill=(int(NAVY[0] + 14 * t), int(NAVY[1] + 20 * t), int(NAVY[2] + 50 * t)))
frame(d, (40, 40, 280, 280), 48, 10)
d.rounded_rectangle((64, 64, 256, 256), 32, fill=NAVY_D)
flake(d, 80, 72, 10)
x = pixel_text(d, 330, 70, "KELLOGG'S LAND", 11, GOLD, shadow=RED)
pixel_text(d, 330, 170, 'HD', 11, PAPER, shadow=RED)
sub = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 26)
d.text((470, 178), 'Tony & Friends · DOS 1994', font=sub, fill=PAPER)
d.text((470, 216), 'im Browser · Recomp-Projekt', font=sub, fill=(169, 178, 230))
ban.save(os.path.join(root, 'assets/banner.png'))
# Vorschaubild für GitHub (Settings → Social preview), 1280x640
soc = Image.new('RGB', (1280, 640), NAVY)
ds = ImageDraw.Draw(soc)
for i in range(640):
    t = 1 - i / 640
    ds.line([(0, i), (1280, i)], fill=(int(NAVY[0] + 14 * t), int(NAVY[1] + 20 * t), int(NAVY[2] + 50 * t)))
soc.paste(ban, (0, 160))
soc.save(os.path.join(root, 'assets/social-preview.png'))
print('assets/logo.png, assets/banner.png, assets/social-preview.png')
