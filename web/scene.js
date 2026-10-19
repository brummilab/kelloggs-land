// Breitbild-Renderer: liest pro Bild die Szene (Kamera, Level-Karte, Sprite-Liste) aus dem
// Speicher des Spiels und baut daraus ein breiteres Bild aus Kacheln und Sprites neu auf.
// Grundlage: docs/GRAFIK.md. Adressen gelten nur für die unterstützten START.EXE-Versionen.

// Profile je START.EXE-Größe. Code-Offsets im NE-Segment 3, Variablen in DGROUP.
export const PROFILES = {
  147200: {
    name: 'deutsche Version (147 200 Bytes)',
    code: { drawSpriteList: 0xb073, drawSprite: 0x0002, drawTileColumn: 0x2b7e },
    v: {
      scrollX: 0xc1b0, scrollY: 0xc1b4,       // ganzzahlige Teile von c1ae / c1b2 (Ring im VGA-RAM)
      camX: 0xc1c8, camY: 0xc1cc,             // Kamera in Weltkoordinaten
      map: 0xb588, mapRow: 0xb58c,            // far-Zeiger Level-Karte, Bytes pro Zeile
      anim: 0xb590, animStride: 0x63e6,       // Kachel -> Grafikindex
      tileBase: 0xb594,                       // Offset der Kachelgrafik im GS-Segment
      spriteList: 0xb59a, spriteCount: 0xc188,
      frames: 0xb59e, frameIndex: 0xb5a2,     // Bildbeschreibungen (0x2C Bytes), Bildnummer -> Index
      vramBase: 0xc1d4, pitch: 0xc1d0, ring: 0xc1da, playRows: 0xc1e0,
      bounds: 0x73f0,
    },
  },
};

const s16 = (v) => (v << 16) >> 16;

// Inhalts-Kennung einer Grafik (FNV-1a, 32 Bit, hex). Damit findet ein HD-Paket seine Kacheln und
// Sprites unabhängig von Level, Speicherplatz und Spielversion wieder.
export function gfxHash(bytes, w = 0, h = 0) {
  let x = 0x811c9dc5 ^ (w * 31 + h);
  for (let i = 0; i < bytes.length; i++) { x ^= bytes[i]; x = Math.imul(x, 0x01000193); }
  return (x >>> 0).toString(16).padStart(8, '0');
}

export class Scene {
  constructor(m, profile) {
    this.m = m; this.p = profile; this.cpu = m.cpu;
    this.ds = m.selBase(m.segSel[6]);
    this.frame = null;          // letzte erfasste Szene
    this.sprites = new Map();   // Bildnummer -> {w, h, hx, hy, idx, alpha}
    this.tileSel = 0;
    this.cur = null;            // gerade gezeichnetes Sprite (Mitschnitt)
    this.stats = { captured: 0, frames: 0 };
    const seg3 = m.segSel[3], c = this.cpu, P = profile.code;
    this.codeSels = new Set(); m.segSel.forEach((s, i) => { if (i) { this.codeSels.add(s); this.codeSels.add(s + 8); } });
    this.codeSels.add(m.thunkSel);

    c.addBreakpoint(seg3, P.drawSpriteList, () => this.capture());
    c.addBreakpoint(seg3, P.drawTileColumn, () => { this.tileSel = c.sreg[5]; });
    c.addBreakpoint(seg3, P.drawSprite, () => this.beginSprite());
    // VGA-Schreibzugriffe während des kompilierten Sprite-Codes mitschneiden
    const vw = m.vgaWrite.bind(m);
    m.vgaWrite = (a, v) => {
      if (this.cur && !this.codeSels.has(c.sreg[1])) this.recordWrite(a, v);
      else if (this.cur && this.codeSels.has(c.sreg[1]) && this.cur.started) this.endSprite();
      if (this.offscreen) return; // Probe-Zeichnen: nichts im echten Bildspeicher ändern
      return vw(a, v);
    };
    this.offscreen = false;
    this.failed = new Set();     // Bildnummern, die sich nicht abseits zeichnen ließen
  }

