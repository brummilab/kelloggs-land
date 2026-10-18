// Seite: Spieldateien einlesen, Worker starten, Bild zeichnen, Tastatur weiterreichen.

import { readZip } from './zip.js';

const $ = (id) => document.getElementById(id);
const canvas = $('screen'), ctx = canvas.getContext('2d');
const off = document.createElement('canvas'), offCtx = off.getContext('2d');
let worker = null, started = false;

// KeyboardEvent.code -> Scancode (Set 1)
const SCAN = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06, Digit6: 0x07, Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b,
  Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f, KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16, KeyI: 0x17,
  KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c, NumpadEnter: 0x1c, ControlLeft: 0x1d, ControlRight: 0x1d,
  KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23, KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28,
  Backquote: 0x29, ShiftLeft: 0x2a, Backslash: 0x2b, KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32,
  Comma: 0x33, Period: 0x34, Slash: 0x35, ShiftRight: 0x36, AltLeft: 0x38, AltRight: 0x38, Space: 0x39, CapsLock: 0x3a,
  F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e, F5: 0x3f, F6: 0x40, F7: 0x41, F8: 0x42, F9: 0x43, F10: 0x44,
  Home: 0x47, ArrowUp: 0x48, PageUp: 0x49, ArrowLeft: 0x4b, ArrowRight: 0x4d, End: 0x4f, ArrowDown: 0x50, PageDown: 0x51, Insert: 0x52, Delete: 0x53,
  Numpad8: 0x48, Numpad4: 0x4b, Numpad6: 0x4d, Numpad2: 0x50,
};

function setStatus(text, kind = '') { const s = $('status'); s.textContent = text; s.dataset.kind = kind; }

const NEEDED = ['START.EXE', 'PCKELL.DAT'];

async function collect(fileList) {
  const files = {};
  for (const f of fileList) {
    const buf = await f.arrayBuffer();
    if (/\.zip$/i.test(f.name)) {
      const z = await readZip(buf);
      for (const [name, data] of Object.entries(z)) files[name.split(/[\\/]/).pop().toUpperCase()] = data;
    } else files[f.name.toUpperCase()] = new Uint8Array(buf);
  }
  return files;
}

async function start(fileList) {
  if (started) return;
  setStatus('Lese Dateien …');
  let files;
  try { files = await collect(fileList); } catch (e) { setStatus(`Die Datei ließ sich nicht lesen: ${e.message}`, 'error'); return; }
  const missing = NEEDED.filter((n) => !files[n]);
  if (missing.length) {
    setStatus(`Es fehlt: ${missing.join(', ')}. Wähle den entpackten Spielordner oder die ZIP-Datei mit diesen Dateien.`, 'error');
    return;
  }
  let hiscore = null;
  try { const s = localStorage.getItem('kelloggs-hiscore'); if (s) hiscore = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)); } catch {}
  started = true;
  document.body.dataset.state = 'running';
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onWorker;
  worker.postMessage({ type: 'start', files, hiscore });
  setStatus('Läuft. Klick ins Bild, falls die Tasten nicht reagieren.');
  canvas.focus();
}

let frames = 0, lastFps = performance.now(), loadAvg = 0;
function onWorker(e) {
  const m = e.data;
  if (m.type === 'frame') {
    if (off.width !== m.w || off.height !== m.h) { off.width = m.w; off.height = m.h; }
    offCtx.putImageData(new ImageData(new Uint8ClampedArray(m.buf), m.w, m.h), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    frames++; loadAvg = loadAvg * 0.95 + m.load * 0.05;
    const now = performance.now();
    if (now - lastFps > 1000) {
      $('mode').textContent = `${m.w}×${m.h} · Modus ${m.mode.toString(16).toUpperCase()}h`;
      $('fps').textContent = `${Math.round(frames * 1000 / (now - lastFps))} fps · CPU ${Math.round(loadAvg * 100)} %`;
      frames = 0; lastFps = now;
    }
  } else if (m.type === 'log') {
    const l = $('log'); l.textContent += m.text + '\n'; l.scrollTop = l.scrollHeight;
  } else if (m.type === 'error') {
    setStatus('Der Emulator ist auf einen Fehler gestoßen. Details stehen im Protokoll.', 'error');
    $('log').textContent += '\nFEHLER: ' + m.text + '\n'; $('logbox').open = true;
  } else if (m.type === 'exit') {
    setStatus(`Spiel beendet (Code ${m.code}). Lade die Seite neu, um wieder zu spielen.`);
  } else if (m.type === 'save') {
    try { localStorage.setItem('kelloggs-hiscore', btoa(String.fromCharCode(...m.data))); } catch {}
  }
}

function key(e, down) {
  if (!worker) return;
  const s = SCAN[e.code];
  if (s === undefined) return;
  if (e.repeat) { e.preventDefault(); return; }
  worker.postMessage({ type: 'key', down, scan: s });
  e.preventDefault();
}
window.addEventListener('keydown', (e) => key(e, true));
window.addEventListener('keyup', (e) => key(e, false));
window.addEventListener('blur', () => worker && worker.postMessage({ type: 'pause', on: true }));
window.addEventListener('focus', () => worker && worker.postMessage({ type: 'pause', on: false }));

$('pick').addEventListener('change', (e) => start(e.target.files));
$('pickdir').addEventListener('change', (e) => start(e.target.files));
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.dataset.over = '1'; }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => { delete drop.dataset.over; }));
drop.addEventListener('drop', (e) => { e.preventDefault(); start(e.dataTransfer.files); });

$('full').addEventListener('click', async () => {
  try { await $('stage').requestFullscreen(); } catch { setStatus('Vollbild ist hier nicht verfügbar.'); }
  canvas.focus();
});
$('speed').addEventListener('change', (e) => worker && worker.postMessage({ type: 'speed', value: +e.target.value }));

// Startbild: Testbild im Spielrahmen
ctx.fillStyle = '#0b1a63'; ctx.fillRect(0, 0, canvas.width, canvas.height);
