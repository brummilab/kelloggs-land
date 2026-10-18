// x86-Interpreter: 16-Bit Protected Mode mit 386-Erweiterungen (0x66/0x67-Präfixe).
// Referenz für den späteren Recompiler und Fallback für zur Laufzeit erzeugten Code.
//
// Der "Bus" (siehe machine.js) stellt bereit:
//   mem            Uint8Array, linearer Speicher
//   selBase(sel)   Basisadresse eines Selektors (undefined = ungültig)
//   selLimit(sel)  Limit eines Selektors
//   vgaRead(a)/vgaWrite(a,v)  für 0xA0000–0xBFFFF
//   inb(p)/outb(p,v)
//   interrupt(n)   Software-Interrupt (INT n)
//   trap(id)       Opcode F1 xx xx: Sprung in JS-Implementierung (KERNEL, RTM, Default-Handler)

const PARITY = new Uint8Array(256);
for (let i = 0; i < 256; i++) { let p = 1; for (let b = i; b; b >>= 1) p ^= b & 1; PARITY[i] = p; }
const MASK = { 8: 0xff, 16: 0xffff, 32: 0xffffffff };
const SIGN = { 8: 0x80, 16: 0x8000, 32: 0x80000000 };
const trunc = (v, sz) => (sz === 32 ? v >>> 0 : v & MASK[sz]);
const sx8 = (v) => (v << 24) >> 24;
const sx16 = (v) => (v << 16) >> 16;
const sx = (v, sz) => (sz === 8 ? sx8(v) : sz === 16 ? sx16(v) : v | 0);

export const ES = 0, CS = 1, SS = 2, DS = 3, FS = 4, GS = 5;
export const EAX = 0, ECX = 1, EDX = 2, EBX = 3, ESP = 4, EBP = 5, ESI = 6, EDI = 7;
const SEGNAMES = ['ES', 'CS', 'SS', 'DS', 'FS', 'GS'];

export class CpuError extends Error {}

export class CPU {
  constructor(bus) {
    this.bus = bus;
    this.mem = bus.mem;
    this.r = new Uint32Array(8);
    this.sreg = new Uint16Array(6);
    this.sbase = new Array(6).fill(0);
    this.ip = 0;
    this.cf = 0; this.pf = 0; this.af = 0; this.zf = 0; this.sf = 0; this.of = 0;
    this.df = 0; this.iflag = 1; this.tf = 0; this.iopl = 3; this.nt = 0;
    this.halted = false;
    this.icount = 0;
    this.trace = new Uint32Array(256); this.tracePos = 0; // CS<<16|IP der letzten Befehle
    this.bps = []; this.bpFlag = new Uint8Array(65536);
  }

  // ---------- Speicher ----------
  rb(a) { return (a - 0xa0000) >>> 0 < 0x20000 ? this.bus.vgaRead(a) : this.mem[a]; }
  wb(a, v) { if ((a - 0xa0000) >>> 0 < 0x20000) this.bus.vgaWrite(a, v & 0xff); else this.mem[a] = v; }
  rw(a) { return this.rb(a) | (this.rb(a + 1) << 8); }
  ww(a, v) { this.wb(a, v & 0xff); this.wb(a + 1, (v >> 8) & 0xff); }
  rd(a) { return (this.rw(a) | (this.rw(a + 2) << 16)) >>> 0; }
  wd(a, v) { this.ww(a, v & 0xffff); this.ww(a + 2, v >>> 16); }
  rm_(a, sz) { return sz === 8 ? this.rb(a) : sz === 16 ? this.rw(a) : this.rd(a); }
  wm_(a, v, sz) { if (sz === 8) this.wb(a, v); else if (sz === 16) this.ww(a, v); else this.wd(a, v); }

  // ---------- Register ----------
  get ax() { return this.r[0] & 0xffff; } set ax(v) { this.setR16(0, v); }
  get cx() { return this.r[1] & 0xffff; } set cx(v) { this.setR16(1, v); }
  get dx() { return this.r[2] & 0xffff; } set dx(v) { this.setR16(2, v); }
  get bx() { return this.r[3] & 0xffff; } set bx(v) { this.setR16(3, v); }
  get sp() { return this.r[4] & 0xffff; } set sp(v) { this.setR16(4, v); }
  get bp() { return this.r[5] & 0xffff; } set bp(v) { this.setR16(5, v); }
  get si() { return this.r[6] & 0xffff; } set si(v) { this.setR16(6, v); }
  get di() { return this.r[7] & 0xffff; } set di(v) { this.setR16(7, v); }
  get al() { return this.r[0] & 0xff; } set al(v) { this.setR8(0, v); }
  get ah() { return (this.r[0] >> 8) & 0xff; } set ah(v) { this.setR8(4, v); }
  get bl() { return this.r[3] & 0xff; } get bh() { return (this.r[3] >> 8) & 0xff; }
  get cl() { return this.r[1] & 0xff; } get ch() { return (this.r[1] >> 8) & 0xff; }
  get dl() { return this.r[2] & 0xff; } get dh() { return (this.r[2] >> 8) & 0xff; }
  set dl(v) { this.setR8(2, v); } set cl(v) { this.setR8(1, v); }
  set bl(v) { this.setR8(3, v); } set bh(v) { this.setR8(7, v); }
  set ch(v) { this.setR8(5, v); } set dh(v) { this.setR8(6, v); }

  getR8(i) { return i < 4 ? this.r[i] & 0xff : (this.r[i - 4] >> 8) & 0xff; }
  setR8(i, v) {
    if (i < 4) this.r[i] = (this.r[i] & 0xffffff00) | (v & 0xff);
    else this.r[i - 4] = (this.r[i - 4] & 0xffff00ff) | ((v & 0xff) << 8);
  }
  setR16(i, v) { this.r[i] = (this.r[i] & 0xffff0000) | (v & 0xffff); }
  getR(i, sz) { return sz === 8 ? this.getR8(i) : sz === 16 ? this.r[i] & 0xffff : this.r[i]; }
  setR(i, sz, v) { if (sz === 8) this.setR8(i, v); else if (sz === 16) this.setR16(i, v); else this.r[i] = v; }

