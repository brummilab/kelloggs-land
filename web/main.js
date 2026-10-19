// Seite: Spieldateien einlesen, Worker starten, Bild zeichnen, Tastatur weiterreichen.

import { readZip } from './zip.js';
import { GLRenderer } from './gl.js';

const $ = (id) => document.getElementById(id);
// App-Modus (Android-App, ?app=1): Spieldateien liegen mit in der App (../game/), Touch-Steuerung
const APP = new URLSearchParams(location.search).has('app');
if (APP) document.body.classList.add('app');
// App-Version und Ergebnis der Update-Prüfung (setzt die Android-App über window.__upd)
const APPVER = new URLSearchParams(location.search).get('v');
window.kelloggsShowUpdate = () => {
  const el = $('appver'); if (!APP || !el) return;
  el.textContent = 'Version ' + (APPVER || '?') + (window.__upd ? ' · ' + window.__upd : '');
  el.hidden = false;
};
window.kelloggsShowUpdate();
const canvas = $('screen'), ctx = canvas.getContext('2d');
const off = document.createElement('canvas'), offCtx = off.getContext('2d');
let worker = null, started = false;
let audio = null, audioNode = null, soundOn = false;
// Breitbild 16:9: neu aufgebautes Level (Kacheln + Sprites aus dem Speicher des Spiels)
let wideOn = false, glr = null, glActive = false;
try { glr = new GLRenderer(document.getElementById('gl')); } catch (e) { glr = null; }
try { wideOn = localStorage.getItem('kelloggs-wide') === '1'; } catch {}
if (APP) { try { if (localStorage.getItem('kelloggs-wide') === null) wideOn = true; } catch { wideOn = true; } }
function setWide(on) {
  wideOn = on;
  canvas.width = on ? 1280 : 640; canvas.height = on ? 720 : 480;
  document.getElementById('stage').classList.toggle('wide', on);
  const b = document.getElementById('wide'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? 'Breitbild an' : 'Breitbild';
  try { localStorage.setItem('kelloggs-wide', on ? '1' : '0'); } catch {}
  if (worker) worker.postMessage({ type: 'wide', on, gl: !!glr });
  if (!on) setGl(false);
}
// glActive: 'scene' (Breitbild-Level) oder false (2D-Canvas)
function setGl(on) {
  if (glActive === on) return;
  debug.glSwitches = (debug.glSwitches || 0) + 1;
  glActive = on; document.getElementById('stage').classList.toggle('gl', !!on);
}
// WebGL: jedes Bildschirmbild zeichnen, im Level mit Zwischenbildern zwischen den Szenen des Spiels
function glLoop() {
  if (glActive === 'scene' && glr.draw()) countFrame();
  requestAnimationFrame(glLoop);
}
requestAnimationFrame(glLoop);
// Zustand für Tests und Fehlersuche (Konsole: kelloggs)
const debug = { audioSamples: 0, audioRate: 0, get audioState() { return audio ? audio.state : 'aus'; } };
window.kelloggs = debug;
debug.gl = () => glr; debug.glActive = () => glActive;

// Ton erst nach einem Klick (Browser-Regel für Autoplay)
async function setSound(on) {
  try {
    if (on && !audio) {
      audio = new AudioContext({ latencyHint: 'interactive' });
      await audio.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url));
      audioNode = new AudioWorkletNode(audio, 'sb-player', { outputChannelCount: [2] });
      audioNode.connect(audio.destination);
      audioNode.port.postMessage({ vol: +$('volume').value });
    }
    if (audio) { if (on) await audio.resume(); else await audio.suspend(); }
    soundOn = on;
  } catch (e) {
    soundOn = false; setStatus(`Ton lässt sich hier nicht abspielen: ${e.message}`, 'error');
  }
  $('sound').textContent = soundOn ? 'Ton aus' : 'Ton an';
  $('sound').setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  if (worker) worker.postMessage({ type: 'audio', on: soundOn });
}

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
  startFiles(files);
}

