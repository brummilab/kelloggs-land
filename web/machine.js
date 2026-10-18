// Emulierter PC für START.EXE: Speicher, Selektoren (LDT), KERNEL/RTM-Importe,
// DOS (INT 21h), DPMI (INT 31h), BIOS (INT 10h/16h/1Ah), PIC, PIT, Tastatur, VGA.
// Läuft in Node und im Browser.

import { CPU, CpuError, ES, CS, SS, DS } from './cpu.js';
import { parseNE, applyRelocs } from './ne.js';
import { VGA } from './vga.js';
import { PIT, PIT_HZ } from './pit.js';

const MEM_SIZE = 32 << 20;
const DOS_TOP = 0xa0000;        // konventioneller Speicher endet hier
const EXT_START = 0x110000;     // erweiterter Speicher ab 1 MB + 64 KB
const IPS = 15_000_000;         // virtuelle Befehle pro Sekunde

export class Machine {
  constructor({ files, log = () => {}, args = '' }) {
    this.files = new Map();
    for (const [k, v] of Object.entries(files)) this.files.set(k.toUpperCase(), v);
    this.log = log;
    this.mem = new Uint8Array(MEM_SIZE);
    this.vga = new VGA(this.mem);
    this.cpu = new CPU(this);
    this.desc = [null];          // LDT: Index -> {base, limit, access}
    this.thunks = [];            // id -> Handler
    this.pmVec = new Array(256).fill(null);
    this.rmVec = new Array(256).fill(null);
    this.excVec = new Array(32).fill(null);
    this.handles = [null, null, null, null, null];
    this.stats = new Map();
    this.warned = new Set();
    this.keyQueue = [];          // Scancodes, die noch per IRQ1 kommen
    this.biosKeys = [];          // [scan, ascii] für INT 16h
    this.port60 = 0;
    this.picMask = 0; this.picIsr = 0;
    this.nextTick = 65536 / PIT_HZ; this.ticks = 0; this.port61 = 0;
    this.pit = new PIT((t) => { this.nextTick = t + this.pit.period(0); });
    this.exitCode = null;
    this.dosNext = 0x1000;       // nächstes freies Paragraph-Segment unter 640 KB
    this.extFree = [{ base: EXT_START, size: MEM_SIZE - EXT_START }];
    this.sb = { reset: 0, out: [], cmd: null, args: [] };
    this.sbBase = 0x220;
    this.args = args;
  }

  // ---------- Statistik / Logging ----------
  count(key) { this.stats.set(key, (this.stats.get(key) || 0) + 1); }
  warnOnce(key, msg) { if (!this.warned.has(key)) { this.warned.add(key); this.log('WARN ' + msg); } }
  get time() { return this.cpu.icount / IPS; }

  // ---------- Selektoren ----------
  allocSel(base, limit, access = 0xf2) {
    const idx = this.desc.length;
    this.desc.push({ base, limit, access });
    return (idx << 3) | 7;
  }
  allocSels(n) {
    const first = this.desc.length;
    for (let i = 0; i < n; i++) this.desc.push({ base: 0, limit: 0, access: 0xf2 });
    return (first << 3) | 7;
  }
  d(sel) { return this.desc[sel >> 3]; }
  selBase(sel) { if ((sel & 0xfffc) === 0) return undefined; const d = this.desc[sel >> 3]; return d ? d.base : undefined; }
  selLimit(sel) { const d = this.d(sel); return d ? d.limit : 0; }
  selAccess(sel) { const d = this.d(sel); return d ? (d.access << 8) : 0; }
  lin(sel, off) { const b = this.selBase(sel); if (b === undefined) throw new CpuError(`Zeiger mit ungültigem Selektor ${sel.toString(16)}`); return b + off; }

  // Block im erweiterten Speicher (first fit)
  extAlloc(size) {
    size = (size + 15) & ~15;
    for (let i = 0; i < this.extFree.length; i++) {
      const f = this.extFree[i];
      if (f.size >= size) {
        const base = f.base; f.base += size; f.size -= size;
        if (!f.size) this.extFree.splice(i, 1);
        this.mem.fill(0, base, base + size);
        return base;
      }
    }
    throw new CpuError(`kein Speicher mehr für ${size} Bytes`);
  }
  extFreeBlock(base, size) {
    size = (size + 15) & ~15;
    this.extFree.push({ base, size });
    this.extFree.sort((a, b) => a.base - b.base);
    for (let i = 0; i < this.extFree.length - 1;) {
      const a = this.extFree[i], b = this.extFree[i + 1];
      if (a.base + a.size === b.base) { a.size += b.size; this.extFree.splice(i + 1, 1); } else i++;
    }
  }
  // Großer Block mit Selektor-Kachelung (__AHINCR = 8)
  allocHuge(size) {
    const base = this.extAlloc(Math.max(size, 16));
    const n = Math.max(1, Math.ceil(size / 0x10000));
    const sel = this.allocSels(n);
    for (let i = 0; i < n; i++) {
      const d = this.desc[(sel >> 3) + i];
      d.base = base + i * 0x10000; d.limit = Math.min(0xffff, size - 1 - i * 0x10000) >>> 0; d.size = size; d.tiles = n;
    }
    this.desc[sel >> 3].block = { base, size, n };
    return sel;
  }
  freeHuge(sel) {
    const d = this.d(sel);
    if (!d || !d.block) return false;
    this.extFreeBlock(d.block.base, d.block.size);
    for (let i = 0; i < d.block.n; i++) this.desc[(sel >> 3) + i] = null;
    return true;
  }
  dosAlloc(paras) {
    if (this.dosNext + paras > DOS_TOP >> 4) return null;
    const seg = this.dosNext; this.dosNext += paras;
    this.mem.fill(0, seg << 4, (seg + paras) << 4);
    return seg;
  }