  w(o) { return this.cpu.rw(this.ds + o); }
  far(o) { const b = this.m.selBase(this.w(o + 2)); return b === undefined ? null : b + this.w(o); }

  // Wird am Anfang von draw_sprite_list aufgerufen: Szene dieses Bildes festhalten
  capture() {
    const V = this.p.v, c = this.cpu;
    if (this.cur) this.endSprite();
    const n = this.w(V.spriteCount), list = this.far(V.spriteList);
    const sprites = [];
    if (list !== null) for (let i = 0; i < n && i < 256; i++) {
      const e = list + i * 8;
      sprites.push({ x: s16(c.rw(e)), y: s16(c.rw(e + 2)), frame: c.rw(e + 4), flags: c.rw(e + 6) });
    }
    // Neues Level (andere Karte oder Kachelgrafik): Bildnummern zeigen auf andere Grafiken
    const lvl = `${this.w(V.map)}:${this.w(V.map + 2)}:${this.w(V.mapRow)}:${this.w(V.tileBase)}:${this.w(V.tileBase + 2)}`;
    if (lvl !== this.level) { this.level = lvl; this.sprites.clear(); this.failed.clear(); this.gen = (this.gen || 0) + 1; }
    this.frame = {
      camX: s16(this.w(V.camX)), camY: s16(this.w(V.camY)),
      sprites, t: this.m.time,
    };
    this.stats.frames++;
  }

  frameDesc(frame) {
    const V = this.p.v, idx = s16(this.w(V.frameIndex + (frame & 0x0fff) * 2));
    if (idx < 0) return null;
    const base = this.far(V.frames); if (base === null) return null;
    const d = base + idx * 0x2c, c = this.cpu;
    // Kennung der Bildbeschreibung: ändert sich, wenn das Spiel andere Grafik unter dieselbe Bildnummer legt
    // (z. B. beim Wechsel der Spielfigur); dann muss das Bild neu mitgeschnitten werden
    // (z. B. beim Wechsel der Spielfigur: dieselbe Beschreibung, aber anderer Zeichencode an derselben Adresse),
    // daher auch die ersten 64 Bytes des kompilierten Zeichencodes (far-Zeiger bei 0x18) mit in die Kennung
    let sig = 0x811c9dc5;
    for (let i = 0; i < 0x2c; i += 2) { sig ^= c.rw(d + i); sig = Math.imul(sig, 0x01000193) >>> 0; }
    const cb = this.m.selBase(c.rw(d + 0x1a));
    if (cb !== undefined) { const ca = cb + c.rw(d + 0x18); for (let i = 0; i < 64; i += 2) { sig ^= c.rw(ca + i); sig = Math.imul(sig, 0x01000193) >>> 0; } }
    return { w: c.rw(d), h: c.rw(d + 2), hx: s16(c.rw(d + 8)), hy: s16(c.rw(d + 10)), sig };
  }