  loadSeg(i, sel) {
    sel &= 0xffff;
    let base = 0;
    if (sel & 0xfffc || i === CS || i === SS) {
      base = this.bus.selBase(sel);
      if (base === undefined) throw new CpuError(`ungültiger Selektor ${sel.toString(16)} für ${SEGNAMES[i]}`);
    }
    this.sreg[i] = sel; this.sbase[i] = base;
  }

  // ---------- Flags ----------
  get flags() {
    return (this.cf | 2 | (this.pf << 2) | (this.af << 4) | (this.zf << 6) | (this.sf << 7) | (this.tf << 8) |
      (this.iflag << 9) | (this.df << 10) | (this.of << 11) | (this.iopl << 12) | (this.nt << 14));
  }
  set flags(w) {
    this.cf = w & 1; this.pf = (w >> 2) & 1; this.af = (w >> 4) & 1; this.zf = (w >> 6) & 1;
    this.sf = (w >> 7) & 1; this.tf = (w >> 8) & 1; this.iflag = (w >> 9) & 1; this.df = (w >> 10) & 1;
    this.of = (w >> 11) & 1; this.iopl = (w >> 12) & 3; this.nt = (w >> 14) & 1;
  }
  szp(r, sz) { this.zf = r === 0 ? 1 : 0; this.sf = (r & SIGN[sz]) ? 1 : 0; this.pf = PARITY[r & 0xff]; }

  alu(op, a, b, sz) {
    const m = MASK[sz], s = SIGN[sz];
    let r;
    switch (op) {
      case 0: // ADD
        r = a + b; this.cf = r > m ? 1 : 0; r = trunc(r, sz);
        this.of = ((a ^ r) & (b ^ r) & s) ? 1 : 0; this.af = ((a ^ b ^ r) & 0x10) ? 1 : 0; break;
      case 1: r = trunc(a | b, sz); this.cf = this.of = this.af = 0; break;
      case 2: { // ADC
        const c = this.cf; r = a + b + c; this.cf = r > m ? 1 : 0; r = trunc(r, sz);
        this.of = ((a ^ r) & (b ^ r) & s) ? 1 : 0; this.af = ((a ^ b ^ r) & 0x10) ? 1 : 0; break;
      }
      case 3: { // SBB
        const c = this.cf; r = a - b - c; this.cf = (a < b + c) ? 1 : 0; r = trunc(r, sz);
        this.of = ((a ^ b) & (a ^ r) & s) ? 1 : 0; this.af = ((a ^ b ^ r) & 0x10) ? 1 : 0; break;
      }
      case 4: r = trunc(a & b, sz); this.cf = this.of = this.af = 0; break;
      case 5: case 7: // SUB, CMP
        r = a - b; this.cf = a < b ? 1 : 0; r = trunc(r, sz);
        this.of = ((a ^ b) & (a ^ r) & s) ? 1 : 0; this.af = ((a ^ b ^ r) & 0x10) ? 1 : 0; break;
      case 6: r = trunc(a ^ b, sz); this.cf = this.of = this.af = 0; break;
    }
    this.szp(r, sz);
    return r;
  }
  inc(a, sz) { const c = this.cf; const r = this.alu(0, a, 1, sz); this.cf = c; return r; }
  dec(a, sz) { const c = this.cf; const r = this.alu(5, a, 1, sz); this.cf = c; return r; }

  shift(op, a, cnt, sz) {
    cnt &= 0x1f;
    if (!cnt) return a;
    const m = MASK[sz], s = SIGN[sz];
    let r = a;
    switch (op) {
      case 0: // ROL
        for (let i = 0; i < cnt; i++) { const hi = (r & s) ? 1 : 0; r = trunc(r * 2 + hi, sz); this.cf = hi; }
        this.of = ((r & s) ? 1 : 0) ^ this.cf; return r;
      case 1: // ROR
        for (let i = 0; i < cnt; i++) { const lo = r & 1; r = (r >>> 1) | (lo ? s : 0); r = trunc(r, sz); this.cf = lo; }
        this.of = ((r & s) ? 1 : 0) ^ ((r & (s >>> 1)) ? 1 : 0); return r;
      case 2: // RCL
        for (let i = 0; i < cnt; i++) { const hi = (r & s) ? 1 : 0; r = trunc(r * 2 + this.cf, sz); this.cf = hi; }
        this.of = ((r & s) ? 1 : 0) ^ this.cf; return r;
      case 3: // RCR
        for (let i = 0; i < cnt; i++) { const lo = r & 1; r = trunc((r >>> 1) | (this.cf ? s : 0), sz); this.cf = lo; }
        this.of = ((r & s) ? 1 : 0) ^ ((r & (s >>> 1)) ? 1 : 0); return r;
      case 4: case 6: // SHL/SAL
        if (cnt <= sz) this.cf = (a >>> (sz - cnt)) & 1; else this.cf = 0;
        r = cnt >= 32 ? 0 : trunc(sz === 32 ? (a << cnt) >>> 0 : a << cnt, sz);
        this.of = ((r & s) ? 1 : 0) ^ this.cf; break;
      case 5: // SHR
        this.cf = cnt <= sz ? (a >>> (cnt - 1)) & 1 : 0;
        r = cnt >= 32 ? 0 : a >>> cnt; this.of = (a & s) ? 1 : 0; break;
      case 7: { // SAR
        const v = sx(a, sz);
        this.cf = (v >> Math.min(cnt - 1, 31)) & 1;
        r = trunc(v >> Math.min(cnt, 31), sz); this.of = 0; break;
      }
    }
    this.szp(r, sz); this.af = 0;
    return r;
  }

