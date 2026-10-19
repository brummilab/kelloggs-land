// Spielstände (Save States): der komplette Zustand der nachgebauten Maschine (Speicher, CPU, VGA, Timer,
// Sound Blaster, DMA, DOS-Verwaltung) als Daten, die sich per postMessage verschicken und in IndexedDB
// ablegen lassen. Funktionen (Thunks, Rückrufe) werden nicht gespeichert: Laden geschieht in eine frisch
// gestartete Maschine mit denselben Spieldateien, die ihre Funktionen schon hat; nur die Daten werden
// darübergeschrieben. Große Speicherbereiche werden seitenweise gespeichert (leere Seiten fallen weg).

const VERSION = 1;
const PAGE = 4096;
const SKIP = new Set(['files', 'ne', 'log', 'stats', 'warned', 'thunks', 'onSamples', 'raiseIrq', 'onReload', 'last']);
const SKIPPED = Symbol('skip');

const isTyped = (v) => ArrayBuffer.isView(v) && !(v instanceof DataView);
const isPlain = (v) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };

function encode(v, seen) {
  if (typeof v === 'function' || typeof v === 'symbol') return SKIPPED;
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return { $k: 'ref' };          // gemeinsam genutztes Objekt (z. B. Speicher): Verweis bleibt
  seen.add(v);
  if (isTyped(v)) {
    if (v.byteLength <= 256 * 1024) return { $k: 'ta', t: v.constructor.name, d: v.slice() };
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength), pages = [];
    for (let o = 0; o < bytes.length; o += PAGE) {
      const end = Math.min(o + PAGE, bytes.length);
      let used = false; for (let i = o; i < end; i++) if (bytes[i]) { used = true; break; }
      if (used) pages.push([o, bytes.slice(o, end)]);
    }
    return { $k: 'sparse', t: v.constructor.name, n: v.length, pages };
  }
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v) { const e = encode(x, seen); if (e === SKIPPED) return SKIPPED; out.push(e); }
    return out;
  }
  if (v instanceof Map) {
    const out = [];
    for (const [k, x] of v) { const ek = encode(k, seen), e = encode(x, seen); if (e === SKIPPED || ek === SKIPPED) return SKIPPED; out.push([ek, e]); }
    return { $k: 'map', e: out };
  }
  if (v instanceof Set) {
    const out = [];
    for (const x of v) { const e = encode(x, seen); if (e === SKIPPED) return SKIPPED; out.push(e); }
    return { $k: 'set', e: out };
  }
  const out = {};
  for (const k of Object.keys(v)) {
    if (SKIP.has(k)) continue;
    const e = encode(v[k], seen);
    if (e !== SKIPPED) out[k] = e;
  }
  return isPlain(v) ? out : { $k: 'obj', f: out };
}

function makeTyped(t, n) { const C = globalThis[t]; return new C(n); }

// Gespeicherte Daten in einen neuen Wert verwandeln (für Felder ohne passendes Gegenstück)
function revive(e) {
  if (e === null || typeof e !== 'object') return e;
  if (Array.isArray(e)) return e.map(revive);
  switch (e.$k) {
    case 'ta': return e.d.slice();
    case 'sparse': { const a = makeTyped(e.t, e.n), b = new Uint8Array(a.buffer); for (const [o, d] of e.pages) b.set(d, o); return a; }
    case 'map': return new Map(e.e.map(([k, v]) => [revive(k), revive(v)]));
    case 'set': return new Set(e.e.map(revive));
    case 'obj': { const o = {}; for (const k of Object.keys(e.f)) o[k] = revive(e.f[k]); return o; }
    case 'ref': return undefined;
    default: { const o = {}; for (const k of Object.keys(e)) o[k] = revive(e[k]); return o; }
  }
}

// Gespeicherten Wert e in das vorhandene Feld holder[key] schreiben, Objekte mit Methoden bleiben erhalten
function apply(holder, key, e) {
  const cur = holder[key];
  if (e && typeof e === 'object' && e.$k === 'ref') return;          // Verweis: vorhandene Verbindung behalten
  if (e && typeof e === 'object' && (e.$k === 'ta' || e.$k === 'sparse') && isTyped(cur) && cur.length === (e.$k === 'ta' ? e.d.length : e.n) && cur.constructor.name === e.t) {
    if (e.$k === 'ta') cur.set(e.d);
    else { const b = new Uint8Array(cur.buffer, cur.byteOffset, cur.byteLength); b.fill(0); for (const [o, d] of e.pages) b.set(d, o); }
    return;
  }
  if (e && typeof e === 'object' && e.$k === 'obj' && cur && typeof cur === 'object' && !isPlain(cur)) { into(cur, e.f); return; }
  if (Array.isArray(e) && Array.isArray(cur) && cur.length === e.length && cur.some((x) => x && typeof x === 'object' && !isPlain(x) && !Array.isArray(x))) {
    for (let i = 0; i < e.length; i++) apply(cur, i, e[i]);
    return;
  }
  holder[key] = revive(e);
}
function into(target, fields) { for (const k of Object.keys(fields)) apply(target, k, fields[k]); }

export function saveState(m) {
  const defThunks = [];
  if (m.defThunks) m.defThunks.forEach((v, n) => { if (v) defThunks.push([n, v.off]); });
  defThunks.sort((a, b) => a[1] - b[1]);
  return { version: VERSION, exe: m.file('START.EXE').length, thunkCount: m.thunks.length, defThunks: defThunks.map((d) => d[0]), time: m.time, data: encode(m, new Set()) };
}

// m: frisch geladene Maschine mit denselben Spieldateien
export function loadState(m, s) {
  if (!s || s.version !== VERSION) throw new Error('Spielstand aus einer anderen Version');
  if (m.file('START.EXE').length !== s.exe) throw new Error('Spielstand gehört zu einer anderen Spielversion');
  for (const n of s.defThunks) m.defaultThunk(n);      // zur Laufzeit angelegte Thunks in derselben Reihenfolge
  if (m.thunks.length !== s.thunkCount) throw new Error('Spielstand passt nicht zu dieser Maschine');
  const f = s.data.$k === 'obj' ? s.data.f : s.data;
  into(m, f);
  m.vga.last = null;
}
