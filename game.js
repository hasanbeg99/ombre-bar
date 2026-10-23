/* Ombré Bar – Schichten. Gießen. Genießen.  (c) 2026 Oruci Sabahudin. Original code & procedural art/audio. */
'use strict';
(() => {
const BUILD = 'OMM_BUILD v1.0.0 2026-10-23';

// ───────────────────────── TUNING (all gameplay numbers live here) ─────────────────────────
const T = {
  TITLE: 'Ombré Bar', SUBTITLE: 'SCHICHTEN · GIESSEN · GENIESSEN', MARK: 'O.T.', CREDIT: 'inspiriert von O.T.',
  W: 400, MIN_H: 700,               // logical design size (portrait)
  // stream: volume (fraction of a full glass) per second
  F0: 0.07,                         // stream at the start of every hold
  F1_0: 0.50, F1_1: 0.74,           // max stream at difficulty 0 → 1
  RAMP_T0: 1.7, RAMP_T1: 1.05,      // s of continuous holding until max stream (difficulty 0 → 1)
  RAMP_POW: 1.6,                    // ramp curve (>1 = gentle start, then rushes)
  MIX0: 0.17, MIX_K: 3.0,           // stream above MIX0 churns the boundary below (mix += excess*K*dt)
  // judging (height fraction of the glass)
  BAND0: 0.055, BAND1: 0.03,        // miss tolerance around a target line
  PERF0: 0.016, PERF1: 0.009,       // PERFEKT tolerance
  KNAPP: 0.72,                      // |error| beyond this share of the band (but still inside) = KNAPP!
  SHARP_OK: 0.85,                   // sharpness ≥ this = SAUBER!
  PERFECT_SHARP: 0.6,               // a PERFEKT glass also needs every boundary at least this crisp
  COMMIT: 0.5, COMMIT_FAR: 1.15,    // idle s after after-flow until a layer is locked (FAR = still clearly below line)
  TINY: 0.004,                      // a layer with less volume is not committed (accidental tap)
  // run
  LIVES: 3, RAMP_GLASSES: 26, MULT_MAX: 5,
  TIME0: 10, TIME1: 6, TIME_LAYER0: 3.4, TIME_LAYER1: 2.3, // ice-melt timer per glass = base + per layer
  PTS: 10, PERFECT_PTS: 15, KNAPP_PTS: 5, SHARP_PTS: 10, TIME_PTS: 4,
  SLIDE_IN: 0.5, SLIDE_OUT: 0.36, JUDGE_DELAY: 0.6, FAIL_DELAY: 0.85,
  RESTART_LOCK: 0.45,
  // surface spring waves
  WAVE_N: 26, WAVE_K: 140, WAVE_DAMP: 4.0, WAVE_SPREAD: 60,
  MAXP: 300,                        // particle cap
  // ingredients: flow = stream multiplier, tail = after-flow (s of current stream) arriving over tailT,
  // rise = share of the poured volume that expands afterwards over riseT (foam), cloud = sinking cloud fx
  ING: {
    milk:       { name: 'Milch',     col: '#fbf7ee', dark: '#b3a584', flow: 1.00, tail: 0.015, tailT: 0.12, rise: 0,    riseT: 1,   cloud: 0 },
    matcha:     { name: 'Matcha',    col: '#8aac5c', dark: '#5f843b', flow: 0.95, tail: 0.10,  tailT: 0.45, rise: 0,    riseT: 1,   cloud: 1 },
    strawberry: { name: 'Erdbeere',  col: '#e98c9c', dark: '#c9607a', flow: 0.72, tail: 0.06,  tailT: 0.60, rise: 0,    riseT: 1,   cloud: 0 },
    coconut:    { name: 'Kokos',     col: '#efe7d6', dark: '#a8956a', flow: 1.05, tail: 0.035, tailT: 0.20, rise: 0,    riseT: 1,   cloud: 0 },
    foam:       { name: 'Cold Foam', col: '#fffdf7', dark: '#ada38c', flow: 0.85, tail: 0.01,  tailT: 0.10, rise: 0.24, riseT: 0.9, cloud: 0 },
  },
  // glass shapes: H = inner height (px), hw(h) = inner half width at height fraction h
  GLASS: {
    tall:  { H: 320, base: 18, hw: h => 60 + 16 * h },
    short: { H: 222, base: 24, hw: h => 88 + 12 * h },
    cup:   { H: 270, base: 14, hw: h => 40 + 58 * Math.sqrt(h) },
  },
};

// ───────────────────────── helpers ─────────────────────────
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const FONT = 'ui-rounded,"SF Pro Rounded","Nunito","Varela Round",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
const fonts = {}; const font = (s, w = 800) => fonts[s + '|' + w] || (fonts[s + '|' + w] = `${w} ${s}px ${FONT}`);
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixCol(a, b, t, dark = 0) { const A = hex(a), B = hex(b); const f = i => Math.round(lerp(A[i], B[i], t) * (1 - dark)); return `rgb(${f(0)},${f(1)},${f(2)})`; }
const MURK = '#8f8a5a';
function boundCol(a, b, m) { const A = hex(a), B = hex(b), M = hex(MURK), k = clamp(m * 0.6, 0, 0.6); const f = i => Math.round(lerp((A[i] + B[i]) / 2, M[i], k)); return `rgb(${f(0)},${f(1)},${f(2)})`; }

const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { alpha: false });
const bg = document.createElement('canvas'); const bgx = bg.getContext('2d');
let cssW = 0, cssH = 0, dpr = 1, scale = 1, VW = 400, VH = 800, safeTop = 0, safeBot = 0, GY = 600, GS = 1, CX = 200;
let qDpr = Math.min(2, window.devicePixelRatio || 1), lowFx = false;

// pre-rendered sprites (no per-frame blur)
function sprite(size, fn) { const c = document.createElement('canvas'); c.width = c.height = size; fn(c.getContext('2d'), size); return c; }
const SPR = {
  cloud: sprite(64, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(98,140,58,0.9)'); g.addColorStop(0.5, 'rgba(110,150,66,0.45)'); g.addColorStop(1, 'rgba(120,160,70,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }),
  bubble: sprite(32, (x, s) => { x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2; x.beginPath(); x.arc(16, 16, 12, 0, 7); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fill(); x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.arc(11, 11, 3.2, 0, 7); x.fill(); }),
  foamB: sprite(32, (x, s) => { x.strokeStyle = 'rgba(200,190,170,0.5)'; x.lineWidth = 1.5; x.beginPath(); x.arc(16, 16, 11, 0, 7); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(12, 12, 2.5, 0, 7); x.fill(); }),
  spark: sprite(48, (x, s) => { const g = x.createRadialGradient(24, 24, 0, 24, 24, 24); g.addColorStop(0, 'rgba(255,246,200,1)'); g.addColorStop(0.3, 'rgba(255,220,130,0.5)'); g.addColorStop(1, 'rgba(255,220,130,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); x.fillStyle = '#fff8dc'; x.beginPath(); x.moveTo(24, 6); x.lineTo(27, 21); x.lineTo(42, 24); x.lineTo(27, 27); x.lineTo(24, 42); x.lineTo(21, 27); x.lineTo(6, 24); x.lineTo(21, 21); x.closePath(); x.fill(); }),
  leaf: sprite(32, (x, s) => { x.translate(16, 16); x.rotate(-0.6); x.fillStyle = '#7ea04d'; x.beginPath(); x.ellipse(0, 0, 13, 6.5, 0, 0, 7); x.fill(); x.strokeStyle = '#5c7d36'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(-11, 0); x.lineTo(11, 0); x.stroke(); }),
};

// ───────────────────────── glass geometry (volume tables) ─────────────────────────
const VT_N = 160;
for (const k in T.GLASS) {
  const g = T.GLASS[k], cum = new Float32Array(VT_N + 1); let s = 0; cum[0] = 0;
  for (let i = 1; i <= VT_N; i++) { const h = (i - 0.5) / VT_N; s += g.hw(h); cum[i] = s; }
  for (let i = 0; i <= VT_N; i++) cum[i] /= s; g.cum = cum; g.id = k;
}
function volToH(g, v) { // v may exceed 1 (overflow) – extrapolate linearly
  if (v <= 0) return 0; const c = g.cum; if (v >= 1) return 1 + (v - 1) * (c[VT_N] - c[VT_N - 1] > 0 ? 1 / ((c[VT_N] - c[VT_N - 1]) * VT_N) : 1);
  let lo = 0, hi = VT_N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < v) lo = m; else hi = m; }
  return (lo + (v - c[lo]) / (c[hi] - c[lo])) / VT_N;
}
function hToVol(g, h) { if (h <= 0) return 0; if (h >= 1) return 1; const f = h * VT_N, i = Math.floor(f); return lerp(g.cum[i], g.cum[i + 1], f - i); }

// ───────────────────────── layout ─────────────────────────
function resize() {
  cssW = window.innerWidth; cssH = window.innerHeight;
  dpr = Math.min(qDpr, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(cssW * dpr)); cv.height = Math.max(1, Math.round(cssH * dpr));
  scale = Math.min(cssW / T.W, cssH / T.MIN_H);
  VW = cssW / scale; VH = cssH / scale;
  const s = getComputedStyle(document.getElementById('safe'));
  safeTop = (parseFloat(s.paddingTop) || 0) / scale; safeBot = (parseFloat(s.paddingBottom) || 0) / scale;
  CX = VW / 2; GY = VH - 112 - safeBot;
  GS = clamp((VH - safeTop - safeBot - 360) / 330, 0.82, 1.18);
  buildBg();
}
function buildBg() {
  bg.width = cv.width; bg.height = cv.height;
  const b = bgx, k = dpr * scale; b.setTransform(k, 0, 0, k, 0, 0);
  const g = b.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#fbf5e8'); g.addColorStop(0.6, '#f4ead6'); g.addColorStop(1, '#efe2c8');
  b.fillStyle = g; b.fillRect(0, 0, VW, VH);
  const R = mulberry(5);
  // soft pastel blobs (rendered once)
  for (let i = 0; i < 7; i++) {
    const x = R() * VW, y = R() * VH * 0.7, r = 90 + R() * 160, c = R() < 0.6 ? '168,196,140' : '240,190,190';
    const cg = b.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `rgba(${c},0.22)`); cg.addColorStop(1, `rgba(${c},0)`);
    b.fillStyle = cg; b.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // shelf with little café props (simple shapes)
  const sy = safeTop + VH * 0.3;
  b.fillStyle = 'rgba(160,130,95,0.16)'; b.fillRect(0, sy, VW, 6);
  b.fillStyle = 'rgba(120,150,95,0.18)';
  for (let i = 0; i < 4; i++) { const x = 24 + i * (VW - 48) / 3.2 + R() * 20; b.beginPath(); b.ellipse(x, sy - 12, 9, 12, 0, 0, 7); b.fill(); b.fillRect(x - 7, sy - 6, 14, 6); }
  // sage arch backdrop behind the glass so white milk pops
  { const aw = Math.min(VW - 40, 300), ax = VW / 2 - aw / 2, atop = GY - 330 * GS - 40, ab = GY + 6;
    const ag = b.createLinearGradient(0, atop, 0, ab); ag.addColorStop(0, '#c9d8b4'); ag.addColorStop(1, '#adc293');
    b.fillStyle = ag; b.beginPath(); b.moveTo(ax, ab); b.lineTo(ax, atop + aw / 2); b.arc(VW / 2, atop + aw / 2, aw / 2, Math.PI, 0); b.lineTo(ax + aw, ab); b.closePath(); b.fill();
    b.strokeStyle = 'rgba(255,255,255,0.5)'; b.lineWidth = 3; b.stroke(); }
  // counter
  const cy = GY + 6;
  const cg = b.createLinearGradient(0, cy, 0, VH); cg.addColorStop(0, '#b9cc9f'); cg.addColorStop(0.08, '#a8bf8c'); cg.addColorStop(1, '#93ad78');
  b.fillStyle = cg; b.fillRect(0, cy, VW, VH - cy);
  b.fillStyle = 'rgba(255,255,255,0.35)'; b.fillRect(0, cy, VW, 2);
  b.fillStyle = 'rgba(70,90,50,0.08)'; for (let x = -20; x < VW; x += 34) b.fillRect(x, cy + 14, 1, VH);
}

// ───────────────────────── audio (procedural) ─────────────────────────
const S = { ctx: null, out: null, on: store.get('omm_mute', '0') !== '1', noise: null, pourG: null, pourF: null, lastP: 0, glugT: 0 };
function aInit() {
  if (S.ctx) { if (S.ctx.state !== 'running') S.ctx.resume().catch(() => {}); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  try {
    const c = new C(); S.ctx = c;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.connect(c.destination);
    S.out = c.createGain(); S.out.gain.value = S.on ? 0.85 : 0; S.out.connect(comp);
    const len = c.sampleRate * 2 | 0, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let br = 0; for (let i = 0; i < len; i++) { br = br * 0.82 + (Math.random() * 2 - 1) * 0.18; d[i] = br * 2.4; } // soft (brownish) noise
    S.noise = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    S.pourF = c.createBiquadFilter(); S.pourF.type = 'bandpass'; S.pourF.frequency.value = 600; S.pourF.Q.value = 1.4;
    S.pourG = c.createGain(); S.pourG.gain.value = 0; src.connect(S.pourF); S.pourF.connect(S.pourG); S.pourG.connect(S.out); src.start();
  } catch (e) { S.ctx = null; }
}
function nz(t0, dur, type, f1, q, vol, f2) {
  const c = S.ctx, src = c.createBufferSource(); src.buffer = S.noise;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f1, t0); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t0 + dur); f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(f); f.connect(g); g.connect(S.out); src.start(t0, Math.random() * 1.5, dur + 0.03);
}
function tn(t0, type, f1, f2, dur, vol, att = 0.005) {
  const c = S.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f1, t0); if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(S.out); o.start(t0); o.stop(t0 + dur + 0.05);
}
const ok = () => S.ctx && S.on && S.ctx.state === 'running';
const sfx = {
  clink(v = 1, d = 0) { if (!ok()) return; const t = S.ctx.currentTime + d, f = rnd(2100, 2900); tn(t, 'sine', f, f * 0.995, 0.28, 0.07 * v, 0.002); tn(t, 'sine', f * 2.76, f * 2.76, 0.12, 0.035 * v, 0.002); tn(t, 'sine', f * 5.4, f * 5.4, 0.05, 0.02 * v, 0.002); },
  glug(h) { if (!ok()) return; const t = S.ctx.currentTime, f = 380 + h * 700 + rnd(-60, 60); tn(t, 'sine', f, f * 1.5, 0.05, 0.035, 0.004); },
  tick() { if (!ok()) return; tn(S.ctx.currentTime, 'sine', 1250, 1250, 0.05, 0.05); },
  good() { if (!ok()) return; const t = S.ctx.currentTime; tn(t, 'triangle', 880, 880, 0.22, 0.08); tn(t + 0.07, 'triangle', 1175, 1175, 0.3, 0.07); },
  perfect(k = 0) { if (!ok()) return; const t = S.ctx.currentTime, b = [1047, 1175, 1319, 1568, 1760][Math.min(4, k)]; tn(t, 'triangle', b, b, 0.35, 0.09); tn(t + 0.06, 'sine', b * 1.5, b * 1.5, 0.4, 0.07); tn(t + 0.12, 'sine', b * 2, b * 2, 0.45, 0.05); },
  knapp() { if (!ok()) return; const t = S.ctx.currentTime; tn(t, 'triangle', 660, 990, 0.18, 0.09); },
  glass() { if (!ok()) return; const t = S.ctx.currentTime; [784, 988, 1175, 1568].forEach((f, i) => tn(t + i * 0.07, 'triangle', f, f, 0.32, 0.08)); sfx.clink(0.8, 0.3); },
  miss() { if (!ok()) return; const t = S.ctx.currentTime; tn(t, 'sine', 300, 150, 0.32, 0.18); tn(t + 0.12, 'sine', 220, 110, 0.35, 0.14); },
  spill() { if (!ok()) return; const t = S.ctx.currentTime; nz(t, 0.6, 'lowpass', 2400, 0.8, 0.5, 260); tn(t, 'sine', 240, 90, 0.4, 0.15); },
  fizz() { if (!ok()) return; nz(S.ctx.currentTime, rnd(0.02, 0.05), 'highpass', rnd(3000, 6000), 1, 0.05); },
  ui() { if (!ok()) return; tn(S.ctx.currentTime, 'sine', 700, 1050, 0.09, 0.08); },
  record() { if (!ok()) return; const t = S.ctx.currentTime; [784, 988, 1175, 1568, 1976].forEach((f, i) => tn(t + i * 0.08, 'triangle', f, f, 0.34, 0.08)); },
  over() { if (!ok()) return; const t = S.ctx.currentTime; [659, 523, 440].forEach((f, i) => tn(t + i * 0.12, 'triangle', f, f, 0.4, 0.08)); },
};
function setPour(rate, h) {
  if (!S.ctx || !S.pourG) return; const t = S.ctx.currentTime; if (t - S.lastP < 0.03) return; S.lastP = t;
  S.pourG.gain.setTargetAtTime(S.on && rate > 0 ? 0.08 + rate * 0.55 : 0, t, rate > 0 ? 0.03 : 0.06);
  S.pourF.frequency.setTargetAtTime(320 + h * 1350 + rate * 350, t, 0.05); // rising pitch as the glass fills
}
let hapticOK = false;
const vib = p => { if (hapticOK && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } };

