#!/usr/bin/env python3
"""Baut die Browser-Version nach dist/ (statische Seite, z. B. für ein claude.ai-Artifact).

    python3 tools/build-site.py [--artifact]

--artifact entfernt <!doctype>, <html>, <head> und <body>, weil das Artifact diese Hülle selbst setzt.
"""
import os
import re
import shutil
import sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src, dist = os.path.join(root, 'web'), os.path.join(root, 'dist')
shutil.rmtree(dist, ignore_errors=True)
os.makedirs(dist)
for f in os.listdir(src):
    if f.endswith('.js'):
        shutil.copy(os.path.join(src, f), dist)
html = open(os.path.join(src, 'index.html'), encoding='utf-8').read()
if '--artifact' in sys.argv:
    html = re.sub(r'<!doctype html>\s*', '', html, flags=re.I)
    html = re.sub(r'</?(html|head|body)[^>]*>\s*', '', html, flags=re.I)
    html = re.sub(r'<meta (charset|name="viewport")[^>]*>\s*', '', html, flags=re.I)
open(os.path.join(dist, 'index.html'), 'w', encoding='utf-8').write(html)
print('dist/:', ', '.join(sorted(os.listdir(dist))))
