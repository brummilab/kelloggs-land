// VGA mit 4 Planes: Mode 13h (chain-4) und Mode X (unchained), Schreibmodi 0–3,
// Latches, DAC, Retrace-Status. render() liefert RGBA-Pixel.

export class VGA {
  constructor() {
    this.planes = [0, 1, 2, 3].map(() => new Uint8Array(0x10000));
    this.text = new Uint8Array(0x8000);
    this.latch = new Uint8Array(4);
    this.seq = new Uint8Array(8);
    this.gc = new Uint8Array(16);
    this.crtc = new Uint8Array(32);
    this.attr = new Uint8Array(32);
    this.dac = new Uint8Array(768);
    this.seqIdx = 0; this.gcIdx = 0; this.crtcIdx = 0; this.attrIdx = 0; this.attrFlip = 0;
    this.dacW = 0; this.dacR = 0; this.dacSub = 0; this.misc = 0x63; this.pelMask = 0xff;
    this.mode = 3;
    this.frames = 0;
    this.setMode(3);
  }

  setMode(m) {
    this.mode = m;
    if (m === 0x13) {
      this.seq.set([3, 1, 0x0f, 0, 0x0e]);
      this.gc.set([0, 0, 0, 0, 0, 0x40, 0x05, 0x0f, 0xff]);
      const cr = [0x5f, 0x4f, 0x50, 0x82, 0x54, 0x80, 0xbf, 0x1f, 0x00, 0x41, 0, 0, 0, 0, 0, 0,
        0x9c, 0x8e, 0x8f, 0x28, 0x40, 0x96, 0xb9, 0xa3, 0xff];
      this.crtc.fill(0); this.crtc.set(cr);
      for (let p = 0; p < 4; p++) this.planes[p].fill(0);
      // Standard-VGA-Palette (erste 16 Farben reichen fürs Erste)
      const ega = [0, 0, 0, 0, 0, 42, 0, 42, 0, 0, 42, 42, 42, 0, 0, 42, 0, 42, 42, 21, 0, 42, 42, 42,
        21, 21, 21, 21, 21, 63, 21, 63, 21, 21, 63, 63, 63, 21, 21, 63, 21, 63, 63, 63, 21, 63, 63, 63];
      this.dac.fill(0); this.dac.set(ega);
    } else if (m === 0x12 || m === 0x0d || m === 0x10) {
      // planare 16-Farben-Modi
      this.seq.set([3, m === 0x0d ? 9 : 1, 0x0f, 0, 6]);
      this.gc.set([0, 0, 0, 0, 0, 0, 0x05, 0x0f, 0xff]);
      this.crtc.fill(0);
      if (m === 0x12) this.crtc.set([0x5f, 0x4f, 0x50, 0x82, 0x54, 0x80, 0x0b, 0x3e, 0, 0x40, 0, 0, 0, 0, 0, 0, 0xea, 0x8c, 0xdf, 0x28, 0, 0xe7, 0x04, 0xe3, 0xff]);
      else if (m === 0x10) this.crtc.set([0x5f, 0x4f, 0x50, 0x82, 0x54, 0x80, 0xbf, 0x1f, 0, 0x40, 0, 0, 0, 0, 0, 0, 0x83, 0x85, 0x5d, 0x28, 0x0f, 0x63, 0xba, 0xe3, 0xff]);
      else this.crtc.set([0x2d, 0x27, 0x28, 0x90, 0x2b, 0x80, 0xbf, 0x1f, 0, 0xc0, 0, 0, 0, 0, 0, 0, 0x9c, 0x8e, 0x8f, 0x14, 0, 0x96, 0xb9, 0xe3, 0xff]);
      this.attr.set([0, 1, 2, 3, 4, 5, 0x14, 7, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, m === 0x0d ? 1 : 1, 0, 0x0f, 0, 0]);
      for (let p = 0; p < 4; p++) this.planes[p].fill(0);
      // Standard-EGA-Palette im DAC (64 Einträge)
      this.dac.fill(0);
      for (let i = 0; i < 64; i++) {
        const c = (b2, b1) => ((((i >> b2) & 1) * 2 + ((i >> b1) & 1)) * 21);
        this.dac[i * 3] = c(2, 5); this.dac[i * 3 + 1] = c(1, 4); this.dac[i * 3 + 2] = c(0, 3);
      }
    } else {
      this.seq.set([3, 0, 3, 0, 2]);
      this.gc.set([0, 0, 0, 0, 0, 0x10, 0x0e, 0, 0xff]);
      this.crtc.fill(0);
      this.crtc.set([0x5f, 0x4f, 0x50, 0x82, 0x55, 0x81, 0xbf, 0x1f, 0, 0x4f, 0, 0, 0, 0, 0, 0, 0x9c, 0x8e, 0x8f, 0x28, 0x1f, 0x96, 0xb9, 0xa3, 0xff]);
    }
  }