// ───────────────────────── particles & pops ─────────────────────────
// kinds: 0 droplet (outside), 1 bubble (inside liquid), 2 matcha cloud (inside), 3 spark (outside), 4 leaf (outside)
const parts = []; for (let i = 0; i < T.MAXP; i++) parts.push({ a: 0, x: 0, y: 0, vx: 0, vy: 0, l: 0, m: 1, s: 1, c: '#fff', k: 0, g: 0, r: 0, vr: 0 });
let pI = 0, pAlive = 0;
function emit(k, x, y, vx, vy, s, life, c, g) {
  if (lowFx && Math.random() < 0.45) return;
  const p = parts[pI]; pI = (pI + 1) % T.MAXP;
  p.a = 1; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.s = s; p.l = 0; p.m = life; p.c = c; p.g = g || 0; p.r = rnd(0, 6.28); p.vr = rnd(-3, 3);
}
const pops = []; for (let i = 0; i < 10; i++) pops.push({ a: 0, x: 0, y: 0, t: 0, txt: '', c: '#fff', s: 1 });
let ppI = 0; function pop(x, y, txt, c, s = 1) { const hwT = txt.length * 9.5 * s; x = clamp(x, hwT + 6, VW - hwT - 6); const o = pops[ppI]; ppI = (ppI + 1) % pops.length; o.a = 1; o.x = x; o.y = y; o.t = 0; o.txt = txt; o.c = c; o.s = s; }

