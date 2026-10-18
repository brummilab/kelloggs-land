// WebGL2-Renderer für das Breitbild: zeichnet Kacheln, Sprites, Statusleiste und Infofenster aus den
// Szenendaten des Workers (scene.js → snapshot) und rechnet Zwischenbilder für flüssiges Scrollen.
// Farben laufen wie im Original über Farbindex, PEL-Maske je Zeile und Palette.

const VS = `#version 300 es
in vec2 aPos; uniform vec4 uRect; uniform vec2 uView; out vec2 vGame;
void main() {
  vGame = uRect.xy + aPos * uRect.zw;                   // Spielpixel (x nach rechts, y nach unten)
  vec2 p = vGame / uView * 2.0 - 1.0;
  gl_Position = vec4(p.x, p.y, 0.0, 1.0);              // in den Zwischenpuffer: Texelzeile = Spielzeile
}`;

// Hintergrund: Kacheln, Statusleiste, Infofenster
const FS_BG = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
in vec2 vGame; out vec4 o;
uniform usampler2D uMap; uniform sampler2D uAtlas, uPal, uMask, uStatus, uOverlay;
uniform vec2 uCam; uniform ivec2 uTile0; uniform int uCols, uRowsT, uRows, uExtra, uHasOverlay;
vec4 pal(int ci, int row) {
  int m = int(texelFetch(uMask, ivec2(clamp(row, 0, 479), 0), 0).r * 255.0 + 0.5);
  return texelFetch(uPal, ivec2(ci & m, 0), 0);
}
void main() {
  ivec2 gp = ivec2(floor(vGame));
  if (gp.y >= uRows) {                                   // Statusleiste, mittig
    int x = gp.x - uExtra;
    o = (x >= 0 && x < 320) ? texelFetch(uStatus, ivec2(x, gp.y - uRows), 0) : vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  if (uHasOverlay == 1) {
    int x = gp.x - uExtra;
    if (x >= 0 && x < 320) { o = texelFetch(uOverlay, ivec2(x, gp.y), 0); return; }
  }
  vec2 w = floor(uCam + vGame - vec2(float(uExtra), 0.0));
  ivec2 wi = ivec2(w), t = (wi >> 4) - uTile0;
  int ci = 0;
  if (t.x >= 0 && t.y >= 0 && t.x < uCols && t.y < uRowsT) {
    uint g = texelFetch(uMap, t, 0).r;
    if (g != 0xffffu) {
      int gi = int(g);
      ivec2 a = ivec2((gi & 63) * 16 + (wi.x & 15), (gi >> 6) * 16 + (wi.y & 15));
      ci = int(texelFetch(uAtlas, a, 0).r * 255.0 + 0.5);
    }
  }
  o = pal(ci, gp.y);
}`;

// Sprites: Farbindex + Deckkraft aus dem Sprite-Atlas
const FS_SPR = `#version 300 es
precision highp float; precision highp int;
in vec2 vGame; out vec4 o;
uniform sampler2D uSprites, uPal, uMask;
uniform vec4 uSrc; uniform vec2 uOrigin; uniform int uRows, uFlash;
void main() {
  if (vGame.y >= float(uRows)) discard;
  ivec2 l = ivec2(floor(vGame - uOrigin));
  if (l.x < 0 || l.y < 0 || l.x >= int(uSrc.z) || l.y >= int(uSrc.w)) discard;
  vec2 s = texelFetch(uSprites, ivec2(uSrc.xy) + l, 0).rg;
  if (s.g < 0.5) discard;
  int ci = uFlash == 1 ? 255 : int(s.r * 255.0 + 0.5);
  int row = int(floor(vGame.y));
  int m = int(texelFetch(uMask, ivec2(clamp(row, 0, 479), 0), 0).r * 255.0 + 0.5);
  o = texelFetch(uPal, ivec2(ci & m, 0), 0);
}`;

// Skalierer: Quelle in Texeln; Pixel = nächster Nachbar, HD = xBR-lv2 (Hyllian, MIT, siehe unten)
const VS_SC = `#version 300 es
in vec2 aPos; uniform vec4 uRect, uSrcRect; uniform vec2 uView; out vec2 vSrc;
void main() {
  vec2 g = uRect.xy + aPos * uRect.zw;
  vSrc = uSrcRect.xy + aPos * uSrcRect.zw;
  vec2 p = g / uView * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;

/* xBR-lv2 nach Hyllians Shader (libretro/glsl-shaders, xbr/shaders/xbr-lv2.glsl):
   Copyright (C) 2011-2016 Hyllian - sergiogdb@gmail.com. MIT-Lizenz:
   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
   associated documentation files (the "Software"), to deal in the Software without restriction, including
   without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
   following conditions: The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
   KIND, EXPRESS OR IMPLIED. Angepasst an WebGL2 (texelFetch, Skalierung als Uniform). */
const FS_SC = `#version 300 es
precision highp float; precision highp int;
in vec2 vSrc; out vec4 o;
uniform sampler2D uSrc; uniform ivec2 uSrcSize; uniform float uScale; uniform int uHD;
vec3 T(ivec2 p) { return texelFetch(uSrc, clamp(p, ivec2(0), uSrcSize - 1), 0).rgb; }
const vec3 rgbw = vec3(14.352, 28.176, 5.472);
const vec4 Ao = vec4(1.0, -1.0, -1.0, 1.0), Bo = vec4(1.0, 1.0, -1.0, -1.0), Co = vec4(1.5, 0.5, -0.5, 0.5);
const vec4 Ax = vec4(1.0, -1.0, -1.0, 1.0), Bx = vec4(0.5, 2.0, -0.5, -2.0), Cx = vec4(1.0, 1.0, -0.5, 0.0);
const vec4 Ay = vec4(1.0, -1.0, -1.0, 1.0), By = vec4(2.0, 0.5, -2.0, -0.5), Cy = vec4(2.0, 0.0, -1.0, 0.5);
const vec4 Ci = vec4(0.25);
vec4 df(vec4 A, vec4 B) { return abs(A - B); }
vec4 diff(vec4 A, vec4 B) { return vec4(notEqual(A, B)); }
vec4 eq(vec4 A, vec4 B) { return step(df(A, B), vec4(15.0)); }
vec4 neq(vec4 A, vec4 B) { return vec4(1.0) - eq(A, B); }
vec4 wd(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) { return df(a,b) + df(a,c) + df(d,e) + df(d,f) + 4.0*df(g,h); }
float c_df(vec3 c1, vec3 c2) { vec3 d = abs(c1 - c2); return d.r + d.g + d.b; }
void main() {
  ivec2 p = ivec2(floor(vSrc));
  if (uHD == 0) { o = vec4(T(p), 1.0); return; }
  vec2 fp = fract(vSrc);
  vec3 A1 = T(p + ivec2(-1,-2)), B1 = T(p + ivec2(0,-2)), C1 = T(p + ivec2(1,-2));
  vec3 A = T(p + ivec2(-1,-1)), B = T(p + ivec2(0,-1)), C = T(p + ivec2(1,-1));
  vec3 D = T(p + ivec2(-1,0)), E = T(p), F = T(p + ivec2(1,0));
  vec3 G = T(p + ivec2(-1,1)), H = T(p + ivec2(0,1)), I = T(p + ivec2(1,1));
  vec3 G5 = T(p + ivec2(-1,2)), H5 = T(p + ivec2(0,2)), I5 = T(p + ivec2(1,2));
  vec3 A0 = T(p + ivec2(-2,-1)), D0 = T(p + ivec2(-2,0)), G0 = T(p + ivec2(-2,1));
  vec3 C4 = T(p + ivec2(2,-1)), F4 = T(p + ivec2(2,0)), I4 = T(p + ivec2(2,1));
  vec4 b = vec4(dot(B,rgbw), dot(D,rgbw), dot(H,rgbw), dot(F,rgbw));
  vec4 c = vec4(dot(C,rgbw), dot(A,rgbw), dot(G,rgbw), dot(I,rgbw));
  vec4 d = b.yzwx, e = vec4(dot(E,rgbw)), f = b.wxyz, g = c.zwxy, h = b.zwxy, i = c.wxyz;
  vec4 i4 = vec4(dot(I4,rgbw), dot(C1,rgbw), dot(A0,rgbw), dot(G5,rgbw));
  vec4 i5 = vec4(dot(I5,rgbw), dot(C4,rgbw), dot(A1,rgbw), dot(G0,rgbw));
  vec4 h5 = vec4(dot(H5,rgbw), dot(F4,rgbw), dot(B1,rgbw), dot(D0,rgbw));
  vec4 f4 = h5.yzwx;
  float S = uScale;
  vec4 delta = vec4(1.0 / S), delta_l = vec4(0.5 / S, 1.0 / S, 0.5 / S, 1.0 / S), delta_u = delta_l.yxwz;
  vec4 fx = Ao * fp.y + Bo * fp.x, fx_l = Ax * fp.y + Bx * fp.x, fx_u = Ay * fp.y + By * fp.x;
  vec4 irlv0 = diff(e,f) * diff(e,h);
  vec4 irlv1 = irlv0 * (neq(f,b) * neq(f,c) + neq(h,d) * neq(h,g) + eq(e,i) * (neq(f,f4) * neq(f,i4) + neq(h,h5) * neq(h,i5)) + eq(e,g) + eq(e,c));
  vec4 irlv2l = diff(e,g) * diff(d,g), irlv2u = diff(e,c) * diff(b,c);
  vec4 fx45i = clamp((fx + delta - Co - Ci) / (2.0 * delta), 0.0, 1.0);
  vec4 fx45 = clamp((fx + delta - Co) / (2.0 * delta), 0.0, 1.0);
  vec4 fx30 = clamp((fx_l + delta_l - Cx) / (2.0 * delta_l), 0.0, 1.0);
  vec4 fx60 = clamp((fx_u + delta_u - Cy) / (2.0 * delta_u), 0.0, 1.0);
  vec4 wd1 = wd(e, c, g, i, h5, f4, h, f), wd2 = wd(h, d, i5, f, i4, b, e, i);
  vec4 edri = step(wd1, wd2) * irlv0;
  vec4 edr = step(wd1 + vec4(0.1), wd2) * step(vec4(0.5), irlv1);
  vec4 edr_l = step(2.0 * df(f,g), df(h,c)) * irlv2l * edr;
  vec4 edr_u = step(2.0 * df(h,c), df(f,g)) * irlv2u * edr;
  fx45 = edr * fx45; fx30 = edr_l * fx30; fx60 = edr_u * fx60; fx45i = edri * fx45i;
  vec4 px = step(df(e,f), df(e,h));
  vec4 m = max(max(fx30, fx60), max(fx45, fx45i));
  vec3 r1 = mix(E, mix(H, F, px.x), m.x); r1 = mix(r1, mix(B, D, px.z), m.z);
  vec3 r2 = mix(E, mix(F, B, px.y), m.y); r2 = mix(r2, mix(D, H, px.w), m.w);
  o = vec4(mix(r1, r2, step(c_df(E, r1), c_df(E, r2))), 1.0);
}`;

const ATLAS_W = 1024, ATLAS_H = 512;   // Kacheln: 64 × 32 Kacheln à 16×16
const SPR_W = 2048, SPR_H = 2048;      // Sprites: einfache Regal-Packung

export class GLRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 nicht verfügbar');
    this.canvas = canvas; this.gl = gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.bg = this.program(FS_BG); this.spr = this.program(FS_SPR); this.sc = this.program(FS_SC, VS_SC);
    this.mode = 'hd';            // 'hd' (xBR) oder 'pixel'
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = (fmt, ifmt, type, w, h) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tAtlas = tex(gl.RED, gl.R8, gl.UNSIGNED_BYTE, ATLAS_W, ATLAS_H);
    this.tSpr = tex(gl.RG, gl.RG8, gl.UNSIGNED_BYTE, SPR_W, SPR_H);
    this.tPal = tex(gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, 256, 1);
    this.tMask = tex(gl.RED, gl.R8, gl.UNSIGNED_BYTE, 480, 1);
    this.tMap = null; this.tStatus = null; this.tOverlay = null;
    this.mapSize = [0, 0]; this.statusSize = [0, 0]; this.overlaySize = [0, 0];
    this.sprPos = new Map(); this.shelf = { x: 0, y: 0, h: 0 };
    this.frames = [];          // letzte Szenen (Spielzeit aufsteigend)
    this.clockOff = null;      // Spielzeit ≈ clockOff + Wanduhr·speed
    this.speed = 1;
    this.delay = 1 / 50;       // so weit hinter der neuesten Szene zeichnen, dass meist zwei Szenen vorliegen
    this.interpolate = true;
  }

  program(fs, vs = VS) {
    const gl = this.gl, sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }

  // Szene vom Worker übernehmen
  push(s) {
    const gl = this.gl;
    if (s.reset) { this.sprPos.clear(); this.shelf = { x: 0, y: 0, h: 0 }; this.frames = []; }
    gl.bindTexture(gl.TEXTURE_2D, this.tAtlas);
    for (const [g, px] of s.newTiles) gl.texSubImage2D(gl.TEXTURE_2D, 0, (g & 63) * 16, (g >> 6) * 16, 16, 16, gl.RED, gl.UNSIGNED_BYTE, px);
    gl.bindTexture(gl.TEXTURE_2D, this.tSpr);
    for (const sp of s.newSprites) {
      const sh = this.shelf;
      if (sh.x + sp.w > SPR_W) { sh.x = 0; sh.y += sh.h + 1; sh.h = 0; }
      if (sh.y + sp.h > SPR_H) { this.sprPos.clear(); sh.x = 0; sh.y = 0; sh.h = 0; } // voll: von vorn (selten)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, sh.x, sh.y, sp.w, sp.h, gl.RG, gl.UNSIGNED_BYTE, sp.px);
      this.sprPos.set(sp.k, [sh.x, sh.y]); sh.x += sp.w + 1; sh.h = Math.max(sh.h, sp.h);
    }
    const now = performance.now() / 1000, off = s.t - now * this.speed;
    if (this.clockOff === null || Math.abs(off - this.clockOff) > 0.25) this.clockOff = off;
    else this.clockOff += (off - this.clockOff) * 0.05;
    const last = this.frames[this.frames.length - 1];
    if (last && s.t < last.t) this.frames = [];        // Zeitsprung (neues Level, Laden)
    if (last && s.t === last.t) this.frames.pop();     // gleiche Szene, neuere Daten (Infofenster)
    this.frames.push(s);
    if (this.frames.length > 8) this.frames.shift();
  }

  upload(name, w, h, fmt, ifmt, type, data) {
    const gl = this.gl, key = name + 'Size';
    if (!this[name] || this[key][0] !== w || this[key][1] !== h) {
      if (this[name]) gl.deleteTexture(this[name]);
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
      this[name] = t; this[key] = [w, h];
    } else { gl.bindTexture(gl.TEXTURE_2D, this[name]); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, fmt, type, data); }
  }

  // Canvas an die Anzeigegröße anpassen; Rechteck mit Seitenverhältnis `aspect` einpassen, Rest schwarz
  fit(aspect) {
    const gl = this.gl, c = this.canvas, dpr = window.devicePixelRatio || 1;
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (W && H && (c.width !== W || c.height !== H)) { c.width = W; c.height = H; }
    let vw = c.width, vh = Math.round(c.width / aspect);
    if (vh > c.height) { vh = c.height; vw = Math.round(c.height * aspect); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, c.width, c.height); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return [(c.width - vw) >> 1, (c.height - vh) >> 1, vw, vh];
  }

  // Zwischenbild-Puffer in Spielauflösung (Spielfeld + 2 Pixel Rand für die Verschiebung)
  target(w, h) {
    const gl = this.gl;
    if (!this.fbo || this.fboW !== w || this.fboH !== h) {
      if (this.fboTex) gl.deleteTexture(this.fboTex);
      this.fboTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
      this.fbo = this.fbo || gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
      this.fboW = w; this.fboH = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
  }

  // Quelltextur hochskaliert ins Ausgaberechteck zeichnen. Ausgabe in Spielpixeln (rect, view),
  // Quelle in Texeln (src = Ursprung und Größe). Pixel: nächster Nachbar; HD: xBR-lv2.
  scale(tex, texW, texH, rect, view, src, outPx) {
    const gl = this.gl, P = this.sc;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u.uSrc, 0);
    gl.uniform2i(P.u.uSrcSize, texW, texH);
    gl.uniform4f(P.u.uRect, rect[0], rect[1], rect[2], rect[3]); gl.uniform2f(P.u.uView, view[0], view[1]);
    gl.uniform4f(P.u.uSrcRect, src[0], src[1], src[2], src[3]);
    gl.uniform1f(P.u.uScale, Math.max(1, outPx));
    gl.uniform1i(P.u.uHD, this.mode === 'hd' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Originalbild (Menüs, Karte, Titel) über den Skalierer zeichnen, 4:3, bei Breitbild mittig in 16:9
  pushFrame(rgba, w, h) { this.orig = { rgba, w, h, dirty: true }; }
  drawFrame(wide) {
    const gl = this.gl, f = this.orig; if (!f) return false;
    if (f.dirty) { this.upload('tOrig', f.w, f.h, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, f.rgba); f.dirty = false; }
    const box = this.fit(wide ? 16 / 9 : 4 / 3);
    if (wide) { const w43 = Math.round(box[3] * 4 / 3); box[0] += (box[2] - w43) >> 1; box[2] = w43; }
    gl.viewport(box[0], box[1], box[2], box[3]);
    gl.bindVertexArray(this.vao);
    this.scale(this.tOrig, f.w, f.h, [0, 0, f.w, f.h], [f.w, f.h], [0, 0, f.w, f.h], box[2] / f.w);
    return true;
  }

  // Ein Bild zeichnen; Zwischenstand zwischen zwei Szenen nach Spielzeit
  draw() {
    const gl = this.gl, fr = this.frames;
    if (!fr.length) return false;
    let a = fr[fr.length - 1], b = a, k = 0;
    if (this.interpolate && fr.length > 1) {
      const t = this.clockOff + performance.now() / 1000 * this.speed - this.delay;
      if (t <= fr[0].t) { a = b = fr[0]; }
      else for (let i = fr.length - 1; i > 0; i--) {
        if (fr[i - 1].t <= t) { a = fr[i - 1]; b = fr[i]; k = Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t)); break; }
      }
      if (b.reset || Math.abs(b.camX - a.camX) > 24 || Math.abs(b.camY - a.camY) > 24) { a = b; k = 0; }
    }
    const s = k > 0.5 ? b : a;                         // Kacheln, Palette, Statusleiste vom näheren Bild
    const camX = a.camX + (b.camX - a.camX) * k, camY = a.camY + (b.camY - a.camY) * k;
    // Spielfeld wird bei ganzzahliger Kamera gezeichnet; der Bruchteil verschiebt beim Hochskalieren
    const cx = Math.floor(camX), cy = Math.floor(camY), fx = camX - cx, fy = camY - cy;
    const VW = 320 + 2 * s.extra, VH = s.H, FW = VW + 2, FH = s.rows + 2;

    gl.bindVertexArray(this.vao);
    this.upload('tMap', s.cols, s.trows, gl.RED_INTEGER, gl.R16UI, gl.UNSIGNED_SHORT, s.map);
    this.upload('tStatus', 320, s.H - s.rows, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, s.status);
    if (s.overlay) this.upload('tOverlay', 320, s.rows, gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, s.overlay);
    gl.bindTexture(gl.TEXTURE_2D, this.tPal); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, s.pal);
    gl.bindTexture(gl.TEXTURE_2D, this.tMask); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, s.H, 1, gl.RED, gl.UNSIGNED_BYTE, s.mask);

    // 1. Spielfeld in Spielauflösung in den Zwischenpuffer
    this.target(FW, FH);
    const bind = (unit, t, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); };
    let P = this.bg; gl.useProgram(P.p);
    bind(0, this.tMap, P.u.uMap); bind(1, this.tAtlas, P.u.uAtlas); bind(2, this.tPal, P.u.uPal); bind(3, this.tMask, P.u.uMask);
    bind(4, this.tStatus, P.u.uStatus); bind(5, this.tOverlay || this.tStatus, P.u.uOverlay);
    gl.uniform4f(P.u.uRect, 0, 0, FW, FH); gl.uniform2f(P.u.uView, FW, FH);
    gl.uniform2f(P.u.uCam, cx, cy); gl.uniform2i(P.u.uTile0, s.tx0, s.ty0);
    gl.uniform1i(P.u.uCols, s.cols); gl.uniform1i(P.u.uRowsT, s.trows); gl.uniform1i(P.u.uRows, 9999);
    gl.uniform1i(P.u.uExtra, s.extra); gl.uniform1i(P.u.uHasOverlay, s.overlay ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!s.overlay) {
      // Sprites: Position zwischen a und b, Zuordnung über Reihenfolge und Nähe
      P = this.spr; gl.useProgram(P.p);
      bind(0, this.tSpr, P.u.uSprites); bind(1, this.tPal, P.u.uPal); bind(2, this.tMask, P.u.uMask);
      gl.uniform2f(P.u.uView, FW, FH); gl.uniform1i(P.u.uRows, s.rows);
      const list = k > 0.5 ? b.sprites : a.sprites, other = k > 0.5 ? a.sprites : b.sprites;
      const used = new Uint8Array(other.length);
      const dist = (o, sp) => Math.abs(o.x + o.w / 2 - sp.x - sp.w / 2) + Math.abs(o.y + o.h - sp.y - sp.h);
      for (let i = 0; i < list.length; i++) {
        const sp = list[i], pos = this.sprPos.get(sp.k); if (!pos) continue;
        // Partner im anderen Bild: gleicher Listenplatz bevorzugt, sonst der nächste in der Nähe
        let j = -1, best = 40;
        if (i < other.length && !used[i]) { const d = dist(other[i], sp); if (d < best) { j = i; best = d; } }
        if (j < 0) for (let q = 0; q < other.length; q++) { if (used[q]) continue; const d = dist(other[q], sp); if (d < best) { best = d; j = q; } }
        let x = sp.x, y = sp.y;
        if (j >= 0) {
          used[j] = 1; const o = other[j];
          // Ankerpunkt: Mitte unten (Füße), damit Bildwechsel mit anderer Größe nicht springen
          const A = k > 0.5 ? o : sp, B = k > 0.5 ? sp : o;
          const ax = A.x + A.w / 2 + (B.x + B.w / 2 - A.x - A.w / 2) * k, ay = A.y + A.h + (B.y + B.h - A.y - A.h) * k;
          x = ax - sp.w / 2; y = ay - sp.h;
        }
        const ox = Math.round(x - camX + fx) + s.extra, oy = Math.round(y - camY + fy);
        gl.uniform4f(P.u.uRect, ox, oy, sp.w, sp.h);
        gl.uniform4f(P.u.uSrc, pos[0], pos[1], sp.w, sp.h); gl.uniform2f(P.u.uOrigin, ox, oy);
        gl.uniform1i(P.u.uFlash, sp.flash);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    // 2. Hochskalieren auf den Bildschirm: Spielfeld um den Kamera-Bruchteil verschoben, Statusleiste fest
    const box = this.fit(16 / 9);
    gl.viewport(box[0], box[1], box[2], box[3]);
    const px = box[2] / VW;
    this.scale(this.fboTex, FW, FH, [0, 0, VW, s.rows], [VW, VH], [fx, fy, VW, s.rows], px);
    this.scale(this.tStatus, 320, s.H - s.rows, [s.extra, s.rows, 320, s.H - s.rows], [VW, VH], [0, 0, 320, s.H - s.rows], px);
    return true;
  }
}