function startFiles(files) {
  if (started) return;
  const missing = NEEDED.filter((n) => !files[n]);
  if (missing.length) {
    setStatus(`Es fehlt: ${missing.join(', ')}. Wähle den entpackten Spielordner oder die ZIP-Datei mit diesen Dateien.`, 'error');
    return;
  }
  if (!APP) saveGame(files);
  let hiscore = null;
  try { const s = localStorage.getItem('kelloggs-hiscore'); if (s) hiscore = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)); } catch {}
  started = true;
  touchMode();
  document.body.dataset.state = 'running';
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onWorker;
  worker.postMessage({ type: 'start', files, hiscore });
  worker.postMessage({ type: 'audio', on: soundOn });
  applySettings();
  setStatus('Läuft. Klick ins Bild, falls die Tasten nicht reagieren.');
  canvas.focus();
}

let frames = 0, lastFps = performance.now(), loadAvg = 0, modeText = '–';
function countFrame() {
  frames++;
  const now = performance.now();
  if (now - lastFps > 1000) {
    $('mode').textContent = modeText;
    $('fps').textContent = `${Math.round(frames * 1000 / (now - lastFps))} fps · CPU ${Math.round(loadAvg * 100)} %`;
    frames = 0; lastFps = now;
  }
}
function onWorker(e) {
  const m = e.data;
  if (m.type === 'frame') {
    countFrame(); loadAvg = loadAvg * 0.95 + m.load * 0.05; modeText = `${m.w}×${m.h} · Modus ${m.mode.toString(16).toUpperCase()}h`;
    setGl(false);
    if (off.width !== m.w || off.height !== m.h) { off.width = m.w; off.height = m.h; }
    offCtx.putImageData(new ImageData(new Uint8ClampedArray(m.buf), m.w, m.h), 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (wideOn && m.w <= 360) {
      // Originalbild (4:3) im Breitbild-Rahmen mittig, links und rechts schwarz
      const w43 = Math.round(canvas.height * 4 / 3), x0 = (canvas.width - w43) >> 1;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, x0, canvas.height); ctx.fillRect(x0 + w43, 0, canvas.width - x0 - w43, canvas.height);
      ctx.drawImage(off, x0, 0, w43, canvas.height);
    } else ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  } else if (m.type === 'scene') {
    const ov = !!m.scene.overlay; if (ov !== debug.lastOverlay) { debug.overlayToggles = (debug.overlayToggles || 0) + 1; debug.lastOverlay = ov; }
    glr.push(m.scene); setGl('scene');
    loadAvg = loadAvg * 0.95 + m.load * 0.05; modeText = `${m.scene.extra ? 'Breitbild' : '4:3'} WebGL · ${320 + 2 * m.scene.extra}×${m.scene.H}`;
  } else if (m.type === 'wide-support') {
    const btn = $('wide');
    btn.disabled = !m.on;
    btn.title = m.on ? `Breitbild 16:9 für die ${m.name}` : 'Breitbild gibt es bisher nur für die deutsche Version (START.EXE mit 147 200 Bytes)';
    worker.postMessage({ type: 'wide', on: !!(m.on && wideOn), gl: !!glr });
    if (!m.on && wideOn) setWide(false);
  } else if (m.type === 'audio') {
    debug.audioSamples += m.samples.length; debug.audioRate = m.rate;
    if (audioNode && soundOn) audioNode.port.postMessage({ samples: m.samples, rate: m.rate }, [m.samples.buffer]);
  } else if (m.type === 'log') {
    const l = $('log'); l.textContent += m.text + '\n'; l.scrollTop = l.scrollHeight;
  } else if (m.type === 'error') {
    setStatus('Der Emulator ist auf einen Fehler gestoßen. Details stehen im Protokoll.', 'error');
    $('log').textContent += '\nFEHLER: ' + m.text + '\n'; $('logbox').open = true;
  } else if (m.type === 'exit') {
    setStatus(`Spiel beendet (Code ${m.code}). Lade die Seite neu, um wieder zu spielen.`);
  } else if (m.type === 'state') {
    putState(m.state).then((ok) => note(ok ? 'Spielstand gespeichert' : 'Spielstand ließ sich nicht speichern'));
  } else if (m.type === 'state-loaded') {
    note('Spielstand geladen');
  } else if (m.type === 'state-error') {
    note('Spielstand: ' + m.text);
  } else if (m.type === 'save') {
    try { localStorage.setItem('kelloggs-hiscore', btoa(String.fromCharCode(...m.data))); } catch {}
  }
}