// ───────────────────────── engine state ─────────────────────────
const G = { state: 'menu', t: 0, shake: 0, flash: 0, over: null, overT: 0, hud: {}, hold: false, toast: '', toastT: 0, seen: {}, menuT: 0 };
const E = {
  rec: null, glass: null, phase: 'none', t: 0, gx: 0, pgx: 0, layers: [], ci: 0, band: 0.05, perf: 0.012, rampT: 1.5, f1: 0.5,
  pouring: false, holdT: 0, holdVol: 0, rate: 0, prate: 0, idle: 0, needRelease: false, timeMax: 0, timeLeft: 0,
  done: null, judgeT: 0, emitted: false, queue: null, ice: [], wave: new Float32Array(T.WAVE_N), wv: new Float32Array(T.WAVE_N),
  streamTop: 0, streamW: 0, jugA: 0, glugAcc: 0, foam: [], bot: false, botAim: 0, hintsOn: false, mixHint: false, spillT: 0, failFx: 0,
};
const cbs = new Set();
function D() { return E.rec && E.rec.diff !== undefined ? E.rec.diff : 0; }

function initGlass(rec) {
  const g = T.GLASS[rec.glass] || T.GLASS.tall;
  const d = clamp(rec.diff !== undefined ? rec.diff : (typeof rec.difficulty === 'number' ? rec.difficulty : 0.3), 0, 1);
  E.rec = rec; E.glass = g; E.phase = 'in'; E.t = 0; E.gx = VW + 140; E.pgx = E.gx; E.ci = 0; E.pouring = false; E.rate = 0; E.prate = 0; E.idle = 0;
  E.layers = rec.layers.map(l => ({ type: T.ING[l.type] ? l.type : 'milk', target: clamp(+l.target || 0.5, 0.05, 0.98), vol: 0, pv: 0, tailP: 0, tailR: 0, riseP: 0, riseR: 0, mix: 0, res: null }));
  const bm = rec.band || 1;
  E.band = lerp(T.BAND0, T.BAND1, d) * bm; E.perf = lerp(T.PERF0, T.PERF1, d) * Math.sqrt(bm);
  E.rampT = lerp(T.RAMP_T0, T.RAMP_T1, d) / (rec.rampMul || 1); E.f1 = lerp(T.F1_0, T.F1_1, d);
  E.timeMax = rec.time > 0 ? rec.time : 0; E.timeLeft = E.timeMax; E.done = null; E.emitted = false; E.judgeT = 0;
  E.needRelease = G.hold; E.bot = !!rec.bot; E.hintsOn = !!rec.hints; E.spillT = 0; E.failFx = 0;
  E.wave.fill(0); E.wv.fill(0); E.streamW = 0; E.jugA = 0;
  const R = mulberry((Math.random() * 1e9) | 0), n = rec.glass === 'short' ? 3 : 4; E.ice = [];
  const hw0 = g.hw(0.1) * GS;
  for (let i = 0; i < n; i++) E.ice.push({ x: rnd(-hw0 * 0.45, hw0 * 0.45), s: (rec.glass === 'cup' ? 30 : 36) * GS * (0.85 + R() * 0.3), rest: 0, r: rnd(-0.4, 0.4), ph: R() * 6.28 });
  E.ice.sort((a, b) => a.x - b.x);
  let stack = 0; for (let i = 0; i < n; i++) { E.ice[i].rest = stack + E.ice[i].s * 0.5; stack += E.ice[i].s * (i % 2 ? 0.55 : 0.75); } // resting height above bottom
  E.foam = []; for (let i = 0; i < 26; i++) E.foam.push({ x: R(), y: R(), s: 0.4 + R() * 0.8 });
}
function startGlass(rec) {
  if (!rec || !rec.layers || !rec.layers.length) throw new Error('OMM.startGlass: recipe.layers required');
  if (E.phase === 'none' || E.phase === 'gone') { initGlass(rec); sfx.clink(0.8, 0.15); sfx.clink(0.6, 0.3); }
  else { E.queue = rec; E.phase = 'out'; E.t = 0; }
}
const curLayer = () => E.layers[E.ci];
function cumVol(i) { let s = 0; for (let k = 0; k <= i; k++) s += E.layers[k].vol; return s; }
function totalVol() { let s = 0; for (const l of E.layers) s += l.vol; return s; }
const gH = () => E.glass.H * GS;
const yOf = h => GY - h * gH();
function surfH() { return volToH(E.glass, totalVol()); }

function judgeLayer(i) {
  const L = E.layers[i], actual = volToH(E.glass, cumVol(i)), err = actual - L.target, ae = Math.abs(err);
  const sharp = i === 0 ? 1 : clamp(1 - L.mix, 0, 1);
  L.res = { type: L.type, target: L.target, actual: +actual.toFixed(4), error: +err.toFixed(4), sharpness: +sharp.toFixed(3), perfect: ae <= E.perf, miss: ae > E.band, knapp: ae > E.band * T.KNAPP && ae <= E.band };
  return L.res;
}
function layerPoints(r) { return T.PTS + (r.perfect ? T.PERFECT_PTS : 0) + (r.knapp ? T.KNAPP_PTS : 0) + Math.round(r.sharpness * T.SHARP_PTS); }
function commitLayer() {
  const i = E.ci, r = judgeLayer(i), y = yOf(r.actual), x = E.gx + E.glass.hw(r.actual) * GS + 34;
  E.idle = 0; sfx.tick();
  if (r.miss) { pop(E.gx, y - 20, r.error > 0 ? 'ZU VIEL!' : 'ZU WENIG!', '#d4607a', 1.15); finishGlass('miss'); return; }
  if (r.perfect) { pop(E.gx, y - 24, 'PERFEKT!', '#c99a2e', 1.2); sfx.perfect(i); vib(12); for (let k = 0; k < 10; k++) emit(3, E.gx + rnd(-60, 60), y + rnd(-8, 8), rnd(-60, 60), rnd(-90, -20), rnd(10, 18), rnd(0.5, 0.9)); }
  else if (r.knapp) { pop(E.gx, y - 24, 'KNAPP!', '#d08a3a', 1.05); sfx.knapp(); vib(8); }
  else { pop(E.gx, y - 24, 'GUT', '#6f8f46', 0.95); sfx.good(); }
  if (i > 0) { if (r.sharpness >= T.SHARP_OK) pop(x, y + 14, 'SAUBER!', '#5f843b', 0.75); else if (r.sharpness < 0.5) pop(x, y + 14, 'TRÜB', '#9a8a5a', 0.7); }
  E.ci++; E.pouring = false; E.holdT = 0;
  if (E.ci >= E.layers.length) finishGlass('ok'); else if (G.hold) E.needRelease = true;
}
function finishGlass(reason) {
  if (E.done) return;
  for (let i = 0; i < E.layers.length; i++) if (!E.layers[i].res) judgeLayer(i);
  const rs = E.layers.map(l => l.res), failed = reason !== 'ok';
  let score = 0; if (!failed) { for (const r of rs) score += layerPoints(r); if (E.timeMax) score += Math.round(E.timeLeft / E.timeMax * T.TIME_PTS * rs.length); }
  const perfect = !failed && rs.every((r, i) => r.perfect && (i === 0 || r.sharpness >= T.PERFECT_SHARP));
  E.done = { recipeId: E.rec.id, score, perfect, overflow: reason === 'overflow', failed, timeout: reason === 'timeout', reason,
    time: +(E.timeMax ? E.timeMax - E.timeLeft : E.t).toFixed(2), timeLeft: +E.timeLeft.toFixed(2),
    layers: rs.map(r => ({ type: r.type, target: r.target, actual: r.actual, error: r.error, sharpness: r.sharpness })) };
  E.phase = 'judge'; E.judgeT = 0; E.pouring = false; setPour(0, 0);
  if (G.hold) E.needRelease = true;
  if (perfect) { sfx.glass(); vib([10, 40, 14]); G.flash = 0.5; pop(E.gx, yOf(1) - 92, 'PERFEKTES GLAS!', '#c99a2e', 1.15);
    for (let k = 0; k < 22; k++) emit(k % 3 ? 3 : 4, E.gx + rnd(-50, 50), yOf(0.9), rnd(-160, 160), rnd(-260, -80), rnd(12, 20), rnd(0.8, 1.3), '', 260); }
  if (failed) { E.failFx = 1; G.shake = reason === 'overflow' ? 7 : 4; vib(30);
    if (reason === 'overflow') { sfx.spill(); pop(E.gx, yOf(1) - 40, 'ÜBERGELAUFEN!', '#d4607a', 1.2); }
    else if (reason === 'timeout') { sfx.miss(); pop(E.gx, yOf(1) - 40, 'ZU LANGSAM!', '#d4607a', 1.15); }
    else sfx.miss(); }
}

