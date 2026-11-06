'use strict';
/* Cimática — detecção de notas e acordes + visualização de placas vibrantes.
   Tudo roda no navegador (Web Audio API + Canvas). */

// ============================================================
// Utilidades, configurações e teoria musical
// ============================================================
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const store = {
  get(k, d) { try { const v = localStorage.getItem('cimatica.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cimatica.' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};

const DEFAULTS = { instrument: 'auto', detect: 'note', a4: 440, shape: 'square', sens: 60, count: 16000 };
const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

const NOTES_PT = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
const NOTES_EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const SHARP_PCS = [1, 3, 6, 8, 10];

const freqToMidi = f => 69 + 12 * Math.log2(f / settings.a4);
const midiToFreq = m => settings.a4 * Math.pow(2, (m - 69) / 12);
const pcOf = m => ((m % 12) + 12) % 12;
const octOf = m => Math.floor(m / 12) - 1;
const nameEN = m => NOTES_EN[pcOf(m)] + octOf(m);
const namePT = m => NOTES_PT[pcOf(m)] + octOf(m);
const noteHTML = m => `${NOTES_PT[pcOf(m)]}<sub>${octOf(m)}</sub>`;
const hueOf = m => (pcOf(m) * 30 + 190) % 360;

const INSTRUMENTS = {
  auto:   { fmin: 60,  fmax: 2500, game: [48, 79], strings: null, staffShift: 0 },
  guitar: { fmin: 72,  fmax: 1400, game: [40, 76], staffShift: 12,
            strings: [['6ª', 40], ['5ª', 45], ['4ª', 50], ['3ª', 55], ['2ª', 59], ['1ª', 64]] },
  violin: { fmin: 180, fmax: 3600, game: [55, 88], staffShift: 0,
            strings: [['4ª', 55], ['3ª', 62], ['2ª', 69], ['1ª', 76]] },
};
const inst = () => INSTRUMENTS[settings.instrument] || INSTRUMENTS.auto;

const INTERVALS = ['uníssono', 'segunda menor', 'segunda maior', 'terça menor', 'terça maior', 'quarta justa',
  'trítono', 'quinta justa', 'sexta menor', 'sexta maior', 'sétima menor', 'sétima maior'];

const CHORD_TYPES = [
  { iv: [0, 4, 7], s: '', pt: 'maior' },
  { iv: [0, 3, 7], s: 'm', pt: 'menor' },
  { iv: [0, 4, 7, 10], s: '7', pt: 'com sétima' },
  { iv: [0, 4, 7, 11], s: '7M', pt: 'com sétima maior' },
  { iv: [0, 3, 7, 10], s: 'm7', pt: 'menor com sétima' },
  { iv: [0, 3, 7, 11], s: 'm(7M)', pt: 'menor com sétima maior' },
  { iv: [0, 3, 6], s: '°', pt: 'diminuto' },
  { iv: [0, 3, 6, 9], s: '°7', pt: 'diminuto com sétima' },
  { iv: [0, 3, 6, 10], s: 'm7(♭5)', pt: 'meio-diminuto' },
  { iv: [0, 4, 8], s: '+', pt: 'aumentado' },
  { iv: [0, 2, 7], s: 'sus2', pt: 'com segunda suspensa' },
  { iv: [0, 5, 7], s: 'sus4', pt: 'com quarta suspensa' },
  { iv: [0, 5, 7, 10], s: '7sus4', pt: 'com sétima e quarta suspensa' },
  { iv: [0, 4, 7, 9], s: '6', pt: 'com sexta' },
  { iv: [0, 3, 7, 9], s: 'm6', pt: 'menor com sexta' },
  { iv: [0, 2, 4, 7], s: 'add9', pt: 'com nona adicionada' },
  { iv: [0, 2, 3, 7], s: 'm(add9)', pt: 'menor com nona adicionada' },
  { iv: [0, 2, 4, 7, 10], s: '9', pt: 'com nona' },
];

function nameChord(midis) {
  const bass = pcOf(midis[0]);
  const pcs = [...new Set(midis.map(pcOf))];
  if (pcs.length === 1) return { cifra: NOTES_EN[bass], pt: `${NOTES_PT[bass]} em oitavas` };
  if (pcs.length === 2) {
    const other = pcs.find(p => p !== bass);
    const iv = (other - bass + 12) % 12;
    if (iv === 7) return { cifra: NOTES_EN[bass] + '5', pt: `${NOTES_PT[bass]} com quinta (power chord)` };
    return { cifra: `${NOTES_EN[bass]}–${NOTES_EN[other]}`, pt: `intervalo de ${INTERVALS[iv]}` };
  }
  let best = null;
  for (const root of pcs) {
    const rel = new Set(pcs.map(p => (p - root + 12) % 12));
    for (const t of CHORD_TYPES) {
      const T = new Set(t.iv);
      let score = 0;
      for (const r of rel) score += T.has(r) ? 1 : -1;
      for (const r of T) if (!rel.has(r)) score -= (r === 7 ? 0.4 : 1);
      if (root === bass) score += 0.3;
      score -= t.iv.length * 0.01;
      if (!best || score > best.score) best = { score, root, t };
    }
  }
  if (!best || best.score < 1.5) {
    return { cifra: pcs.map(p => NOTES_EN[p]).join(' '), pt: 'notas sem acorde reconhecido' };
  }
  const slash = best.root !== bass;
  return {
    cifra: NOTES_EN[best.root] + best.t.s + (slash ? '/' + NOTES_EN[bass] : ''),
    pt: `${NOTES_PT[best.root]} ${best.t.pt}${slash ? ` com baixo em ${NOTES_PT[bass]}` : ''}`,
  };
}

// ============================================================
// Áudio: entradas (microfone, demonstração, arquivo) e análise
// ============================================================
let audioCtx = null, inputBus, analyser, chordAnalyser, timeBuf, specBuf, chordBuf, sampleRate = 48000;
let micStream = null, micNode = null, mediaNode = null;
let demoOut = null, demoTimer = null, demoIdx = 0;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sampleRate = audioCtx.sampleRate;
    inputBus = audioCtx.createGain();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.6;
    chordAnalyser = audioCtx.createAnalyser();
    chordAnalyser.fftSize = 16384;
    chordAnalyser.smoothingTimeConstant = 0.3;
    inputBus.connect(analyser);
    inputBus.connect(chordAnalyser);
    timeBuf = new Float32Array(analyser.fftSize);
    specBuf = new Float32Array(analyser.frequencyBinCount);
    chordBuf = new Float32Array(chordAnalyser.frequencyBinCount);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

async function toggleMic() {
  ensureAudio();
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micNode.disconnect();
    micStream = micNode = null;
    updateInputButtons();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('o navegador só libera o microfone em páginas https:// ou http://localhost.');
  }
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  micNode = audioCtx.createMediaStreamSource(micStream);
  micNode.connect(inputBus);
  keepAwake();
  updateInputButtons();
}

// Demonstração: cordas soltas e escalas (com vibrato nas notas de violino) ou acordes de violão
const DEMO_NOTES = [
  { m: 40 }, { m: 45 }, { m: 50 }, { m: 55 }, { m: 59 }, { m: 64 },
  { m: 55, v: 1 }, { m: 62, v: 1 }, { m: 69, v: 1 }, { m: 76, v: 1 }, { m: 72, v: 1 }, { m: 67, v: 1 },
];
const DEMO_CHORDS = [
  [48, 52, 55, 60, 64],         // C
  [45, 52, 57, 60, 64],         // Am
  [41, 48, 53, 57, 60, 65],     // F
  [43, 47, 50, 55, 59, 67],     // G
  [40, 47, 52, 56, 59, 64],     // E
  [50, 57, 60, 66],             // D7
  [40, 47, 52, 55, 59, 64],     // Em
  [45, 52, 57, 61, 64],         // A
];

function playTone(f, t, dur, { vib = false, sustain = false, gain = 0.12 } = {}) {
  const o = audioCtx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = f;
  const flt = audioCtx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = Math.min(5000, f * 6);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + (sustain ? 0.08 : 0.01));
  if (sustain) g.gain.setValueAtTime(gain * 0.9, t + dur - 0.35);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(flt).connect(g).connect(demoOut);
  if (vib) {
    const l = audioCtx.createOscillator();
    l.frequency.value = 5.6;
    const lg = audioCtx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.011, t + 0.8);
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + dur);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}