  // draw_sprite(x, y, frame, flags) – Pascal-Aufruf: x zuerst gepusht (oben), flags direkt über der Rücksprungadresse
  beginSprite() {
    const c = this.cpu, sp = c.sbase[2] + c.sp;
    const flags = c.rw(sp + 4), frame = c.rw(sp + 6), y = s16(c.rw(sp + 8)), x = s16(c.rw(sp + 10));
    if (this.cur) this.endSprite();
    if ((flags & 0x100) || !this.frame) return;
    const d = this.frameDesc(frame); if (!d || d.w > 128 || d.h > 128) return;
    if (this.fresh(frame & 0x0fff, d)) return;
    const V = this.p.v;
    // dieselbe Kamera wie draw_sprite selbst (c1c8/c1cc zum Zeitpunkt des Aufrufs)
    const sx = x - s16(this.w(V.camX)) - d.hx, sy = y - s16(this.w(V.camY)) - d.hy;
    const rows = this.w(V.playRows) || 176;
    if (sx < 0 || sy < 0 || sx + d.w > 320 || sy + d.h > rows) return; // nur vollständig sichtbare Sprites
    // Startadresse genau wie draw_sprite: Basis + (sy+scrollY)·Zeilenbreite + (sx+scrollX)/4, 16 Bit
    const pitch = this.w(V.pitch) || 84, col = (sx + this.w(V.scrollX)) & 0xffff, row = (sy + this.w(V.scrollY)) & 0xffff;
    this.cur = { key: frame & 0x0fff, d, sx, sy, idx: new Uint8Array(d.w * d.h), alpha: new Uint8Array(d.w * d.h), n: 0, started: false,
      pitch, align: col & 3, di0: (this.w(V.vramBase) + row * pitch + (col >> 2)) & 0xffff };
  }

  recordWrite(a, v) {
    const s = this.cur, vga = this.m.vga;
    s.started = true;
    const o = a - 0xa0000; if (o < 0 || o >= 0x10000) return;
    const mask = vga.seq[2] & 0xf;
    const rel = (o - s.di0) & 0xffff, ly = Math.floor(rel / s.pitch), bx = rel % s.pitch;
    if (ly >= s.d.h) return;
    for (let p = 0; p < 4; p++) {
      if (!(mask & (1 << p))) continue;
      const lx = bx * 4 + p - s.align;
      if (lx < 0 || lx >= s.d.w) continue;
      s.idx[ly * s.d.w + lx] = v; s.alpha[ly * s.d.w + lx] = 1; s.n++;
    }
  }

  endSprite() {
    const s = this.cur; this.cur = null;
    if (!s || s.n < 4) return;
    this.sprites.set(s.key, { w: s.d.w, h: s.d.h, hx: s.d.hx, hy: s.d.hy, idx: s.idx, alpha: s.alpha, sig: s.d.sig });
    this.stats.captured++;
  }

  // Sprite-Bild abseits zeichnen: die Zeichenroutine des Spiels (draw_sprite) mit einer Position
  // knapp innerhalb des Bildes aufrufen, ihre Schreibzugriffe mitschneiden und nicht in den
  // Bildspeicher lassen. Danach CPU, DGROUP und VGA-Register wiederherstellen.
  // Bild im Cache und noch gültig? Sonst (andere Grafik unter derselben Nummer) aus dem Cache nehmen
  fresh(key, d) {
    const img = this.sprites.get(key);
    if (!img) return false;
    if (!d || img.sig === d.sig) return true;
    this.sprites.delete(key); this.failed.delete(key);
    if (this.sentSprites) this.sentSprites.delete(key);
    return false;
  }

