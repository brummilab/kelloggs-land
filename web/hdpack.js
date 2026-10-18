// HD-Paket: Grafiken des Spiels exportieren (aus der eigenen Spielkopie) und eigene, verbesserte
// Fassungen wieder laden. Dateinamen: t_<kennung>.png (Kachel), s_<kennung>.png (Sprite).
// Die Kennung ist ein Prüfwert über die Original-Pixel (scene.js → gfxHash).
// HD-Fassungen sind 4-fach so groß wie das Original (Kachel 64×64); 1-, 2- und 8-fach wird umgerechnet.

import { readZip } from './zip.js';

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// ZIP mit Deflate (über CompressionStream des Browsers)
async function deflate(data) {
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}
export async function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const [name, data] of files) {
    const n = enc.encode(name), crc = crc32(data), comp = await deflate(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 8, true);
    h.setUint32(14, crc, true); h.setUint32(18, comp.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true);
    parts.push(new Uint8Array(h.buffer), n, comp);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(10, 8, true);
    c.setUint32(16, crc, true); c.setUint32(20, comp.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + comp.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}

// PNG ohne Canvas (schnell, synchron): RGBA, Filter 0, zlib „stored“; die ZIP-Datei komprimiert danach
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
  v.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8); v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out;
}
function png(rgba, w, h, scale = 1) {
  const W = w * scale, H = h * scale, raw = new Uint8Array((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / scale), row = y * (W * 4 + 1) + 1;
    for (let x = 0; x < W; x++) { const s = (sy * w + Math.floor(x / scale)) * 4, d = row + x * 4; raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]; raw[d + 3] = rgba[s + 3]; }
  }
  const blocks = Math.ceil(raw.length / 65535) || 1, z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78; z[1] = 0x01; let p = 2;
  for (let i = 0; i < blocks; i++) {
    const n = Math.min(65535, raw.length - i * 65535);
    z[p] = i === blocks - 1 ? 1 : 0; z[p + 1] = n & 255; z[p + 2] = n >> 8; z[p + 3] = ~n & 255; z[p + 4] = (~n >> 8) & 255;
    z.set(raw.subarray(i * 65535, i * 65535 + n), p + 5); p += 5 + n;
  }
  let a = 1, b = 0; for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  new DataView(z.buffer).setUint32(p, ((b << 16) | a) >>> 0);
  const ih = new Uint8Array(13), v = new DataView(ih.buffer); v.setUint32(0, W); v.setUint32(4, H); ih[8] = 8; ih[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}