function demoStep() {
  const t = audioCtx.currentTime + 0.02;
  if (settings.detect === 'chord' && !game.active) {
    const ch = DEMO_CHORDS[demoIdx % DEMO_CHORDS.length];
    ch.forEach((m, i) => playTone(midiToFreq(m), t + i * 0.035, 2.8, { gain: 0.07 }));
  } else if (game.active && game.target != null) {
    playTone(midiToFreq(game.target + (Math.random() - 0.5) * 0.2), t, 2.6, { sustain: true });
  } else {
    const n = DEMO_NOTES[demoIdx % DEMO_NOTES.length];
    playTone(midiToFreq(n.m + (Math.random() - 0.5) * 0.3), t, 2.8, { vib: !!n.v, sustain: !!n.v });
  }
  demoIdx++;
}

function startDemo() {
  ensureAudio();
  if (demoTimer) return;
  demoOut = audioCtx.createGain();
  demoOut.connect(inputBus);
  demoOut.connect(audioCtx.destination);
  demoStep();
  demoTimer = setInterval(demoStep, 3000);
  updateInputButtons();
}
function stopDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  if (demoOut) { const d = demoOut; setTimeout(() => d.disconnect(), 3200); demoOut = null; }
  updateInputButtons();
}

function openAudioFile(file) {
  if (!file) return;
  ensureAudio();
  const el = $('audioFile');
  if (!mediaNode) {
    mediaNode = audioCtx.createMediaElementSource(el);
    mediaNode.connect(inputBus);
    mediaNode.connect(audioCtx.destination);
  }
  if (el.src) URL.revokeObjectURL(el.src);
  el.src = URL.createObjectURL(file);
  el.hidden = false;
  el.play().catch(() => {});
}

function updateInputButtons() {
  $('micBtn').classList.toggle('on', !!micStream);
  $('micBtn').textContent = micStream ? 'Microfone ligado' : 'Microfone';
  $('demoBtn').classList.toggle('on', !!demoTimer);
}

let wakeLock = null;
async function keepAwake() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } }
  catch { /* não disponível */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (micStream || demoTimer)) keepAwake(); });