  renderOffscreen(frame) {
    const key = frame & 0x0fff;
    if (this.fresh(key, this.frameDesc(key)) || this.failed.has(key) || !this.frame) return false;
    const d = this.frameDesc(key);
    if (!d || d.w > 300 || d.h > 160) { this.failed.add(key); return false; }
    const c = this.cpu, m = this.m, vga = m.vga, P = this.p.code;
    const save = { r: c.r.slice(), sreg: c.sreg.slice(), sbase: c.sbase.slice(), ip: c.ip, flags: c.flags, icount: c.icount, halted: c.halted,
      seq: vga.seq.slice(), gc: vga.gc.slice(), seqIdx: vga.seqIdx, gcIdx: vga.gcIdx, ds: m.mem.slice(this.ds, this.ds + 0x10000) };
    const camX = s16(this.w(this.p.v.camX)), camY = s16(this.w(this.p.v.camY));
    const x = camX + d.hx + 8, y = camY + d.hy + 4;
    let ok = false;
    try {
      this.offscreen = true;
      c.push16(x & 0xffff); c.push16(y & 0xffff); c.push16(key); c.push16(0);
      c.push16(save.sreg[1]); c.push16(save.ip);
      c.loadSeg(1, this.m.segSel[3]); c.ip = P.drawSprite;
      const sp0 = save.r[4] & 0xffff;
      for (let n = 0; n < 400000; n++) {
        if (c.ip === save.ip && c.sreg[1] === save.sreg[1] && c.sp === sp0) { ok = true; break; }
        c.step();
      }
      if (this.cur) this.endSprite();
    } catch (e) { ok = false; this.cur = null; }
    this.offscreen = false;
    c.r.set(save.r); c.sreg.set(save.sreg); for (let i = 0; i < 6; i++) c.sbase[i] = save.sbase[i];
    c.ip = save.ip; c.flags = save.flags; c.icount = save.icount; c.halted = save.halted;
    vga.seq.set(save.seq); vga.gc.set(save.gc); vga.seqIdx = save.seqIdx; vga.gcIdx = save.gcIdx;
    m.mem.set(save.ds, this.ds);
    if (!ok || !this.sprites.has(key)) { this.failed.add(key); return false; }
    this.stats.offscreen = (this.stats.offscreen || 0) + 1;
    return true;
  }

  tileGfx(id) {
    const V = this.p.v, c = this.cpu;
    const table = this.far(V.anim), stride = this.w(V.animStride) || 4; // far-Zeiger, 4 Bytes je Kachel
    return table === null ? 0 : c.rw(table + id * stride);
  }

  // Sprite noch nicht im Cache: seinen Rahmen aus dem Originalbild übernehmen (nur innerhalb der 320 Pixel)
  cutout(out, W, extra, rows, s, orig) {
    const d = this.frameDesc(s.frame); if (!d) return;
    const sx = s.x - this.frame.camX - d.hx, sy = s.y - this.frame.camY - d.hy;
    const o32 = new Uint32Array(orig.rgba.buffer, orig.rgba.byteOffset, orig.width * orig.height);
    for (let y = Math.max(0, sy); y < Math.min(rows, sy + d.h); y++)
      for (let x = Math.max(0, sx); x < Math.min(320, sx + d.w); x++) out[y * W + x + extra] = o32[y * 320 + x];
  }