  cond(c) {
    switch (c) {
      case 0: return this.of; case 1: return !this.of;
      case 2: return this.cf; case 3: return !this.cf;
      case 4: return this.zf; case 5: return !this.zf;
      case 6: return this.cf || this.zf; case 7: return !this.cf && !this.zf;
      case 8: return this.sf; case 9: return !this.sf;
      case 10: return this.pf; case 11: return !this.pf;
      case 12: return this.sf !== this.of; case 13: return this.sf === this.of;
      case 14: return this.zf || this.sf !== this.of; case 15: return !this.zf && this.sf === this.of;
    }
  }

  // ---------- Holen / Dekodieren ----------
  fb() { const v = this.rb(this.sbase[CS] + this.ip); this.ip = (this.ip + 1) & 0xffff; return v; }
  fw() { const v = this.fb(); return v | (this.fb() << 8); }
  fd() { const v = this.fw(); return (v | (this.fw() << 16)) >>> 0; }
  fimm(sz) { return sz === 8 ? this.fb() : sz === 16 ? this.fw() : this.fd(); }

  modrm() {
    const m = this.fb();
    this.mod = m >> 6; this.reg = (m >> 3) & 7; this.rmn = m & 7;
    if (this.mod !== 3) this.as32 ? this.ea32() : this.ea16();
  }
  ea16() {
    const r = this.r; let off, seg = DS;
    switch (this.rmn) {
      case 0: off = r[3] + r[6]; break;
      case 1: off = r[3] + r[7]; break;
      case 2: off = r[5] + r[6]; seg = SS; break;
      case 3: off = r[5] + r[7]; seg = SS; break;
      case 4: off = r[6]; break;
      case 5: off = r[7]; break;
      case 6: if (this.mod === 0) off = this.fw(); else { off = r[5]; seg = SS; } break;
      case 7: off = r[3]; break;
    }
    if (this.mod === 1) off += sx8(this.fb()); else if (this.mod === 2) off += this.fw();
    this.eaOff = off & 0xffff;
    if (this.seg >= 0) seg = this.seg;
    this.ea = this.sbase[seg] + this.eaOff;
  }
  ea32() {
    const r = this.r; let off = 0, seg = DS, base = this.rmn;
    if (base === 4) {
      const sib = this.fb(); const sc = sib >> 6, idx = (sib >> 3) & 7; base = sib & 7;
      if (idx !== 4) off = r[idx] * (1 << sc);
      if (base === 5 && this.mod === 0) off += this.fd();
      else { off += r[base]; if (base === 4 || base === 5) seg = SS; }
    } else if (base === 5 && this.mod === 0) off = this.fd();
    else { off = r[base]; if (base === 5) seg = SS; }
    if (this.mod === 1) off += sx8(this.fb()); else if (this.mod === 2) off += this.fd() | 0;
    this.eaOff = off >>> 0;
    if (this.seg >= 0) seg = this.seg;
    this.ea = this.sbase[seg] + this.eaOff;
  }
  rmR(sz) { return this.mod === 3 ? this.getR(this.rmn, sz) : this.rm_(this.ea, sz); }
  rmW(sz, v) { if (this.mod === 3) this.setR(this.rmn, sz, v); else this.wm_(this.ea, v, sz); }

  // ---------- Stack ----------
  push16(v) { const sp = (this.r[4] - 2) & 0xffff; this.setR16(4, sp); this.ww(this.sbase[SS] + sp, v); }
  push32(v) { const sp = (this.r[4] - 4) & 0xffff; this.setR16(4, sp); this.wd(this.sbase[SS] + sp, v); }
  pop16() { const sp = this.r[4] & 0xffff; const v = this.rw(this.sbase[SS] + sp); this.setR16(4, sp + 2); return v; }
  pop32() { const sp = this.r[4] & 0xffff; const v = this.rd(this.sbase[SS] + sp); this.setR16(4, sp + 4); return v; }
  push(v, sz) { sz === 32 ? this.push32(v) : this.push16(v); }
  pop(sz) { return sz === 32 ? this.pop32() : this.pop16(); }

  // ---------- Kontrollfluss-Helfer (auch für machine.js) ----------
  farCall(sel, off) { this.push16(this.sreg[CS]); this.push16(this.ip); this.loadSeg(CS, sel); this.ip = off; }
  farRet(popBytes = 0) { const ip = this.pop16(); const cs = this.pop16(); this.loadSeg(CS, cs); this.ip = ip; this.setR16(4, this.sp + popBytes); }
  intCall(sel, off) { this.push16(this.flags); this.farCall(sel, off); this.iflag = 0; this.tf = 0; }
  iret() { const ip = this.pop16(); const cs = this.pop16(); const fl = this.pop16(); this.loadSeg(CS, cs); this.ip = ip; this.flags = fl; }

  // ---------- Ausführung ----------
  run(n) {
    const end = this.icount + n;
    while (this.icount < end && !this.halted) this.step();
  }

  // Haltepunkte: bps[ip] = [{cs, fn}], billig genug für jeden Befehl
  addBreakpoint(cs, ip, fn) { (this.bps[ip] ||= []).push({ cs, fn }); this.bpFlag[ip] = 1; }

  step() {
    if (this.bpFlag[this.ip]) for (const b of this.bps[this.ip]) if (b.cs === this.sreg[CS]) b.fn();
    this.trace[this.tracePos++ & 255] = (this.sreg[CS] << 16) | this.ip;
    this.icount++;
    this.startIp = this.ip;
    this.seg = -1; this.os32 = false; this.as32 = false; this.rep = 0;
    let op;
    for (;;) {
      op = this.fb();
      switch (op) {
        case 0x26: this.seg = ES; continue; case 0x2e: this.seg = CS; continue;
        case 0x36: this.seg = SS; continue; case 0x3e: this.seg = DS; continue;
        case 0x64: this.seg = FS; continue; case 0x65: this.seg = GS; continue;
        case 0x66: this.os32 = true; continue; case 0x67: this.as32 = true; continue;
        case 0xf0: continue;
        case 0xf2: this.rep = 2; continue; case 0xf3: this.rep = 3; continue;
      }
      break;
    }
    this.exec(op);
  }

