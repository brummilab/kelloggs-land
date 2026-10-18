#!/usr/bin/env node
// Startet START.EXE im Interpreter (ohne Browser) und speichert Bilder als PNG.
//
//   node tools/run.mjs <spielordner> [--seconds 20] [--shots 1,3,5] [--out out/]
//                      [--keys 6:enter,8:space] [--verbose]
//
// Der Spielordner muss START.EXE und PCKELL.DAT enthalten (eigene Kopie).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Machine } from '../web/machine.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const dir = argv[0];
if (!dir || dir.startsWith('--')) { console.error('Aufruf: node tools/run.mjs <spielordner> [--seconds N] [--shots t1,t2] [--keys t:taste]'); process.exit(1); }
const seconds = +opt('seconds', 15);
const shots = opt('shots', '').split(',').filter(Boolean).map(Number);
const outDir = opt('out', 'out');
const KEYS = { enter: 0x1c, space: 0x39, esc: 0x01, up: 0x48, down: 0x50, left: 0x4b, right: 0x4d, ctrl: 0x1d, alt: 0x38, y: 0x15, j: 0x24, n: 0x31, 1: 0x02, 2: 0x03 };
const keys = opt('keys', '').split(',').filter(Boolean).map((s) => { const [t, k] = s.split(':'); return { t: +t, scan: KEYS[k] ?? parseInt(k, 16) }; });

const files = {};
for (const f of fs.readdirSync(dir)) {
  const p = path.join(dir, f);
  if (fs.statSync(p).isFile()) files[f.toUpperCase()] = new Uint8Array(fs.readFileSync(p));
}
fs.mkdirSync(outDir, { recursive: true });

const t0 = Date.now();
// Ton mitschneiden (--wav datei.wav): Proben auf 44,1 kHz umrechnen
const wavOut = opt('wav', null);
const audio = []; let audioPhase = 0;
function onSamples(buf, rate) {
  if (!wavOut) return;
  const step = rate / 44100;
  for (; audioPhase < buf.length - 1; audioPhase += step) {
    const i = Math.floor(audioPhase), f = audioPhase - i;
    audio.push(buf[i] * (1 - f) + buf[i + 1] * f);
  }
  audioPhase -= buf.length - 1;
}
function writeWav(file) {
  const n = audio.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(audio[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
  console.log(`Ton -> ${file} (${(n / 44100).toFixed(1)} s)`);
}
const m = new Machine({ files, onSamples, sound: !argv.includes('--nosound'), log: (s) => console.log(`[${m.time.toFixed(2)}s] ${s}`) });
m.verbose = argv.includes('--verbose');
m.load();

// Auf 4:3 (640x480) skalieren, wie ein Röhrenmonitor es anzeigt (außer mit --raw)
function to43(img) {
  if (argv.includes('--raw')) return img;
  const W = 640, H = 480, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y * img.height / H);
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x * img.width / W), s = (sy * img.width + sx) * 4, d = (y * W + x) * 4;
      out[d] = img.rgba[s]; out[d + 1] = img.rgba[s + 1]; out[d + 2] = img.rgba[s + 2]; out[d + 3] = 255;
    }
  }
  return { width: W, height: H, rgba: out };
}

function png(file, img) {
  const { width, height, rgba } = to43(img);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const events = [...shots.map((t) => ({ t, shot: true })), ...keys, ...keys.map((k) => ({ t: k.t + 0.15, scan: k.scan, up: true }))].sort((a, b) => a.t - b.t);
let err = null;
try {
  for (const e of events) {
    if (e.t > m.time) m.run(e.t - m.time);
    if (m.exitCode !== null) break;
    if (e.shot) { const f = path.join(outDir, `frame_${e.t.toFixed(1)}s.png`); png(f, m.frame()); console.log(`Bild -> ${f} (${m.vga.geometry().width}x${m.vga.geometry().height}, Modus ${m.vga.mode.toString(16)}h)`); }
    else if (e.up) m.keyUp(e.scan);
    else { m.keyDown(e.scan); console.log(`[${m.time.toFixed(2)}s] Taste ${e.scan.toString(16)}`); }
  }
  if (m.exitCode === null && seconds > m.time) m.run(seconds - m.time);
} catch (e) { err = e; }

const c = m.cpu;
console.log(`\n${c.icount.toLocaleString('de-AT')} Befehle, ${m.time.toFixed(2)} s virtuell, ${((Date.now() - t0) / 1000).toFixed(1)} s echt`);
console.log('Aufrufe:', [...m.stats.entries()].sort().map(([k, v]) => `${k}=${v}`).join('  '));
png(path.join(outDir, 'last.png'), m.frame());
m.sb.flush();
if (wavOut) writeWav(wavOut);
console.log('DSP-Befehle:', [...m.sb.commands.entries()].map(([k, v]) => `${k.toString(16)}h=${v}`).join(' '));
if (err) {
  console.log('\nFEHLER: ' + err.message);
  console.log(c.dumpRegs());
  console.log('Letzte Befehle: ' + c.lastTrace(24));
  if (!(err.name === 'CpuError' || err.constructor.name === 'CpuError')) console.log(err.stack);
  process.exitCode = 1;
}