function key(e, down) {
  if (!worker) return;
  if (e.code === 'F5' || e.code === 'F9') { e.preventDefault(); if (down && !e.repeat) (e.code === 'F5' ? saveSlot : loadSlot)(); return; }
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

// Beim Laden des Spiels gleich den Ton einschalten: die Dateiauswahl ist ein Klick des Nutzers
$('pick').addEventListener('click', () => { if (!soundOn) setSound(true); });
$('pickdir').addEventListener('click', () => { if (!soundOn) setSound(true); });
$('pick').addEventListener('change', (e) => start(e.target.files));
$('pickdir').addEventListener('change', (e) => start(e.target.files));
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.dataset.over = '1'; }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => { delete drop.dataset.over; }));
drop.addEventListener('drop', (e) => { e.preventDefault(); start(e.dataTransfer.files); });

$('wide').addEventListener('click', () => { setWide(!wideOn); canvas.focus(); });
setWide(wideOn);
$('full').addEventListener('click', async () => {
  try { await $('stage').requestFullscreen(); } catch { setStatus('Vollbild ist hier nicht verfügbar.'); }
  canvas.focus();
});
$('sound').addEventListener('click', () => { setSound(!soundOn); canvas.focus(); });
// Einstellungen bleiben in diesem Browser gespeichert (Lautstärke, Tempo)
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('kelloggs-' + k); localStorage.setItem('kelloggs-' + k, v); } catch {} return null; };
{ const v = pref('volume'); if (v !== null) $('volume').value = v; const sp = pref('speed'); if (sp !== null && [...$('speed').options].some((o) => o.value === sp)) $('speed').value = sp; }
function applySettings() {
  if (audioNode) audioNode.port.postMessage({ vol: +$('volume').value });
  const sp = +$('speed').value; if (glr) glr.speed = sp; if (worker) worker.postMessage({ type: 'speed', value: sp });
}
$('volume').addEventListener('input', (e) => { pref('volume', e.target.value); applySettings(); });
$('speed').addEventListener('change', (e) => { pref('speed', e.target.value); applySettings(); });

// Startbild: Testbild im Spielrahmen
ctx.fillStyle = '#0b1a63'; ctx.fillRect(0, 0, canvas.width, canvas.height);

// ---------------------------------------------------------------- App-Modus: Start, Touch-Tasten, Zurück-Taste
function sendScan(scan, down) { if (worker) worker.postMessage({ type: 'key', down, scan }); }
window.kelloggsKey = (scan) => { sendScan(scan, true); setTimeout(() => sendScan(scan, false), 120); };
if (APP) {
  $('tapstart').addEventListener('click', async () => {
    $('tapstart').disabled = true; $('tapstart').textContent = 'Lade …';
    setSound(true);
    try {
      const base = new URL('../game/', location.href);
      const names = await (await fetch(new URL('files.json', base))).json();
      const files = {};
      for (const n of names) files[n.toUpperCase()] = new Uint8Array(await (await fetch(new URL(n, base))).arrayBuffer());
      startFiles(files);
    } catch (e) { $('tapstart').textContent = 'Spieldateien fehlen in der App'; }
  });
}

// ---------------------------------------------------------------- Touch-Tasten (App und Handy-Browser)
// Im Handy-Browser (grober Zeiger, kein Mauszeiger) wechselt die Seite beim Spielstart in dieselbe
// bildschirmfüllende Ansicht wie die App, mit Touch-Tasten.
const TOUCH = APP || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
function touchMode() {
  if (!TOUCH || APP) return;
  document.body.classList.add('app', 'touchweb');
  try { const r = document.documentElement.requestFullscreen(); if (r) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch {}
}
for (const b of document.querySelectorAll('#touch .tbtn[data-scan]')) {
  const scan = +b.dataset.scan; let ids = new Set();
  const on = (e) => { e.preventDefault(); if (!ids.size) sendScan(scan, true); ids.add(e.pointerId); b.dataset.on = ''; try { b.setPointerCapture(e.pointerId); } catch {} };
  const off = (e) => { if (!ids.delete(e.pointerId)) return; if (!ids.size) { sendScan(scan, false); delete b.dataset.on; } };
  b.addEventListener('pointerdown', on);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, off);
}
$('twide').addEventListener('pointerdown', (e) => { e.preventDefault(); if (!$('wide').disabled) setWide(!wideOn); });

