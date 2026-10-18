#!/usr/bin/env python3
"""Testet die Browser-Version in Headless-Chromium (Playwright).

    python3 tools/browser-test.py <spielordner> <ausgabeordner> [skript]

Skript: kommagetrennte Schritte  "wait:5", "shot:name", "key:Enter", "hold:ArrowRight:1.5"
Läuft in Echtzeit, der Server wird automatisch gestartet.
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

game, out = sys.argv[1], sys.argv[2]
script = sys.argv[3] if len(sys.argv) > 3 else 'wait:8,shot:start,wait:20,shot:title'
os.makedirs(out, exist_ok=True)
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
srv = subprocess.Popen([sys.executable, os.path.join(root, 'tools/serve.py'), '8799'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
files = [os.path.join(game, f) for f in os.listdir(game) if f.upper() in ('START.EXE', 'PCKELL.DAT', 'KELLOGG.INI', 'RTM.EXE', 'DPMI16BI.OVL')]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'], executable_path='/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
        page = b.new_page(viewport={'width': 1100, 'height': 1000})
        page.on('console', lambda m: print('console:', m.text))
        page.on('pageerror', lambda e: print('pageerror:', e))
        page.goto('http://127.0.0.1:8799/web/', wait_until='domcontentloaded')
        page.screenshot(path=os.path.join(out, '00_leer.png'))
        page.click('#pick', force=True) if '--sound' in sys.argv else None
        page.set_input_files('#pick', files)
        page.click('#screen')
        for step in script.split(','):
            kind, *a = step.split(':')
            if kind == 'wait':
                time.sleep(float(a[0]))
            elif kind == 'shot':
                page.locator('#stage').screenshot(path=os.path.join(out, a[0] + '.png'))
                print(a[0], page.inner_text('#status'), '|', page.inner_text('#mode'), '|', page.inner_text('#fps'))
            elif kind == 'click':
                page.click(a[0])
            elif kind == 'eval':
                print('eval', a[0], page.evaluate(a[0]))
            elif kind == 'page':
                page.screenshot(path=os.path.join(out, a[0] + '.png'))
            elif kind == 'key':
                page.keyboard.down(a[0]); time.sleep(0.15); page.keyboard.up(a[0])
            elif kind == 'hold':
                page.keyboard.down(a[0]); time.sleep(float(a[1])); page.keyboard.up(a[0])
        print('Ton-Knopf:', page.inner_text('#sound'))
        print(page.inner_text('#log')[-1500:])
        b.close()
finally:
    srv.terminate()