  get chain4() { return (this.seq[4] & 8) !== 0; }

  read(a) {
    if (a >= 0xb0000) return this.text[(a - 0xb8000) & 0x7fff];
    let o = a - 0xa0000;
    if (o >= 0x10000) return 0xff;
    let plane;
    if (this.chain4) { plane = o & 3; o >>= 2; } else plane = this.gc[4] & 3;
    for (let p = 0; p < 4; p++) this.latch[p] = this.planes[p][o];
    if (this.gc[5] & 8) { // Lesemodus 1: Farbvergleich
      const cc = this.gc[2], dc = this.gc[7]; let r = 0;
      for (let bit = 0; bit < 8; bit++) {
        let ok = true;
        for (let p = 0; p < 4; p++) if ((dc >> p) & 1) { if (((this.latch[p] >> bit) & 1) !== ((cc >> p) & 1)) { ok = false; break; } }
        if (ok) r |= 1 << bit;
      }
      return r;
    }
    return this.latch[plane];
  }

  write(a, v) {
    if (a >= 0xb0000) { this.text[(a - 0xb8000) & 0x7fff] = v; return; }
    let o = a - 0xa0000;
    if (o >= 0x10000) return;
    let mask = this.seq[2] & 0xf;
    if (this.chain4) { mask &= 1 << (o & 3); o >>= 2; }
    const wm = this.gc[5] & 3;
    const P = this.planes;
    if (wm === 0 && !(this.gc[1] & 0xf) && !(this.gc[3]) && this.gc[8] === 0xff) { // schneller Pfad
      if (mask & 1) P[0][o] = v; if (mask & 2) P[1][o] = v; if (mask & 4) P[2][o] = v; if (mask & 8) P[3][o] = v;
      return;
    }
    if (wm === 1) { for (let p = 0; p < 4; p++) if (mask & (1 << p)) P[p][o] = this.latch[p]; return; }
    const rot = this.gc[3] & 7, fn = (this.gc[3] >> 3) & 3;
    let bm = this.gc[8];
    const rv = ((v >> rot) | (v << (8 - rot))) & 0xff;
    if (wm === 3) bm &= rv;
    for (let p = 0; p < 4; p++) {
      if (!(mask & (1 << p))) continue;
      let d;
      if (wm === 0) d = (this.gc[1] >> p) & 1 ? ((this.gc[0] >> p) & 1 ? 0xff : 0) : rv;
      else if (wm === 2) d = (v >> p) & 1 ? 0xff : 0;
      else d = (this.gc[0] >> p) & 1 ? 0xff : 0;
      const l = this.latch[p];
      if (wm !== 3) { if (fn === 1) d &= l; else if (fn === 2) d |= l; else if (fn === 3) d ^= l; }
      P[p][o] = (d & bm) | (l & ~bm);
    }
  }

