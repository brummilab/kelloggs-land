// AudioWorklet: Ringpuffer für die Sound-Blaster-Proben (z. B. 20 kHz, mono),
// lineare Umrechnung auf die Rate des Ausgabegeräts, Latenz rund 80 ms.

class SBPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1 << 16; this.mask = this.size - 1;
    this.buf = new Float32Array(this.size);
    this.r = 0; this.w = 0; this.n = 0;
    this.rate = 20000; this.phase = 0; this.vol = 0.8;
    this.waiting = true; // nach einem Aussetzer erst wieder etwas Vorlauf sammeln
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.samples) {
        this.rate = d.rate;
        const s = d.samples;
        for (let i = 0; i < s.length; i++) {
          if (this.n >= this.size) break;
          this.buf[this.w] = s[i]; this.w = (this.w + 1) & this.mask; this.n++;
        }
        // zu viel Vorlauf (z. B. nach einer Pause): auf Ziel-Latenz kürzen
        const max = this.rate * 0.25, target = this.rate * 0.08;
        if (this.n > max) { const drop = Math.floor(this.n - target); this.r = (this.r + drop) & this.mask; this.n -= drop; }
      }
      if (d.vol !== undefined) this.vol = d.vol;
    };
  }
  process(inputs, outputs) {
    const out = outputs[0], ch0 = out[0];
    const step = this.rate / sampleRate;
    if (this.waiting && this.n > this.rate * 0.05) this.waiting = false;
    for (let i = 0; i < ch0.length; i++) {
      if (this.waiting || this.n < 2) { ch0[i] = 0; this.waiting = true; continue; }
      const a = this.buf[this.r], b = this.buf[(this.r + 1) & this.mask];
      ch0[i] = (a + (b - a) * this.phase) * this.vol;
      this.phase += step;
      while (this.phase >= 1) { this.phase -= 1; this.r = (this.r + 1) & this.mask; this.n--; }
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    return true;
  }
}

registerProcessor('sb-player', SBPlayer);