  // Breitbild zusammensetzen. extra = zusätzliche Spielpixel links und rechts.
  compose(extra = 53) {
    const f = this.frame, m = this.m, vga = m.vga;
    const orig = vga.last || vga.render();
    if (!f || orig.width !== 320) return null;
    const V = this.p.v, c = this.cpu;
    const W = 320 + 2 * extra, H = orig.height, rows = Math.min(this.w(V.playRows) || 176, H);
    const out = new Uint32Array(W * H);
    const pal = vga.palette32();
    const mapBase = this.far(V.map), rowBytes = this.w(V.mapRow);
    const gs = this.far(V.tileBase), tileBase = 0; // Kachelgrafik: far-Zeiger b594 (Selektor wie GS beim Zeichnen)
    if (mapBase === null || gs === null || !rowBytes) return null;
    const mapCols = rowBytes >> 1;
    const gfxCache = new Map();
    // Kacheln
    for (let y = 0; y < rows; y++) {
      const mask = vga.rowMask ? vga.rowMask[y] : 0xff;
      const wy = f.camY + y; const ty = wy >> 4, iy = wy & 15;
      for (let x = 0; x < W; x++) {
        const wx = f.camX - extra + x;
        let ci = 0;
        if (wx >= 0 && (wx >> 4) < mapCols && wy >= 0) {
          const id = c.rw(mapBase + ty * rowBytes + (wx >> 4) * 2) & 0x1ff;
          let g = gfxCache.get(id); if (g === undefined) { g = this.tileGfx(id); gfxCache.set(id, g); }
          const ix = wx & 15;
          const off = tileBase + g * 0x100 + ((ix & 3) << 2 | ix >> 2) + iy * 16;
          ci = m.mem[gs + off];
        }
        out[y * W + x] = pal[ci & mask];
      }
    }
    // Sprites (aus dem Mitschnitt), in Listenreihenfolge; fehlende Bilder abseits zeichnen lassen
    let budget = 6;
    for (const s of f.sprites) {
      if ((s.frame & 0xb000) || (s.flags & 0xff)) continue;
      if (!this.fresh(s.frame & 0x0fff, this.frameDesc(s.frame)) && budget > 0 && !this.failed.has(s.frame & 0x0fff)) { budget--; this.renderOffscreen(s.frame); }
      const img = this.sprites.get(s.frame & 0x0fff);
      if (!img) { this.cutout(out, W, extra, rows, s, orig); continue; }
      const x0 = s.x - f.camX - img.hx + extra, y0 = s.y - f.camY - img.hy;
      // Bit 8: das Spiel setzt Set/Reset im Grafik-Controller auf FFh, alle Pixel werden Farbe FFh (Aufblitzen)
      const flash = (s.flags & 0x100) !== 0;
      for (let y = 0; y < img.h; y++) {
        const yy = y0 + y; if (yy < 0 || yy >= rows) continue;
        const mask = vga.rowMask ? vga.rowMask[yy] : 0xff;
        for (let x = 0; x < img.w; x++) {
          const xx = x0 + x; if (xx < 0 || xx >= W) continue;
          const i = y * img.w + x; if (img.alpha[i]) out[yy * W + xx] = pal[(flash ? 0xff : img.idx[i]) & mask];
        }
      }
    }
    const o32 = new Uint32Array(orig.rgba.buffer, orig.rgba.byteOffset, orig.width * orig.height);
    // Spielschleife steht (Infofenster, Pause): Das Spiel zeichnet direkt in den Bildspeicher, die Szene
    // bleibt stehen. Dann die Mitte aus dem Originalbild übernehmen, die Ränder aus der stehenden Szene.
    // Passen die Randspalten des Originals nicht mehr zur Szene (anderer Bildschirm), Originalbild zeigen.
    if (m.time - f.t > 0.1) {
      let diff = 0, total = 0;
      for (let y = 0; y < rows; y++) for (const x of [0, 1, 2, 3, 4, 5, 6, 7, 312, 313, 314, 315, 316, 317, 318, 319]) {
        total++; if (o32[y * 320 + x] !== out[y * W + x + extra]) diff++;
      }
      if (diff > total * 0.3) return null;
      for (let y = 0; y < rows; y++) out.set(o32.subarray(y * 320, y * 320 + 320), y * W + extra);
    }
    // Statusleiste und alles unterhalb des Spielfelds aus dem Originalbild
    for (let y = rows; y < H; y++) for (let x = 0; x < 320; x++) out[y * W + x + extra] = o32[y * 320 + x];
    return { width: W, height: H, rgba: new Uint8Array(out.buffer), playRows: rows };
  }
}