  dsSeg() { return this.seg >= 0 ? this.seg : DS; }
  get wsz() { return this.os32 ? 32 : 16; }

  exec(op) {
    const W = this.wsz;
    if (op < 0x40 && (op & 7) < 6) { // ALU-Gruppe 00–3D
      const aop = op >> 3;
      let sz, a, b;
      switch (op & 7) {
        case 0: sz = 8; this.modrm(); a = this.rmR(8); b = this.getR8(this.reg); a = this.alu(aop, a, b, 8); if (aop !== 7) this.rmW(8, a); return;
        case 1: sz = W; this.modrm(); a = this.rmR(sz); b = this.getR(this.reg, sz); a = this.alu(aop, a, b, sz); if (aop !== 7) this.rmW(sz, a); return;
        case 2: this.modrm(); a = this.getR8(this.reg); b = this.rmR(8); a = this.alu(aop, a, b, 8); if (aop !== 7) this.setR8(this.reg, a); return;
        case 3: sz = W; this.modrm(); a = this.getR(this.reg, sz); b = this.rmR(sz); a = this.alu(aop, a, b, sz); if (aop !== 7) this.setR(this.reg, sz, a); return;
        case 4: a = this.alu(aop, this.al, this.fb(), 8); if (aop !== 7) this.al = a; return;
        case 5: a = this.alu(aop, this.getR(0, W), this.fimm(W), W); if (aop !== 7) this.setR(0, W, a); return;
      }
    }
    switch (op) {
      case 0x06: this.push(this.sreg[ES], W); return;
      case 0x07: this.loadSeg(ES, this.pop(W)); return;
      case 0x0e: this.push(this.sreg[CS], W); return;
      case 0x16: this.push(this.sreg[SS], W); return;
      case 0x17: this.loadSeg(SS, this.pop(W)); return;
      case 0x1e: this.push(this.sreg[DS], W); return;
      case 0x1f: this.loadSeg(DS, this.pop(W)); return;
      case 0x0f: return this.exec0f();
      case 0x27: { // DAA
        const old = this.al, oc = this.cf; let al = old;
        if ((al & 0xf) > 9 || this.af) { al += 6; this.af = 1; } else this.af = 0;
        if (old > 0x99 || oc) { al += 0x60; this.cf = 1; } else this.cf = 0;
        this.al = al & 0xff; this.szp(al & 0xff, 8); return;
      }
      case 0x2f: { // DAS
        const old = this.al, oc = this.cf; let al = old;
        if ((al & 0xf) > 9 || this.af) { al -= 6; this.af = 1; } else this.af = 0;
        if (old > 0x99 || oc) { al -= 0x60; this.cf = 1; } else this.cf = 0;
        this.al = al & 0xff; this.szp(al & 0xff, 8); return;
      }
      case 0x37: if ((this.al & 0xf) > 9 || this.af) { this.ax = this.ax + 0x106; this.af = this.cf = 1; } else this.af = this.cf = 0; this.al = this.al & 0xf; return;
      case 0x3f: if ((this.al & 0xf) > 9 || this.af) { this.ax = this.ax - 6; this.ah = (this.ah - 1) & 0xff; this.af = this.cf = 1; } else this.af = this.cf = 0; this.al = this.al & 0xf; return;
    }
    if (op >= 0x40 && op <= 0x4f) { const i = op & 7; this.setR(i, W, op < 0x48 ? this.inc(this.getR(i, W), W) : this.dec(this.getR(i, W), W)); return; }
    if (op >= 0x50 && op <= 0x57) { const i = op & 7; this.push(i === 4 ? this.getR(4, W) : this.getR(i, W), W); return; }
    if (op >= 0x58 && op <= 0x5f) { const v = this.pop(W); this.setR(op & 7, W, v); return; }
    if (op >= 0x70 && op <= 0x7f) { const d = sx8(this.fb()); if (this.cond(op & 15)) this.ip = (this.ip + d) & 0xffff; return; }
    if (op >= 0x90 && op <= 0x97) { const i = op & 7, t = this.getR(0, W); this.setR(0, W, this.getR(i, W)); this.setR(i, W, t); return; }
    if (op >= 0xb0 && op <= 0xb7) { this.setR8(op & 7, this.fb()); return; }
    if (op >= 0xb8 && op <= 0xbf) { this.setR(op & 7, W, this.fimm(W)); return; }
    if (op >= 0xd8 && op <= 0xdf) { this.modrm(); throw new CpuError(`FPU-Befehl ${op.toString(16)} nicht unterstützt`); }

    switch (op) {
      case 0x60: { const sp = this.getR(4, W); for (const i of [0, 1, 2, 3]) this.push(this.getR(i, W), W); this.push(sp, W); for (const i of [5, 6, 7]) this.push(this.getR(i, W), W); return; }
      case 0x61: { for (const i of [7, 6, 5]) this.setR(i, W, this.pop(W)); this.pop(W); for (const i of [3, 2, 1, 0]) this.setR(i, W, this.pop(W)); return; }
      case 0x62: this.modrm(); return; // BOUND: keine Prüfung
      case 0x68: this.push(this.fimm(W), W); return;
      case 0x6a: this.push(trunc(sx8(this.fb()), W), W); return;
      case 0x69: case 0x6b: {
        this.modrm(); const a = sx(this.rmR(W), W); const b = op === 0x69 ? sx(this.fimm(W), W) : sx8(this.fb());
        this.setR(this.reg, W, this.imulTrunc(a, b, W)); return;
      }
      case 0x6c: case 0x6d: case 0x6e: case 0x6f: return this.strIO(op);
      case 0x80: case 0x81: case 0x82: case 0x83: {
        const sz = op & 1 ? W : 8; this.modrm();
        const a = this.rmR(sz); const b = op === 0x81 ? this.fimm(W) : op === 0x83 ? trunc(sx8(this.fb()), sz) : this.fb();
        const r = this.alu(this.reg, a, b, sz); if (this.reg !== 7) this.rmW(sz, r); return;
      }
      case 0x84: case 0x85: { const sz = op & 1 ? W : 8; this.modrm(); this.alu(4, this.rmR(sz), this.getR(this.reg, sz), sz); return; }
      case 0x86: case 0x87: { const sz = op & 1 ? W : 8; this.modrm(); const a = this.rmR(sz); this.rmW(sz, this.getR(this.reg, sz)); this.setR(this.reg, sz, a); return; }
      case 0x88: this.modrm(); this.rmW(8, this.getR8(this.reg)); return;
      case 0x89: this.modrm(); this.rmW(W, this.getR(this.reg, W)); return;
      case 0x8a: this.modrm(); this.setR8(this.reg, this.rmR(8)); return;
      case 0x8b: this.modrm(); this.setR(this.reg, W, this.rmR(W)); return;
      case 0x8c: this.modrm(); this.rmW(this.mod === 3 ? W : 16, this.sreg[this.reg]); return;
      case 0x8d: this.modrm(); this.setR(this.reg, W, this.eaOff); return;
      case 0x8e: this.modrm(); this.loadSeg(this.reg, this.rmR(16)); return;
      case 0x8f: { const v = this.pop(W); this.modrm(); this.rmW(W, v); return; }
      case 0x98: if (W === 32) this.r[0] = sx16(this.ax) >>> 0; else this.ax = sx8(this.al); return;
      case 0x99: if (W === 32) this.r[2] = (this.r[0] & 0x80000000) ? 0xffffffff : 0; else this.dx = (this.ax & 0x8000) ? 0xffff : 0; return;
      case 0x9a: { const off = this.fimm(W), sel = this.fw(); this.farCall(sel, off); return; }
      case 0x9b: return;
      case 0x9c: this.push(this.flags, W); return;
      case 0x9d: this.flags = this.pop(W); return;
      case 0x9e: { const f = this.ah; this.cf = f & 1; this.pf = (f >> 2) & 1; this.af = (f >> 4) & 1; this.zf = (f >> 6) & 1; this.sf = (f >> 7) & 1; return; }
      case 0x9f: this.ah = this.flags & 0xff; return;
      case 0xa0: case 0xa1: case 0xa2: case 0xa3: {
        const sz = op & 1 ? W : 8; const off = this.as32 ? this.fd() : this.fw(); const a = this.sbase[this.dsSeg()] + off;
        if (op < 0xa2) this.setR(0, sz, this.rm_(a, sz)); else this.wm_(a, this.getR(0, sz), sz); return;
      }
      case 0xa4: case 0xa5: case 0xa6: case 0xa7: case 0xaa: case 0xab:
      case 0xac: case 0xad: case 0xae: case 0xaf: return this.str(op);
      case 0xa8: this.alu(4, this.al, this.fb(), 8); return;
      case 0xa9: this.alu(4, this.getR(0, W), this.fimm(W), W); return;
      case 0xc0: case 0xc1: case 0xd0: case 0xd1: case 0xd2: case 0xd3: {
        const sz = op & 1 ? W : 8; this.modrm(); const a = this.rmR(sz);
        const cnt = op <= 0xc1 ? this.fb() : op <= 0xd1 ? 1 : this.cl;
        this.rmW(sz, this.shift(this.reg, a, cnt, sz)); return;
      }
      case 0xc2: { const n = this.fw(); this.ip = this.pop(W) & 0xffff; this.setR16(4, this.sp + n); return; }
      case 0xc3: this.ip = this.pop(W) & 0xffff; return;
      case 0xc4: case 0xc5: { this.modrm(); const off = this.rm_(this.ea, W); const sel = this.rw(this.ea + W / 8); this.loadSeg(op === 0xc4 ? ES : DS, sel); this.setR(this.reg, W, off); return; }
      case 0xc6: this.modrm(); this.rmW(8, this.fb()); return;
      case 0xc7: this.modrm(); this.rmW(W, this.fimm(W)); return;
      case 0xc8: { // ENTER
        const size = this.fw(), lvl = this.fb() & 31; this.push16(this.bp); const fp = this.sp;
        for (let i = 1; i < lvl; i++) { this.bp = this.bp - 2; this.push16(this.rw(this.sbase[SS] + this.bp)); }
        if (lvl) this.push16(fp);
        this.bp = fp; this.sp = this.sp - size; return;
      }
      case 0xc9: this.sp = this.bp; this.setR(5, W, this.pop(W)); return;
      case 0xca: { const n = this.fw(); const ip = this.pop(W); const cs = this.pop(W); this.loadSeg(CS, cs); this.ip = ip & 0xffff; this.setR16(4, this.sp + n); return; }
      case 0xcb: { const ip = this.pop(W); const cs = this.pop(W); this.loadSeg(CS, cs); this.ip = ip & 0xffff; return; }
      case 0xcc: this.bus.interrupt(3); return;
      case 0xcd: this.bus.interrupt(this.fb()); return;
      case 0xce: if (this.of) this.bus.interrupt(4); return;
      case 0xcf: this.iret(); return;
      case 0xd4: { const b = this.fb(); if (!b) throw new CpuError('AAM 0'); const al = this.al; this.ah = (al / b) | 0; this.al = al % b; this.szp(this.al, 8); return; }
      case 0xd5: { const b = this.fb(); this.ax = (this.al + this.ah * b) & 0xff; this.szp(this.al, 8); return; }
      case 0xd6: this.al = this.cf ? 0xff : 0; return;
      case 0xd7: this.al = this.rb(this.sbase[this.dsSeg()] + ((this.bx + this.al) & 0xffff)); return;
      case 0xe0: case 0xe1: case 0xe2: case 0xe3: {
        const d = sx8(this.fb());
        const big = this.as32;
        if (op === 0xe3) { if ((big ? this.r[1] : this.cx) === 0) this.ip = (this.ip + d) & 0xffff; return; }
        let c;
        if (big) { c = this.r[1] = (this.r[1] - 1) >>> 0; } else { c = (this.cx - 1) & 0xffff; this.cx = c; }
        if (c !== 0 && (op === 0xe2 || (op === 0xe1 ? this.zf : !this.zf))) this.ip = (this.ip + d) & 0xffff;
        return;
      }
      case 0xe4: this.al = this.bus.inb(this.fb()); return;
      case 0xe5: { const p = this.fb(); this.inW(p, W); return; }
      case 0xe6: this.bus.outb(this.fb(), this.al); return;
      case 0xe7: { const p = this.fb(); this.outW(p, W); return; }
      case 0xec: this.al = this.bus.inb(this.dx); return;
      case 0xed: this.inW(this.dx, W); return;
      case 0xee: this.bus.outb(this.dx, this.al); return;
      case 0xef: this.outW(this.dx, W); return;
      case 0xe8: { const d = this.fimm(W); this.push(this.ip, W); this.ip = (this.ip + d) & 0xffff; return; }
      case 0xe9: { const d = this.fimm(W); this.ip = (this.ip + d) & 0xffff; return; }
      case 0xea: { const off = this.fimm(W), sel = this.fw(); this.loadSeg(CS, sel); this.ip = off & 0xffff; return; }
      case 0xeb: { const d = sx8(this.fb()); this.ip = (this.ip + d) & 0xffff; return; }
      case 0xf1: { const id = this.fw(); this.bus.trap(id); return; }
      case 0xf4: this.halted = true; return;
      case 0xf5: this.cf ^= 1; return;
      case 0xf6: case 0xf7: return this.grp3(op & 1 ? W : 8);
      case 0xf8: this.cf = 0; return; case 0xf9: this.cf = 1; return;
      case 0xfa: this.iflag = 0; return; case 0xfb: this.iflag = 1; return;
      case 0xfc: this.df = 0; return; case 0xfd: this.df = 1; return;
      case 0xfe: { this.modrm(); const a = this.rmR(8); if (this.reg === 0) this.rmW(8, this.inc(a, 8)); else if (this.reg === 1) this.rmW(8, this.dec(a, 8)); else throw this.bad(op); return; }
      case 0xff: return this.grp5(W);
    }
    throw this.bad(op);
  }

