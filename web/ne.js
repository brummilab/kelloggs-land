// NE-Loader für START.EXE (16-Bit Protected Mode, Borland Pascal 7 / RTM).
// Läuft in Node und im Browser (ES-Modul, nur Uint8Array/DataView).

export function parseNE(bytes) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const u8 = (o) => d[o], u16 = (o) => v.getUint16(o, true), u32 = (o) => v.getUint32(o, true);
  if (u16(0) !== 0x5a4d) throw new Error('keine MZ-Datei');
  const ne = u32(0x3c);
  if (u16(ne) !== 0x454e) throw new Error('kein NE-Header');

  const segCount = u16(ne + 0x1c), modCount = u16(ne + 0x1e);
  const segTab = ne + u16(ne + 0x22), modRef = ne + u16(ne + 0x28), impNames = ne + u16(ne + 0x2a);
  const entryTab = ne + u16(ne + 0x04), align = u16(ne + 0x32);
  const str = (o) => String.fromCharCode(...d.subarray(o + 1, o + 1 + d[o]));
  const modules = [];
  for (let i = 0; i < modCount; i++) modules.push(str(impNames + u16(modRef + i * 2)));

  const segments = [];
  for (let s = 0; s < segCount; s++) {
    const e = segTab + s * 8;
    const off = u16(e), len = u16(e + 2), flags = u16(e + 4), minAlloc = u16(e + 6);
    const fileOff = off << align;
    const size = off ? (len || 0x10000) : 0;
    const alloc = Math.max(size, minAlloc || 0x10000);
    const seg = { nr: s + 1, data: !!(flags & 1), flags, size, alloc, bytes: new Uint8Array(alloc), relocs: [] };
    if (off) seg.bytes.set(d.subarray(fileOff, fileOff + size));
    if (off && (flags & 0x100)) {
      const r = fileOff + size, n = u16(r);
      for (let k = 0; k < n; k++) {
        const p = r + 2 + k * 8;
        const src = u8(p), fl = u8(p + 1), at = u16(p + 2), a = u16(p + 4), b = u16(p + 6);
        const rel = { src, additive: !!(fl & 4), kind: fl & 3, at };
        if (rel.kind === 0) { rel.seg = a & 0xff; rel.off = b; }
        else if (rel.kind === 1) { rel.module = modules[a - 1]; rel.ordinal = b; }
        else if (rel.kind === 2) { rel.module = modules[a - 1]; rel.name = str(impNames + b); }
        else { rel.osType = a; }
        seg.relocs.push(rel);
      }
    }
    segments.push(seg);
  }

  // Einträge der Entry-Tabelle (für Referenzen auf "movable" Segmente, seg=0xFF)
  const entries = [null];
  for (let p = entryTab;;) {
    const cnt = u8(p), type = u8(p + 1); p += 2;
    if (!cnt) break;
    for (let i = 0; i < cnt; i++) {
      if (type === 0) entries.push(null);
      else if (type === 0xff) { entries.push({ seg: u8(p + 3), off: u16(p + 4) }); p += 6; }
      else { entries.push({ seg: type, off: u16(p + 1) }); p += 3; }
    }
    if (type === 0) continue;
  }

  return {
    segments, modules, entries,
    autoData: u16(ne + 0x0e),
    heapSize: u16(ne + 0x10), stackSize: u16(ne + 0x12),
    entry: { seg: u16(ne + 0x16), ip: u16(ne + 0x14) },
    stack: { seg: u16(ne + 0x1a), sp: u16(ne + 0x18) },
  };
}

// Relocations anwenden. resolve(rel) liefert {sel, off} für das Ziel.
// Behandelt Ketten (nicht-additiv: das Wort an der Stelle zeigt auf die nächste Stelle, 0xFFFF = Ende).
export function applyRelocs(seg, resolve) {
  const b = seg.bytes;
  const rw = (o) => b[o] | (b[o + 1] << 8);
  const ww = (o, x) => { b[o] = x & 0xff; b[o + 1] = (x >> 8) & 0xff; };
  for (const rel of seg.relocs) {
    if (rel.kind === 3) continue; // OS-Fixups (FPU-Emulation) – ignoriert
    const t = resolve(rel);
    let at = rel.at;
    for (let guard = 0; guard < 0x10000; guard++) {
      const next = rw(at);
      switch (rel.src) {
        case 0: b[at] = (rel.additive ? b[at] : 0) + (t.off & 0xff); break;
        case 2: ww(at, (rel.additive ? next : 0) + t.sel); break;
        case 3: ww(at, (rel.additive ? next : 0) + t.off); ww(at + 2, t.sel); break;
        case 5: ww(at, (rel.additive ? next : 0) + t.off); break;
        default: throw new Error(`Relocation-Typ ${rel.src} nicht unterstützt (seg${seg.nr}:${at.toString(16)})`);
      }
      if (rel.additive || next === 0xffff || rel.src === 0) break;
      at = next;
    }
  }
}