// Szene als Daten für den WebGL-Renderer im Hauptthread (web/gl.js): Kamera, Kachelausschnitt,
// Sprite-Liste, Palette, PEL-Maske je Zeile, Statusleiste. Neue Kachel- und Sprite-Grafiken werden
// einmal mitgeschickt. Gibt null zurück, wenn gerade kein Level läuft.
Scene.prototype.snapshot = function (extra = 53) {
  this.offLevel = this.offLevel || 0;
  const f = this.frame, m = this.m, vga = m.vga;
  const orig = vga.last || vga.render();
  if (!f || orig.width !== 320) return null;
  const V = this.p.v, c = this.cpu;
  const H = orig.height, rows = Math.min(this.w(V.playRows) || 176, H);
  const mapBase = this.far(V.map), rowBytes = this.w(V.mapRow), gs = this.far(V.tileBase);
  if (mapBase === null || gs === null || !rowBytes) return null;
  const mapCols = rowBytes >> 1;
  if (this.sentGen !== this.gen) { this.sentGen = this.gen; this.sentTiles = new Set(); this.sentSprites = new Set(); this.reset = true; }
  const o32 = new Uint32Array(orig.rgba.buffer, orig.rgba.byteOffset, orig.width * orig.height);
  // Kachelausschnitt mit einer Kachel Rand (für Zwischenbilder)
  const tx0 = ((f.camX - extra) >> 4) - 1, ty0 = (f.camY >> 4) - 1;
  const cols = ((320 + 2 * extra) >> 4) + 4, trows = (rows >> 4) + 4;
  const map = new Uint16Array(cols * trows), newTiles = [];
  const gfxCache = new Map();
  for (let ty = 0; ty < trows; ty++) for (let tx = 0; tx < cols; tx++) {
    const mx = tx0 + tx, my = ty0 + ty;
    let g = 0xffff;
    if (mx >= 0 && mx < mapCols && my >= 0) {
      const id = c.rw(mapBase + my * rowBytes + mx * 2) & 0x1ff;
      g = gfxCache.get(id); if (g === undefined) { g = this.tileGfx(id) & 0x7ff; gfxCache.set(id, g); }
      if (!this.sentTiles.has(g)) {
        this.sentTiles.add(g);
        const px = new Uint8Array(256), b = gs + g * 0x100;
        for (let iy = 0; iy < 16; iy++) for (let ix = 0; ix < 16; ix++) px[iy * 16 + ix] = m.mem[b + ((ix & 3) << 2 | ix >> 2) + iy * 16];
        newTiles.push([g, px, gfxHash(px, 16, 16)]);
      }
    }
    map[ty * cols + tx] = g;
  }
  // Sprites; fehlende Bilder abseits zeichnen lassen
  let budget = 6; const sprites = [], newSprites = [];
  for (const s of f.sprites) {
    if ((s.frame & 0xb000) || (s.flags & 0xff)) continue;
    const k = s.frame & 0x0fff;
    if (!this.fresh(k, this.frameDesc(k)) && budget > 0 && !this.failed.has(k)) { budget--; this.renderOffscreen(s.frame); }
    const img = this.sprites.get(k);
    if (!img) continue;
    if (!this.sentSprites.has(k)) {
      this.sentSprites.add(k);
      const px = new Uint8Array(img.w * img.h * 2);
      for (let i = 0; i < img.w * img.h; i++) { px[i * 2] = img.idx[i]; px[i * 2 + 1] = img.alpha[i] ? 255 : 0; }
      newSprites.push({ k, w: img.w, h: img.h, px, hash: gfxHash(px, img.w, img.h) });
    }
    sprites.push({ k, x: s.x - img.hx, y: s.y - img.hy, w: img.w, h: img.h, flash: (s.flags & 0x100) ? 1 : 0 });
  }
  // Spielschleife steht (Infofenster, Pause): Mitte aus dem Original; anderer Bildschirm: kein Level
  let overlay = null;
  if (!(m.time - f.t > 0.1)) this.offLevel = 0;
  if (m.time - f.t > 0.1) {
    const pal = vga.palette32();
    let diff = 0, total = 0;
    for (let y = 0; y < rows; y++) {
      const mask = vga.rowMask ? vga.rowMask[y] : 0xff, wy = f.camY + y;
      for (const x of [0, 1, 2, 3, 4, 5, 6, 7, 312, 313, 314, 315, 316, 317, 318, 319]) {
        const wx = f.camX + x; let ci = 0;
        if (wx >= 0 && (wx >> 4) < mapCols && wy >= 0) {
          const g = this.tileGfx(c.rw(mapBase + (wy >> 4) * rowBytes + (wx >> 4) * 2) & 0x1ff), ix = wx & 15;
          ci = m.mem[gs + g * 0x100 + ((ix & 3) << 2 | ix >> 2) + (wy & 15) * 16];
        }
        total++; if (o32[y * 320 + x] !== pal[ci & mask]) diff++;
      }
    }
    // Erst nach mehreren Bildern hintereinander als „anderer Bildschirm“ werten, sonst flackert es
    // beim Öffnen des Infofensters (einzelne Bilder mit Übergang)
    if (diff > total * 0.5) { if (++this.offLevel > 20) return null; } else this.offLevel = 0;
    overlay = new Uint8Array(orig.rgba.buffer.slice(orig.rgba.byteOffset, orig.rgba.byteOffset + 320 * rows * 4));
  }
  const pal = new Uint8Array(vga.palette32().slice().buffer);
  const mask = new Uint8Array(H); for (let y = 0; y < H; y++) mask[y] = vga.rowMask ? vga.rowMask[y] : 0xff;
  const status = new Uint8Array(orig.rgba.buffer.slice(orig.rgba.byteOffset + 320 * rows * 4, orig.rgba.byteOffset + 320 * H * 4));
  const reset = !!this.reset; this.reset = false;
  return { t: f.t, camX: f.camX, camY: f.camY, extra, H, rows, tx0, ty0, cols, trows, map, sprites, newTiles, newSprites, pal, mask, status, overlay, reset };
};

