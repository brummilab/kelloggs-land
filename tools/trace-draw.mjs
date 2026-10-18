#!/usr/bin/env node
// Findet die Zeichenroutinen: spielt ins erste Level und protokolliert, welcher Code
// in den VGA-Speicher schreibt und wer diese Routinen aufruft.
//
//   node tools/trace-draw.mjs <spielordner> [functions.json aus Ghidra] [--seconds 4]
//
// Ausgabe: JSON mit Schreibstellen (NE-Segment:Offset, Ghidra-Funktion, Anzahl Bytes)
// und den Aufrufern der wichtigsten Routinen.

import fs from 'node:fs';
import path from 'node:path';
import { Machine } from '../web/machine.js';

const argv = process.argv.slice(2);
const dir = argv[0];
const fnFile = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
const secs = +(argv[argv.indexOf('--seconds') + 1] || 4);
const files = {};
for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isFile()) files[f.toUpperCase()] = new Uint8Array(fs.readFileSync(p)); }

const m = new Machine({ files, log: () => {} });
m.load();
const c = m.cpu;

// Selektor -> NE-Segment (Code-Selektor und sein Daten-Alias)
const selSeg = new Map();
m.segSel.forEach((s, i) => { if (i) { selSeg.set(s, i); selSeg.set(s + 8, i); } });
// Ghidra-Funktionen je Segment, sortiert nach Offset
const fns = {};
if (fnFile) for (const f of JSON.parse(fs.readFileSync(fnFile, 'utf8'))) {
  const seg = +f.block.replace(/\D/g, ''); if (!seg) continue;
  (fns[seg] ||= []).push({ name: f.name, off: parseInt(f.off, 16), size: f.size });
}
Object.values(fns).forEach((a) => a.sort((x, y) => x.off - y.off));
const fnAt = (seg, off) => { const a = fns[seg] || []; let best = null; for (const f of a) { if (f.off <= off) best = f; else break; } return best && off < best.off + best.size + 64 ? best.name : null; };
const where = (sel, off) => { const seg = selSeg.get(sel); return seg ? { seg, off, fn: fnAt(seg, off) } : { sel, off, fn: 'Laufzeitcode (BOB?)' }; };

// Bis ins Level spielen (Ablauf wie im README)
const keys = [[30, 0x39], [40, 0x1c], [50, 0x1c], [60, 0x39], [72, 0x1c], [80, 0x1c], [85, 0x39]];
for (const [t, k] of keys) { m.run(t - m.time); m.keyDown(k); m.run(0.15); m.keyUp(k); }
m.run(88 - m.time);
m.keyDown(0x4d); // nach rechts laufen, damit gescrollt wird

// Schreibzugriffe auf A0000–AFFFF zählen
const writes = new Map();
const vw = m.vgaWrite.bind(m);
m.vgaWrite = (a, v) => {
  if (a < 0xb0000) { const k = `${c.sreg[1]}:${c.startIp}`; writes.set(k, (writes.get(k) || 0) + 1); }
  return vw(a, v);
};
const t0 = m.time;
m.run(secs);
m.keyUp(0x4d);
m.vgaWrite = vw;

// Nach Funktion zusammenfassen
const byFn = new Map();
for (const [k, n] of writes) {
  const [sel, ip] = k.split(':').map(Number);
  const w = where(sel, ip);
  const key = w.seg ? `seg${w.seg} ${w.fn || '?'}` : `sel ${sel.toString(16)} ${w.fn}`;
  const e = byFn.get(key) || { key, bytes: 0, sites: new Set() };
  e.bytes += n; e.sites.add(w.seg ? `${w.seg}:${ip.toString(16)}` : `${sel.toString(16)}:${ip.toString(16)}`);
  byFn.set(key, e);
}
const top = [...byFn.values()].sort((a, b) => b.bytes - a.bytes);
const frames = secs * 70;
console.log(`VGA-Schreibzugriffe in ${secs} s Level (≈${frames} Bilder):`);
for (const e of top.slice(0, 20)) console.log(`  ${String(e.bytes).padStart(9)} Bytes  (${(e.bytes / frames).toFixed(0).padStart(6)}/Bild)  ${e.key}  [${[...e.sites].slice(0, 6).join(' ')}${e.sites.size > 6 ? ' …' : ''}]`);

// Aufrufer der Top-Routinen: beim Eintritt die Rücksprungadresse vom Stack lesen
const targets = new Map();
for (const e of top.slice(0, 8)) {
  const [segStr, name] = e.key.split(' ');
  if (!segStr.startsWith('seg')) continue;
  const seg = +segStr.slice(3); const f = (fns[seg] || []).find((x) => x.name === name);
  if (f) targets.set(`${m.segSel[seg]}:${f.off}`, { key: e.key, callers: new Map() });
}
const step = c.step.bind(c);
c.step = () => {
  const t = targets.get(`${c.sreg[1]}:${c.ip}`);
  if (t) {
    const sp = c.sbase[2] + c.sp;
    const near = c.rw(sp), farSel = c.rw(sp + 2);
    const k = selSeg.has(farSel) ? JSON.stringify(where(farSel, near)) : JSON.stringify(where(c.sreg[1], near));
    t.callers.set(k, (t.callers.get(k) || 0) + 1);
  }
  return step();
};
m.keyDown(0x4d); m.run(1); m.keyUp(0x4d);
c.step = step;
console.log('\nAufrufer (1 s):');
for (const t of targets.values()) {
  console.log(`  ${t.key}`);
  for (const [k, n] of [...t.callers].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`      ${n}× von ${k}`);
}
const v = m.vga, h = (a) => [...a].map((x) => x.toString(16).padStart(2, '0')).join(' ');
console.log(`\nVGA: seq ${h(v.seq.slice(0, 5))} gc ${h(v.gc.slice(0, 9))} | ${JSON.stringify(v.geometry())}`);