  inW(p, W) { if (W === 32) this.r[0] = (this.bus.inb(p) | (this.bus.inb(p + 1) << 8) | (this.bus.inb(p + 2) << 16) | (this.bus.inb(p + 3) << 24)) >>> 0; else this.ax = this.bus.inw ? this.bus.inw(p) : this.bus.inb(p) | (this.bus.inb(p + 1) << 8); }
  outW(p, W) { if (this.bus.outw && W === 16) { this.bus.outw(p, this.ax); return; } const v = this.getR(0, W); for (let i = 0; i < W / 8; i++) this.bus.outb(p + i, (v >>> (i * 8)) & 0xff); }

  bad(op) {
    const at = `${this.sreg[CS].toString(16)}:${this.startIp.toString(16)}`;
    return new CpuError(`unbekannter Opcode ${op.toString(16)} bei ${at}`);
  }

  imulTrunc(a, b, sz) {
    let full;
    if (sz === 32) { const p = BigInt(a) * BigInt(b); full = Number(BigInt.asIntN(64, p)); const r = Number(BigInt.asIntN(32, p)); this.cf = this.of = BigInt(r) !== p ? 1 : 0; return r >>> 0; }
    full = a * b; const r = sx(trunc(full, sz), sz);
    this.cf = this.of = r !== full ? 1 : 0;
    return trunc(full, sz);
  }

