#!/usr/bin/env python3
"""Erzeugt web/hd/index.json: Liste der HD-Bilder (t_*.png, s_*.png), die die Webseite beim Start lädt.

    python3 tools/hd-index.py [web/hd]

Läuft automatisch beim Veröffentlichen (.github/workflows/pages.yml) und mit tools/serve.py.
"""
import json, os, re, sys

root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'hd')
pat = re.compile(r'(?:^|_)[ts]_[0-9a-f]{8}\.png$', re.I)
files = sorted(os.path.relpath(os.path.join(d, f), root).replace(os.sep, '/')
               for d, _, fs in os.walk(root) for f in fs if pat.search(f))
with open(os.path.join(root, 'index.json'), 'w') as fh:
    json.dump({'files': files}, fh, indent=0)
print(f'web/hd/index.json: {len(files)} Bilder')
