#!/usr/bin/env node
// Prüft den Breitbild-Renderer: spielt ins Level 1, setzt Szenen zusammen und vergleicht
// die Mitte pixelgenau mit dem Originalbild des Emulators.
//   node tools/hd-test.mjs <spielordner> <ausgabeordner>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Machine } from '../web/machine.js';
import { sceneFor } from '../web/scene.js';

const [dir, out = 'out'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const files = {};
for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isFile()) files[f.toUpperCase()] = new Uint8Array(fs.readFileSync(p)); }
const m = new Machine({ files, log: () => {} });
m.load();
const sc = sceneFor(m);
if (!sc) { console.log('START.EXE-Version wird vom Breitbild-Renderer nicht unterstützt'); process.exit(1); }

function png(file, { width, height, rgba }, sx = 2, sy = 2.4) {
  const W = Math.round(width * sx), H = Math.round(height * sy), raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { const yy = Math.floor(y / sy); raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) { const s = (yy * width + Math.floor(x / sx)) * 4, d = y * (W * 4 + 1) + 1 + x * 4; raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]; raw[d + 3] = 255; } }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const keys = [[30, 0x39], [40, 0x1c], [50, 0x1c], [60, 0x39], [72, 0x1c], [80, 0x1c], [85, 0x39]];
for (const [t, k] of keys) { m.run(t - m.time); m.keyDown(k); m.run(0.15); m.keyUp(k); }
m.run(88 - m.time);
const shots = [[0, 'stand'], [1.5, 'lauf'], [3, 'lauf2']];
m.keyDown(0x4d);
for (const [dt, name] of shots) {
  m.run(dt ? dt - (m.time - 88) : 0.05);
  const hd = sc.compose();
  const orig = m.vga.last;
  if (!hd) { console.log(name, 'keine Szene'); continue; }
  // Vergleich der Mitte (Spielfeld) mit dem Original
  let diff = 0, total = 0;
  const o32 = new Uint32Array(orig.rgba.buffer), h32 = new Uint32Array(hd.rgba.buffer), ex = (hd.width - 320) / 2;
  for (let y = 0; y < hd.playRows; y++) for (let x = 0; x < 320; x++) { total++; if (o32[y * 320 + x] !== h32[y * hd.width + x + ex]) diff++; }
  console.log(`${name}: Kamera (${sc.frame.camX},${sc.frame.camY}), ${sc.frame.sprites.length} Sprites, ${sc.sprites.size} Sprite-Bilder im Cache, Abweichung Mitte ${(diff / total * 100).toFixed(2)} %`);
  png(path.join(out, `hd_${name}.png`), hd);
  png(path.join(out, `orig_${name}.png`), orig);
}
m.keyUp(0x4d);
// Im Stand nach dem Einblenden: Mitte muss pixelgleich sein
m.run(1.5);
{
  const t0 = performance.now(); let hd; for (let i = 0; i < 20; i++) hd = sc.compose(); const ms = (performance.now() - t0) / 20;
  const orig = m.vga.last, o32 = new Uint32Array(orig.rgba.buffer), h32 = new Uint32Array(hd.rgba.buffer), ex = (hd.width - 320) / 2;
  let diff = 0, total = 0;
  for (let y = 0; y < hd.playRows; y++) for (let x = 0; x < 320; x++) { total++; if (o32[y * 320 + x] !== h32[y * hd.width + x + ex]) diff++; }
  console.log(`ruhig: Kamera (${sc.frame.camX},${sc.frame.camY}), Abweichung Mitte ${(diff / total * 100).toFixed(2)} %, Komposition ${ms.toFixed(2)} ms/Bild`);
  png(path.join(out, 'hd_ruhig.png'), hd); png(path.join(out, 'orig_ruhig.png'), orig);
}