  // ---------- Thunks (F1 id: Sprung nach JavaScript) ----------
  thunk(fn, name) {
    const id = this.thunks.length;
    this.thunks.push({ fn, name });
    const off = id * 4, a = this.thunkBase + off;
    this.mem[a] = 0xf1; this.mem[a + 1] = id & 0xff; this.mem[a + 2] = id >> 8; this.mem[a + 3] = 0xcf;
    return { sel: this.thunkSel, off };
  }
  trap(id) {
    const t = this.thunks[id];
    if (!t) throw new CpuError(`unbekannter Thunk ${id}`);
    t.fn();
  }
  // Pascal-Argumente: arg(0) = zuletzt gepushtes Wort (direkt über der Rücksprungadresse)
  arg(i) { const c = this.cpu; return c.rw(c.sbase[SS] + ((c.sp + 4 + i * 2) & 0xffff)); }
  argD(i) { return (this.arg(i) | (this.arg(i + 1) << 16)) >>> 0; }

  // ---------- Laden ----------
  load() {
    const exe = this.file('START.EXE');
    if (!exe) throw new Error('START.EXE fehlt');
    const ne = this.ne = parseNE(exe);

    // Thunk-Segment
    this.thunkBase = this.extAlloc(0x10000);
    this.thunkSel = this.allocSel(this.thunkBase, 0xffff, 0xfa);

    // feste Selektoren
    const fixed = (base) => this.allocSel(base, 0xffff);
    this.selA000 = fixed(0xa0000); this.selB000 = fixed(0xb0000); this.selB800 = fixed(0xb8000);
    this.sel0040 = this.allocSel(0x400, 0x2ff); this.sel0000 = fixed(0);
    this.selF000 = fixed(0xf0000); this.selC000 = fixed(0xc0000); this.selE000 = fixed(0xe0000); this.selD000 = fixed(0xd0000);
    this.segSelCache = new Map([[0xa000, this.selA000], [0xb000, this.selB000], [0xb800, this.selB800], [0x40, this.sel0040], [0, this.sel0000]]);

    // Segmente laden
    this.segSel = [0];
    for (const s of ne.segments) {
      const base = this.extAlloc(s.alloc);
      s.base = base;
      this.segSel.push(this.allocSel(base, s.alloc - 1, s.data ? 0xf2 : 0xfa));
      // RTM legt hinter jedem Code-Selektor einen Daten-Alias an (CS + __AHINCR), BP7 nutzt das
      if (!s.data) this.allocSel(base, s.alloc - 1, 0xf2);
    }

    // Importe
    const imports = this.buildImports();
    for (const s of ne.segments) {
      applyRelocs(s, (rel) => {
        if (rel.kind === 0) {
          if (rel.seg === 0xff) { const e = ne.entries[rel.off]; return { sel: this.segSel[e.seg], off: e.off }; }
          return { sel: this.segSel[rel.seg], off: rel.off };
        }
        const key = rel.kind === 1 ? `${rel.module}.${rel.ordinal}` : `${rel.module}.${rel.name}`;
        const t = imports[key];
        if (!t) {
          this.warnOnce('imp' + key, `Import ${key} fehlt`);
          return this.thunk(() => { throw new CpuError(`Import ${key} aufgerufen`); }, key);
        }
        return t;
      });
      this.mem.set(s.bytes, s.base);
    }

    // PSP + Umgebung im DOS-Speicher
    const envSeg = this.dosAlloc(16);
    const env = 'PATH=C:\\\0COMSPEC=C:\\COMMAND.COM\0\0\x01\0C:\\KELLOGG\\START.EXE\0';
    for (let i = 0; i < env.length; i++) this.mem[(envSeg << 4) + i] = env.charCodeAt(i);
    const pspSeg = this.dosAlloc(16);
    const psp = pspSeg << 4;
    this.mem[psp] = 0xcd; this.mem[psp + 1] = 0x20;
    this.mem[psp + 2] = 0x00; this.mem[psp + 3] = 0xa0;
    this.pspSel = this.allocSel(psp, 0xff);
    this.envSel = this.allocSel(envSeg << 4, 0xff);
    this.mem[psp + 0x2c] = this.envSel & 0xff; this.mem[psp + 0x2d] = this.envSel >> 8;
    const cmd = this.args ? ' ' + this.args : '';
    this.mem[psp + 0x80] = cmd.length;
    for (let i = 0; i < cmd.length; i++) this.mem[psp + 0x81 + i] = cmd.charCodeAt(i);
    this.mem[psp + 0x81 + cmd.length] = 13;
    this.dta = { sel: this.pspSel, off: 0x80 };

    // BIOS-Datenbereich
    this.mem[0x449] = 3; this.mem[0x44a] = 80; this.mem[0x463] = 0xd4; this.mem[0x464] = 0x03; this.mem[0x484] = 24;

    // Register wie beim Start einer NE-Anwendung
    const c = this.cpu;
    c.loadSeg(CS, this.segSel[ne.entry.seg]); c.ip = ne.entry.ip;
    c.loadSeg(SS, this.segSel[ne.stack.seg]); c.sp = ne.stack.sp || 0xfffe;
    c.loadSeg(DS, this.segSel[ne.autoData]); c.loadSeg(ES, this.pspSel);
    c.bx = ne.stackSize; c.cx = ne.heapSize; c.di = this.segSel[ne.autoData]; c.si = 0; c.ax = 0;
    this.log(`geladen: ${ne.segments.length} Segmente, Start ${c.sreg[CS].toString(16)}:${c.ip.toString(16)}`);
  }