// ---------- Detecção de nota única (YIN) ----------
const W = 2048;
const yinD = new Float32Array(W + 2), yinC = new Float32Array(W + 2);
function detectPitch(buf, sr, fmin, fmax) {
  const minTau = Math.max(2, Math.floor(sr / fmax));
  const maxTau = Math.min(W - 2, Math.ceil(sr / fmin));
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    yinD[tau] = s;
  }
  yinC[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    run += yinD[tau];
    yinC[tau] = run > 0 ? yinD[tau] * tau / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (yinC[t] < 0.15) {
      while (t + 1 <= maxTau && yinC[t + 1] < yinC[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  const x0 = yinC[tau - 1], x1 = yinC[tau], x2 = yinC[tau + 1];
  const den = x0 - 2 * x1 + x2;
  const better = den !== 0 ? tau + (x0 - x2) / (2 * den) : tau;
  return { freq: sr / better, clarity: 1 - x1 };
}

// ---------- Detecção de acordes (picos do espectro + soma de harmônicos) ----------
const MAX_PEAKS = 256;
const peakF = new Float32Array(MAX_PEAKS), peakA = new Float32Array(MAX_PEAKS);
const HARM_W = [1, 0.8, 0.6, 0.5, 0.4, 0.35];

function detectChord() {
  chordAnalyser.getFloatFrequencyData(chordBuf);
  const binHz = sampleRate / chordAnalyser.fftSize;
  const I = inst();
  const lo = Math.max(2, Math.floor(Math.max(55, I.fmin * 0.9) / binHz));
  const hi = Math.min(chordBuf.length - 2, Math.ceil(5000 / binHz));
  let sum = 0, maxA = 0;
  for (let i = lo; i <= hi; i++) { const a = Math.pow(10, chordBuf[i] / 20); sum += a; if (a > maxA) maxA = a; }
  const thr = Math.max((sum / (hi - lo + 1)) * 3, maxA * 0.04);
  let np = 0;
  for (let i = lo + 1; i < hi && np < MAX_PEAKS; i++) {
    const d = chordBuf[i];
    if (d > chordBuf[i - 1] && d >= chordBuf[i + 1] && d > -85) {
      const a = Math.pow(10, d / 20);
      if (a > thr) {
        const y0 = chordBuf[i - 1], y2 = chordBuf[i + 1];
        const dd = y0 - 2 * d + y2;
        peakF[np] = (i + (dd !== 0 ? 0.5 * (y0 - y2) / dd : 0)) * binHz;
        peakA[np] = Math.sqrt(a);
        np++;
      }
    }
  }
  if (!np) return [];
  const mLo = Math.ceil(freqToMidi(Math.max(I.fmin, 60)));
  const mHi = Math.floor(freqToMidi(Math.min(I.fmax, 1300)));
  const chosen = [];
  let first = 0;
  for (let iter = 0; iter < 6; iter++) {
    let best = -1, bs = 0;
    for (let m = mLo; m <= mHi; m++) {
      if (chosen.includes(m)) continue;
      const f0 = midiToFreq(m);
      let s = 0, hasF = false;
      for (let h = 1; h <= 6; h++) {
        const fh = f0 * h, tol = fh * 0.025;
        let mx = 0;
        for (let p = 0; p < np; p++) if (Math.abs(peakF[p] - fh) < tol && peakA[p] > mx) mx = peakA[p];
        if (h === 1 && mx > first * 0.05) hasF = true;
        s += mx * HARM_W[h - 1];
      }
      if (hasF && s > bs) { bs = s; best = m; }
    }
    if (best < 0) break;
    if (iter === 0) first = bs;
    else if (bs < first * 0.33) break;
    chosen.push(best);
    const f0 = midiToFreq(best);
    for (let h = 1; h <= 8; h++) {
      const fh = f0 * h, tol = fh * 0.025;
      // a fundamental sai por completo; os harmônicos ficam parcialmente (podem ser outra nota do acorde)
      for (let p = 0; p < np; p++) if (Math.abs(peakF[p] - fh) < tol) peakA[p] *= h === 1 ? 0 : 0.25;
    }
  }
  return chosen.sort((a, b) => a - b);
}

// ============================================================
// Placas: formatos, máscaras e modos de vibração
// ============================================================
const G = 200; // resolução da grade do campo

const SQUARE_MODES = [];
for (let n = 1; n <= 16; n++)
  for (let m = n + 1; m <= 18; m++) { SQUARE_MODES.push({ n, m, s: 1 }); SQUARE_MODES.push({ n, m, s: -1 }); }
SQUARE_MODES.sort((a, b) => (a.n * a.n + a.m * a.m) - (b.n * b.n + b.m * b.m) || b.s - a.s);

const CIRCLE_MODES = [];
for (let n = 0; n <= 10; n++) for (let m = 1; m <= 7; m++) CIRCLE_MODES.push({ n, m, k: (m + n / 2) * Math.PI });
CIRCLE_MODES.sort((a, b) => a.k - b.k);

const HEX_MODES = Array.from({ length: 70 }, (_, i) => ({ k: Math.PI * (0.9 + 0.38 * i), v: i % 2 }));

function besselJ(n, x) {
  const steps = 200;
  let s = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps * Math.PI;
    s += Math.cos(n * t - x * Math.sin(t));
  }
  return s / steps;
}

const SHAPES = {
  square: () => true,
  circle: (x, y) => { const u = x * 2 - 1, v = y * 2 - 1; return u * u + v * v <= 0.97; },
  water:  (x, y) => { const u = x * 2 - 1, v = y * 2 - 1; return u * u + v * v <= 0.97; },
  hex: (x, y) => {
    const u = Math.abs(x * 2 - 1) / 0.985, v = Math.abs(y * 2 - 1) / 0.985;
    return v <= 0.8660254 && Math.sqrt(3) * u + v <= Math.sqrt(3);
  },
  guitar: (x, y) => {
    const lower = (x - 0.5) ** 2 + (y - 0.665) ** 2 <= 0.30 ** 2;
    const upper = (x - 0.5) ** 2 + (y - 0.31) ** 2 <= 0.225 ** 2;
    const hole = (x - 0.5) ** 2 + (y - 0.43) ** 2 <= 0.072 ** 2;
    return (lower || upper) && !hole;
  },
};

const pickMode = (list, midi, off = 0) => list[clamp(Math.round(midi) - 40 + off, 0, list.length - 1)];

function computeRaw(shape, midi) {
  const F = new Float32Array(G * G);
  let label;
  if (shape === 'square' || shape === 'guitar') {
    const { n, m, s } = pickMode(SQUARE_MODES, midi);
    const [x0, y0, x1, y1] = shape === 'square' ? [0, 0, 1, 1] : [0.19, 0.08, 0.81, 0.97];
    const cx = new Float32Array(G), cy = new Float32Array(G), dx = new Float32Array(G), dy = new Float32Array(G);
    for (let i = 0; i < G; i++) {
      const X = ((i + 0.5) / G - x0) / (x1 - x0), Y = ((i + 0.5) / G - y0) / (y1 - y0);
      cx[i] = Math.cos(n * Math.PI * X); dx[i] = Math.cos(m * Math.PI * X);
      cy[i] = Math.cos(m * Math.PI * Y); dy[i] = Math.cos(n * Math.PI * Y);
    }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) F[j * G + i] = cx[i] * cy[j] + s * dx[i] * dy[j];
    label = `${shape === 'guitar' ? 'tampo' : 'modo'} (${n}, ${m}) ${s > 0 ? '+' : '−'}`;
  } else if (shape === 'circle' || shape === 'water') {
    const { n, m, k } = pickMode(CIRCLE_MODES, midi, shape === 'water' ? 8 : 0);
    const R = 512, radial = new Float32Array(R + 1);
    for (let i = 0; i <= R; i++) radial[i] = besselJ(n, k * i / R);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const u = (i + 0.5) / G * 2 - 1, v = (j + 0.5) / G * 2 - 1;
      const r = Math.min(1, Math.hypot(u, v));
      F[j * G + i] = radial[Math.round(r * R)] * Math.cos(n * Math.atan2(v, u));
    }
    label = `modo circular n=${n}, m=${m}`;
  } else {
    const { k, v } = pickMode(HEX_MODES, midi);
    const dirs = [0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(a => [Math.cos(a), Math.sin(a)]);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const u = (i + 0.5) / G * 2 - 1, w = (j + 0.5) / G * 2 - 1;
      let s = 0;
      for (const [c, d] of dirs) { const p = k * (u * c + w * d); s += v ? Math.sin(p) : Math.cos(p); }
      F[j * G + i] = s;
    }
    label = `modo hexagonal ${v ? 'triangular' : 'senoidal'} k=${(k / Math.PI).toFixed(2)}π`;
  }
  return { F, label };
}