function pourStep(dt) {
  const L = curLayer(), ing = T.ING[L.type];
  const wantHold = E.bot ? botWants() : (G.hold && !E.needRelease);
  if (wantHold) {
    if (!E.pouring) { E.pouring = true; E.holdT = 0; E.holdVol = 0; E.streamTop = 0; }
    E.holdT += dt;
    const f = Math.pow(clamp(E.holdT / E.rampT, 0, 1), T.RAMP_POW);
    E.rate = ing.flow * (T.F0 + (E.f1 - T.F0) * f);
    const dv = E.rate * dt; L.vol += dv; E.holdVol += dv; E.idle = 0;
    if (E.ci > 0 && E.rate > T.MIX0) { L.mix += (E.rate - T.MIX0) * T.MIX_K * dt; if (E.hintsOn && !G.seen.mix && L.mix > 0.25) { G.seen.mix = 1; E.mixHint = 2.5; } }
  } else {
    if (E.pouring) { // release → after-flow
      E.pouring = false;
      L.tailP += E.rate * ing.tail; L.tailR = 1 / ing.tailT;
      L.riseP += E.holdVol * ing.rise; L.riseR = 1 / ing.riseT;
      if (ing.cloud && E.ci > 0) L.mix += E.rate * 0.12;
    }
    E.rate = 0;
  }
  // after-flow delivery (exponential)
  let pend = 0;
  for (const Lk of E.layers) {
    if (Lk.tailP > 0) { const d = Math.min(Lk.tailP, Lk.tailP * Lk.tailR * dt * 2.2 + 0.0004 * dt); Lk.vol += d; Lk.tailP -= d; }
    if (Lk.riseP > 0) { const d = Math.min(Lk.riseP, Lk.riseP * Lk.riseR * dt * 2.2 + 0.0004 * dt); Lk.vol += d; Lk.riseP -= d; if (Math.random() < 0.25) sfx.fizz(); }
    if (Lk.tailP < 1e-5) Lk.tailP = 0; if (Lk.riseP < 1e-5) Lk.riseP = 0;
    pend += Lk.tailP + Lk.riseP;
  }
  const h = surfH();
  if (h >= 1.0) { E.spillT = 1; spillFx(); finishGlass('overflow'); return; }
  if (!E.pouring && pend < 0.0006 && L.vol > T.TINY) {
    E.idle += dt;
    const far = volToH(E.glass, cumVol(E.ci)) < L.target - E.band;
    if (E.idle >= (far ? T.COMMIT_FAR : T.COMMIT)) commitLayer();
  }
  if (E.timeMax && E.phase === 'pour') { E.timeLeft -= dt; if (E.timeLeft <= 0) { E.timeLeft = 0; finishGlass('timeout'); } }
}
function botWants() { // menu demo autopilot
  const L = curLayer(); if (!L) return false; const ing = T.ING[L.type];
  if (E.pouring) { const pred = cumVol(E.ci) + E.rate * ing.tail + E.holdVol * ing.rise; return volToH(E.glass, pred) < L.target + E.botAim; }
  return L.vol <= T.TINY && E.idle === 0 && E.t > 0.5;
}
function spillFx() { const y = yOf(1) - 2; for (const s of [-1, 1]) for (let k = 0; k < 14; k++) emit(0, E.gx + s * E.glass.hw(1) * GS, y, s * rnd(20, 90), rnd(-120, 10), rnd(2, 4.5), rnd(0.6, 1), T.ING[(curLayer() || E.layers[E.layers.length - 1]).type].dark, 700); }

function stepEngine(dt) {
  E.pgx = E.gx; for (const l of E.layers) l.pv = l.vol + 0;
  if (E.phase === 'none' || E.phase === 'gone') return;
  E.t += dt;
  if (E.phase === 'in') { const f = clamp(E.t / T.SLIDE_IN, 0, 1), e = 1 - Math.pow(1 - f, 3) * (1 - f * 0.0); E.gx = lerp(VW + 140, CX, e + Math.sin(f * Math.PI) * 0.0); if (f >= 1) { E.gx = CX; E.phase = 'pour'; E.t = 0; E.botAim = rnd(-0.006, 0.006); } }
  else if (E.phase === 'pour') pourStep(dt);
  else if (E.phase === 'judge') { E.judgeT += dt; E.timeLeft = E.timeLeft; if (!E.emitted && E.judgeT >= (E.done.failed ? T.FAIL_DELAY : T.JUDGE_DELAY)) { E.emitted = true; const d = E.done; for (const cb of Array.from(cbs)) { try { cb(d); } catch (e) { console.error(e); } } } deliverOnly(dt); }
  else if (E.phase === 'out') { const f = clamp(E.t / T.SLIDE_OUT, 0, 1); E.gx = lerp(CX, -160, f * f); if (f >= 1) { E.phase = 'gone'; if (E.queue) { const q = E.queue; E.queue = null; initGlass(q); sfx.clink(0.8, 0.05); sfx.clink(0.6, 0.2); } } }
  if (E.phase !== 'pour' && E.phase !== 'judge') E.rate = 0;
  // stream visuals
  const tw = E.rate > 0 ? 3 + E.rate * 16 : 0; E.streamW += (tw - E.streamW) * Math.min(1, dt * 18);
  if (!E.pouring) E.streamTop += dt * 900; E.jugA += ((E.pouring ? 1 : 0) - E.jugA) * Math.min(1, dt * 9);
  if (E.layers.length && (E.phase === 'pour' || E.phase === 'judge')) liquidFx(dt);
  // waves
  const N = T.WAVE_N, w = E.wave, v = E.wv;
  for (let i = 0; i < N; i++) { const l = i > 0 ? w[i - 1] : w[i], r = i < N - 1 ? w[i + 1] : w[i]; v[i] += (-T.WAVE_K * w[i] + T.WAVE_SPREAD * (l + r - 2 * w[i]) * 6 - T.WAVE_DAMP * v[i]) * dt; }
  for (let i = 0; i < N; i++) w[i] += v[i] * dt;
  E.failFx = Math.max(0, E.failFx - dt);
}
function deliverOnly(dt) { for (const Lk of E.layers) { if (Lk.tailP > 0) { const d = Math.min(Lk.tailP, Lk.tailP * Lk.tailR * dt * 2.2 + 0.0004 * dt); Lk.vol += d; Lk.tailP -= d; } if (Lk.riseP > 0) { const d = Math.min(Lk.riseP, Lk.riseP * Lk.riseR * dt * 2.2 + 0.0004 * dt); Lk.vol += d; Lk.riseP -= d; } } }
function liquidFx(dt) {
  const L = curLayer(), h = surfH(), sy = yOf(Math.min(h, 1)), sx = E.gx + 12 * GS, ing = T.ING[(L || E.layers[E.layers.length - 1]).type];
  if (E.rate > 0 && E.phase === 'pour') {
    const N = T.WAVE_N, hw = E.glass.hw(Math.min(h, 1)) * GS, idx = clamp(Math.round((sx - (E.gx - hw)) / (2 * hw) * (N - 1)), 0, N - 1);
    E.wv[idx] += E.rate * 260 * dt * 8 * (Math.random() - 0.3); if (idx > 0) E.wv[idx - 1] -= E.rate * 400 * dt; if (idx < N - 1) E.wv[idx + 1] -= E.rate * 400 * dt;
    if (Math.random() < E.rate * 6 * dt * 60 * 0.12) emit(0, sx + rnd(-3, 3), sy - 2, rnd(-50, 50), rnd(-120, -40), rnd(1.5, 3), rnd(0.25, 0.45), ing.col === '#fbf7ee' || ing.col === '#fffdf7' ? '#e9e1cf' : ing.dark, 700);
    if (Math.random() < E.rate * 4 * dt * 60 * 0.12) emit(1, sx + rnd(-8, 8), sy + rnd(6, 26), rnd(-8, 8), rnd(-40, -15), rnd(4, 8), rnd(0.4, 0.9), '', 0);
    E.glugAcc += dt * (4 + E.rate * 18); if (E.glugAcc > 1) { E.glugAcc = 0; sfx.glug(h); }
  }
  // matcha clouds sinking into the layer below
  if (L && ing.cloud && E.ci > 0 && (E.rate > 0 || L.tailP > 0.002)) {
    const by = yOf(volToH(E.glass, cumVol(E.ci - 1))), hw = E.glass.hw(volToH(E.glass, cumVol(E.ci - 1))) * GS;
    const amt = (E.rate + L.tailP * 3) * 50 * dt;
    if (Math.random() < amt) emit(2, E.gx + rnd(-hw * 0.7, hw * 0.7), by + rnd(-4, 4), rnd(-10, 10), rnd(8, 26) * (0.6 + E.rate), rnd(12, 22) * GS, rnd(1.4, 2.4), '', -6);
  }
  if (L && L.riseP > 0.001 && Math.random() < 0.4) emit(1, E.gx + rnd(-40, 40), sy + rnd(2, 10), rnd(-5, 5), rnd(-20, -5), rnd(3, 6), 0.4, '', 0);
}

// ───────────────────────── modes & public API ─────────────────────────
const modes = {}; let modeCbs = [];
const API = {
  T, BUILD,
  startGlass,
  onGlassDone(cb) { cbs.add(cb); modeCbs.push(cb); return () => cbs.delete(cb); },
  setHUD(o) { if (o === null) { G.hud = {}; return; } for (const k in o) { if (o[k] === null) delete G.hud[k]; else G.hud[k] = o[k]; } },
  mode: 'menu',
  registerMode(id, def) { modes[id] = Object.assign({ label: id }, def, { id }); },
  setMode,
  gameOver,
  pop(txt, c) { pop(CX, VH * 0.42, txt, c || '#5f843b', 1); },
  random: seed => seed === undefined ? Math.random : mulberry(seed | 0),
  state: () => ({ phase: E.phase, layer: E.ci, level: E.layers.length ? surfH() : 0, pouring: E.pouring, rate: E.rate, timeLeft: E.timeLeft, gameState: G.state }),
};
function setMode(id) {
  const cur = modes[API.mode]; if (cur && cur.stop) { try { cur.stop(); } catch (e) { console.error(e); } }
  for (const cb of modeCbs) cbs.delete(cb); modeCbs = [];
  G.hud = {}; G.over = null; E.queue = null; API.mode = id; E.needRelease = G.hold;
  if (id === 'menu') { G.state = 'menu'; G.menuT = 0; startDemo(); return; }
  G.state = 'play'; E.phase = 'none';
  const m = modes[id]; if (m && m.start) m.start(API);
}
function gameOver(o) {
  o = o || {}; const key = 'omm_best_' + API.mode, best = +store.get(key, '0') || 0, sc = o.score | 0, nb = sc > best;
  if (nb) store.set(key, String(sc));
  G.over = { score: sc, title: o.title || 'Feierabend!', sub: o.sub || '', lines: o.lines || [], best: nb ? sc : best, newBest: nb && sc > 0, mode: API.mode };
  G.state = 'over'; G.overT = 0; sfx.over(); if (nb && sc > 0) setTimeout(sfx.record, 450);
}
const bestOf = id => +store.get('omm_best_' + id, '0') || 0;