  inb(p) {
    switch (p) {
      case 0x3c4: return this.seqIdx; case 0x3c5: return this.seq[this.seqIdx & 7];
      case 0x3ce: return this.gcIdx; case 0x3cf: return this.gc[this.gcIdx & 15];
      case 0x3d4: return this.crtcIdx; case 0x3d5: return this.crtc[this.crtcIdx & 31];
      case 0x3c7: return 3; case 0x3c8: return this.dacW;
      case 0x3c9: { const v = this.dac[this.dacR * 3 + this.dacSub]; if (++this.dacSub === 3) { this.dacSub = 0; this.dacR = (this.dacR + 1) & 255; } return v; }
      case 0x3cc: return this.misc;
      case 0x3c6: return this.pelMask;
      case 0x3c1: return this.attr[this.attrIdx & 31];
      case 0x3c0: return this.attrIdx;
    }
    return 0xff;
  }
  outb(p, v) {
    switch (p) {
      case 0x3c4: this.seqIdx = v; return; case 0x3c5: this.seq[this.seqIdx & 7] = v; return;
      case 0x3ce: this.gcIdx = v; return; case 0x3cf: this.gc[this.gcIdx & 15] = v; return;
      case 0x3d4: case 0x3b4: this.crtcIdx = v; return; case 0x3d5: case 0x3b5: this.crtc[this.crtcIdx & 31] = v; return;
      case 0x3c7: this.dacR = v; this.dacSub = 0; return;
      case 0x3c8: this.dacW = v; this.dacSub = 0; return;
      case 0x3c9: this.dac[this.dacW * 3 + this.dacSub] = v & 63; if (++this.dacSub === 3) { this.dacSub = 0; this.dacW = (this.dacW + 1) & 255; } return;
      case 0x3c2: this.misc = v; return;
      case 0x3c6: this.pelMask = v; return;
      case 0x3c0: if (!this.attrFlip) this.attrIdx = v; else this.attr[this.attrIdx & 31] = v; this.attrFlip ^= 1; return;
    }
  }

  // ---------- Strahl-Timing ----------
  // Die VGA zeichnet Zeile für Zeile synchron zur virtuellen Zeit. Das Spiel ändert mitten
  // im Bild Palettenmaske, Startadresse und Panning und nutzt Line Compare für die Statusleiste.
  timing() {
    const cr = this.crtc;
    const vtotal = (cr[6] | ((cr[7] & 1) << 8) | (((cr[7] >> 5) & 1) << 9)) + 2;
    const vde = (cr[0x12] | (((cr[7] >> 1) & 1) << 8) | (((cr[7] >> 6) & 1) << 9)) + 1;
    const vrs = cr[0x10] | (((cr[7] >> 2) & 1) << 8) | (((cr[7] >> 7) & 1) << 9);
    const vrlen = (((cr[0x11] & 0xf) - (vrs & 0xf)) & 0xf) || 16;
    const lc = cr[0x18] | (((cr[7] >> 4) & 1) << 8) | (((cr[9] >> 6) & 1) << 9);
    return { vtotal: Math.max(vtotal, vde + 2, 10), vde, vrs, vrlen, lc };
  }
  scanline(t) {
    const L = Math.floor(t * LINE_HZ);
    const { vtotal } = this.timing();
    if (this.frameL === undefined) this.frameL = L;
    return (L - this.frameL) % vtotal;
  }

  // Bit 3 = vertikaler Rücklauf, Bit 0 = Anzeige gerade inaktiv (Austastung)
  status(t) {
    this.attrFlip = 0;
    const s = this.scanline(t), tm = this.timing();
    const vr = s >= tm.vrs && s < tm.vrs + tm.vrlen ? 8 : 0;
    const hb = ((t * LINE_HZ) % 1) > 0.8 ? 1 : 0;
    return vr | (s >= tm.vde ? 1 : hb);
  }

  get planar16() { return !(this.gc[5] & 0x40); }

  geometry() {
    const cr = this.crtc;
    let width = (cr[1] + 1) * (this.planar16 ? 8 : 4);
    if (this.planar16 && (this.seq[1] & 8)) width /= 2;
    const vde = cr[0x12] | (((cr[7] >> 1) & 1) << 8) | (((cr[7] >> 6) & 1) << 9);
    let scan = (cr[9] & 0x1f) + 1; if (cr[9] & 0x80) scan *= 2;
    const height = Math.round((vde + 1) / scan);
    const start = (cr[0x0c] << 8) | cr[0x0d];
    const pitch = cr[0x13] * 2;
    return { width: Math.min(width, 720), height: Math.min(height, 480), start, pitch, scan };
  }