function normalizeField(F) {
  let mx = 0;
  for (let i = 0; i < F.length; i++) if (mask[i]) mx = Math.max(mx, Math.abs(F[i]));
  if (mx > 0) for (let i = 0; i < F.length; i++) F[i] /= mx;
  return F;
}

const fieldCache = new Map();
function getField(shape, midis) {
  const key = shape + ':' + midis.join(',');
  if (fieldCache.has(key)) return fieldCache.get(key);
  let res;
  if (midis.length === 1) {
    const r = computeRaw(shape, midis[0]);
    res = { F: normalizeField(r.F), label: r.label };
  } else {
    const F = new Float32Array(G * G);
    for (const m of midis) {
      const part = getField(shape, [m]).F;
      for (let i = 0; i < F.length; i++) F[i] += part[i];
    }
    res = { F: normalizeField(F), label: `${midis.length} modos sobrepostos` };
  }
  fieldCache.set(key, res);
  if (fieldCache.size > 120) fieldCache.delete(fieldCache.keys().next().value);
  return res;
}

// Máscara da placa e contorno desenhado
let mask = new Uint8Array(G * G);
const outlineCan = document.createElement('canvas');
function buildShape() {
  const inside = SHAPES[settings.shape] || SHAPES.square;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) mask[j * G + i] = inside((i + 0.5) / G, (j + 0.5) / G) ? 1 : 0;
  const R = 480;
  outlineCan.width = outlineCan.height = R;
  const oc = outlineCan.getContext('2d');
  const img = oc.createImageData(R, R);
  const ins = new Uint8Array(R * R);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) ins[j * R + i] = inside((i + 0.5) / R, (j + 0.5) / R) ? 1 : 0;
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const k = j * R + i;
    if (!ins[k]) continue;
    const edge = i === 0 || j === 0 || i === R - 1 || j === R - 1 || !ins[k - 1] || !ins[k + 1] || !ins[k - R] || !ins[k + R];
    if (edge) { const o = k * 4; img.data[o] = 150; img.data[o + 1] = 160; img.data[o + 2] = 200; img.data[o + 3] = 200; }
  }
  oc.putImageData(img, 0, 0);
  fieldCache.clear();
}

// ============================================================
// Partículas de areia
// ============================================================
let field = new Float32Array(G * G);
let target = new Float32Array(G * G);
let px = new Float32Array(0), py = new Float32Array(0), N = 0;

function scatter() {
  N = settings.count;
  px = new Float32Array(N);
  py = new Float32Array(N);
  const inside = SHAPES[settings.shape] || SHAPES.square;
  for (let i = 0; i < N; i++) {
    let x, y, tries = 0;
    do { x = Math.random(); y = Math.random(); } while (!inside(x, y) && ++tries < 50);
    px[i] = x; py[i] = y;
  }
}

function updateParticles(shake) {
  if (shake <= 0.001) return;
  const stepK = 0.011 * shake, driftK = 0.00004 * shake;
  const lo = 1 / G, hi = 1 - 1 / G;
  for (let p = 0; p < N; p++) {
    const ox = px[p], oy = py[p];
    let gi = (ox * G) | 0, gj = (oy * G) | 0;
    if (gi < 1) gi = 1; else if (gi > G - 2) gi = G - 2;
    if (gj < 1) gj = 1; else if (gj > G - 2) gj = G - 2;
    const idx = gj * G + gi;
    const a = field[idx];
    const gx = (field[idx + 1] - field[idx - 1]) * 0.5 * G;
    const gy = (field[idx + G] - field[idx - G]) * 0.5 * G;
    const step = stepK * Math.abs(a);
    let x = ox + (Math.random() * 2 - 1) * step - a * gx * driftK;
    let y = oy + (Math.random() * 2 - 1) * step - a * gy * driftK;
    if (x < lo) x = 2 * lo - x; else if (x > hi) x = 2 * hi - x;
    if (y < lo) y = 2 * lo - y; else if (y > hi) y = 2 * hi - y;
    const ni = (x * G) | 0, nj = (y * G) | 0;
    if (ni < 0 || nj < 0 || ni >= G || nj >= G || !mask[nj * G + ni]) continue; // não sai da placa
    px[p] = x; py[p] = y;
  }
}

// ============================================================
// Desenho: placa, água, partitura, espectro
// ============================================================
const plate = $('plate'), pctx = plate.getContext('2d');
const staffC = $('staff'), stx = staffC.getContext('2d');
const specC = $('spectrum'), spx = specC.getContext('2d');
let S = 0, dpr = 1;

function resizePlate() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = $('stage').getBoundingClientRect();
  S = Math.max(100, Math.floor(Math.min(r.width, r.height)));
  plate.style.width = plate.style.height = S + 'px';
  plate.width = plate.height = Math.round(S * dpr);
  pctx.fillStyle = '#0a0b12';
  pctx.fillRect(0, 0, plate.width, plate.height);
}
function resizeBottom() {
  for (const c of [staffC, specC]) {
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
  }
  staffDirty = true;
}
new ResizeObserver(resizePlate).observe($('stage'));
new ResizeObserver(resizeBottom).observe($('bottom'));

