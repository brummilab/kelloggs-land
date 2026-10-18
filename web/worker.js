// Web Worker: führt die Maschine aus, schickt Bilder an die Seite, nimmt Tasten entgegen.

import { Machine } from './machine.js';
import { sceneFor } from './scene.js';

let m = null, last = 0, paused = false, speed = 1, lastFrame = -1;
let audioOn = false, audioChunks = [], audioRate = 20000;
let scene = null, wide = false;

function onSamples(buf, rate) {
  if (!audioOn) return;
  audioChunks.push(buf); audioRate = rate;
}
function sendAudio() {
  if (!audioChunks.length) return;
  const n = audioChunks.reduce((a, b) => a + b.length, 0), all = new Float32Array(n);
  let o = 0; for (const b of audioChunks) { all.set(b, o); o += b.length; }
  audioChunks = [];
  postMessage({ type: 'audio', samples: all, rate: audioRate }, [all.buffer]);
}

function log(text) { postMessage({ type: 'log', text }); }

function tick() {
  if (!m || paused) return;
  const now = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  const t0 = performance.now();
  try {
    m.run(dt);
    m.sb.flush(); sendAudio();
  } catch (e) {
    postMessage({ type: 'error', text: `${e.message}\n${m.cpu.dumpRegs()}\n${m.cpu.lastTrace(16)}` });
    m = null; return;
  }
  const busy = performance.now() - t0;
  if (m.vga.frames === lastFrame && m.vga.last) return; // kein neues Bild seit dem letzten Tick
  lastFrame = m.vga.frames;
  // Breitbild, wenn eingeschaltet und gerade ein Level läuft; sonst das Originalbild
  const f = (wide && scene && scene.compose()) || m.frame();
  postMessage({ type: 'frame', w: f.width, h: f.height, buf: f.rgba.buffer, mode: m.vga.mode, t: m.time, load: busy / (dt * 1000 || 1) }, [f.rgba.buffer]);
  if (m.exitCode !== null) { postMessage({ type: 'exit', code: m.exitCode }); m = null; }
}

onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'start') {
    m = new Machine({ files: msg.files, log, onSamples });
    try {
      const hs = msg.hiscore; if (hs) m.files.set('HISCORE.DAT', hs);
      m.load();
    } catch (err) { postMessage({ type: 'error', text: err.message }); m = null; return; }
    scene = sceneFor(m);
    postMessage({ type: 'wide-support', on: !!scene, name: scene ? scene.p.name : null });
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
  } else if (msg.type === 'audio') {
    audioOn = msg.on; audioChunks = [];
  } else if (msg.type === 'wide') {
    wide = msg.on; lastFrame = -1;
  } else if (msg.type === 'speed') {
    speed = msg.value;
  }
};