// ---------------------------------------------------------------- Gamepad
// Standard-Belegung: Steuerkreuz/linker Stick = Pfeile, A = Sprung, B/X = Aktion (Alt), Y = Pause,
// Start = Enter, Select/Zurück = Esc. Gedrückte Tasten werden nur bei Änderung weitergereicht.
const PAD = [[0, 0x39], [1, 0x38], [2, 0x38], [3, 0x19], [9, 0x1c], [8, 0x01], [12, 0x48], [13, 0x50], [14, 0x4b], [15, 0x4d]];
const padDown = new Map();
function padScan() {
  const want = new Set();
  for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) {
    if (!g || !g.connected) continue;
    for (const [i, scan] of PAD) { const b = g.buttons[i]; if (b && (b.pressed || b.value > 0.5)) want.add(scan); }
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    if (ax < -0.5) want.add(0x4b); if (ax > 0.5) want.add(0x4d);
    if (ay < -0.6) want.add(0x48); if (ay > 0.6) want.add(0x50);
  }
  for (const scan of want) if (!padDown.has(scan)) { padDown.set(scan, 1); sendScan(scan, true); }
  for (const scan of [...padDown.keys()]) if (!want.has(scan)) { padDown.delete(scan); sendScan(scan, false); }
}
let padTimer = null;
window.addEventListener('gamepadconnected', (e) => {
  setStatus(`Gamepad verbunden: ${e.gamepad.id.replace(/\s*\(.*$/, '')}`);
  if (!padTimer) padTimer = setInterval(padScan, 1000 / 120);
});
debug.pad = () => [...padDown.keys()];

// ---------------------------------------------------------------- Spielstände
// Ein Spielstand (F5 speichern, F9 laden, oder die Knöpfe) liegt in diesem Browser in IndexedDB.
async function putState(state) {
  try {
    const db = await gameDb();
    await new Promise((ok, err) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(state, 'state'); tx.oncomplete = ok; tx.onerror = () => err(tx.error); });
    return true;
  } catch { return false; }
}
async function getState() {
  try {
    const db = await gameDb();
    return await new Promise((ok) => { const r = db.transaction('files').objectStore('files').get('state'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
  } catch { return null; }
}
let noteTimer = null;
function note(text) {
  const n = $('note'); n.textContent = text; n.hidden = false;
  clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.hidden = true; }, 2200);
  setStatus(text);
}
function saveSlot() { if (worker) worker.postMessage({ type: 'save-state' }); }
async function loadSlot() {
  if (!worker) return;
  const st = await getState();
  if (!st) { note('Noch kein Spielstand gespeichert'); return; }
  worker.postMessage({ type: 'load-state', state: st });
}
$('savestate').addEventListener('click', () => { saveSlot(); canvas.focus(); });
$('loadstate').addEventListener('click', () => { loadSlot(); canvas.focus(); });
for (const [id, fn] of [['tsave', saveSlot], ['tload', loadSlot]]) $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
debug.saveSlot = saveSlot; debug.loadSlot = loadSlot;

// ---------------------------------------------------------------- Offline (installierbare Web-App)
if (!APP && 'serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------------------------------------------------------------- Spielkopie im Browser merken (nur Website)
// Nach dem ersten Laden bleibt die eigene Spielkopie in diesem Browser (IndexedDB) gespeichert, beim nächsten
// Besuch reicht ein Klick auf „Weiterspielen“. Die Dateien verlassen den Browser nie.
function gameDb() {
  return new Promise((ok, err) => {
    const r = indexedDB.open('kelloggs-game', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error);
  });
}
async function saveGame(files) {
  try {
    const db = await gameDb(), tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(files, 'copy');
  } catch {}
}
async function loadGame() {
  try {
    const db = await gameDb();
    return await new Promise((ok) => { const r = db.transaction('files').objectStore('files').get('copy'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
  } catch { return null; }
}
if (!APP) loadGame().then((files) => {
  if (!files || !NEEDED.every((n) => files[n])) return;
  $('resumebox').hidden = false;
  $('resume').addEventListener('click', () => { if (!soundOn) setSound(true); startFiles(files); });
  $('forget').addEventListener('click', async () => {
    try { const db = await gameDb(); db.transaction('files', 'readwrite').objectStore('files').delete('copy'); } catch {}
    $('resumebox').hidden = true;
  });
});