// menu demo
const DEMO = [
  { id: 'demo1', name: 'Iced Matcha Latte', glass: 'tall', layers: [{ type: 'milk', target: 0.5 }, { type: 'matcha', target: 0.84 }] },
  { id: 'demo2', name: 'Strawberry Matcha', glass: 'short', layers: [{ type: 'strawberry', target: 0.3 }, { type: 'milk', target: 0.6 }, { type: 'matcha', target: 0.86 }] },
  { id: 'demo3', name: 'Matcha Cold Foam', glass: 'cup', layers: [{ type: 'milk', target: 0.45 }, { type: 'matcha', target: 0.72 }, { type: 'foam', target: 0.9 }] },
];
let demoI = 0, demoCb = null;
function startDemo() {
  if (demoCb) cbs.delete(demoCb);
  demoCb = () => { if (API.mode === 'menu') { demoI = (demoI + 1) % DEMO.length; startGlass(Object.assign({ bot: true, diff: 0.2 }, DEMO[demoI])); } };
  cbs.add(demoCb); modeCbs.push(demoCb);
  E.phase = 'none'; startGlass(Object.assign({ bot: true, diff: 0.2 }, DEMO[demoI]));
}

// ───────────────────────── Endless mode (built purely on the public API) ─────────────────────────
const RECIPES = [
  { name: 'Iced Matcha Latte', layers: ['milk', 'matcha'], from: 1, w: 3 },
  { name: 'Strawberry Matcha', layers: ['strawberry', 'milk', 'matcha'], from: 4, w: 3 },
  { name: 'Matcha Cold Foam', layers: ['milk', 'matcha', 'foam'], from: 6, w: 3 },
  { name: 'Coconut Matcha', layers: ['coconut', 'matcha'], from: 8, w: 2 },
  { name: 'Coconut Cloud', layers: ['coconut', 'matcha', 'foam'], from: 11, w: 2 },
  { name: 'Strawberry Cloud', layers: ['strawberry', 'milk', 'matcha', 'foam'], from: 14, w: 2 },
  { name: 'Ombré Deluxe', layers: ['strawberry', 'coconut', 'matcha', 'foam'], from: 18, w: 1 },
];
function genRecipe(n) {
  const d = clamp((n - 1) / T.RAMP_GLASSES, 0, 1);
  if (n === 1) return { id: 'e1', name: 'Iced Matcha Latte', glass: 'tall', diff: 0, band: 1.3, hints: true, time: 0, layers: [{ type: 'milk', target: 0.48 }, { type: 'matcha', target: 0.8 }] };
  const pool = RECIPES.filter(r => n >= r.from); const fresh = pool.filter(r => n - r.from < 2); // just unlocked → show it
  let r; if (fresh.length && n === fresh[0].from) r = fresh[0]; else { let s = 0; for (const p of pool) s += p.w; let x = Math.random() * s; r = pool[pool.length - 1]; for (const p of pool) { x -= p.w; if (x <= 0) { r = p; break; } } }
  const glass = n <= 3 ? 'tall' : ['tall', 'short', 'cup'][Math.floor(Math.random() * 3)];
  const k = r.layers.length, top = rnd(0.74, 0.9), minT = lerp(0.15, 0.1, d);
  const w = r.layers.map((t, i) => t === 'foam' ? rnd(0.5, 0.8) : (i === 0 ? rnd(1.2, 1.8) : rnd(0.8, 1.5)));
  const ws = w.reduce((a, b) => a + b, 0); let acc = 0;
  const layers = r.layers.map((t, i) => { acc += Math.max(minT, w[i] / ws * top); return { type: t, target: +Math.min(acc, 0.93).toFixed(3) }; });
  for (let i = 1; i < layers.length; i++) if (layers[i].target <= layers[i - 1].target + 0.06) layers[i].target = +(layers[i - 1].target + 0.08).toFixed(3);
  const time = lerp(T.TIME0, T.TIME1, d) + lerp(T.TIME_LAYER0, T.TIME_LAYER1, d) * k;
  return { id: 'e' + n, name: r.name, glass, diff: d, time: +time.toFixed(1), hints: n <= 3 || fresh.length > 0, layers };
}
const Endless = (() => {
  let api, run;
  const hud = () => api.setHUD({ score: run.score, lives: run.lives, best: bestOf('endless'), sub: run.mult > 1 ? '×' + run.mult + '  PERFEKT-SERIE' : null, title: 'Glas ' + run.n });
  function next() { run.n++; api.startGlass(genRecipe(run.n)); hud(); }
  function done(r) {
    run.glasses++;
    if (r.failed) {
      run.lives--; run.streak = 0; run.mult = 1; run.last = r.reason;
      if (run.lives <= 0) {
        const t = { overflow: 'Übergelaufen.', timeout: 'Das Eis ist geschmolzen.', miss: 'Schicht verfehlt.' }[r.reason] || '';
        api.gameOver({ score: run.score, title: 'Feierabend!', sub: t, lines: [`${run.served} Gläser serviert  ·  ${run.perfects} perfekt`] }); return;
      }
    } else {
      run.served++;
      if (r.perfect) { run.streak++; run.perfects++; run.mult = Math.min(T.MULT_MAX, 1 + run.streak); } else { run.streak = 0; run.mult = 1; }
      const pts = r.score * run.mult; run.score += pts; G.scorePop = 1;
      api.pop('+' + pts + (run.mult > 1 ? '  ×' + run.mult : ''), r.perfect ? '#c99a2e' : '#5f843b');
    }
    next();
  }
  return { label: 'Endlos', start(a) { api = a; run = { score: 0, lives: T.LIVES, n: 0, streak: 0, mult: 1, perfects: 0, served: 0, glasses: 0 }; api.onGlassDone(done); next(); }, stop() {}, run: () => run };
})();
API.registerMode('endless', Endless);
window.OMM = API;

// ───────────────────────── input ─────────────────────────
let pid = null;
function muteHit(x, y) { return x > VW - 60 && y < safeTop + 58; }
const BTN = { endless: { x: 0, y: 0, w: 0, h: 0 }, rush: { x: 0, y: 0, w: 0, h: 0 }, menu: { x: 0, y: 0, w: 0, h: 0 } };
const inB = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
function onDown(e) {
  e.preventDefault(); hapticOK = true; aInit();
  const x = e.clientX / scale, y = e.clientY / scale;
  if (muteHit(x, y)) { S.on = !S.on; store.set('omm_mute', S.on ? '0' : '1'); if (S.out) S.out.gain.value = S.on ? 0.85 : 0; sfx.ui(); return; }
  if (G.state === 'menu') {
    if (inB(BTN.rush, x, y)) { if (modes.rush) { sfx.ui(); setMode('rush'); } else { G.toast = 'Rush Hour kommt bald!'; G.toastT = 1.6; sfx.tick(); } return; }
    sfx.ui(); setMode('endless'); return; // anywhere else (incl. the Endlos button) starts Endlos
  }
  if (G.state === 'over') {
    if (G.overT < T.RESTART_LOCK) return;
    if (inB(BTN.menu, x, y)) { sfx.ui(); setMode('menu'); return; }
    setMode(G.over.mode); // instant restart
  }
  if (pid !== null) return;
  pid = e.pointerId; try { cv.setPointerCapture(pid); } catch (er) {}
  G.hold = true;
}
function onUp(e) { if (e.pointerId !== pid) return; pid = null; G.hold = false; E.needRelease = false; }
cv.addEventListener('pointerdown', onDown, { passive: false });
cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'dblclick'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pid = null; G.hold = false; E.needRelease = false; setPour(0, 0); if (S.ctx && S.ctx.state === 'running') S.ctx.suspend().catch(() => {}); }
  else { last = performance.now(); acc = 0; if (S.ctx) S.ctx.resume().catch(() => {}); }
});
window.addEventListener('resize', () => { resize(); if (E.phase === 'pour' || E.phase === 'judge') E.gx = E.pgx = CX; });