  buildImports() {
    const c = this.cpu, m = this;
    const pas = (name, popBytes, fn) => this.thunk(() => { m.count(name); fn(); c.farRet(popBytes); }, name);
    const konst = (v) => ({ sel: v, off: v });
    return {
      'KERNEL.91': this.thunk(() => { // InitTask (Register-Aufruf)
        m.count('InitTask');
        c.ax = 1; c.cx = m.ne.stackSize; c.dx = 1; c.di = m.segSel[m.ne.autoData]; c.si = 0;
        c.loadSeg(ES, m.pspSel); c.bx = 0x81;
        c.farRet(0);
      }, 'InitTask'),
      'KERNEL.15': pas('GlobalAlloc', 6, () => {
        const size = m.argD(0), flags = m.arg(2);
        const sel = m.allocHuge(size || 1); c.ax = sel; c.dx = 0;
        if (m.verbose) m.log(`GlobalAlloc(${flags.toString(16)}, ${size}) -> ${sel.toString(16)}`);
      }),
      'KERNEL.16': pas('GlobalReAlloc', 8, () => { c.ax = 0; }),
      'KERNEL.17': pas('GlobalFree', 2, () => { m.freeHuge(m.arg(0)); c.ax = 0; }),
      'KERNEL.18': pas('GlobalLock', 2, () => { const h = m.arg(0); c.ax = 0; c.dx = m.d(h) ? h : 0; }),
      'KERNEL.19': pas('GlobalUnlock', 2, () => { c.ax = 0; }),
      'KERNEL.20': pas('GlobalSize', 2, () => { const d = m.d(m.arg(0)); const s = d ? (d.size || d.limit + 1) : 0; c.ax = s & 0xffff; c.dx = s >>> 16; }),
      'KERNEL.184': pas('GlobalDOSAlloc', 4, () => {
        const size = m.argD(0); const paras = (size + 15) >> 4; const seg = m.dosAlloc(paras);
        if (seg === null) { c.ax = 0; c.dx = 0; return; }
        c.ax = m.allocSel(seg << 4, Math.min(0xffff, size - 1)); c.dx = seg;
      }),
      'KERNEL.185': pas('GlobalDOSFree', 2, () => { c.ax = 0; }),
      'KERNEL.171': pas('AllocDStoCSAlias', 2, () => { const d = m.d(m.arg(0)); c.ax = d ? m.allocSel(d.base, d.limit, 0xfa) : 0; }),
      'KERNEL.114': konst(8),                       // __AHINCR
      'KERNEL.113': konst(3),                       // __AHSHIFT
      'KERNEL.174': konst(this.selA000), 'KERNEL.181': konst(this.selB000),
      'KERNEL.182': konst(this.selB800), 'KERNEL.193': konst(this.sel0040),
      'KERNEL.183': konst(this.sel0000), 'KERNEL.194': konst(this.selF000),
      'KERNEL.195': konst(this.selC000), 'KERNEL.190': konst(this.selE000), 'KERNEL.179': konst(this.selD000),
      'RTM.5': pas('MemAllocateBlock', 14, () => { // (Size, Attr, EventProc, var Selector): Integer
        const size = m.argD(5), attr = m.arg(4);
        const sel = m.allocHuge(size || 1);
        const p = m.lin(m.arg(1), m.arg(0)); c.ww(p, sel);
        if (m.verbose) m.log(`MemAllocateBlock(${size}, attr ${attr}) -> ${sel.toString(16)}`);
        c.ax = 0;
      }),
      'RTM.6': pas('MemFreeBlock', 2, () => { m.freeHuge(m.arg(0)); c.ax = 0; }),
      'RTM.21': pas('MemQueryFreeMem', 4, () => {
        const free = m.extFree.reduce((a, f) => a + f.size, 0); const big = Math.min(free, 16 << 20);
        c.ax = big & 0xffff; c.dx = big >>> 16;
      }),
    };
  }