function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const waterCan = document.createElement('canvas');
waterCan.width = waterCan.height = G;
const wctx = waterCan.getContext('2d');
const wimg = wctx.createImageData(G, G);
function drawWater(c, m, P, t, amp) {
  const [r, g, b] = hslToRgb(hue, 0.75, 0.55);
  const osc = 0.35 + 0.65 * Math.sin(t * 0.018);
  const d = wimg.data;
  const a = Math.min(1.2, amp > 0.02 ? 0.45 + amp : amp * 20);
  const k1 = osc * a * G * 0.04;          // inclinação da superfície
  const nodeK = Math.min(1, a) * 0.55;    // brilho das linhas nodais
  for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
    const k = j * G + i, o = k * 4;
    if (!mask[k]) { d[o + 3] = 0; continue; }
    const sx = (field[k + 1] - field[k - 1]) * k1, sy = (field[k + G] - field[k - G]) * k1;
    let diff = 0.5 + (sx * 0.6 + sy * 0.8) * 0.5;
    diff = diff < 0 ? 0 : diff > 1 ? 1 : diff;
    const spec = diff > 0.78 ? (diff - 0.78) * 4.5 : 0;
    const q = 1 - Math.abs(field[k]);
    const q2 = q * q, q4 = q2 * q2, node = q4 * q4 * q2 * nodeK;
    const L = 0.1 + diff * 0.4 * Math.min(1, a + 0.25) + node;
    d[o] = Math.min(255, 8 + r * L + 235 * spec);
    d[o + 1] = Math.min(255, 10 + g * L + 235 * spec);
    d[o + 2] = Math.min(255, 18 + b * L + 235 * spec);
    d[o + 3] = 255;
  }
  wctx.putImageData(wimg, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(waterCan, m, m, P, P);
}

let hue = 200, targetHue = 200, waterAmp = 0;
const display = { big: '', small: '' };

function drawPlate(t, shake, level, warp, idle) {
  const c = pctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalCompositeOperation = 'source-over';
  const m = S * 0.04, P = S - 2 * m;
  if (settings.shape === 'water') {
    c.fillStyle = '#0a0b12';
    c.fillRect(0, 0, S, S);
    waterAmp += (shake - waterAmp) * 0.08;
    drawWater(c, m, P, t, waterAmp);
  } else {
    c.fillStyle = 'rgba(10, 11, 18, 0.38)';
    c.fillRect(0, 0, S, S);
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `hsla(${hue}, 85%, ${55 + level * 20}%, ${0.3 + level * 0.45})`;
    const sz = Math.max(1.1, S / 520) * (1 + level * 0.25);
    const off = m + P * 0.5 * (1 - warp);
    const sc = P * warp;
    for (let p = 0; p < N; p++) c.fillRect(off + px[p] * sc, off + py[p] * sc, sz, sz);
    c.globalCompositeOperation = 'source-over';
  }
  c.globalAlpha = 0.45;
  c.drawImage(outlineCan, m, m, P, P);
  c.globalAlpha = 1;

  if ((document.body.classList.contains('present') || rec) && display.big) {
    c.globalAlpha = idle ? 0.45 : 1;
    c.textBaseline = 'top';
    c.fillStyle = `hsl(${hue}, 85%, 70%)`;
    c.font = `700 ${Math.round(S * 0.085)}px Fraunces, Georgia, serif`;
    c.fillText(display.big, S * 0.06, S * 0.05);
    c.fillStyle = 'rgba(231, 233, 243, 0.78)';
    c.font = `500 ${Math.round(S * 0.03)}px "IBM Plex Mono", ui-monospace, monospace`;
    c.fillText(display.small, S * 0.06, S * 0.05 + S * 0.1);
    c.globalAlpha = 1;
  }
}

function drawSpectrum(marks) {
  const c = spx, w = specC.width, h = specC.height;
  c.clearRect(0, 0, w, h);
  if (!analyser) return;
  analyser.getFloatFrequencyData(specBuf);
  const fMin = 50, fMax = 4000, lmin = Math.log(fMin), lr = Math.log(fMax) - lmin;
  const binHz = sampleRate / analyser.fftSize;
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x < w; x += 2) {
    const f = Math.exp(lmin + lr * x / w);
    const db = specBuf[Math.min(specBuf.length - 1, Math.round(f / binHz))];
    c.lineTo(x, h - clamp((db + 100) / 80, 0, 1) * h);
  }
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = `hsla(${hue}, 70%, 55%, 0.35)`;
  c.fill();
  c.fillStyle = 'rgba(231, 233, 243, 0.35)';
  c.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
  for (const mm of [40, 45, 52, 57, 64, 69, 76, 81, 88, 93]) {
    const x = (Math.log(midiToFreq(mm)) - lmin) / lr * w;
    c.fillRect(x, 0, 1, 5 * dpr);
    c.fillText(nameEN(mm), x + 3 * dpr, h - 3 * dpr);
  }
  c.fillStyle = `hsl(${hue}, 90%, 70%)`;
  for (const f of marks) {
    const x = (Math.log(f) - lmin) / lr * w;
    c.fillRect(x - dpr, 0, 2 * dpr, h);
  }
}

// Partitura (clave de sol). No violão a escrita é uma oitava acima do som real.
const history = [];
let staffDirty = true;
const STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function pushHistory(item) { history.push(item); if (history.length > 300) history.shift(); staffDirty = true; }