// ───────────────────────── simulation ─────────────────────────
function stepFx(dt) {
  pAlive = 0;
  for (let i = 0; i < T.MAXP; i++) { const p = parts[i]; if (!p.a) continue; p.l += dt; if (p.l >= p.m) { p.a = 0; continue; } pAlive++;
    if (p.k === 2) { p.vx *= 1 - 0.8 * dt; p.vy = p.vy * (1 - 0.9 * dt); p.s += dt * 9; } else { p.vx *= 1 - 1.5 * dt; p.vy += p.g * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; }
  for (const o of pops) if (o.a) { o.t += dt; if (o.t >= 1.1) o.a = 0; }
  G.shake = Math.max(0, G.shake - dt * 25); G.flash = Math.max(0, G.flash - dt * 1.6); G.scorePop = Math.max(0, (G.scorePop || 0) - dt * 3);
  if (G.toastT > 0) G.toastT -= dt; if (E.mixHint > 0) E.mixHint -= dt;
}
let pourSoundRate = 0;
function step(dt) {
  G.t += dt; stepFx(dt);
  if (G.state === 'menu') G.menuT += dt;
  if (G.state === 'over') G.overT += dt;
  stepEngine(dt);
  const r = (E.phase === 'pour' && G.state !== 'over') ? E.rate : 0;
  pourSoundRate = r; setPour(G.state === 'menu' ? r * 0.5 : r, E.layers.length ? Math.min(1, surfH()) : 0);
}

// ───────────────────────── rendering ─────────────────────────
function rr(x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function glassPath(gx, g, out) {
  const H = g.H * GS, n = 14;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const h = i / n; ctx.lineTo(gx - (g.hw(h) * GS + out), GY - h * H - (i === n ? out * 0.3 : 0)); }
  for (let i = n; i >= 0; i--) { const h = i / n; ctx.lineTo(gx + g.hw(h) * GS + out, GY - h * H - (i === n ? out * 0.3 : 0)); }
  ctx.closePath();
}
function textOut(txt, x, y, size, col, w = 900, stroke = 'rgba(255,253,246,0.95)') {
  ctx.font = font(size, w); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.22; ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y);
  ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.textBaseline = 'alphabetic';
}
function drawGlass(alpha) {
  if (!E.glass || E.phase === 'none' || E.phase === 'gone') return;
  const g = E.glass, gx = lerp(E.pgx, E.gx, alpha), H = g.H * GS;
  // shadow on counter
  ctx.fillStyle = 'rgba(60,80,40,0.16)'; ctx.beginPath(); ctx.ellipse(gx, GY + g.base * GS + 4, g.hw(0) * GS + 22, 9, 0, 0, 7); ctx.fill();
  // base block
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); rr(gx - g.hw(0) * GS - 6, GY - 2, (g.hw(0) * GS + 6) * 2, g.base * GS + 4, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(150,170,140,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  // interior back
  glassPath(gx, g, 0); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  ctx.save(); glassPath(gx, g, 0); ctx.clip();
  // liquid layers
  let cum = 0, prevH = 0; const n = E.layers.length, top = (() => { let k = -1; for (let i = 0; i < n; i++) if (E.layers[i].vol > 0.0005) k = i; return k; })();
  const hs = []; for (let i = 0; i < n; i++) { const L = E.layers[i]; cum += lerp(L.pv, L.vol, alpha); hs.push(Math.min(volToH(g, cum), 1.02)); }
  const L0 = gx - 140, LW = 280;
  for (let i = 0; i <= top; i++) {
    const L = E.layers[i], ing = T.ING[L.type], h0 = i ? hs[i - 1] : 0, h1 = hs[i];
    const y0 = GY - h0 * H + 1, y1 = GY - h1 * H;
    ctx.fillStyle = ing.col;
    if (i === top) { // wavy surface
      const N = T.WAVE_N, hw = g.hw(Math.min(h1, 1)) * GS; ctx.beginPath(); ctx.moveTo(gx - hw - 4, y0 + 2);
      for (let k = 0; k < N; k++) { const x = gx - hw - 4 + (2 * hw + 8) * k / (N - 1); ctx.lineTo(x, y1 + E.wave[k] * 1 + Math.sin(G.t * 2.2 + k * 0.6) * 0.8); }
      ctx.lineTo(gx + hw + 4, y0 + 2); ctx.closePath(); ctx.fill();
      // meniscus highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < N; k++) { const x = gx - hw - 4 + (2 * hw + 8) * k / (N - 1); ctx[k ? 'lineTo' : 'moveTo'](x, y1 + E.wave[k] + Math.sin(G.t * 2.2 + k * 0.6) * 0.8 + 1.5); } ctx.stroke();
    } else ctx.fillRect(L0, y1, LW, y0 - y1);
    if (L.type === 'foam' && y0 - y1 > 3) { // foam texture
      for (const f of E.foam) { const fy = y1 + 3 + f.y * (y0 - y1 - 4), fx = gx + (f.x - 0.5) * 2 * g.hw(h1) * GS * 0.95, s = 6 * f.s * GS; ctx.drawImage(SPR.foamB, fx - s, fy - s, s * 2, s * 2); }
    }
    // boundary with the layer below
    if (i > 0) {
      const below = T.ING[E.layers[i - 1].type], m = clamp(L.mix, 0, 1.2), bh = 3 + m * 40 * GS, by = y0 - 1;
      const gr = ctx.createLinearGradient(0, by - bh * 0.6, 0, by + bh * 0.5);
      gr.addColorStop(0, ing.col); gr.addColorStop(0.5, boundCol(ing.col, below.col, m)); gr.addColorStop(1, below.col);
      ctx.fillStyle = gr; ctx.fillRect(L0, by - bh * 0.6, LW, Math.min(bh * 1.1, (by - y1) + bh * 0.5));
    }
  }
  // depth shading over liquid (one gradient)
  if (top >= 0) { const sg = ctx.createLinearGradient(gx - 110, 0, gx + 110, 0); sg.addColorStop(0, 'rgba(60,70,40,0.16)'); sg.addColorStop(0.3, 'rgba(255,255,255,0.06)'); sg.addColorStop(0.75, 'rgba(60,70,40,0)'); sg.addColorStop(1, 'rgba(60,70,40,0.14)'); ctx.fillStyle = sg; ctx.fillRect(L0, GY - Math.min(hs[top], 1) * H - 6, LW, Math.min(hs[top], 1) * H + 8); }
  // in-liquid particles
  for (let i = 0; i < T.MAXP; i++) { const p = parts[i]; if (!p.a || (p.k !== 1 && p.k !== 2)) continue; const f = p.l / p.m;
    if (p.k === 2) { ctx.globalAlpha = 0.55 * Math.sin(f * Math.PI); ctx.drawImage(SPR.cloud, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2); }
    else { ctx.globalAlpha = 0.7 * (1 - f); ctx.drawImage(SPR.bubble, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2); } }
  ctx.globalAlpha = 1;
  // ice cubes (float at the surface)
  const sh = top >= 0 ? Math.min(hs[top], 1) : 0, sy = GY - sh * H;
  for (const c of E.ice) {
    const restY = GY - c.rest, fy = sy + c.s * 0.22 + Math.sin(G.t * 1.6 + c.ph) * 1.5, y = Math.min(restY, fy), x = gx + c.x;
    ctx.save(); ctx.translate(x, y); ctx.rotate(c.r + Math.sin(G.t + c.ph) * 0.03);
    ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); rr(-c.s / 2, -c.s / 2, c.s, c.s, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); rr(-c.s / 2 + 5, -c.s / 2 + 4, c.s * 0.35, 4, 2); ctx.fill();
    ctx.restore();
  }
  // target lines
  drawTargets(gx, g, H);
  ctx.restore();
  // walls
  glassPath(gx, g, 3); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4; ctx.stroke();
  glassPath(gx, g, 5.5); ctx.strokeStyle = 'rgba(120,145,110,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(gx - g.hw(0.25) * GS + 9, GY - H * 0.25); ctx.lineTo(gx - g.hw(0.7) * GS + 10, GY - H * 0.7); ctx.stroke(); ctx.lineCap = 'butt';
  // etched café mark 'O.T.' (subtle, low on the glass)
  { const my = GY - H * 0.1; ctx.save(); ctx.globalAlpha = 0.32; ctx.font = font(11 * GS, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText(T.MARK, gx + g.hw(0.1) * GS * 0.45, my); ctx.globalAlpha = 0.18; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(gx + g.hw(0.1) * GS * 0.45, my, 13 * GS, 0, 7); ctx.stroke(); ctx.restore(); ctx.textBaseline = 'alphabetic'; }
  // labels for target lines (outside, right)
  for (let i = 0; i < n; i++) {
    const L = E.layers[i], ing = T.ING[L.type], y = GY - L.target * H, x = gx + g.hw(L.target) * GS + 12, act = i === E.ci && E.phase === 'pour';
    ctx.fillStyle = ing.col; ctx.strokeStyle = ing.dark; ctx.lineWidth = act ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(x + 6, y, act ? 8 : 6, 0, 7); ctx.fill(); ctx.stroke();
    if (L.res) { ctx.font = font(13, 900); ctx.textAlign = 'left'; ctx.fillStyle = L.res.miss ? '#d4607a' : '#5f843b'; ctx.fillText(L.res.miss ? '✕' : '✓', x + 17, y + 5); }
    else if (act) { ctx.font = font(11, 800); ctx.textAlign = 'left'; ctx.fillStyle = ing.dark; ctx.fillText(ing.name, x + 18, y + 4); }
  }
  // commit ring
  if (E.phase === 'pour' && !E.pouring && E.idle > 0) {
    const L = curLayer(), far = volToH(g, cumVol(E.ci)) < L.target - E.band, f = clamp(E.idle / (far ? T.COMMIT_FAR : T.COMMIT), 0, 1);
    const x = gx - g.hw(L.target) * GS - 20, y = GY - L.target * H;
    ctx.strokeStyle = 'rgba(95,132,59,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#5f843b'; ctx.beginPath(); ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
  }
  // perfect shine
  if (E.done && E.done.perfect && E.phase === 'judge') { const f = clamp(E.judgeT / 0.6, 0, 1); ctx.save(); glassPath(gx, g, 0); ctx.clip(); ctx.globalAlpha = 0.5 * Math.sin(f * Math.PI); ctx.fillStyle = '#fff'; ctx.beginPath(); const sx = gx - 120 + f * 260; ctx.moveTo(sx, GY - H - 20); ctx.lineTo(sx + 30, GY - H - 20); ctx.lineTo(sx - 30, GY + 20); ctx.lineTo(sx - 60, GY + 20); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; }
  if (E.failFx > 0 && E.done && E.done.reason !== 'ok') { ctx.globalAlpha = E.failFx * 0.35; glassPath(gx, g, 0); ctx.fillStyle = '#e8909e'; ctx.fill(); ctx.globalAlpha = 1; }
}
function drawTargets(gx, g, H) {
  for (let i = 0; i < E.layers.length; i++) {
    const L = E.layers[i], ing = T.ING[L.type], y = GY - L.target * H, hw = g.hw(L.target) * GS, act = i === E.ci && E.phase === 'pour';
    if (act) { const yb = GY - (L.target + E.band) * H, ya = GY - (L.target - E.band) * H; ctx.globalAlpha = 0.16; ctx.fillStyle = ing.dark; ctx.fillRect(gx - hw - 4, yb, hw * 2 + 8, ya - yb); ctx.globalAlpha = 1; }
    ctx.strokeStyle = L.res ? (L.res.miss ? 'rgba(212,96,122,0.8)' : 'rgba(95,132,59,0.55)') : ing.dark; ctx.lineWidth = act ? 2.5 : 1.5;
    ctx.globalAlpha = act ? 0.75 + 0.25 * Math.sin(G.t * 6) : (L.res ? 0.7 : 0.5);
    ctx.setLineDash(L.res ? [] : [7, 6]); ctx.beginPath(); ctx.moveTo(gx - hw, y); ctx.lineTo(gx + hw, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
}
function drawJug(alpha) {
  if (!E.glass || E.phase === 'none' || E.phase === 'gone' || !E.layers.length) return;
  const L = curLayer() || E.layers[E.layers.length - 1], ing = T.ING[L.type], g = E.glass, gx = lerp(E.pgx, E.gx, alpha);
  const H = g.H * GS, topY = GY - H, jx = gx + 40 * GS, jy = topY - 78 * GS, sx = gx + 12 * GS, spoutY = jy + 6;
  const ok = E.phase === 'pour' || E.phase === 'judge';
  // stream
  if (E.streamW > 0.4 && ok) {
    const sh = Math.min(surfH(), 1), sy = GY - sh * H + 2, st = spoutY + (E.pouring ? 0 : E.streamTop);
    if (st < sy) { const w = E.streamW * GS; ctx.fillStyle = ing.col === '#fbf7ee' || ing.col === '#fffdf7' || ing.col === '#efe7d6' ? '#f3ecdc' : ing.col;
      ctx.beginPath(); ctx.moveTo(sx - w * 0.6, st); ctx.quadraticCurveTo(sx - w * 0.45, (st + sy) / 2, sx - w / 2 + Math.sin(G.t * 30) * 0.4, sy); ctx.lineTo(sx + w / 2, sy); ctx.quadraticCurveTo(sx + w * 0.45, (st + sy) / 2, sx + w * 0.6, st); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,110,80,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(sx - w * 0.2, st, Math.max(1, w * 0.15), sy - st); }
  }
  // jug (small carafe) tilts while pouring
  ctx.save(); ctx.translate(jx, jy); ctx.rotate(-0.25 - E.jugA * 0.45); const s = GS;
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = 'rgba(120,145,110,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-28 * s, 0); ctx.lineTo(-22 * s, -12 * s); ctx.lineTo(18 * s, -12 * s); ctx.lineTo(24 * s, 46 * s); ctx.quadraticCurveTo(0, 54 * s, -22 * s, 46 * s); ctx.lineTo(-18 * s, 4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ing.col; ctx.strokeStyle = ing.dark; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-16 * s, 18 * s); ctx.lineTo(21 * s, 18 * s); ctx.lineTo(23 * s, 44 * s); ctx.quadraticCurveTo(0, 51 * s, -20 * s, 44 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,145,110,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(26 * s, 14 * s, 11 * s, -1.2, 1.3); ctx.stroke();
  ctx.restore();
}
function drawOuterFx() {
  for (let i = 0; i < T.MAXP; i++) { const p = parts[i]; if (!p.a || p.k === 1 || p.k === 2) continue; const f = p.l / p.m;
    if (p.k === 0) { ctx.globalAlpha = 1 - f * f; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill(); }
    else { ctx.globalAlpha = 1 - f; const spr = p.k === 3 ? SPR.spark : SPR.leaf; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.drawImage(spr, -p.s, -p.s, p.s * 2, p.s * 2); ctx.restore(); } }
  ctx.globalAlpha = 1;
  for (const o of pops) if (o.a) { const e = Math.min(1, o.t / 0.15), s = o.s * (0.6 + 0.4 * e + (e < 1 ? 0.15 * Math.sin(e * Math.PI) : 0)); ctx.globalAlpha = o.t > 0.8 ? 1 - (o.t - 0.8) / 0.3 : 1; ctx.save(); ctx.translate(o.x, Math.max(safeTop + 120, o.y - o.t * 34)); ctx.scale(s, s); textOut(o.txt, 0, 0, 30, o.c); ctx.restore(); }
  ctx.globalAlpha = 1;
}
function drawMute() {
  const x = VW - 32, y = safeTop + 30; ctx.globalAlpha = 0.75; ctx.fillStyle = '#5c7a45'; ctx.strokeStyle = '#5c7a45'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 10, y - 4); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x + 1, y - 9); ctx.lineTo(x + 1, y + 9); ctx.lineTo(x - 5, y + 4); ctx.lineTo(x - 10, y + 4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); if (S.on) { ctx.arc(x + 3, y, 6, -0.8, 0.8); ctx.moveTo(x + 6, y - 9); ctx.arc(x + 3, y, 10, -0.8, 0.8); } else { ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 13, y + 5); ctx.moveTo(x + 13, y - 5); ctx.lineTo(x + 5, y + 5); } ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawCup(x, y, s, on) { ctx.globalAlpha = on ? 1 : 0.25; ctx.fillStyle = on ? '#8aac5c' : '#b9b09a'; ctx.beginPath(); ctx.moveTo(x - 7 * s, y - 8 * s); ctx.lineTo(x + 7 * s, y - 8 * s); ctx.lineTo(x + 5 * s, y + 8 * s); ctx.lineTo(x - 5 * s, y + 8 * s); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fbf7ee'; ctx.fillRect(x - 6.2 * s, y - 7 * s, 12.4 * s, 5 * s); ctx.globalAlpha = 1; }
function drawHud() {
  const h = G.hud;
  if (h.best !== undefined) { ctx.font = font(13, 800); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(92,122,69,0.75)'; ctx.fillText('BEST ' + h.best, 16, safeTop + 30); }
  if (h.score !== undefined) { const sp = 1 + (G.scorePop || 0) * 0.15; ctx.save(); ctx.translate(CX, safeTop + 46); ctx.scale(sp, sp); textOut(String(h.score), 0, 0, 44, '#3f5a2c'); ctx.restore(); }
  if (h.lives !== undefined) for (let i = 0; i < T.LIVES; i++) drawCup(CX - 20 + i * 20, safeTop + 82, 0.8, i < h.lives);
  if (h.sub) { ctx.fillStyle = 'rgba(217,164,65,0.18)'; ctx.beginPath(); rr(CX - 80, safeTop + 96, 160, 22, 11); ctx.fill(); ctx.font = font(12, 900); ctx.textAlign = 'center'; ctx.fillStyle = '#b98a25'; ctx.fillText(h.sub, CX, safeTop + 111); }
  // order card
  if (h.order !== false && E.rec && E.layers.length && E.phase !== 'none' && E.phase !== 'gone') {
    const n = E.layers.length, cw = 112, ch = 44 + n * 21 + (E.timeMax ? 14 : 0), x = 12, y = safeTop + 64;
    ctx.fillStyle = 'rgba(255,253,246,0.92)'; ctx.strokeStyle = 'rgba(140,165,120,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); rr(x, y, cw, ch, 12); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.font = font(10, 800); ctx.fillStyle = 'rgba(92,122,69,0.65)'; ctx.fillText((h.title || 'BESTELLUNG').toUpperCase(), x + 10, y + 16);
    ctx.font = font(11.5, 900); ctx.fillStyle = '#3f5a2c'; const nm = E.rec.name || 'Bestellung'; ctx.fillText(nm.length > 17 ? nm.slice(0, 16) + '…' : nm, x + 10, y + 31);
    for (let k = 0; k < n; k++) { const i = n - 1 - k, L = E.layers[i], ing = T.ING[L.type], ly = y + 46 + k * 21, act = i === E.ci && E.phase === 'pour';
      if (act) { ctx.fillStyle = 'rgba(138,172,92,0.18)'; ctx.beginPath(); rr(x + 5, ly - 2, cw - 10, 19, 7); ctx.fill(); }
      ctx.fillStyle = ing.col; ctx.strokeStyle = ing.dark; ctx.lineWidth = 1.2; ctx.beginPath(); rr(x + 10, ly + 1, 18, 13, 4); ctx.fill(); ctx.stroke();
      ctx.font = font(11, act ? 900 : 700); ctx.fillStyle = L.res ? 'rgba(63,90,44,0.5)' : '#3f5a2c'; ctx.fillText(ing.name, x + 34, ly + 12);
      if (L.res) { ctx.fillStyle = L.res.miss ? '#d4607a' : '#5f843b'; ctx.font = font(12, 900); ctx.fillText(L.res.miss ? '✕' : '✓', x + cw - 18, ly + 12); }
      else if (act) { ctx.fillStyle = '#5f843b'; ctx.font = font(11, 900); ctx.fillText('▸', x + cw - 17, ly + 12); } }
    if (E.timeMax) { const f = clamp(E.timeLeft / E.timeMax, 0, 1), by = y + ch - 12; ctx.fillStyle = 'rgba(140,165,120,0.2)'; ctx.beginPath(); rr(x + 10, by, cw - 20, 5, 2.5); ctx.fill();
      ctx.fillStyle = f < 0.25 ? (Math.sin(G.t * 12) > 0 ? '#d4607a' : '#e8a0ae') : '#9cc4d8'; ctx.beginPath(); rr(x + 10, by, Math.max(5, (cw - 20) * f), 5, 2.5); ctx.fill(); }
  }
  // hints
  let hint = h.hint || '';
  if (!hint && E.hintsOn && E.phase === 'pour' && G.state === 'play') {
    const L = curLayer(), lv = volToH(E.glass, cumVol(E.ci));
    if (E.mixHint > 0) hint = 'Langsamer = saubere Schichten!';
    else if (!E.pouring && L.vol <= T.TINY) hint = L.type === 'matcha' && E.ci > 0 ? 'Matcha läuft nach – früher loslassen!' : L.type === 'foam' ? 'Cold Foam steigt nach!' : L.type === 'strawberry' ? 'Erdbeere fließt langsam' : 'Halten zum Eingießen';
    else if (E.pouring) hint = lv > L.target - E.band * 1.4 ? 'Jetzt loslassen!' : 'Halten…';
    else hint = 'Kurz warten = fertig · Halten = nachgießen';
  }
  if (hint) { ctx.globalAlpha = 0.8 + 0.2 * Math.sin(G.t * 6); textOut(hint, CX, GY + 52, 17, '#3f5a2c', 800); ctx.globalAlpha = 1;
    if (E.hintsOn && !E.pouring && E.layers.length && curLayer() && curLayer().vol <= T.TINY && E.phase === 'pour') drawHand(CX + 150, GY - 30 + Math.sin(G.t * 5) * 4, 0.5 + 0.5 * Math.sin(G.t * 5)); }
  drawMute();
}
function drawHand(x, y, press) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(95,132,59,0.25)'; ctx.beginPath(); ctx.arc(0, -16, 10 + press * 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff8ee'; ctx.strokeStyle = '#5c7a45'; ctx.lineWidth = 2;
  ctx.beginPath(); rr(-6, -18 + press * 3, 12, 34, 6); ctx.fill(); ctx.stroke(); ctx.beginPath(); rr(-12, 4 + press * 3, 26, 26, 10); ctx.fill(); ctx.stroke();
  ctx.restore(); ctx.globalAlpha = 1;
}
function button(b, x, y, w, h, label, primary, disabled) {
  b.x = x; b.y = y; b.w = w; b.h = h;
  ctx.fillStyle = disabled ? 'rgba(255,253,246,0.6)' : (primary ? '#7ea04d' : '#fffdf6'); ctx.strokeStyle = disabled ? 'rgba(150,150,130,0.5)' : '#5f843b'; ctx.lineWidth = 2;
  if (disabled) ctx.setLineDash([6, 5]);
  ctx.beginPath(); rr(x, y, w, h, h / 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  if (primary) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); rr(x + 6, y + 4, w - 12, h * 0.38, h * 0.2); ctx.fill(); }
  ctx.font = font(primary ? 21 : 16, 900); ctx.textAlign = 'center'; ctx.fillStyle = disabled ? 'rgba(120,120,100,0.7)' : (primary ? '#fffdf6' : '#3f5a2c'); ctx.fillText(label, x + w / 2, y + h / 2 + (primary ? 7 : 6));
}
function drawMenu() {
  const t = G.menuT, ty = safeTop + Math.max(66, VH * 0.088);
  ctx.fillStyle = 'rgba(251,245,232,0.55)'; ctx.fillRect(0, 0, VW, ty + 210);
  const g2 = ctx.createLinearGradient(0, ty + 210, 0, ty + 260); g2.addColorStop(0, 'rgba(251,245,232,0.55)'); g2.addColorStop(1, 'rgba(251,245,232,0)'); ctx.fillStyle = g2; ctx.fillRect(0, ty + 210, VW, 50);
  const bob = Math.sin(t * 2) * 3; ctx.drawImage(SPR.leaf, CX + 96, ty - 40 + bob, 30, 30);
  // two-tone title (ombré)
  ctx.save(); ctx.translate(CX, ty + bob * 0.3); ctx.font = font(54, 900); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = 10; ctx.strokeStyle = '#fffdf6'; ctx.strokeText(T.TITLE, 0, 0);
  const tg = ctx.createLinearGradient(0, -44, 0, 6); tg.addColorStop(0, '#5f843b'); tg.addColorStop(0.55, '#8aac5c'); tg.addColorStop(1, '#d8b98a'); ctx.fillStyle = tg; ctx.fillText(T.TITLE, 0, 0); ctx.restore();
  ctx.font = font(12, 800); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(92,122,69,0.8)'; ctx.fillText(T.SUBTITLE, CX, ty + 26);
  ctx.font = font(14, 700); ctx.fillStyle = '#4c6a37'; ctx.fillText('Halten = gießen · Am Strich loslassen', CX, ty + 50);
  const bw = 210; button(BTN.endless, CX - bw / 2, ty + 72, bw, 54, '▶  Endlos', true, false);
  button(BTN.rush, CX - bw / 2, ty + 138, bw, 42, modes.rush ? modes.rush.label : 'Rush Hour (bald)', false, !modes.rush);
  const b = bestOf('endless'); if (b > 0) { ctx.font = font(14, 900); ctx.fillStyle = '#b98a25'; ctx.textAlign = 'center'; ctx.fillText('Bestwert ' + b, CX, ty + 202); }
  if (G.toastT > 0) { ctx.globalAlpha = Math.min(1, G.toastT * 3); textOut(G.toast, CX, ty + 226, 16, '#c9607a', 800); ctx.globalAlpha = 1; }
  ctx.font = font(11, 600); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(70,90,50,0.42)'; ctx.fillText(T.CREDIT, CX, VH - 22 - safeBot);
  ctx.font = font(9, 600); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(70,90,50,0.45)'; ctx.fillText(BUILD, 8, VH - 6 - safeBot);
  drawMute();
}
function drawOver() {
  const o = G.over, f = clamp((G.overT - 0.15) / 0.3, 0, 1); if (f <= 0 || !o) return;
  ctx.globalAlpha = f * 0.7; ctx.fillStyle = '#f7efdd'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = f;
  const cy = VH * 0.36, e = 1 - Math.pow(1 - f, 3), pw = Math.min(VW - 40, 320);
  ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = 'rgba(140,165,120,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); rr(CX - pw / 2, cy - 120 + (1 - e) * 30, pw, 300, 22); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(CX, cy - 80); ctx.scale(0.8 + 0.2 * e, 0.8 + 0.2 * e); textOut(o.title, 0, 0, 38, '#5f843b'); ctx.restore();
  ctx.font = font(15, 700); ctx.textAlign = 'center'; ctx.fillStyle = '#7a6a50'; ctx.fillText(o.sub, CX, cy - 44);
  textOut(String(o.score), CX, cy + 8, 64, '#3f5a2c');
  if (o.newBest) { const p = 1 + Math.sin(G.t * 6) * 0.06; ctx.save(); ctx.translate(CX, cy + 56); ctx.scale(p, p); textOut('NEUER REKORD!', 0, 0, 22, '#c99a2e'); ctx.restore(); }
  else { ctx.font = font(15, 800); ctx.fillStyle = 'rgba(92,122,69,0.8)'; ctx.fillText('Bestwert ' + o.best, CX, cy + 60); }
  ctx.font = font(13, 700); ctx.fillStyle = 'rgba(92,122,69,0.75)'; o.lines.forEach((l, i) => ctx.fillText(l, CX, cy + 90 + i * 18));
  if (G.overT >= T.RESTART_LOCK) { ctx.globalAlpha = f * (0.65 + 0.35 * Math.sin(G.t * 5)); textOut('Tippen für neue Runde', CX, cy + 132, 19, '#5f843b', 900); ctx.globalAlpha = f; }
  button(BTN.menu, CX - 60, cy + 196, 120, 38, 'Menü', false, false);
  ctx.globalAlpha = 1; drawMute();
}
function render(alpha) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.drawImage(bg, 0, 0);
  const k = dpr * scale, sh = G.shake, sx = sh ? rnd(-sh, sh) : 0, sy = sh ? rnd(-sh, sh) * 0.5 : 0;
  ctx.setTransform(k, 0, 0, k, sx * k, sy * k);
  drawJug(alpha); drawGlass(alpha); drawOuterFx();
  if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.3; ctx.fillStyle = '#fff6d8'; ctx.fillRect(-20, -20, VW + 40, VH + 40); ctx.globalAlpha = 1; }
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (G.state === 'menu') drawMenu(); else { drawHud(); if (G.state === 'over') drawOver(); }
}

