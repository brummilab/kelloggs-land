// Sound Blaster (DSP 2.01) und DMA-Controller 8237 (Kanäle 0–3).
// Das Spiel spielt 8-Bit-Samples per Auto-Init-DMA aus einem Ringpuffer und liest dabei
// ständig die aktuelle DMA-Adresse. Deshalb läuft der Adresszähler hier im Takt der
// virtuellen Zeit: catchUp(t) holt alle bis t fälligen Samples aus dem Speicher.

const ADDR_PORT = [0x00, 0x02, 0x04, 0x06], COUNT_PORT = [0x01, 0x03, 0x05, 0x07];
const PAGE_PORT = { 0x87: 0, 0x83: 1, 0x81: 2, 0x82: 3 };

export class DMA {
  constructor(mem) {
    this.mem = mem;
    this.ch = [0, 1, 2, 3].map(() => ({ base: 0, cur: 0, baseCount: 0, count: 0, page: 0, mode: 0, masked: true, tc: false }));
    this.ff = 0; this.status = 0;
  }
  in(p) {
    const ci = ADDR_PORT.indexOf(p), cc = COUNT_PORT.indexOf(p);
    if (ci >= 0 || cc >= 0) {
      const c = this.ch[ci >= 0 ? ci : cc], v = ci >= 0 ? c.cur : c.count;
      const out = this.ff ? (v >> 8) & 0xff : v & 0xff; this.ff ^= 1; return out;
    }
    if (p === 0x08) { const s = this.status; this.status &= 0xf0; return s; }
    if (p in PAGE_PORT) return this.ch[PAGE_PORT[p]].page;
    return 0xff;
  }
  out(p, v) {
    const ci = ADDR_PORT.indexOf(p), cc = COUNT_PORT.indexOf(p);
    if (ci >= 0) { const c = this.ch[ci]; c.base = this.ff ? (c.base & 0xff) | (v << 8) : (c.base & 0xff00) | v; c.cur = c.base; this.ff ^= 1; return; }
    if (cc >= 0) { const c = this.ch[cc]; c.baseCount = this.ff ? (c.baseCount & 0xff) | (v << 8) : (c.baseCount & 0xff00) | v; c.count = c.baseCount; this.ff ^= 1; return; }
    if (p in PAGE_PORT) { this.ch[PAGE_PORT[p]].page = v; return; }
    switch (p) {
      case 0x0a: this.ch[v & 3].masked = !!(v & 4); return;
      case 0x0b: this.ch[v & 3].mode = v; return;
      case 0x0c: this.ff = 0; return;
      case 0x0d: this.ff = 0; this.ch.forEach((c) => { c.masked = true; }); return;
      case 0x0e: this.ch.forEach((c) => { c.masked = false; }); return;
      case 0x0f: this.ch.forEach((c, i) => { c.masked = !!(v & (1 << i)); }); return;
    }
  }
  // Ein Byte vom Kanal lesen (Speicher -> Gerät). Liefert null, wenn der Kanal steht.
  read(i) {
    const c = this.ch[i];
    if (c.masked || c.tc) return null;
    const v = this.mem[(c.page << 16) | c.cur];
    c.cur = (c.cur + ((c.mode & 0x20) ? -1 : 1)) & 0xffff;
    if (c.count === 0) {
      this.status |= 1 << i;
      if (c.mode & 0x10) { c.cur = c.base; c.count = c.baseCount; } else { c.tc = true; c.masked = true; }
    } else c.count = (c.count - 1) & 0xffff;
    return v;
  }
}

export class SoundBlaster {
  constructor({ dma, dmaCh = 1, raiseIrq, onSamples }) {
    this.dma = dma; this.dmaCh = dmaCh; this.raiseIrq = raiseIrq; this.onSamples = onSamples;
    this.q = []; this.need = 0; this.cmd = 0; this.args = [];
    this.resetState = 0; this.speaker = false;
    this.rate = 11025; this.playing = false; this.auto = false; this.paused = false;
    this.remaining = 0; this.blockLen = 0x800;
    this.pos = 0;            // Zeit der zuletzt erzeugten Probe (Sekunden)
    this.irqPending = false;
    this.gain = 0; this.level = 0; this.zeroRun = 0; this.lastRaw = 128; // Ausgangsrampe gegen Knacksen
    this.direct = 128;       // letzter Wert bei direkter DAC-Ausgabe (Befehl 10h)
    this.buf = new Float32Array(4096); this.bufLen = 0;
    this.commands = new Map();
  }

  in(o, t) {
    switch (o) {
      case 0xa: return this.q.length ? this.q.shift() : 0xff;
      case 0xc: return 0x7f;                                  // Schreibpuffer frei
      case 0xe: this.irqPending = false; return this.q.length ? 0xff : 0x7f; // auch IRQ-Quittung
      case 0xf: return 0xff;
    }
    return 0xff;
  }

