// 8253/8254 PIT: Kanal 0 (IRQ0) und Kanal 2 (Gate über Port 61h), Latch und Lo/Hi-Zugriff.
// Zeitbasis ist die virtuelle Zeit der Maschine (Sekunden).

export const PIT_HZ = 1193182;

class Channel {
  constructor() { this.div = 65536; this.mode = 3; this.rw = 3; this.start = 0; this.latch = null; this.wHi = false; this.rHi = false; this.lo = 0; this.running = true; }
  count(t) {
    if (!this.running) return this.div & 0xffff;
    const el = Math.floor((t - this.start) * PIT_HZ);
    let c = this.div - (el % this.div);
    if (this.mode === 3) c = (c * 2) % this.div; // Rechteck zählt doppelt so schnell
    return c & 0xffff;
  }
}

export class PIT {
  constructor(onReload) {
    this.ch = [new Channel(), new Channel(), new Channel()];
    this.onReload = onReload; // (kanal, t) – Kanal 0 neu geladen
    this.gate2 = 0;
  }
  period(i = 0) { return this.ch[i].div / PIT_HZ; }

  control(v, t) {
    const i = v >> 6;
    if (i === 3) return; // Read-Back nicht unterstützt
    const c = this.ch[i];
    const rw = (v >> 4) & 3;
    if (rw === 0) { c.latch = [c.count(t)]; c.rHi = false; return; }
    c.rw = rw; c.mode = (v >> 1) & 7; if (c.mode > 5) c.mode -= 4;
    c.wHi = false; c.rHi = false; c.latch = null;
  }

  write(i, v, t) {
    const c = this.ch[i];
    let full = false;
    if (c.rw === 1) { c.lo = v; c.wv = v; full = true; }
    else if (c.rw === 2) { c.wv = v << 8; full = true; }
    else if (!c.wHi) { c.lo = v; c.wHi = true; }
    else { c.wv = c.lo | (v << 8); c.wHi = false; full = true; }
    if (!full) return;
    c.div = c.wv || 65536;
    c.start = t; c.running = i !== 2 || this.gate2;
    if (i === 0 && this.onReload) this.onReload(t);
  }

  read(i, t) {
    const c = this.ch[i];
    let val;
    if (c.latch) val = c.latch[0]; else val = c.count(t);
    let out;
    if (c.rw === 1) out = val & 0xff;
    else if (c.rw === 2) out = val >> 8;
    else { out = c.rHi ? val >> 8 : val & 0xff; c.rHi = !c.rHi; }
    if (c.latch && (c.rw !== 3 || !c.rHi)) c.latch = null;
    return out & 0xff;
  }

  setGate2(on, t) {
    const c = this.ch[2];
    if (on && !this.gate2) { c.start = t; c.running = true; }
    if (!on) c.running = false;
    this.gate2 = on ? 1 : 0;
  }
  out2(t) { const c = this.ch[2]; if (!c.running) return 1; return c.count(t) > c.div / 2 ? 1 : 0; }
}