function drawStaff() {
  staffDirty = false;
  const c = stx, w = staffC.width / dpr, h = staffC.height / dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const hs = 5, bottomY = Math.round(h * 0.64), left = 46, stepX = 34;
  const yOf = d => bottomY - (d - 30) * hs;
  c.strokeStyle = 'rgba(231, 233, 243, 0.28)';
  c.lineWidth = 1;
  for (let k = 0; k < 5; k++) { const y = yOf(30 + 2 * k) + 0.5; c.beginPath(); c.moveTo(10, y); c.lineTo(w - 10, y); c.stroke(); }
  c.fillStyle = 'rgba(231, 233, 243, 0.55)';
  c.font = '600 11px "IBM Plex Sans", sans-serif';
  c.textBaseline = 'middle';
  c.fillText('SOL', 12, yOf(34));
  if (inst().staffShift) { c.font = '500 10px "IBM Plex Mono", monospace'; c.fillText('8vb', 12, yOf(26)); }

  const shift = inst().staffShift;
  const slots = Math.max(1, Math.floor((w - left - 50) / stepX));
  const items = history.slice(-slots);
  const head = (x, m, color, filled) => {
    const dm = m + shift, pc = pcOf(dm);
    const d = octOf(dm) * 7 + STEP[pc];
    const y = clamp(yOf(d), 6, h - 18);
    c.strokeStyle = 'rgba(231, 233, 243, 0.45)';
    for (let ld = 28; ld >= d; ld -= 2) { c.beginPath(); c.moveTo(x - 10, yOf(ld) + 0.5); c.lineTo(x + 10, yOf(ld) + 0.5); c.stroke(); }
    for (let ld = 40; ld <= d; ld += 2) { c.beginPath(); c.moveTo(x - 10, yOf(ld) + 0.5); c.lineTo(x + 10, yOf(ld) + 0.5); c.stroke(); }
    c.save();
    c.translate(x, y);
    c.rotate(-0.35);
    c.beginPath();
    c.ellipse(0, 0, 5.8, 4.1, 0, 0, Math.PI * 2);
    c.restore();
    if (filled) { c.fillStyle = color; c.fill(); } else { c.strokeStyle = color; c.lineWidth = 1.6; c.stroke(); c.lineWidth = 1; }
    if (SHARP_PCS.includes(pc)) { c.fillStyle = color; c.font = '14px "IBM Plex Sans", sans-serif'; c.textAlign = 'right'; c.fillText('♯', x - 8, y); c.textAlign = 'left'; }
  };
  items.forEach((it, i) => {
    const x = left + 20 + i * stepX;
    const last = i === items.length - 1;
    const color = `hsla(${hueOf(it.midis[0])}, 80%, 68%, ${last ? 1 : 0.75})`;
    it.midis.forEach(m => head(x, m, color, true));
    c.fillStyle = last ? 'rgba(231, 233, 243, 0.9)' : 'rgba(140, 145, 169, 0.9)';
    c.font = '500 10px "IBM Plex Mono", monospace';
    c.textAlign = 'center';
    c.fillText(it.label, x, h - 8);
    c.textAlign = 'left';
  });
  if (game.active && game.target != null) {
    const x = w - 34;
    head(x, game.target, 'rgba(242, 193, 78, 1)', false);
    c.fillStyle = 'rgba(242, 193, 78, 0.95)';
    c.font = '600 10px "IBM Plex Mono", monospace';
    c.textAlign = 'center';
    c.fillText('alvo', x, h - 8);
    c.textAlign = 'left';
  }
  $('staffNote').textContent = settings.instrument === 'guitar'
    ? 'Violão: escrito uma oitava acima do som, como nas partituras de violão.'
    : history.length ? '' : 'As notas tocadas aparecem aqui.';
}

// ============================================================
// Painel de leitura (nota, acorde, afinador, cordas)
// ============================================================
const readout = $('readout');

function buildStrings() {
  const I = inst();
  $('stringsWrap').hidden = !I.strings || settings.detect === 'chord';
  $('strings').innerHTML = (I.strings || [])
    .map(([n, m]) => `<span class="str" data-m="${m}"><small>${n}</small>${nameEN(m)}</span>`).join('');
}

function renderNoteHUD(freq, midi, cents) {
  $('readoutLabel').textContent = 'Nota';
  $('note').innerHTML = noteHTML(midi);
  $('sub').textContent = `${nameEN(midi)} · ideal ${midiToFreq(midi).toFixed(1)} Hz`;
  $('freq').textContent = `${freq.toFixed(1)} Hz`;
  $('tunerWrap').hidden = false;
  $('needle').style.left = `${50 + clamp(cents, -50, 50)}%`;
  const ac = Math.abs(cents), sign = cents >= 0 ? '+' : '';
  const centsEl = $('cents');
  centsEl.textContent = ac < 5 ? `afinado (${sign}${cents.toFixed(0)} cents)` : `${cents > 0 ? 'alto' : 'baixo'}: ${sign}${cents.toFixed(0)} cents`;
  centsEl.style.color = ac < 5 ? 'var(--good)' : ac < 15 ? 'var(--warn)' : 'var(--bad)';
  const depth = vibHist.length > 10 ? (Math.max(...vibHist) - Math.min(...vibHist)) / 2 : 0;
  $('vibrato').textContent = depth > 6 ? `vibrato ±${depth.toFixed(0)} cents` : '';

  const I = inst();
  if (I.strings) {
    let best = null;
    for (const [n, m] of I.strings) {
      const c = 1200 * Math.log2(freq / midiToFreq(m));
      if (!best || Math.abs(c) < Math.abs(best.c)) best = { n, m, c };
    }
    const near = Math.abs(best.c) <= 150;
    const cls = Math.abs(best.c) < 5 ? 'good' : Math.abs(best.c) < 25 ? 'warn' : 'bad';
    for (const el of $('strings').children) {
      const isNear = near && +el.dataset.m === best.m;
      el.className = 'str' + (isNear ? ' near ' + cls : '');
    }
    $('stringMsg').textContent = !near ? 'nota fora das cordas soltas'
      : Math.abs(best.c) < 5 ? `corda ${best.n} (${namePT(best.m)}) afinada`
      : `corda ${best.n} (${namePT(best.m)}): ${best.c > 0 ? '+' : ''}${best.c.toFixed(0)} cents · ${best.c < 0 ? 'aperte para subir' : 'afrouxe para descer'}`;
  }
  display.big = namePT(midi);
  display.small = `${freq.toFixed(1)} Hz · ${nameEN(midi)} · ${sign}${cents.toFixed(0)} cents`;
  readout.classList.remove('idle');
}

function renderChordHUD(midis, nm) {
  $('readoutLabel').textContent = 'Acorde';
  $('note').textContent = nm.cifra;
  $('sub').textContent = nm.pt;
  $('freq').textContent = midis.map(namePT).join(' · ');
  $('tunerWrap').hidden = true;
  display.big = nm.cifra;
  display.small = `${nm.pt} · ${midis.map(nameEN).join(' ')}`;
  readout.classList.remove('idle');
}

// ============================================================
// Treino
// ============================================================
const game = { active: false, target: null, score: 0, streak: 0, best: store.get('best', 0), hold: 0, wrong: 0, cooldown: 0 };