  out(o, v, t) {
    if (o === 6) {
      if (v & 1) this.resetState = 1;
      else if (this.resetState) { this.resetState = 0; this.q = [0xaa]; this.playing = false; this.need = 0; this.armed = true; }
      return;
    }
    if (o !== 0xc) return;
    if (this.need) { this.args.push(v); if (--this.need === 0) this.exec(t); return; }
    this.cmd = v; this.args = [];
    this.commands.set(v, (this.commands.get(v) || 0) + 1);
    const n = { 0x10: 1, 0x14: 2, 0x16: 2, 0x17: 2, 0x24: 2, 0x40: 1, 0x48: 2, 0x74: 2, 0x75: 2, 0x76: 2, 0x77: 2, 0xe0: 1, 0xe4: 1, 0x80: 2 }[v];
    this.need = n || 0;
    if (!this.need) this.exec(t);
  }

  exec(t) {
    const a = this.args;
    switch (this.cmd) {
      case 0x10: this.catchUp(t); this.direct = a[0]; break;
      case 0x14: case 0x16: case 0x17: case 0x74: case 0x75: case 0x76: case 0x77:
        this.catchUp(t); this.startDma((a[0] | (a[1] << 8)) + 1, false, t); break;
      case 0x1c: case 0x1f: case 0x7d: case 0x7f: this.catchUp(t); this.startDma(this.blockLen, true, t); break;
      case 0x48: this.blockLen = (a[0] | (a[1] << 8)) + 1; break;
      case 0x40: this.rate = Math.round(1000000 / (256 - a[0])); break;
      case 0xd0: this.catchUp(t); this.paused = true; break;
      case 0xd4: this.catchUp(t); this.paused = false; this.pos = t; break;
      case 0xd1: this.speaker = true; break;
      case 0xd3: this.speaker = false; break;
      case 0xd8: this.q.push(this.speaker ? 0xff : 0); break;
      case 0xda: this.auto = false; break;
      case 0xe1: this.q.push(2, 1); break;
      case 0xe0: this.q.push(~a[0] & 0xff); break;
      case 0xe4: this.testByte = a[0]; break;
      case 0xe8: this.q.push(this.testByte || 0); break;
      case 0xf2: this.raiseIrq(); break;
      case 0x80: this.silenceAt = t + ((a[0] | (a[1] << 8)) + 1) / this.rate; break;
    }
  }

  startDma(len, auto, t) {
    this.playing = true; this.paused = false; this.auto = auto; this.blockLen = auto ? len : this.blockLen;
    this.remaining = len; this.pos = t;
  }

  // Alle bis t fälligen Proben erzeugen
  catchUp(t) {
    if (t <= this.pos) return;
    const step = 1 / this.rate;
    let n = Math.floor((t - this.pos) / step);
    if (n <= 0) return;
    if (n > this.rate) { n = this.rate; this.pos = t - n * step; } // nach langer Pause nicht nachholen
    for (let i = 0; i < n; i++) {
      let s = 128;
      if (this.playing && !this.paused) {
        const v = this.dma.read(this.dmaCh);
        if (v !== null) {
          s = v;
          // Nach einem Reset löscht das Spiel seinen Puffer mit 00h (= tiefster Ausschlag, nicht Stille).
          // Bis echter Ton kommt, gilt 00h als Stille, sonst knackst jeder Szenenwechsel.
          if (this.armed) { if (s === 0) s = 128; else if (s !== 128) this.armed = false; }
        }
        if (--this.remaining <= 0) {
          if (this.auto) this.remaining = this.blockLen; else this.playing = false;
          this.irqPending = true; this.raiseIrq();
        }
      } else if (!this.playing) s = this.direct;
      // Weiche Übergänge beim Starten/Stoppen der Wiedergabe und Lautsprecher an/aus (≈ 5 ms),
      // damit Neustarts der Karte zwischen den Szenen nicht knacksen
      const active = this.speaker && (this.playing || s !== 128);
      this.gain += active ? (1 - this.gain) * 0.01 : -this.gain * 0.01;
      // Längere Folgen von 00h (Spiel löscht den Puffer) weich ausblenden statt als Rechteck abspielen
      this.zeroRun = s === 0 ? this.zeroRun + 1 : 0;
      const x = (s - 128) / 128;
      // Ein Sprung direkt von Stille (80h) auf 00h ist kein Ton, sondern ein gelöschter Puffer
      if (s === 0 && this.lastRaw === 128) this.zeroRun = 9;
      if (s !== 0) this.lastRaw = s;
      this.level = active && this.zeroRun <= 8 ? x : this.level * 0.995;
      this.push(this.level * this.gain);
    }
    this.pos += n * step;
  }

  push(x) {
    this.buf[this.bufLen++] = x;
    if (this.bufLen === this.buf.length) this.flush();
  }
  flush() {
    if (!this.bufLen) return;
    if (this.onSamples) this.onSamples(this.buf.slice(0, this.bufLen), this.rate);
    this.bufLen = 0;
  }
}
