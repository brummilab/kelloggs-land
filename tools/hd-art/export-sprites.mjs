// Exports every sprite frame of the game (as colour indices + opacity) from your own game copy: starts
// level 1 and lets the game draw each frame off screen (web/scene.js renderOffscreen). Scratch output.
//   node tools/hd-art/export-sprites.mjs <game folder> sprites.json [frames to try, default 1200]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { Machine } = await import(path.join(root, 'web', 'machine.js'));
const { sceneFor } = await import(path.join(root, 'web', 'scene.js'));
const dir = process.argv[2], files = {};
for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isFile()) files[f.toUpperCase()] = new Uint8Array(fs.readFileSync(p)); }
const m = new Machine({ files, log: () => {} }); m.load(); const sc = sceneFor(m);
// through the title and menus into level 1 (space / enter at fixed times)
const keys = [[30, 0x39], [40, 0x1c], [50, 0x1c], [60, 0x39], [72, 0x1c], [80, 0x1c], [85, 0x39]];
for (const [t, k] of keys) { m.run(t - m.time); m.keyDown(k); m.run(0.15); m.keyUp(k); }
m.run(90 - m.time); sc.compose();
const N = +process.argv[4] || 1200;
for (let k = 0; k < N; k++) sc.renderOffscreen(k);
const g = sc.exportGfx();
const pal = [...new Uint32Array(g.pal.buffer)];
const sprites = [...sc.sprites].map(([k, img]) => ({ k, w: img.w, h: img.h, hx: img.hx, hy: img.hy, idx: [...img.idx], alpha: [...img.alpha].map(a => a ? 1 : 0) }));
fs.writeFileSync(process.argv[3], JSON.stringify({ pal, sprites }));
console.log(sprites.length, 'sprite frames');