  grp3(sz) {
    this.modrm();
    const a = this.rmR(sz);
    switch (this.reg) {
      case 0: case 1: this.alu(4, a, this.fimm(sz), sz); return;
      case 2: this.rmW(sz, trunc(~a, sz)); return;
      case 3: { const r = this.alu(5, 0, a, sz); this.cf = a !== 0 ? 1 : 0; this.rmW(sz, r); return; }
      case 4: case 5: { // MUL / IMUL
        const signed = this.reg === 5;
        if (sz === 8) {
          const r = signed ? sx8(this.al) * sx8(a) : this.al * a; this.ax = r & 0xffff;
          this.cf = this.of = signed ? (sx8(r & 0xff) !== r ? 1 : 0) : (this.ah ? 1 : 0); return;
        }
        if (sz === 16) {
          const r = signed ? sx16(this.ax) * sx16(a) : this.ax * a; this.ax = r & 0xffff; this.dx = (r >> 16) & 0xffff;
          this.cf = this.of = signed ? (sx16(r & 0xffff) !== r ? 1 : 0) : (this.dx ? 1 : 0); return;
        }
        const p = signed ? BigInt(this.r[0] | 0) * BigInt(a | 0) : BigInt(this.r[0]) * BigInt(a);
        const u = BigInt.asUintN(64, p);
        this.r[0] = Number(u & 0xffffffffn); this.r[2] = Number(u >> 32n);
        this.cf = this.of = signed ? (BigInt.asIntN(32, p) !== p ? 1 : 0) : (this.r[2] ? 1 : 0); return;
      }
      case 6: case 7: { // DIV / IDIV
        const signed = this.reg === 7;
        if (a === 0) return this.divFault();
        if (sz === 8) {
          const n = signed ? sx16(this.ax) : this.ax, d = signed ? sx8(a) : a;
          const q = Math.trunc(n / d), rem = n % d;
          if (signed ? (q > 127 || q < -128) : q > 255) return this.divFault();
          this.al = q & 0xff; this.ah = rem & 0xff; return;
        }
        if (sz === 16) {
          const n = signed ? ((this.dx << 16) | this.ax) : ((this.dx * 65536) + this.ax), d = signed ? sx16(a) : a;
          const q = Math.trunc(n / d), rem = n % d;
          if (signed ? (q > 32767 || q < -32768) : q > 65535) return this.divFault();
          this.ax = q & 0xffff; this.dx = rem & 0xffff; return;
        }
        const n = signed ? BigInt.asIntN(64, (BigInt(this.r[2]) << 32n) | BigInt(this.r[0])) : (BigInt(this.r[2]) << 32n) | BigInt(this.r[0]);
        const d = signed ? BigInt(a | 0) : BigInt(a);
        const q = n / d, rem = n % d;
        if (signed ? (q > 2147483647n || q < -2147483648n) : q > 0xffffffffn) return this.divFault();
        this.r[0] = Number(BigInt.asUintN(32, q)); this.r[2] = Number(BigInt.asUintN(32, rem)); return;
      }
    }
  }
  divFault() { this.ip = this.startIp; this.bus.exception(0); }