// Farbindizes -> RGBA mit der Palette des Spiels (ohne PEL-Maske, also die „normalen“ Farben)
function toRGBA(idx, alpha, pal) {
  const out = new Uint8Array(idx.length * 4);
  for (let i = 0; i < idx.length; i++) {
    const c = idx[i] * 4;
    out[i * 4] = pal[c]; out[i * 4 + 1] = pal[c + 1]; out[i * 4 + 2] = pal[c + 2]; out[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return out;
}

const README = `Kellogg's Land HD – Grafik-Export
=================================

Diese Dateien stammen aus deiner eigenen Spielkopie. Bitte nicht veröffentlichen.

original/   Kacheln (t_*.png, 16×16) und Sprites (s_*.png) in Originalgröße
hd-vorlage/ dieselben Bilder 4-fach vergrößert (Kachel 64×64): hier drin zeichnen

So entsteht ein HD-Paket:
1. Bilder aus hd-vorlage/ in einem Grafikprogramm verbessern (Aseprite, Krita, Photoshop, GIMP …).
   Größe und Dateiname nicht ändern. Transparenz bei Sprites bleibt transparent.
2. Nur die bearbeiteten Dateien in einen Ordner oder eine ZIP-Datei legen.
3. Im Spiel unter „Grafik-Werkstatt“ → „HD-Paket laden“ auswählen. Fertig, sofort sichtbar.

Hinweise:
- Kacheln liegen nebeneinander: Ränder so zeichnen, dass sie an die Nachbarkacheln passen
  (die Übersicht uebersicht-kacheln.png zeigt alle Kacheln des Levels).
- Farben dürfen frei gewählt werden. Einblenden, Wasser und Aufblitzen färbt das Spiel automatisch um.
- Sprites, die du im Spiel noch nicht gesehen hast, fehlen im Export: weiterspielen und erneut exportieren.
`;

// Export: {tiles:[{hash,px}], sprites:[{hash,w,h,px(RG)}], pal} -> ZIP-Blob
export async function exportPack(gfx, onProgress = () => {}) {
  const files = [['LIESMICH.txt', new TextEncoder().encode(README)]];
  const n = gfx.tiles.length + gfx.sprites.length; let done = 0;
  for (const t of gfx.tiles) {
    const rgba = toRGBA(t.px, null, gfx.pal);
    files.push([`original/kacheln/t_${t.hash}.png`, png(rgba, 16, 16)]);
    files.push([`hd-vorlage/kacheln/t_${t.hash}.png`, png(rgba, 16, 16, 4)]);
    if (++done % 50 === 0) { onProgress(done / n); await new Promise((r) => setTimeout(r)); }
  }
  for (const s of gfx.sprites) {
    const idx = new Uint8Array(s.w * s.h), alpha = new Uint8Array(s.w * s.h);
    for (let i = 0; i < idx.length; i++) { idx[i] = s.px[i * 2]; alpha[i] = s.px[i * 2 + 1]; }
    const rgba = toRGBA(idx, alpha, gfx.pal);
    files.push([`original/sprites/s_${s.hash}.png`, png(rgba, s.w, s.h)]);
    files.push([`hd-vorlage/sprites/s_${s.hash}.png`, png(rgba, s.w, s.h, 4)]);
    if (++done % 50 === 0) { onProgress(done / n); await new Promise((r) => setTimeout(r)); }
  }
  // Übersicht aller Kacheln (16 je Zeile, 4-fach, 2 Pixel Abstand, Zwischenraum magenta)
  const cols = 16, rows = Math.ceil(gfx.tiles.length / cols), S = 18;
  if (rows) {
    const W = cols * S, H = rows * S, sheet = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { sheet[i * 4] = 255; sheet[i * 4 + 2] = 255; sheet[i * 4 + 3] = 255; }
    gfx.tiles.forEach((t, i) => {
      const rgba = toRGBA(t.px, null, gfx.pal), ox = (i % cols) * S, oy = Math.floor(i / cols) * S;
      for (let y = 0; y < 16; y++) sheet.set(rgba.subarray(y * 64, y * 64 + 64), ((oy + y) * W + ox) * 4);
    });
    files.push(['uebersicht-kacheln.png', png(sheet, W, H, 4)]);
  }
  onProgress(1);
  return await makeZip(files);
}

// Import: Dateien (PNG, ZIP oder Ordner) -> Map 't_'/'s_' + Kennung -> {w, h, data(ImageData)}
export async function readPack(fileEntries) {
  const raw = [];
  for (const [name, data] of fileEntries) {
    if (/\.zip$/i.test(name)) { for (const [n, d] of Object.entries(await readZip(data.buffer ? data : new Uint8Array(data)))) raw.push([n, d]); }
    else raw.push([name, data]);
  }
  // alle Bilder gleichzeitig entpacken (schneller als nacheinander)
  const decoded = await Promise.all(raw.map(async ([name, data]) => {
    const m = /(?:^|\/)([ts])_([0-9a-f]{8})\.png$/i.exec(name);
    if (!m || /(^|\/)original\//i.test(name)) return null;  // unveränderte Originale aus dem Export überspringen
    try { return [m[1].toLowerCase() + '_' + m[2].toLowerCase(), await decodePNG(data)]; } catch { return null; }
  }));
  const pack = new Map();
  for (const e of decoded) { if (!e) continue; const old = pack.get(e[0]); if (!old || old.width < e[1].width) pack.set(e[0], e[1]); }
  return pack;
}

// PNG lesen (ohne Canvas/createImageBitmap): Farbtypen Grau, RGB, Palette, Grau+Alpha, RGBA;
// Bittiefe 1–8 (16 Bit wird auf 8 gekürzt), ohne Interlacing. Ergebnis wie ImageData: {width, height, data}
export async function decodePNG(buf) {
  const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf), v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (v.getUint32(0) !== 0x89504e47) throw new Error('keine PNG-Datei');
  let p = 8, w = 0, h = 0, depth = 8, type = 6, interlace = 0, plte = null, trns = null; const idat = [];
  while (p < d.length) {
    const len = v.getUint32(p), t = String.fromCharCode(d[p + 4], d[p + 5], d[p + 6], d[p + 7]), c = d.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = v.getUint32(p + 8); h = v.getUint32(p + 12); depth = d[p + 16]; type = d[p + 17]; interlace = d[p + 20]; }
    else if (t === 'PLTE') plte = c; else if (t === 'tRNS') trns = c; else if (t === 'IDAT') idat.push(c); else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('PNG mit Interlacing wird nicht unterstützt');
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], bpp = Math.max(1, (ch * depth) >> 3), stride = (w * ch * depth + 7) >> 3;
  const px = new Uint8Array(stride * h); let prev = new Uint8Array(stride);
  for (let y = 0, q = 0; y < h; y++) {
    const f = raw[q++], row = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, r = raw[q++];
      let val;
      if (f === 0) val = r; else if (f === 1) val = r + a; else if (f === 2) val = r + b; else if (f === 3) val = r + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); val = r + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      row[x] = val & 255;
    }
    prev = row;
  }
  const out = new Uint8ClampedArray(w * h * 4);
  const sample = (y, i) => {           // i-ter Wert der Zeile y in Bittiefe depth, auf 0..255 bzw. Index
    const row = y * stride;
    if (depth === 8) return px[row + i];
    if (depth === 16) return px[row + i * 2];
    const bit = i * depth, byte = px[row + (bit >> 3)], sh = 8 - depth - (bit & 7);
    return (byte >> sh) & ((1 << depth) - 1);
  };
  const scaleG = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (type === 3) {
      const i = sample(y, x); out[o] = plte[i * 3]; out[o + 1] = plte[i * 3 + 1]; out[o + 2] = plte[i * 3 + 2]; out[o + 3] = trns && i < trns.length ? trns[i] : 255;
    } else if (type === 0 || type === 4) {
      const g = sample(y, x * ch) * scaleG; out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = type === 4 ? sample(y, x * 2 + 1) : 255;
    } else {
      out[o] = sample(y, x * ch); out[o + 1] = sample(y, x * ch + 1); out[o + 2] = sample(y, x * ch + 2); out[o + 3] = type === 6 ? sample(y, x * 4 + 3) : 255;
    }
  }
  return { width: w, height: h, data: out };
}

// Bild auf Zielgröße bringen: Vergrößern mit nächstem Nachbarn, Verkleinern als Mittelwert
export function resize(img, w, h) {
  if (img.width === w && img.height === h) return img;
  const out = new Uint8ClampedArray(w * h * 4), sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * sx), y0 = Math.floor(y * sy), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * img.width + xx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; a += img.data[i + 3]; n++; }
    const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
  }
  return { width: w, height: h, data: out };
}

// Paket im Browser merken (IndexedDB), damit es nach dem Neuladen wieder da ist
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('kelloggs-hd', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pack');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function savePackFiles(entries) {
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction('pack', 'readwrite'); t.objectStore('pack').put(entries, 'files'); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
export async function loadPackFiles() {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction('pack').objectStore('pack').get('files'); t.onsuccess = () => res(t.result || null); t.onerror = () => rej(t.error); });
}
export async function clearPackFiles() {
  const d = await db();
  await new Promise((res) => { const t = d.transaction('pack', 'readwrite'); t.objectStore('pack').delete('files'); t.oncomplete = res; t.onerror = res; });
}
