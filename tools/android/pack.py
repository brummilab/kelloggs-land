#!/usr/bin/env python3
"""Adds the game files of your own copy to the Android test app and signs it (for internal testing only).
    python3 tools/android/pack.py <app-release-unsigned.apk> <build-tools dir> <game folder> <out.apk> [keystore]
The unsigned app and the build tools come from the GitHub Actions run 'Android' (artifact kelloggs-android).
Game files go to assets/game/ with a list files.json; the page loads them by itself (web/main.js, ?app=1)."""
import json, os, subprocess, sys, zipfile

src, bt, game, out = sys.argv[1:5]
ks = sys.argv[5] if len(sys.argv) > 5 else os.path.join(os.path.dirname(out) or '.', 'kelloggs-test.keystore')
names = sorted(f for f in os.listdir(game) if os.path.isfile(os.path.join(game, f))
               and f.upper().split('.')[-1] in ('EXE', 'DAT', 'SET', 'INI', 'OVL', 'ME'))
tmp = out + '.tmp.apk'
with zipfile.ZipFile(src) as zi, zipfile.ZipFile(tmp, 'w') as zo:
    for it in zi.infolist():
        if it.filename.startswith('META-INF/'): continue
        zo.writestr(it, zi.read(it.filename), compress_type=it.compress_type)
    for n in names:
        zo.write(os.path.join(game, n), 'assets/game/' + n, compress_type=zipfile.ZIP_DEFLATED)
    zo.writestr('assets/game/files.json', json.dumps(names))
aligned = out + '.aligned.apk'
subprocess.run([os.path.join(bt, 'zipalign'), '-f', '-p', '4', tmp, aligned], check=True)
if not os.path.exists(ks):
    subprocess.run(['keytool', '-genkeypair', '-keystore', ks, '-storepass', 'kelloggs', '-keypass', 'kelloggs', '-alias', 'test',
                    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Kelloggs Land Test'], check=True)
subprocess.run(['java', '-jar', os.path.join(bt, 'lib', 'apksigner.jar'), 'sign', '--ks', ks, '--ks-pass', 'pass:kelloggs',
                '--out', out, aligned], check=True)
os.remove(tmp); os.remove(aligned)
print(out, len(names), 'game files:', ', '.join(names))