  grp5(W) {
    this.modrm();
    switch (this.reg) {
      case 0: this.rmW(W, this.inc(this.rmR(W), W)); return;
      case 1: this.rmW(W, this.dec(this.rmR(W), W)); return;
      case 2: { const t = this.rmR(W); this.push(this.ip, W); this.ip = t & 0xffff; return; }
      case 3: { const off = this.rm_(this.ea, W), sel = this.rw(this.ea + W / 8); this.farCall(sel, off & 0xffff); return; }
      case 4: this.ip = this.rmR(W) & 0xffff; return;
      case 5: { const off = this.rm_(this.ea, W), sel = this.rw(this.ea + W / 8); this.loadSeg(CS, sel); this.ip = off & 0xffff; return; }
      case 6: this.push(this.rmR(W), W); return;
    }
    throw this.bad(0xff);
  }

  // ---------- Stringbefehle ----------
  strStep(sz) { return this.df ? -(sz / 8) : sz / 8; }
  idx(i) { return this.as32 ? this.r[i] : this.r[i] & 0xffff; }
  addIdx(i, d) { if (this.as32) this.r[i] = (this.r[i] + d) >>> 0; else this.setR16(i, (this.r[i] + d) & 0xffff); }
  str(op) {
    const W = this.wsz;
    const sz = op & 1 ? W : 8, d = this.strStep(sz);
    const src = this.sbase[this.dsSeg()], es = this.sbase[ES];
    const kind = op & 0xfe;
    let count = this.rep ? (this.as32 ? this.r[1] : this.cx) : 1;
    // Schneller Pfad: REP MOVS/STOS ohne VGA-Bereich
    while (count) {
      switch (kind) {
        case 0xa4: this.wm_(es + this.idx(7), this.rm_(src + this.idx(6), sz), sz); this.addIdx(6, d); this.addIdx(7, d); break;
        case 0xaa: this.wm_(es + this.idx(7), this.getR(0, sz), sz); this.addIdx(7, d); break;
        case 0xac: this.setR(0, sz, this.rm_(src + this.idx(6), sz)); this.addIdx(6, d); break;
        case 0xa6: this.alu(7, this.rm_(src + this.idx(6), sz), this.rm_(es + this.idx(7), sz), sz); this.addIdx(6, d); this.addIdx(7, d); break;
        case 0xae: this.alu(7, this.getR(0, sz), this.rm_(es + this.idx(7), sz), sz); this.addIdx(7, d); break;
      }
      if (!this.rep) return;
      count = (count - 1) >>> 0;
      if (this.as32) this.r[1] = count; else this.cx = count;
      if ((kind === 0xa6 || kind === 0xae) && ((this.rep === 3 && !this.zf) || (this.rep === 2 && this.zf))) return;
    }
  }
  strIO(op) {
    const W = this.wsz;
    const sz = op & 1 ? W : 8, d = this.strStep(sz);
    let count = this.rep ? this.cx : 1;
    while (count) {
      if (op < 0x6e) { const v = sz === 8 ? this.bus.inb(this.dx) : this.bus.inb(this.dx) | (this.bus.inb(this.dx + 1) << 8); this.wm_(this.sbase[ES] + this.idx(7), v, sz); this.addIdx(7, d); }
      else { const v = this.rm_(this.sbase[this.dsSeg()] + this.idx(6), sz); if (sz === 8) this.bus.outb(this.dx, v); else if (this.bus.outw) this.bus.outw(this.dx, v); else { this.bus.outb(this.dx, v & 0xff); this.bus.outb(this.dx + 1, v >> 8); } this.addIdx(6, d); }
      if (!this.rep) return;
      count = (count - 1) & 0xffff; this.cx = count;
    }
  }