function renderGame(msg, cls) {
  $('gameTarget').innerHTML = game.target != null ? `${noteHTML(game.target)} <span class="hint">${nameEN(game.target)}</span>` : '—';
  $('gScore').textContent = game.score;
  $('gStreak').textContent = game.streak;
  $('gBest').textContent = game.best;
  if (msg !== undefined) { const el = $('gameMsg'); el.textContent = msg || ' '; el.className = cls || ''; }
}
function nextTarget() {
  const [lo, hi] = inst().game;
  let m, tries = 0;
  do { m = lo + Math.floor(Math.random() * (hi - lo + 1)); }
  while ((m === game.target || (SHARP_PCS.includes(pcOf(m)) && Math.random() < 0.6)) && ++tries < 30);
  game.target = m;
  game.hold = game.wrong = 0;
  $('gameCard').classList.remove('hit');
  renderGame('', '');
  staffDirty = true;
}
function startGame() {
  game.active = true;
  game.score = game.streak = 0;
  if (settings.detect !== 'note') { settings.detect = 'note'; $('detect').value = 'note'; onDetectChange(); }
  $('gameCard').hidden = false;
  $('gameBtn').classList.add('on');
  nextTarget();
}
function stopGame() {
  game.active = false;
  game.target = null;
  $('gameCard').hidden = true;
  $('gameBtn').classList.remove('on');
  staffDirty = true;
}
function gameTick(midi, cents) {
  if (!game.active || game.cooldown > 0 || game.target == null) return;
  if (midi === game.target) {
    game.wrong = 0;
    if (Math.abs(cents) < 25) {
      if (++game.hold >= 8) {
        game.score++;
        game.streak++;
        if (game.score > game.best) { game.best = game.score; store.set('best', game.best); }
        $('gameCard').classList.add('hit');
        renderGame(game.streak >= 3 ? `Acertou! ${game.streak} seguidas` : 'Acertou!', 'good');
        game.cooldown = 45;
      }
    } else {
      renderGame(`Nota certa, ajuste a afinação (${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents)`, 'warn');
    }
  } else {
    game.hold = 0;
    if (++game.wrong === 20) {
      game.streak = 0;
      const same = pcOf(midi) === pcOf(game.target);
      renderGame(same ? `Oitava errada: toque ${midi < game.target ? 'mais agudo ↑' : 'mais grave ↓'}`
        : `Você tocou ${namePT(midi)}. Toque ${midi < game.target ? 'mais agudo ↑' : 'mais grave ↓'}`, 'warn');
    }
  }
}

// ============================================================
// Gravação de vídeo
// ============================================================
let rec = null;
function toggleRec() {
  if (rec) { rec.recorder.stop(); return; }
  if (!plate.captureStream || !window.MediaRecorder) { toast('Este navegador não grava vídeo da tela.'); return; }
  ensureAudio();
  const dest = audioCtx.createMediaStreamDestination();
  inputBus.connect(dest);
  const vstream = plate.captureStream(60);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8e6 } : {});
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    try { inputBus.disconnect(dest); } catch { /* já desconectado */ }
    vstream.getTracks().forEach(t => t.stop());
    const type = recorder.mimeType || 'video/webm';
    const blob = new Blob(chunks, { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cimatica-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    rec = null;
    $('recBtn').classList.remove('rec');
    $('recBtn').textContent = 'Gravar vídeo';
    $('recBadge').hidden = true;
    toast('Vídeo salvo na pasta de downloads.');
  };
  recorder.start(500);
  rec = { recorder, start: performance.now() };
  $('recBtn').classList.add('rec');
  $('recBtn').textContent = 'Parar gravação';
  $('recBadge').hidden = false;
}

// ============================================================
// Interface
// ============================================================
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function togglePresent(force) {
  const on = force !== undefined ? force : !document.body.classList.contains('present');
  document.body.classList.toggle('present', on);
  $('presentBtn').classList.toggle('on', on);
  $('presentHint').hidden = !on;
  if (on) setTimeout(() => { $('presentHint').hidden = true; }, 3000);
}
function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  const req = document.documentElement.requestFullscreen;
  if (!req) { toast('Tela cheia não está disponível neste navegador.'); return; }
  document.documentElement.requestFullscreen().catch(() => toast('Tela cheia não está disponível aqui.'));
}

function closeStart() { const s = $('start'); if (s) s.remove(); }

async function startMicFromUI(errEl) {
  try { await toggleMic(); closeStart(); }
  catch (e) {
    const msg = 'Não foi possível acessar o microfone: ' + (e && e.message ? e.message : e);
    if (errEl) errEl.textContent = msg; else toast(msg);
  }
}

$('micStart').addEventListener('click', () => startMicFromUI($('err')));
$('demoStart').addEventListener('click', () => { startDemo(); closeStart(); });
$('fileStart').addEventListener('click', () => $('fileInput').click());
$('micBtn').addEventListener('click', () => startMicFromUI(null));
$('demoBtn').addEventListener('click', () => (demoTimer ? stopDemo() : startDemo()));
$('fileInput').addEventListener('change', e => { openAudioFile(e.target.files[0]); closeStart(); });

function onDetectChange() {
  resetDetection();
  buildStrings();
  if (settings.detect === 'chord') { $('readoutLabel').textContent = 'Acorde'; $('tunerWrap').hidden = true; }
  else { $('readoutLabel').textContent = 'Nota'; $('tunerWrap').hidden = false; }
}

function bindSetting(id, key, { num = false, after } = {}) {
  const el = $(id);
  el.value = settings[key];
  el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    let v = el.value;
    if (num) { v = +v; if (!isFinite(v)) return; }
    settings[key] = v;
    saveSettings();
    if (after) after();
  });
}
bindSetting('instrument', 'instrument', { after: () => { buildStrings(); staffDirty = true; if (game.active) nextTarget(); } });
bindSetting('detect', 'detect', { after: () => { if (game.active && settings.detect === 'chord') stopGame(); onDetectChange(); } });
bindSetting('a4', 'a4', { num: true, after: () => { settings.a4 = clamp(settings.a4, 400, 480); $('a4').value = settings.a4; saveSettings(); buildStrings(); } });
bindSetting('sens', 'sens', { num: true });
bindSetting('shape', 'shape', { after: () => { buildShape(); scatter(); setTarget(currentMidis); } });
bindSetting('count', 'count', { num: true, after: scatter });
document.querySelectorAll('[data-a4]').forEach(b => b.addEventListener('click', () => {
  settings.a4 = +b.dataset.a4; $('a4').value = settings.a4; saveSettings(); buildStrings();
}));