// Alle Kacheln des aktuellen Levels und alle bisher gesehenen Sprites als Farbindizes (für den Export)
Scene.prototype.exportGfx = function () {
  const V = this.p.v, c = this.cpu, m = this.m;
  const mapBase = this.far(V.map), rowBytes = this.w(V.mapRow), gs = this.far(V.tileBase);
  if (mapBase === null || gs === null || !rowBytes || !this.frame) return null;
  const mapCols = rowBytes >> 1, b = this.w(V.bounds + 6) || 2048, mapRows = Math.ceil((b + 200) / 16);
  const seen = new Set(), hashes = new Set(), tiles = [];
  const add = (g) => {
    if (seen.has(g)) return; seen.add(g);
    const px = new Uint8Array(256), base = gs + g * 0x100;
    for (let iy = 0; iy < 16; iy++) for (let ix = 0; ix < 16; ix++) px[iy * 16 + ix] = m.mem[base + ((ix & 3) << 2 | ix >> 2) + iy * 16];
    const hash = gfxHash(px, 16, 16);
    if (!hashes.has(hash)) { hashes.add(hash); tiles.push({ g, hash, px }); }
  };
  // jede Kachel der Karte und jedes Animationsbild aus der Animationstabelle
  const ids = new Set();
  for (let y = 0; y < mapRows; y++) for (let x = 0; x < mapCols; x++) ids.add(c.rw(mapBase + y * rowBytes + x * 2) & 0x1ff);
  for (const id of ids) add(this.tileGfx(id) & 0x7ff);
  const sprites = [];
  for (const [k, img] of this.sprites) {
    const px = new Uint8Array(img.w * img.h * 2);
    for (let i = 0; i < img.w * img.h; i++) { px[i * 2] = img.idx[i]; px[i * 2 + 1] = img.alpha[i] ? 255 : 0; }
    const hash = gfxHash(px, img.w, img.h);
    if (!hashes.has(hash)) { hashes.add(hash); sprites.push({ k, w: img.w, h: img.h, hash, px }); }
  }
  // Farben wie im oberen Bildteil (PEL-Maske der ersten Zeile; Wasser nutzt die andere Hälfte der Palette)
  const p32 = this.m.vga.palette32(), m0 = this.m.vga.rowMask ? this.m.vga.rowMask[0] : 0xff, pal = new Uint32Array(256);
  for (let i = 0; i < 256; i++) pal[i] = p32[i & m0];
  return { tiles, sprites, pal: new Uint8Array(pal.buffer) };
};

export function sceneFor(m) {
  const exe = m.file('START.EXE');
  const p = exe && PROFILES[exe.length];
  return p ? new Scene(m, p) : null;
}
