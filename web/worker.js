// Web Worker: führt die Maschine aus, schickt Bilder an die Seite, nimmt Tasten entgegen.

import { Machine } from './machine.js';

let m = null, last = 0, paused = false, speed = 1, lastFrame = -1;

function log(text) { postMessage({ type: 'log', text }); }

function tick() {
  if (!m || paused) return;
  const now = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  const t0 = performance.now();
  try {
    m.run(dt);
  } catch (e) {
    postMessage({ type: 'error', text: `${e.message}\n${m.cpu.dumpRegs()}\n${m.cpu.lastTrace(16)}` });
    m = null; return;
  }
  const busy = performance.now() - t0;
  if (m.vga.frames === lastFrame && m.vga.last) return; // kein neues Bild seit dem letzten Tick
  lastFrame = m.vga.frames;
  const f = m.frame();
  postMessage({ type: 'frame', w: f.width, h: f.height, buf: f.rgba.buffer, mode: m.vga.mode, t: m.time, load: busy / (dt * 1000 || 1) }, [f.rgba.buffer]);
  if (m.exitCode !== null) { postMessage({ type: 'exit', code: m.exitCode }); m = null; }
}

onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'start') {
    m = new Machine({ files: msg.files, log });
    try {
      const hs = msg.hiscore; if (hs) m.files.set('HISCORE.DAT', hs);
      m.load();
    } catch (err) { postMessage({ type: 'error', text: err.message }); m = null; return; }
    // Highscores beim Schreiben an die Seite melden (zum Speichern im Browser)
    const close = m.int21.bind(m);
    m.int21 = () => {
      const c = m.cpu;
      const h = c.ah === 0x3e ? m.handles[c.bx] : null;
      close();
      if (h && h.name === 'HISCORE.DAT') postMessage({ type: 'save', name: 'HISCORE.DAT', data: m.files.get('HISCORE.DAT') });
    };
    last = performance.now();
    setInterval(tick, 1000 / 60);
  } else if (msg.type === 'key' && m) {
    if (msg.down) m.keyDown(msg.scan); else m.keyUp(msg.scan);
  } else if (msg.type === 'pause') {
    paused = msg.on; last = performance.now();
  } else if (msg.type === 'speed') {
    speed = msg.value;
  }
};