  // ---------- 0F-Befehle ----------
  exec0f() {
    const W = this.wsz;
    const op = this.fb();
    if (op >= 0x80 && op <= 0x8f) { const d = this.fimm(W); if (this.cond(op & 15)) this.ip = (this.ip + d) & 0xffff; return; }
    if (op >= 0x90 && op <= 0x9f) { this.modrm(); this.rmW(8, this.cond(op & 15) ? 1 : 0); return; }
    if (op >= 0xc8 && op <= 0xcf) { const v = this.r[op & 7]; this.r[op & 7] = ((v >>> 24) | ((v >> 8) & 0xff00) | ((v & 0xff00) << 8) | (v << 24)) >>> 0; return; }
    switch (op) {
      case 0x00: { this.modrm(); const s = this.rmR(16); if (this.reg === 4 || this.reg === 5) { this.zf = this.bus.selBase(s) !== undefined ? 1 : 0; return; } if (this.reg === 0 || this.reg === 1) { this.rmW(16, 0); return; } break; }
      case 0x01: { this.modrm(); if (this.reg === 4) { this.rmW(16, 1); return; } break; } // SMSW: PE gesetzt
      case 0x02: case 0x03: { // LAR / LSL
        this.modrm(); const s = this.rmR(16); const b = this.bus.selBase(s);
        if (b === undefined) { this.zf = 0; return; }
        this.zf = 1; this.setR(this.reg, W, op === 0x03 ? this.bus.selLimit(s) : this.bus.selAccess(s)); return;
      }
      case 0xa0: this.push(this.sreg[FS], W); return;
      case 0xa1: this.loadSeg(FS, this.pop(W)); return;
      case 0xa8: this.push(this.sreg[GS], W); return;
      case 0xa9: this.loadSeg(GS, this.pop(W)); return;
      case 0xa3: case 0xab: case 0xb3: case 0xbb: { // BT/BTS/BTR/BTC r
        this.modrm(); const bit = this.getR(this.reg, W);
        let addr = null, v, b;
        if (this.mod === 3) { b = bit & (W - 1); v = this.getR(this.rmn, W); }
        else { const disp = Math.floor(sx(bit, W) / W) * (W / 8); addr = this.ea + disp; b = bit & (W - 1); v = this.rm_(addr, W); }
        this.cf = (v >>> b) & 1;
        if (op !== 0xa3) {
          const m = (1 << b) >>> 0;
          v = op === 0xab ? v | m : op === 0xb3 ? v & ~m : v ^ m; v = trunc(v, W);
          if (addr === null) this.setR(this.rmn, W, v); else this.wm_(addr, v, W);
        }
        return;
      }
      case 0xba: { // BT-Gruppe imm
        this.modrm(); const b = this.fb() & (W - 1); let v = this.rmR(W);
        this.cf = (v >>> b) & 1; const m = (1 << b) >>> 0;
        if (this.reg === 5) this.rmW(W, trunc(v | m, W)); else if (this.reg === 6) this.rmW(W, trunc(v & ~m, W)); else if (this.reg === 7) this.rmW(W, trunc(v ^ m, W));
        return;
      }
      case 0xa4: case 0xa5: case 0xac: case 0xad: { // SHLD / SHRD
        this.modrm(); const cnt = (op & 1 ? this.cl : this.fb()) & 31; if (!cnt) return;
        const dst = this.rmR(W), src = this.getR(this.reg, W);
        let r;
        if (op < 0xac) { const big = (BigInt(dst) << BigInt(W)) | BigInt(src); const s = big << BigInt(cnt); r = Number((s >> BigInt(W)) & BigInt(MASK[W])); this.cf = Number((big >> BigInt(2 * W - cnt)) & 1n); }
        else { const big = (BigInt(src) << BigInt(W)) | BigInt(dst); r = Number((big >> BigInt(cnt)) & BigInt(MASK[W])); this.cf = Number((big >> BigInt(cnt - 1)) & 1n); }
        this.szp(r, W); this.rmW(W, r); return;
      }
      case 0xaf: { this.modrm(); this.setR(this.reg, W, this.imulTrunc(sx(this.getR(this.reg, W), W), sx(this.rmR(W), W), W)); return; }
      case 0xb2: case 0xb4: case 0xb5: { this.modrm(); const off = this.rm_(this.ea, W); const sel = this.rw(this.ea + W / 8); this.loadSeg(op === 0xb2 ? SS : op === 0xb4 ? FS : GS, sel); this.setR(this.reg, W, off); return; }
      case 0xb6: this.modrm(); this.setR(this.reg, W, this.rmR(8)); return;
      case 0xb7: this.modrm(); this.setR(this.reg, W, this.rmR(16)); return;
      case 0xbe: this.modrm(); this.setR(this.reg, W, trunc(sx8(this.rmR(8)), W)); return;
      case 0xbf: this.modrm(); this.setR(this.reg, W, trunc(sx16(this.rmR(16)), W)); return;
      case 0xbc: case 0xbd: { // BSF / BSR
        this.modrm(); const v = this.rmR(W); if (!v) { this.zf = 1; return; } this.zf = 0;
        let i; if (op === 0xbc) { i = 0; while (!((v >>> i) & 1)) i++; } else { i = W - 1; while (!((v >>> i) & 1)) i--; }
        this.setR(this.reg, W, i); return;
      }
      case 0xc0: case 0xc1: { // XADD
        const sz = op & 1 ? W : 8; this.modrm(); const a = this.rmR(sz), b = this.getR(this.reg, sz);
        const r = this.alu(0, a, b, sz); this.setR(this.reg, sz, a); this.rmW(sz, r); return;
      }
    }
    throw new CpuError(`unbekannter Opcode 0f ${op.toString(16)} bei ${this.sreg[CS].toString(16)}:${this.startIp.toString(16)}`);
  }

  dumpRegs() {
    const h = (v, n = 4) => v.toString(16).padStart(n, '0');
    const r = this.r;
    return `EAX=${h(r[0], 8)} EBX=${h(r[3], 8)} ECX=${h(r[1], 8)} EDX=${h(r[2], 8)} ESI=${h(r[6], 8)} EDI=${h(r[7], 8)} EBP=${h(r[5], 8)} ESP=${h(r[4], 8)}\n` +
      `CS=${h(this.sreg[1])} IP=${h(this.ip)} DS=${h(this.sreg[3])} ES=${h(this.sreg[0])} SS=${h(this.sreg[2])} FS=${h(this.sreg[4])} GS=${h(this.sreg[5])} FL=${h(this.flags)}`;
  }
  lastTrace(n = 16) {
    const out = [];
    for (let i = n; i > 0; i--) { const t = this.trace[(this.tracePos - i) & 255]; out.push(`${(t >>> 16).toString(16)}:${(t & 0xffff).toString(16)}`); }
    return out.join(' ');
  }
}