  palette32() {
    if (!this.pal32) this.pal32 = new Uint32Array(256);
    const d = this.dac, p = this.pal32;
    for (let i = 0; i < 256; i++) {
      const r = (d[i * 3] * 255 / 63) | 0, g = (d[i * 3 + 1] * 255 / 63) | 0, b = (d[i * 3 + 2] * 255 / 63) | 0;
      p[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    return p;
  }

  // Bis zur aktuellen Strahlposition zeichnen; fertige Bilder landen in this.last
  catchUp(t) {
    const L = Math.floor(t * LINE_HZ);
    if (this.frameL === undefined) { this.frameL = L; this.beginFrame(); }
    let tm = this.timing();
    if (L - this.frameL > tm.vtotal * 4) { // lange Pause (z. B. HLT): Raster neu ausrichten
      this.frameL = L - ((L - this.frameL) % tm.vtotal);
      this.beginFrame();
    }
    while (L - this.frameL >= tm.vtotal) {
      this.drawTo(tm.vde, tm);
      this.publish();
      this.frameL += tm.vtotal;
      this.beginFrame();
      tm = this.timing();
    }
    this.drawTo(Math.min(L - this.frameL, tm.vde), tm);
  }
  beginFrame() {
    const g = this.geometry();
    this.cur = g;
    this.curStart = g.start; // Startadresse wird pro Bild übernommen
    this.nextScan = 0; this.lastRow = -1;
    if (!this.fb || this.fb.width !== g.width || this.fb.height !== g.height) {
      this.fb = { width: g.width, height: g.height, rgba: new Uint8Array(g.width * g.height * 4) };
    }
  }
  publish() {
    this.last = { width: this.fb.width, height: this.fb.height, rgba: this.fb.rgba.slice() };
    this.frames++;
  }
  drawTo(sEnd, tm) {
    if (!this.fb || this.nextScan >= sEnd) return;
    const g = this.geometry();
    if (g.width !== this.fb.width || g.height !== this.fb.height) { this.beginFrame(); return; }
    const pal = this.palette32();
    const out = new Uint32Array(this.fb.rgba.buffer);
    for (let s = this.nextScan; s < sEnd; s++) {
      const row = Math.floor(s / g.scan);
      if (row === this.lastRow || row >= g.height) continue;
      this.lastRow = row;
      const split = s > tm.lc;
      const addr = split ? Math.floor((s - tm.lc - 1) / g.scan) * g.pitch : this.curStart + row * g.pitch;
      const pan = split && (this.attr[0x10] & 0x20) ? 0 : this.attr[0x13] & 0xf;
      this.drawRow(out, row, addr, pan, g, pal);
    }
    this.nextScan = sEnd;
  }
  drawRow(out, row, addr, pan, g, pal) {
    const P = this.planes, mask = this.pelMask, w = g.width, o0 = row * w;
    if (this.planar16) {
      const half = (this.seq[1] & 8) ? 1 : 0;
      const a10 = this.attr[0x10], a14 = this.attr[0x14];
      for (let x = 0; x < w; x++) {
        const px = (x >> half) + (pan & 7), a = (addr + (px >> 3)) & 0xffff, bit = 7 - (px & 7);
        const ci = ((P[0][a] >> bit) & 1) | (((P[1][a] >> bit) & 1) << 1) | (((P[2][a] >> bit) & 1) << 2) | (((P[3][a] >> bit) & 1) << 3);
        let c = this.attr[ci] & 0x3f;
        if (a10 & 0x80) c = (c & 0x0f) | ((a14 & 0x0f) << 4); else c |= (a14 & 0x0c) << 4;
        out[o0 + x] = pal[c & mask];
      }
      return;
    }
    const sh = (pan >> 1) & 3;
    for (let x = 0; x < w; x++) {
      const px = x + sh;
      out[o0 + x] = pal[P[px & 3][(addr + (px >> 2)) & 0xffff] & mask];
    }
  }

  // Letztes fertiges Bild (oder, falls noch keins, eine Momentaufnahme)
  render() {
    if (this.last) return this.last;
    const g = this.geometry(), tm = this.timing();
    this.beginFrame(); this.nextScan = 0; this.drawTo(tm.vde, tm);
    return { width: this.fb.width, height: this.fb.height, rgba: this.fb.rgba.slice() };
  }
}

const LINE_HZ = 31469;
