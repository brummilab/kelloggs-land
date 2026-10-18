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
      return vw(a, v);
    };
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
    return { w: c.rw(d), h: c.rw(d + 2), hx: s16(c.rw(d + 8)), hy: s16(c.rw(d + 10)) };
  }

  // draw_sprite(x, y, frame, flags) – Pascal-Aufruf: x zuerst gepusht (oben), flags direkt über der Rücksprungadresse
  beginSprite() {
    const c = this.cpu, sp = c.sbase[2] + c.sp;
    const flags = c.rw(sp + 4), frame = c.rw(sp + 6), y = s16(c.rw(sp + 8)), x = s16(c.rw(sp + 10));
    if (this.cur) this.endSprite();
    if (this.sprites.has(frame & 0x0fff) || (flags & 0x100) || !this.frame) return;
    const d = this.frameDesc(frame); if (!d || d.w > 128 || d.h > 128) return;
    const V = this.p.v;
    const sx = x - this.frame.camX - d.hx, sy = y - this.frame.camY - d.hy;
    const rows = this.w(V.playRows) || 176;
    if (sx < 0 || sy < 0 || sx + d.w > 320 || sy + d.h > rows) return; // nur vollständig sichtbare Sprites
    this.cur = { key: frame & 0x0fff, d, sx, sy, idx: new Uint8Array(d.w * d.h), alpha: new Uint8Array(d.w * d.h), n: 0, started: false,
      scrollX: this.w(V.scrollX), scrollY: this.w(V.scrollY), base: this.w(V.vramBase), pitch: this.w(V.pitch) || 84, ring: this.w(V.ring) };
  }

  recordWrite(a, v) {
    const s = this.cur, vga = this.m.vga;
    s.started = true;
    const o = a - 0xa0000; if (o < 0 || o >= 0x10000) return;
    const mask = vga.seq[2] & 0xf;
    const ringBytes = s.ring || 0x10000;
    const rel = ((o - s.base) % ringBytes + ringBytes) % ringBytes;
    const rowAbs = Math.floor(rel / s.pitch), colByte = rel % s.pitch;
    const ringRows = Math.floor(ringBytes / s.pitch);
    const ly = ((rowAbs - s.scrollY - s.sy) % ringRows + ringRows) % ringRows;
    if (ly >= s.d.h) return;
    for (let p = 0; p < 4; p++) {
      if (!(mask & (1 << p))) continue;
      const px = colByte * 4 + p, W = s.pitch * 4;
      const lx = ((px - s.scrollX - s.sx) % W + W) % W;
      if (lx >= s.d.w) continue;
      s.idx[ly * s.d.w + lx] = v; s.alpha[ly * s.d.w + lx] = 1; s.n++;
    }
  }

  endSprite() {
    const s = this.cur; this.cur = null;
    if (!s || s.n < 4) return;
    this.sprites.set(s.key, { w: s.d.w, h: s.d.h, hx: s.d.hx, hy: s.d.hy, idx: s.idx, alpha: s.alpha });
    this.stats.captured++;
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
    // Sprites (aus dem Mitschnitt), in Listenreihenfolge
    for (const s of f.sprites) {
      if ((s.frame & 0xb000) || (s.flags & 0xff)) continue;
      const img = this.sprites.get(s.frame & 0x0fff);
      if (!img) { this.cutout(out, W, extra, rows, s, orig); continue; }
      const x0 = s.x - f.camX - img.hx + extra, y0 = s.y - f.camY - img.hy;
      for (let y = 0; y < img.h; y++) {
        const yy = y0 + y; if (yy < 0 || yy >= rows) continue;
        const mask = vga.rowMask ? vga.rowMask[yy] : 0xff;
        for (let x = 0; x < img.w; x++) {
          const xx = x0 + x; if (xx < 0 || xx >= W) continue;
          const i = y * img.w + x; if (img.alpha[i]) out[yy * W + xx] = pal[img.idx[i] & mask];
        }
      }
    }
    // Statusleiste und alles unterhalb des Spielfelds aus dem Originalbild
    const o32 = new Uint32Array(orig.rgba.buffer, orig.rgba.byteOffset, orig.width * orig.height);
    for (let y = rows; y < H; y++) for (let x = 0; x < 320; x++) out[y * W + x + extra] = o32[y * 320 + x];
    return { width: W, height: H, rgba: new Uint8Array(out.buffer), playRows: rows };
  }
}

export function sceneFor(m) {
  const exe = m.file('START.EXE');
  const p = exe && PROFILES[exe.length];
  return p ? new Scene(m, p) : null;
}