  file(name) {
    const n = name.toUpperCase().replace(/\//g, '\\');
    if (this.files.has(n)) return this.files.get(n);
    const base = n.split('\\').pop();
    return this.files.get(base);
  }

  // ---------- Interrupts ----------
  interrupt(n) {
    const v = this.pmVec[n];
    if (v) { this.cpu.intCall(v.sel, v.off); return; }
    this.defaultInt(n);
  }
  exception(n) {
    throw new CpuError(`CPU-Ausnahme ${n} bei ${this.cpu.sreg[CS].toString(16)}:${this.cpu.startIp.toString(16)}`);
  }
  defaultThunk(n) {
    if (!this.defThunks) this.defThunks = [];
    if (!this.defThunks[n]) {
      this.defThunks[n] = this.thunk(() => {
        const c = this.cpu;
        this.defaultInt(n);
        // Ergebnis-Flags in die gestapelten Flags übernehmen (für Software-Interrupts)
        const a = c.sbase[SS] + ((c.sp + 4) & 0xffff);
        if (n < 8 || n > 0x0f) { const st = c.rw(a); c.ww(a, (st & ~0x8d5) | (c.flags & 0x8d5)); }
        c.iret();
      }, `default INT ${n.toString(16)}`);
    }
    return this.defThunks[n];
  }
  defaultInt(n) {
    const c = this.cpu;
    switch (n) {
      case 0x21: return this.int21();
      case 0x31: return this.int31();
      case 0x10: return this.int10();
      case 0x16: return this.int16();
      case 0x1a: { this.count('INT 1A'); if (c.ah === 0) { c.cx = this.ticks >>> 16; c.dx = this.ticks & 0xffff; c.al = 0; } return; }
      case 0x08: this.ticks = (this.ticks + 1) >>> 0; this.mem[0x46c] = this.ticks & 0xff; this.mem[0x46d] = (this.ticks >> 8) & 0xff; this.mem[0x46e] = (this.ticks >> 16) & 0xff; this.eoi(0); return;
      case 0x09: this.biosKey(this.port60); this.eoi(1); return;
      case 0x1c: return;
      case 0x33: this.count('INT 33 ' + c.ax.toString(16)); if (c.ax === 0) c.ax = 0; return;
      case 0x2f: this.count('INT 2F ' + c.ax.toString(16)); return;
      case 0x15: c.cf = 1; c.ah = 0x86; return;
      case 0x11: c.ax = 0x0026; return;
      case 0x12: c.ax = 640; return;
      case 0x0a: case 0x0b: case 0x0c: case 0x0d: case 0x0e: case 0x0f: this.eoi(n - 8); return;
      case 0x00: throw new CpuError('Division durch Null');
      case 0x23: case 0x24: case 0x1b: return;
    }
    this.warnOnce('int' + n, `INT ${n.toString(16)} (AX=${c.ax.toString(16)}) nicht implementiert`);
  }

  // ---------- PIC / IRQ ----------
  eoi(irq) { if (irq === undefined) { for (let i = 0; i < 8; i++) if (this.picIsr & (1 << i)) { this.picIsr &= ~(1 << i); return; } } else this.picIsr &= ~(1 << irq); }
  raiseIrq(irq) {
    const c = this.cpu;
    if (!c.iflag || (this.picMask & (1 << irq)) || (this.picIsr & ((1 << (irq + 1)) - 1))) return false;
    this.picIsr |= 1 << irq;
    const n = 8 + irq, v = this.pmVec[n];
    c.halted = false;
    if (v) c.intCall(v.sel, v.off); else this.defaultInt(n);
    return true;
  }

  // ---------- Tastatur ----------
  keyDown(scan) { this.keyQueue.push(scan); }
  keyUp(scan) { this.keyQueue.push(scan | 0x80); }
  pressKey(scan) { this.keyDown(scan); this.keyUp(scan); }
  biosKey(code) {
    if (code & 0x80) return;
    const ascii = SCAN_ASCII[code] || 0;
    this.biosKeys.push([code, ascii]);
  }

  // ---------- Hauptschleife ----------
  run(seconds) {
    const c = this.cpu;
    const end = this.time + seconds;
    while (this.time < end && this.exitCode === null) {
      // bis zum nächsten Timer-Ereignis laufen (genau genug für Raster-Timing)
      const slice = Math.max(1, Math.min(2000, Math.ceil((this.nextTick - this.time) * IPS)));
      if (c.halted) c.icount += slice; else c.run(slice);
      const t = this.time;
      if (t >= this.nextTick) {
        if (this.raiseIrq(0)) {
          this.nextTick += this.pit.period(0);
          if (this.nextTick < t - 0.2) this.nextTick = t + this.pit.period(0);
        } else if (t - this.nextTick > 0.2) this.nextTick = t; // IRQ verloren
      }
      if (this.keyQueue.length && !(this.picIsr & 2) && t >= (this.nextKey || 0)) {
        this.port60 = this.keyQueue[0];
        if (this.raiseIrq(1)) { this.keyQueue.shift(); this.nextKey = t + 0.02; }
      }
    }
  }

  // ---------- Ports ----------
  inb(p) {
    if (p >= 0x3c0 && p <= 0x3df) {
      if (p === 0x3da) return this.vga.status(this.time);
      return this.vga.inb(p);
    }
    switch (p) {
      case 0x60: return this.port60;
      case 0x64: return this.keyQueue.length ? 0x1d : 0x1c;
      case 0x21: return this.picMask;
      case 0x20: return this.picIsr;
      case 0x40: case 0x41: case 0x42: return this.pit.read(p - 0x40, this.time);
      case 0x61: return (this.port61 & 0x0f) | (this.pit.out2(this.time) << 5);
      case 0x201: return 0xff;
    }
    if (p >= this.sbBase && p < this.sbBase + 0x10) return this.sbIn(p - this.sbBase);
    this.warnOnce('in' + p, `IN ${p.toString(16)}`);
    return 0xff;
  }
  outb(p, v) {
    if (p >= 0x3b0 && p <= 0x3df) return this.vga.outb(p, v);
    switch (p) {
      case 0x20: if (v === 0x20) this.eoi(); return;
      case 0x21: this.picMask = v; return;
      case 0xa0: case 0xa1: return;
      case 0x43: this.pit.control(v, this.time); return;
      case 0x40: case 0x41: case 0x42: this.pit.write(p - 0x40, v, this.time); return;
      case 0x61: this.port61 = v; this.pit.setGate2(v & 1, this.time); return;
    }
    if (p >= this.sbBase && p < this.sbBase + 0x10) return this.sbOut(p - this.sbBase, v);
    if (p >= 0x388 && p <= 0x389) return;
    this.warnOnce('out' + p, `OUT ${p.toString(16)}, ${v.toString(16)}`);
  }
  outw(p, v) { this.outb(p, v & 0xff); this.outb(p + 1, v >> 8); }
  vgaRead(a) { return this.vga.read(a); }
  vgaWrite(a, v) { this.vga.write(a, v); }

  // Minimaler Sound Blaster (DSP) – Ton folgt in Phase 5
  sbIn(o) {
    if (o === 0xa) return this.sb.out.length ? this.sb.out.shift() : 0xff;
    if (o === 0xe) return this.sb.out.length ? 0xff : 0x7f;
    if (o === 0xc) return 0x7f;
    return 0xff;
  }
  sbOut(o, v) {
    if (o === 6) { if (v === 1) this.sb.reset = 1; else if (this.sb.reset) { this.sb.reset = 0; this.sb.out = [0xaa]; } return; }
    if (o === 0xc) {
      this.count('SB DSP ' + v.toString(16));
      if (this.sb.need) { this.sb.args.push(v); if (--this.sb.need === 0) this.sbCmd(); return; }
      this.sb.cmd = v; this.sb.args = [];
      const need = { 0x10: 1, 0x14: 2, 0x40: 1, 0x48: 2, 0x1c: 0, 0x90: 0, 0x91: 0, 0xe1: 0, 0xd1: 0, 0xd3: 0, 0xd0: 0, 0xd4: 0, 0xda: 0, 0xe0: 1, 0xf2: 0 }[v];
      this.sb.need = need || 0;
      if (!this.sb.need) this.sbCmd();
    }
  }
  sbCmd() {
    const s = this.sb;
    if (s.cmd === 0xe1) s.out.push(2, 1);
    else if (s.cmd === 0xe0) s.out.push(~s.args[0] & 0xff);
    else if (s.cmd === 0xf2) { this.sbIrqPending = true; }
    else if (s.cmd === 0x14 || s.cmd === 0x1c) { this.sbDmaLen = s.args.length ? (s.args[0] | (s.args[1] << 8)) + 1 : this.sbDmaLen; this.sbIrqAt = this.time + (this.sbDmaLen || 1) / 11025; }
  }

  // ---------- INT 10h ----------
  int10() {
    const c = this.cpu;
    this.count('INT 10 ' + c.ah.toString(16));
    switch (c.ah) {
      case 0x00: this.vga.setMode(c.al & 0x7f); this.mem[0x449] = c.al & 0x7f; this.log(`Videomodus ${c.al.toString(16)}h`); return;
      case 0x0f: c.al = this.mem[0x449]; c.ah = 80; c.bh = 0; return;
      case 0x10:
        if (c.al === 0x12) { const p = this.lin(c.sreg[ES], c.dx); for (let i = 0; i < c.cx; i++) for (let k = 0; k < 3; k++) this.vga.dac[(c.bx + i) * 3 + k] = this.mem[p + i * 3 + k] & 63; return; }
        if (c.al === 0x17) { const p = this.lin(c.sreg[ES], c.dx); for (let i = 0; i < c.cx; i++) for (let k = 0; k < 3; k++) this.mem[p + i * 3 + k] = this.vga.dac[(c.bx + i) * 3 + k]; return; }
        if (c.al === 0x10) { const i = c.bx & 0xff; this.vga.dac[i * 3] = c.dh; this.vga.dac[i * 3 + 1] = c.ch; this.vga.dac[i * 3 + 2] = c.cl; return; }
        return;
      case 0x1a: c.al = 0x1a; c.bx = 0x0008; return;
      case 0x12: if (c.bl === 0x10) { c.bh = 0; c.bl = 3; c.cx = 0; } return;
      case 0x02: case 0x01: case 0x05: case 0x06: case 0x09: case 0x0e: case 0x0b: return;
      case 0x03: c.dx = 0; c.cx = 0x0607; return;
      case 0x11: return;
    }
    this.warnOnce('int10' + c.ah, `INT 10h AH=${c.ah.toString(16)}`);
  }

  // ---------- INT 16h ----------
  int16() {
    const c = this.cpu;
    const ah = c.ah & 0xef;
    if (ah === 0) {
      if (!this.biosKeys.length) { c.ip = c.startIp; c.halted = true; return; }
      const [s, a] = this.biosKeys.shift(); c.ah = s; c.al = a; return;
    }
    if (ah === 1) { if (this.biosKeys.length) { const [s, a] = this.biosKeys[0]; c.ah = s; c.al = a; c.zf = 0; } else c.zf = 1; return; }
    if (ah === 2) { c.al = 0; return; }
    this.warnOnce('int16' + c.ah, `INT 16h AH=${c.ah.toString(16)}`);
  }

  // ---------- DOS ----------
  str(sel, off) { let s = ''; const p = this.lin(sel, off); for (let i = 0; i < 256 && this.mem[p + i]; i++) s += String.fromCharCode(this.mem[p + i]); return s; }
  putStr(sel, off, s) { const p = this.lin(sel, off); for (let i = 0; i < s.length; i++) this.mem[p + i] = s.charCodeAt(i); this.mem[p + s.length] = 0; }
  dosErr(code) { this.cpu.cf = 1; this.cpu.ax = code; }
  normName(n) { return n.toUpperCase().replace(/\//g, '\\').replace(/^[A-Z]:/, '').replace(/^\\KELLOGG\\/, '').replace(/^\.\\/, '').replace(/^\\/, ''); }

  int21() {
    const c = this.cpu, ah = c.ah;
    this.count('INT 21 ' + ah.toString(16).padStart(2, '0'));
    c.cf = 0;
    switch (ah) {
      case 0x02: this.log('DOS: ' + String.fromCharCode(c.dl)); return;
      case 0x09: { let s = ''; const p = this.lin(c.sreg[DS], c.dx); for (let i = 0; i < 1000 && this.mem[p + i] !== 0x24; i++) s += String.fromCharCode(this.mem[p + i]); this.log('DOS: ' + s); return; }
      case 0x0e: c.al = 26; return;
      case 0x19: c.al = 2; return;
      case 0x1a: this.dta = { sel: c.sreg[DS], off: c.dx }; return;
      case 0x2f: c.loadSeg(ES, this.dta.sel); c.bx = this.dta.off; return;
      case 0x25: this.pmVec[c.al] = { sel: c.sreg[DS], off: c.dx }; this.log(`INT ${c.al.toString(16)}h -> ${c.sreg[DS].toString(16)}:${c.dx.toString(16)}`); return;
      case 0x35: { const v = this.pmVec[c.al] || this.defaultThunk(c.al); c.loadSeg(ES, v.sel); c.bx = v.off; return; }
      case 0x2a: { const d = new Date(2026, 9, 18); c.cx = d.getFullYear(); c.dh = d.getMonth() + 1; c.dl = d.getDate(); c.al = d.getDay(); return; }
      case 0x2c: { const t = this.time; c.ch = 12; c.cl = Math.floor(t / 60) % 60; c.dh = Math.floor(t) % 60; c.dl = Math.floor(t * 100) % 100; return; }
      case 0x30: c.ax = 0x0005; c.bx = 0; c.cx = 0; return;
      case 0x33: if (c.al === 0) c.dl = 0; else if (c.al === 6) { c.bx = 0x0005; c.dx = 0; } return;
      case 0x36: c.ax = 64; c.bx = 0x4000; c.cx = 512; c.dx = 0xffff; return;
      case 0x3b: return;
      case 0x47: this.putStr(c.sreg[DS], c.si, 'KELLOGG'); return;
      case 0x3c: case 0x3d: case 0x5b: {
        const name = this.normName(this.str(c.sreg[DS], c.dx));
        let data = this.file(name);
        if (ah === 0x3d && !data) { this.log(`open ${name}: nicht gefunden`); return this.dosErr(2); }
        if (ah !== 0x3d) { data = new Uint8Array(0); this.files.set(name, data); }
        const h = this.handles.length;
        this.handles.push({ name, pos: 0, mode: ah === 0x3d ? c.al & 3 : 2 });
        this.log(`open ${name} (${data.length} Bytes) -> Handle ${h}`);
        c.ax = h; return;
      }
      case 0x3e: if (this.handles[c.bx]) this.handles[c.bx] = null; return;
      case 0x3f: {
        const f = this.handles[c.bx];
        if (!f) { if (c.bx === 0) { c.ax = 0; return; } return this.dosErr(6); }
        const data = this.file(f.name); const n = Math.max(0, Math.min(c.cx, data.length - f.pos));
        const p = this.lin(c.sreg[DS], c.dx);
        for (let i = 0; i < n; i++) c.wb(p + i, data[f.pos + i]);
        f.pos += n; c.ax = n; return;
      }
      case 0x40: {
        const p = this.lin(c.sreg[DS], c.dx);
        if (c.bx === 1 || c.bx === 2) { let s = ''; for (let i = 0; i < c.cx; i++) s += String.fromCharCode(this.mem[p + i]); this.log('STDOUT: ' + s.replace(/\r?\n$/, '')); c.ax = c.cx; return; }
        const f = this.handles[c.bx]; if (!f) return this.dosErr(6);
        let data = this.file(f.name);
        if (f.pos + c.cx > data.length) { const nd = new Uint8Array(f.pos + c.cx); nd.set(data); data = nd; this.files.set(f.name, data); }
        for (let i = 0; i < c.cx; i++) data[f.pos + i] = this.mem[p + i];
        f.pos += c.cx; c.ax = c.cx; return;
      }
      case 0x41: this.files.delete(this.normName(this.str(c.sreg[DS], c.dx))); return;
      case 0x42: {
        const f = this.handles[c.bx]; if (!f) return this.dosErr(6);
        const off = ((c.cx << 16) | c.dx) | 0; const len = this.file(f.name).length;
        f.pos = Math.max(0, c.al === 0 ? off >>> 0 : c.al === 1 ? f.pos + off : len + off);
        c.ax = f.pos & 0xffff; c.dx = f.pos >>> 16; return;
      }
      case 0x43: { const name = this.normName(this.str(c.sreg[DS], c.dx)); if (!this.file(name)) return this.dosErr(2); c.cx = 0x20; return; }
      case 0x44:
        if (c.al === 0) { c.dx = c.bx < 5 ? 0x80d3 : 0x0002; return; }
        if (c.al === 8) { c.ax = 1; return; }
        if (c.al === 0x0e) { c.al = 0; return; }
        return this.dosErr(1);
      case 0x48: { const size = c.bx * 16; const sel = this.allocHuge(size || 16); c.ax = sel; return; }
      case 0x49: this.freeHuge(c.sreg[ES]); return;
      case 0x4a: return;
      case 0x4c: this.exitCode = c.al; this.log(`Programmende (Code ${c.al})`); this.cpu.halted = true; return;
      case 0x4e: case 0x4f: return this.findFile(ah === 0x4e);
      case 0x51: case 0x62: c.bx = this.pspSel; return;
      case 0x57: if (c.al === 0) { c.cx = 0; c.dx = 0x1cb2; } return;
      case 0x58: c.ax = 0; return;
      case 0x59: c.ax = 2; c.bx = 0; return;
    }
    this.warnOnce('int21' + ah, `INT 21h AH=${ah.toString(16)}`);
    this.dosErr(1);
  }
  findFile(first) {
    const c = this.cpu;
    if (first) {
      const pat = this.normName(this.str(c.sreg[DS], c.dx)).split('\\').pop();
      const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      this.findList = [...this.files.keys()].filter((k) => re.test(k) || (pat === '*.*' && !k.includes('\\')));
    }
    const name = this.findList && this.findList.shift();
    if (!name) return this.dosErr(18);
    const p = this.lin(this.dta.sel, this.dta.off);
    this.mem[p + 0x15] = 0x20; this.mem.fill(0, p + 0x16, p + 0x1a);
    const len = this.file(name).length;
    this.mem[p + 0x1a] = len & 0xff; this.mem[p + 0x1b] = (len >> 8) & 0xff; this.mem[p + 0x1c] = (len >> 16) & 0xff; this.mem[p + 0x1d] = len >>> 24;
    const short = name.split('\\').pop();
    for (let i = 0; i < 13; i++) this.mem[p + 0x1e + i] = i < short.length ? short.charCodeAt(i) : 0;
  }

  // ---------- DPMI ----------
  int31() {
    const c = this.cpu, ax = c.ax;
    this.count('INT 31 ' + ax.toString(16).padStart(4, '0'));
    c.cf = 0;
    switch (ax) {
      case 0x0000: c.ax = this.allocSels(c.cx || 1); return;
      case 0x0001: return;
      case 0x0002: { const seg = c.bx; let s = this.segSelCache.get(seg); if (!s) { s = this.allocSel(seg << 4, 0xffff); this.segSelCache.set(seg, s); } c.ax = s; return; }
      case 0x0003: c.ax = 8; return;
      case 0x0006: { const d = this.d(c.bx); if (!d) { c.cf = 1; return; } c.cx = d.base >>> 16; c.dx = d.base & 0xffff; return; }
      case 0x0007: { const d = this.d(c.bx); if (!d) { c.cf = 1; return; } d.base = ((c.cx << 16) | c.dx) >>> 0; this.refreshSegs(); return; }
      case 0x0008: { const d = this.d(c.bx); if (!d) { c.cf = 1; return; } d.limit = ((c.cx << 16) | c.dx) >>> 0; return; }
      case 0x0009: { const d = this.d(c.bx); if (d) d.access = c.cl; return; }
      case 0x000a: { const d = this.d(c.bx); if (!d) { c.cf = 1; return; } c.ax = this.allocSel(d.base, d.limit, 0xf2); return; }
      case 0x000b: {
        const d = this.d(c.bx); if (!d) { c.cf = 1; return; }
        const p = c.sbase[ES] + (c.as32 ? c.r[7] : c.di); const b = d.base, l = d.limit;
        const big = l > 0xfffff; const lim = big ? l >>> 12 : l;
        const bytes = [lim & 0xff, (lim >> 8) & 0xff, b & 0xff, (b >> 8) & 0xff, (b >> 16) & 0xff, d.access, ((lim >> 16) & 0xf) | (big ? 0x80 : 0), (b >>> 24) & 0xff];
        bytes.forEach((v, i) => { this.mem[p + i] = v; }); return;
      }
      case 0x000c: {
        const d = this.d(c.bx); if (!d) { c.cf = 1; return; }
        const p = c.sbase[ES] + c.di; const m = this.mem;
        d.base = (m[p + 2] | (m[p + 3] << 8) | (m[p + 4] << 16) | (m[p + 7] << 24)) >>> 0;
        let lim = m[p] | (m[p + 1] << 8) | ((m[p + 6] & 0xf) << 16); if (m[p + 6] & 0x80) lim = ((lim << 12) | 0xfff) >>> 0;
        d.limit = lim; d.access = m[p + 5]; this.refreshSegs(); return;
      }
      case 0x0100: { const seg = this.dosAlloc(c.bx); if (seg === null) { c.cf = 1; c.ax = 8; c.bx = 0; return; } c.ax = seg; c.dx = this.allocSel(seg << 4, Math.min(0xffff, c.bx * 16 - 1)); return; }
      case 0x0101: case 0x0102: return;
      case 0x0200: { const v = this.rmVec[c.bl]; c.cx = v ? v.seg : 0xf000; c.dx = v ? v.off : 0; return; }
      case 0x0201: this.rmVec[c.bl] = { seg: c.cx, off: c.dx }; return;
      case 0x0202: { const v = this.excVec[c.bl] || this.defaultThunk(0); c.cx = v.sel; c.dx = v.off; return; }
      case 0x0203: this.excVec[c.bl] = { sel: c.cx, off: c.dx }; return;
      case 0x0204: { const v = this.pmVec[c.bl] || this.defaultThunk(c.bl); c.cx = v.sel; c.dx = v.off; return; }
      case 0x0205: {
        const d = this.defThunks && this.defThunks[c.bl];
        this.pmVec[c.bl] = d && d.sel === c.cx && d.off === c.dx ? null : { sel: c.cx, off: c.dx };
        this.log(`DPMI: INT ${c.bl.toString(16)}h -> ${c.cx.toString(16)}:${c.dx.toString(16)}`); return;
      }
      case 0x0300: return this.simRealInt();
      case 0x0303: c.cx = 0xf000; c.dx = 0x100; return;
      case 0x0304: return;
      case 0x0400: c.ax = 0x005a; c.bx = 0x0005; c.cl = 3; c.dx = 0x0870; return;
      case 0x0500: {
        const p = c.sbase[ES] + c.di; const free = this.extFree.reduce((a, f) => Math.max(a, f.size), 0);
        for (let i = 0; i < 0x30; i += 4) c.wd(p + i, 0xffffffff);
        c.wd(p, free); c.wd(p + 4, free >>> 12); c.wd(p + 8, free >>> 12); return;
      }
      case 0x0501: { const size = ((c.bx << 16) | c.cx) >>> 0; const base = this.extAlloc(size); c.bx = base >>> 16; c.cx = base & 0xffff; c.si = base >>> 16; c.di = base & 0xffff; this.linBlocks = this.linBlocks || new Map(); this.linBlocks.set(base, size); return; }
      case 0x0502: { const base = ((c.si << 16) | c.di) >>> 0; const size = this.linBlocks && this.linBlocks.get(base); if (size) this.extFreeBlock(base, size); return; }
      case 0x0600: case 0x0601: case 0x0602: case 0x0603: return;
      case 0x0604: c.bx = 0; c.cx = 4096; return;
      case 0x0800: return; // physische Adresse = linear (BX:CX unverändert)
      case 0x0900: c.al = c.iflag; c.iflag = 0; return;
      case 0x0901: c.al = c.iflag; c.iflag = 1; return;
      case 0x0902: c.al = c.iflag; return;
      case 0x0e00: case 0x0e01: c.cf = 1; return;
    }
    this.warnOnce('int31' + ax, `INT 31h AX=${ax.toString(16)}`);
    c.cf = 1; c.ax = 0x8001;
  }
  refreshSegs() { const c = this.cpu; for (let i = 0; i < 6; i++) { const b = this.selBase(c.sreg[i]); if (b !== undefined) c.sbase[i] = b; } }

  // DPMI 0300h: Real-Mode-Interrupt mit Registerstruktur in ES:DI
  simRealInt() {
    const c = this.cpu, n = c.bl;
    const p = c.sbase[ES] + c.di;
    const rd = (o) => c.rw(p + o), wr = (o, v) => c.ww(p + o, v);
    this.count(`RM INT ${n.toString(16)} ${rd(0x1c).toString(16)}`);
    // Register in eine Schattenkopie laden, JS-Handler mit Real-Mode-Segmenten ausführen
    const save = { r: c.r.slice(), sreg: c.sreg.slice(), sbase: c.sbase.slice(), fl: c.flags };
    for (let i = 0; i < 8; i++) c.r[[7, 6, 5, 4, 3, 2, 1, 0][i]] = c.rd(p + i * 4);
    const rmSeg = (i, seg) => { c.sreg[i] = seg; c.sbase[i] = seg << 4; };
    rmSeg(ES, rd(0x22)); rmSeg(DS, rd(0x24));
    c.flags = rd(0x20);
    const oldLin = this.lin; this.lin = (sel, off) => (sel << 4) + off; // Zeiger sind hier Real-Mode-Segmente
    try { this.defaultInt(n); } finally { this.lin = oldLin; }
    for (let i = 0; i < 8; i++) c.wd(p + i * 4, c.r[[7, 6, 5, 4, 3, 2, 1, 0][i]]);
    wr(0x20, c.flags); wr(0x22, c.sreg[ES]); wr(0x24, c.sreg[DS]);
    c.r.set(save.r); c.sreg.set(save.sreg); for (let i = 0; i < 6; i++) c.sbase[i] = save.sbase[i]; c.flags = save.fl; c.cf = 0;
  }

  // Bild als RGBA
  frame() { return this.vga.render(); }
}

// Scancode -> ASCII (nur das Nötigste für INT 16h)
const SCAN_ASCII = { 0x01: 27, 0x1c: 13, 0x39: 32, 0x0e: 8, 0x0f: 9 };
'1234567890'.split('').forEach((ch, i) => { SCAN_ASCII[0x02 + i] = ch.charCodeAt(0); });
'qwertyuiop'.split('').forEach((ch, i) => { SCAN_ASCII[0x10 + i] = ch.charCodeAt(0); });
'asdfghjkl'.split('').forEach((ch, i) => { SCAN_ASCII[0x1e + i] = ch.charCodeAt(0); });
'zxcvbnm'.split('').forEach((ch, i) => { SCAN_ASCII[0x2c + i] = ch.charCodeAt(0); });