// ───────────────────────── loop + auto quality ─────────────────────────
const DT = 1 / 120; let last = performance.now(), acc = 0, pf = 0, pfN = 0, pfWarm = 0, drops2 = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let el = (now - last) / 1000; last = now; if (el > 0.1) el = 0.1; if (el < 0) el = 0;
  acc += el; let n = 0; while (acc >= DT && n < 12) { step(DT); acc -= DT; n++; } if (n >= 12) acc = 0;
  render(acc / DT); // interpolate between the last two fixed steps
  pfWarm += el;
  if (pfWarm > 2 && !document.hidden) { pf += el; pfN++;
    if (pfN >= 90) { const avg = pf / pfN; pf = 0; pfN = 0; if (avg > 0.0215 && drops2 < 3) { drops2++; if (qDpr > 1.01) { qDpr = Math.max(1, qDpr - 0.5); resize(); } if (drops2 >= 2) lowFx = true; } } }
}
resize(); setMode('menu');
requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });

// test / debug hook
window.__omm = { G, E, T, BUILD, step, sfx, parts, BTN, scale: () => scale, API, genRecipe, volToH, hToVol, surfH, cumVol, Endless,
  q: () => ({ dpr, qDpr, lowFx, VW, VH, GY, GS, pAlive }), hold(v) { G.hold = !!v; if (!v) E.needRelease = false; } };
})();