$('resetBtn').addEventListener('click', scatter);
$('gameBtn').addEventListener('click', () => (game.active ? stopGame() : startGame()));
$('gSkip').addEventListener('click', () => { game.streak = 0; nextTarget(); });
$('gStop').addEventListener('click', stopGame);
$('recBtn').addEventListener('click', toggleRec);
$('presentBtn').addEventListener('click', () => togglePresent());
$('fsBtn').addEventListener('click', toggleFullscreen);
$('clearHist').addEventListener('click', () => { history.length = 0; staffDirty = true; });

document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'p') togglePresent();
  else if (k === 'escape' && document.body.classList.contains('present')) togglePresent(false);
  else if (k === 'f') toggleFullscreen();
  else if (k === 'r') scatter();
});

// ============================================================
// Estado da detecção e laço principal
// ============================================================
let frame = 0, vol = 0, lastSoundFrame = -999;
let currentMidi = null, currentMidis = [52], candMidi = null, candCount = 0, noteActive = false;
let chordCand = null, chordCount = 0, currentChordKey = null, chordMarks = [];
const pitchHist = [], vibHist = [];
let centsSlow = 0, vib = 0, shownFreq = null, modeLabel = '';

function resetDetection() {
  candMidi = null; candCount = 0; noteActive = false;
  chordCand = null; chordCount = 0; currentChordKey = null; chordMarks = [];
  pitchHist.length = 0; vibHist.length = 0; vib = 0;
}

function setTarget(midis) {
  currentMidis = midis;
  const r = getField(settings.shape, midis);
  target = r.F;
  modeLabel = r.label;
  $('mode').textContent = r.label;
  targetHue = hueOf(midis[0]);
}

function handlePitch(f) {
  lastSoundFrame = frame;
  pitchHist.push(f);
  if (pitchHist.length > 5) pitchHist.shift();
  const med = [...pitchHist].sort((a, b) => a - b)[pitchHist.length >> 1];
  const mf = freqToMidi(med), midi = Math.round(mf), cents = (mf - midi) * 100;
  shownFreq = med;
  if (midi === candMidi) candCount++; else { candMidi = midi; candCount = 1; }
  if (candCount === 3) {
    if (midi !== currentMidi || !noteActive) { pushHistory({ midis: [midi], label: nameEN(midi) }); centsSlow = cents; vibHist.length = 0; }
    noteActive = true;
    if (midi !== currentMidi) { currentMidi = midi; setTarget([midi]); }
  }
  if (midi === currentMidi) {
    const c = (freqToMidi(f) - midi) * 100;
    centsSlow += (c - centsSlow) * 0.08;
    vib = clamp(c - centsSlow, -40, 40);
    vibHist.push(vib);
    if (vibHist.length > 40) vibHist.shift();
  }
  if (candCount >= 3) gameTick(midi, cents);
  renderNoteHUD(med, midi, cents);
}

function handleChord(midis) {
  lastSoundFrame = frame;
  chordMarks = midis.map(midiToFreq);
  const key = midis.join(',');
  if (key === chordCand) chordCount++; else { chordCand = key; chordCount = 1; }
  if (chordCount === 3 && key !== currentChordKey) {
    currentChordKey = key;
    const nm = nameChord(midis);
    pushHistory({ midis, label: nm.cifra });
    setTarget(midis);
    renderChordHUD(midis, nm);
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  frame++;
  const I = inst();
  const gate = 0.06 * Math.pow(0.03, settings.sens / 100);

  let rms = 0;
  if (analyser) {
    analyser.getFloatTimeDomainData(timeBuf);
    for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
    rms = Math.sqrt(rms / timeBuf.length);
    if (rms > gate) {
      if (settings.detect === 'chord') {
        if (frame % 4 === 0) { const ch = detectChord(); if (ch.length) handleChord(ch); }
      } else if ((frame & 1) === 0) {
        const r = detectPitch(timeBuf, sampleRate, I.fmin, I.fmax);
        if (r && r.clarity > 0.8) handlePitch(r.freq);
      }
    }
  }
  vol += (rms - vol) * (rms > vol ? 0.4 : 0.06);
  const level = clamp((vol - gate) / (gate * 6), 0, 1);
  const sounding = frame - lastSoundFrame < 20;
  const shake = sounding ? clamp((vol - gate) / (gate * 5) + 0.25, 0, 1.3) : 0;

  if (frame - lastSoundFrame > 15) {
    noteActive = false; candCount = 0; pitchHist.length = 0; chordCand = null; currentChordKey = null;
    vib *= 0.9;
  }
  const idle = frame - lastSoundFrame > 45;
  if (idle) readout.classList.add('idle');
  if (game.active && game.cooldown > 0 && --game.cooldown === 0) nextTarget();

  for (let i = 0; i < field.length; i++) field[i] += (target[i] - field[i]) * 0.12;
  hue += (targetHue - hue) * 0.05;
  document.documentElement.style.setProperty('--hue', Math.round(hue));

  if (settings.shape !== 'water') updateParticles(shake);
  const warp = 1 + clamp(vib * 0.0016, -0.05, 0.05);
  drawPlate(now || 0, shake, sounding ? level : 0, warp, idle);
  drawSpectrum(sounding ? (settings.detect === 'chord' ? chordMarks : shownFreq ? [shownFreq] : []) : []);
  if (staffDirty) drawStaff();
  if (rec && frame % 15 === 0) {
    const s = Math.floor((performance.now() - rec.start) / 1000);
    $('recTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

// ============================================================
// Início
// ============================================================
buildShape();
scatter();
buildStrings();
onDetectChange();
setTarget([52]);
resizePlate();
resizeBottom();
requestAnimationFrame(loop);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
