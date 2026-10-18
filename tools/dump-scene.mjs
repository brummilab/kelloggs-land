#!/usr/bin/env node
// Liest Kamera, Kartenbreite und Sprite-Liste live aus dem Speicher (Level 1, Ablauf wie README).
//   node tools/dump-scene.mjs <spielordner>
// Adressen gelten für START.EXE mit 147 200 Bytes (deutsche Version), siehe docs/GRAFIK.md.
import fs from 'node:fs';
import { Machine } from '../web/machine.js';
const dir = process.argv[2] || 'game'; const files = {};
for (const f of fs.readdirSync(dir)) files[f.toUpperCase()] = new Uint8Array(fs.readFileSync(dir + '/' + f));
const m = new Machine({ files, log: () => {} }); m.load(); const c = m.cpu;
const keys = [[30,0x39],[40,0x1c],[50,0x1c],[60,0x39],[72,0x1c],[80,0x1c],[85,0x39]];
for (const [t,k] of keys) { m.run(t - m.time); m.keyDown(k); m.run(0.15); m.keyUp(k); }
m.run(88 - m.time);
const ds = m.selBase(m.segSel[6]);
const w = (o) => c.rw(ds + o), s16 = (v) => (v << 16) >> 16;
const far = (o) => m.selBase(w(o + 2)) + w(o);
const dump = (label) => {
  const n = w(0xc188), list = far(0xb59a), fr = far(0xb59e);
  const sprites = [];
  for (let i = 0; i < n; i++) { const e = list + i * 8; const x = s16(c.rw(e)), y = s16(c.rw(e + 2)), f = c.rw(e + 4), fl = c.rw(e + 6);
    const idx = s16(w(0xb5a2 + (f & 0x0fff) * 2)); const d = fr + idx * 0x2c;
    sprites.push(`${f.toString(16)}@(${x},${y})${idx >= 0 ? ` ${c.rw(d)}x${c.rw(d+2)}` : ''}${fl & 0xff ? ' aus' : ''}`); }
  console.log(`${label} t=${m.time.toFixed(2)} Kamera=(${s16(w(0xc1b0))},${s16(w(0xc1b4))}) Ref=(${s16(w(0xc1c8))},${s16(w(0xc1cc))}) Grenzen=${[0x73f0,0x73f2,0x73f4,0x73f6].map(o=>s16(w(o))).join(",")} Karte=${w(0xb58c)/2} Kacheln/Zeile, ${n} Sprites: ${sprites.join('  ')}`);
};
// direkt vor dem Sprite-Zeichnen anhalten: Eintritt in seg3:b073
const target = `${m.segSel[3]}:${0xb073}`; let pending = 0;
const step = c.step.bind(c); c.step = () => { if (pending && `${c.sreg[1]}:${c.ip}` === target) { pending--; dump(pending ? 'stehen' : 'laufen'); } return step(); };
pending = 1; m.run(0.1);
m.keyDown(0x4d); m.run(1.5); pending = 1; m.run(0.1); m.keyUp(0x4d);
m.run(0.5); pending = 1; m.run(0.1);
