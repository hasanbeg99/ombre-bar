/* Ombré Bar – Modus „Rush Hour“ (Kundenmodus mit Trinkgeld, 60-s-Schichten, Tages-Challenge)
   Drop-in-Modul. Benötigt window.OMM (Extension API v1). Keine Änderungen am Core nötig.
   Global: window.OMMRush  ·  Mode-ID: 'rush'  ·  Speicher: localStorage 'ombre.rush.v1'
   Kein Echtgeld, keine Lootboxen, keine Zufallskäufe: Trinkgeld ist eine reine Spielwährung für Kosmetik. */
(function () {
  'use strict';
  const VERSION = '1.1.0';
  const MODE_ID = 'rush';
  const SAVE_KEY = 'ombre.rush.v1';

  /* ───────── Konfiguration / Balancing ───────── */
  const CFG = {
    shiftDur: 60,            // Sekunden pro Schicht
    maxQueue: 4,             // Gäste gleichzeitig (1 an der Theke + 3 wartend)
    arrivalStart: 7.5,       // s zwischen Gästen am Schichtbeginn (echter Core: ~7–8 s pro Glas)
    arrivalEnd: 4.5,         // s zwischen Gästen am Schichtende (Tempo steigt → Schlange wächst)
    patienceStart: 26,       // s Geduld am Anfang
    patienceEnd: 16,         // s Geduld am Ende
    servePatienceRate: 0.5,  // Geduld sinkt beim Bedienen nur halb so schnell
    tol: 0.09,               // |Fehler| (Füllhöhe), ab dem eine Schicht 0 Präzision hat (Core-Band: 0.055→0.03)
    perfectErr: 0.025,       // |Fehler| je Schicht für „Perfekt“ (falls Core kein perfect liefert)
    happyQ: 0.62, neutralQ: 0.36, // ≈ Core „GUT“ → glücklich, „KNAPP“ → neutral
    streakStep: 0.2, streakCap: 3.0,   // Trinkgeld-Multiplikator: +0.2 je Serie, max x3
    perfectBonus: 8, regularMul: 1.5,
    neutralTipMul: 0.4,
    gapAfterServe: 0.35,     // s Pause bis zum nächsten startGlass (Core animiert Glaswechsel ~0.9 s selbst)
    diffStart: 0.05, diffEnd: 0.45, // recipe.diff an den Core: Strahl wird über die Schicht schneller, Band enger
    rampStart: 1.0, rampEnd: 1.35,  // recipe.rampMul: Strahl erreicht Vollgas schneller → spürbares Tempo
    jitter: 0.08,            // Zufallsvariation der Ziellinien (±0.04)
    regularChance: 0.18,
    dailyRamp: 12,           // Tages-Challenge: ab Gast Nr. 12 volle Schwierigkeit
    bandTop: 0, bandH: 'auto', // Café-Szene oben: 'auto' = bis knapp über Kanne/Glas des Cores, sonst Anteil (z. B. 0.34)
    bandMin: 0.225, bandMax: 0.36,
    ownHUD: true,            // eigene Timer/Trinkgeld-Leiste in der Szene zeichnen
    coreOrderCard: false,    // Core-Bestellkarte zusätzlich anzeigen?
    sound: true,
  };

  /* ───────── Hilfsfunktionen ───────── */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  function mulberry32(a) { a >>>= 0; return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dateLabel(k) { const p = k.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const OMM = () => window.OMM || null;
  const title = () => (OMM() && OMM().T && OMM().T.TITLE) || 'Ombré Bar';
  const dailySeed = k => hashStr('ombre-rush-daily-' + (k || dateKey()));
  // Tages-Challenge immer mit eigenem RNG → identisch auf jedem Gerät, egal wie der Core random() baut
  const seededRng = s => mulberry32(s);

  /* ───────── Inhalte ───────── */
  const LAYER_COL = { milk: '#f7f2e7', matcha: '#86ad5c', strawberry: '#ec8fa0', coconut: '#efe2c4', foam: '#fffbf2' };
  const LAYER_NAME = { milk: 'Milch', matcha: 'Matcha', strawberry: 'Erdbeere', coconut: 'Kokos', foam: 'Cold Foam' };
  function layerCol(t) { const T = OMM() && OMM().T; if (T && T.ING && T.ING[t] && T.ING[t].col) return T.ING[t].col; const c = T && (T.colors || T.COLORS || T.layerColors); return (c && typeof c[t] === 'string' && c[t]) || LAYER_COL[t] || '#ccc'; }

  // Ziellinien = kumulative Höhe (0 = Boden, 1 = Rand), streng steigend, letzte ≤ 0.95
  const DRINKS = {
    latte: { name: 'Iced Matcha Latte', glass: 'tall', base: 15, unlock: 0, layers: [['milk', 0.55], ['matcha', 0.86]] },
    straw: { name: 'Strawberry Matcha', glass: 'tall', base: 18, unlock: 0, layers: [['strawberry', 0.28], ['milk', 0.6], ['matcha', 0.87]] },
    coco:  { name: 'Coconut Cloud', glass: 'short', base: 20, unlock: 8, layers: [['coconut', 0.42], ['matcha', 0.7], ['foam', 0.92]] },
    free:  { name: 'Matcha Classic', sub: 'Milch, Matcha, Cold Foam', glass: 'cup', base: 22, unlock: 25, layers: [['milk', 0.4], ['matcha', 0.7], ['foam', 0.9]] },
  };
  const DRINK_IDS = Object.keys(DRINKS);

  const REGULARS = [
    { id: 'lotte', name: 'Lotte', drink: 'straw', note: 'extra Erdbeere', mod: L => { L[0].target = 0.36; return L; },
      look: { skin: '#f4cdb0', hair: '#c0503a', style: 1, shirt: '#f3b6c2', acc: 'bow' },
      cond: '10 Gäste glücklich bedienen', test: s => s.happyTotal >= 10, gift: 'g_berry' },
    { id: 'theo', name: 'Theo', drink: 'latte', note: 'wenig Milch', mod: L => { L[0].target = 0.4; return L; },
      look: { skin: '#e2ad85', hair: '#3a2a20', style: 2, shirt: '#9fc3d9', acc: 'phones' },
      cond: 'Serie von 5 in einer Schicht', test: s => s.bestStreak >= 5, gift: 'd_vinyl' },
    { id: 'berger', name: 'Frau Berger', drink: 'coco', note: 'viel Schaum', mod: L => { L[2].target = 0.95; return L; },
      look: { skin: '#f1d2bc', hair: '#b9b4ad', style: 3, shirt: '#b9a3d6', acc: 'hat' },
      cond: '3× Perfekt in einer Schicht', test: s => s.bestPerfects >= 3, gift: 'd_bowl' },
    { id: 'nova', name: 'Nova', drink: 'free', note: 'extra Matcha', mod: L => { L[1].target = 0.76; return L; },
      look: { skin: '#9a6545', hair: '#7a4fb0', style: 4, shirt: '#f2d27a', acc: 'cap' },
      cond: 'Eine Tages-Challenge spielen', test: s => s.dailyPlays >= 1, gift: 'g_neon' },
    { id: 'ferdl', name: 'Opa Ferdl', drink: 'latte', note: 'wie immer', patience: 1.8, mod: L => L,
      look: { skin: '#efc9a9', hair: '#e8e4dc', style: 5, shirt: '#8fae7c', acc: 'glasses' },
      cond: '1.000 Trinkgeld insgesamt', test: s => s.totalTips >= 1000, gift: 'd_clock' },
  ];
  const REG_BY_ID = Object.fromEntries(REGULARS.map(r => [r.id, r]));

  // Kosmetik – feste Preise, direkt kaufbar, keine Zufallselemente.
  const SHOP = [
    { id: 'g_classic', kind: 'glass', name: 'Klassisch', price: 0 },
    { id: 'g_ribbed', kind: 'glass', name: 'Geriffelt', price: 150 },
    { id: 'g_pastel', kind: 'glass', name: 'Pastell-Rosa', price: 250 },
    { id: 'g_bamboo', kind: 'glass', name: 'Bambus-Becher', price: 400 },
    { id: 'g_gold', kind: 'glass', name: 'Goldrand', price: 800 },
    { id: 'g_berry', kind: 'glass', name: 'Lottes Erdbeerglas', price: -1, giftOf: 'lotte' },
    { id: 'g_neon', kind: 'glass', name: 'Novas Neonglas', price: -1, giftOf: 'nova' },
    { id: 'd_plant', kind: 'deco', name: 'Monstera', price: 120 },
    { id: 'd_lights', kind: 'deco', name: 'Lichterkette', price: 200 },
    { id: 'd_shelf', kind: 'deco', name: 'Teeregal', price: 300 },
    { id: 'd_neon', kind: 'deco', name: 'Neon-Schild', price: 350 },
    { id: 'd_cat', kind: 'deco', name: 'Fensterkatze', price: 500 },
    { id: 'd_sakura', kind: 'deco', name: 'Kirschblütenzweig', price: 600 },
    { id: 'd_vinyl', kind: 'deco', name: 'Theos Plattenspieler', price: -1, giftOf: 'theo' },
    { id: 'd_bowl', kind: 'deco', name: 'Bergers Teeschale', price: -1, giftOf: 'berger' },
    { id: 'd_clock', kind: 'deco', name: 'Ferdls Wanduhr', price: -1, giftOf: 'ferdl' },
  ];
  const SHOP_BY_ID = Object.fromEntries(SHOP.map(i => [i.id, i]));

  const SKINS = ['#f6d3b8', '#eebf9b', '#d9a07a', '#b87b55', '#8a5a3c', '#f3c9a8'];
  const HAIRS = ['#2e2420', '#5a3a26', '#9b6a3c', '#d9b26a', '#c0503a', '#3d3d48', '#6d4c8c'];
  const SHIRTS = ['#a9cfa0', '#f2c0a0', '#a8c6e0', '#e9b8cf', '#f0dc8c', '#c8b6e2', '#9fd3c7', '#f4a6a6'];
  const ACCS = ['none', 'none', 'none', 'glasses', 'beanie', 'phones', 'bow'];
  const NAMES = ['Mia', 'Jonas', 'Lea', 'Ben', 'Emma', 'Paul', 'Sofia', 'Luca', 'Hanna', 'Elias', 'Nina', 'Felix', 'Lara', 'Noah', 'Ida', 'Max', 'Yara', 'Tim', 'Zoe', 'Aras'];

  /* ───────── Speicher ───────── */
  const DEFAULT_SAVE = () => ({
    v: 1, tips: 0, totalTips: 0, served: 0, happyTotal: 0, shifts: 0, bestShift: 0, bestStreak: 0, bestPerfects: 0,
    dailyPlays: 0, daily: {}, owned: ['g_classic'], glass: 'g_classic', deco: [], regulars: {}, seenIntro: false, flags: {},
  });
  let SAVE = DEFAULT_SAVE();
  function load() {
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d && d.v === 1) SAVE = Object.assign(DEFAULT_SAVE(), d); } catch (e) { /* frisch starten */ }
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { } }
  load();
  function regState(id) { return SAVE.regulars[id] || (SAVE.regulars[id] = { unlocked: false, hearts: 0 }); }

  /* ───────── Gäste / Rezepte ───────── */
  function randomLook(rng) {
    return { skin: pick(rng, SKINS), hair: pick(rng, HAIRS), style: Math.floor(rng() * 5), shirt: pick(rng, SHIRTS), acc: pick(rng, ACCS) };
  }
  function buildLayers(drinkId, rng, mod) {
    let L = DRINKS[drinkId].layers.map(([type, target]) => ({ type, target }));
    if (mod) L = mod(L);
    let prev = 0;
    for (let i = 0; i < L.length; i++) {
      let t = L[i].target + (rng() - 0.5) * CFG.jitter;
      const maxT = 0.95 - (L.length - 1 - i) * 0.13;
      t = clamp(t, prev + 0.13, maxT);
      L[i].target = Math.round(t * 100) / 100;
      prev = L[i].target;
    }
    return L;
  }
  let custSeq = 0;
  // ctx = { kind, rng, regRng, t, runId, regSeen }
  function makeCustomer(C) {
    const rng = C.rng;
    // Tages-Challenge: Schwierigkeit hängt an der Gast-Nummer, nicht an der Zeit → für alle exakt dieselben Gäste
    const p = C.kind === 'daily' ? clamp((C.customers || 0) / CFG.dailyRamp, 0, 1) : clamp(C.t / CFG.shiftDur, 0, 1);
    // feste Anzahl rng()-Aufrufe pro Gast → Tages-Challenge deterministisch
    const r1 = rng(), r2 = rng(), lookR = mulberry32((rng() * 4294967296) >>> 0), jitR = mulberry32((rng() * 4294967296) >>> 0), nameR = rng();
    let reg = null;
    if (C.kind === 'shift' && C.regRng() < CFG.regularChance) {
      const avail = REGULARS.filter(r => regState(r.id).unlocked && !C.regSeen.has(r.id));
      if (avail.length) { reg = avail[Math.floor(C.regRng() * avail.length)]; C.regSeen.add(reg.id); }
    }
    const pool = C.kind === 'daily' ? DRINK_IDS : DRINK_IDS.filter(id => SAVE.served >= DRINKS[id].unlock);
    // je später in der Schicht, desto eher die komplexeren Drinks
    const drinkId = reg ? reg.drink : pool[Math.floor((1 - Math.pow(1 - r1, lerp(1.0, 1.6, p))) * pool.length) % pool.length];
    const d = DRINKS[drinkId];
    const patienceMax = lerp(CFG.patienceStart, CFG.patienceEnd, p) * (0.9 + 0.2 * r2) * (reg ? (reg.patience || 1.3) : 1);
    const id = ++custSeq;
    const layers = buildLayers(drinkId, jitR, reg && reg.mod);
    return {
      id, drinkId, reg: reg ? reg.id : null, name: reg ? reg.name : NAMES[Math.floor(nameR * NAMES.length)],
      look: reg ? reg.look : randomLook(lookR), note: reg ? reg.note : (d.sub || ''),
      recipe: { id: 'rush-' + C.runId + '-' + id, glass: d.glass, name: d.name, layers, style: SAVE.glass },
      patienceMax, patience: patienceMax, state: 'walkin', x: null, y: 0, scale: 1, mood: 'neutral', moodT: 0, bob: (id * 1.7) % 6.28,
      late: false, tip: 0,
    };
  }

  /* ───────── Bewertung ───────── */
  function evaluate(res) {
    const L = (res && res.layers) || [];
    let q, perfect;
    if (res.overflow || res.timeout) { q = 0; perfect = false; }
    else if (L.length) {
      let sum = 0, allP = true;
      for (const l of L) {
        const err = Math.abs(l.error != null ? l.error : (l.actual || 0) - (l.target || 0));
        const acc = clamp(1 - err / CFG.tol, 0, 1);
        const sh = l.sharpness == null ? 1 : clamp(l.sharpness, 0, 1);
        sum += acc * (0.7 + 0.3 * sh);
        if (err > CFG.perfectErr) allP = false;
      }
      q = sum / L.length; perfect = res.perfect != null ? !!res.perfect : allP;
    } else { q = clamp((res.score || 0) / 100, 0, 1); perfect = !!res.perfect; }
    if (perfect) q = Math.max(q, 0.95);
    if (res.failed && !res.overflow) q = Math.min(q, CFG.happyQ - 0.01); // verfehlte Schicht: höchstens neutral
    return { q, perfect: perfect && !res.overflow && !res.timeout };
  }
  function streakMul(streak) { return Math.min(CFG.streakCap, 1 + CFG.streakStep * Math.max(0, streak - 1)); }
  function computeTip(c, ev, streakBefore) {
    let mood = ev.q >= CFG.happyQ ? 'happy' : ev.q >= CFG.neutralQ ? 'neutral' : 'annoyed';
    if (c.late) mood = mood === 'happy' ? 'neutral' : 'annoyed';
    const base = DRINKS[c.drinkId].base;
    const pf = clamp(c.patience / c.patienceMax, 0, 1);
    let tip = 0, streak = streakBefore;
    if (mood === 'happy') {
      streak = streakBefore + 1;
      tip = base * (0.8 + 0.6 * ev.q) * (0.6 + 0.4 * pf) * streakMul(streak) + (ev.perfect ? CFG.perfectBonus : 0);
      if (c.reg) tip *= CFG.regularMul;
    } else if (mood === 'neutral') { streak = 0; tip = base * CFG.neutralTipMul; }
    else { streak = 0; tip = 0; }
    return { mood, tip: Math.round(tip), streak };
  }

  /* ───────── Zustand ───────── */
  let S = null;            // laufende Schicht
  let screen = 'off';      // off | hub | play | pause | result | shop | regulars | intro
  let shopTab = 'glass';
  let toasts = [];
  let lastResult = null;
  let unsub = null;
  let active = false;

  function newShift(kind) {
    const dk = dateKey();
    const seed = kind === 'daily' ? dailySeed(dk) : ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    S = {
      kind, dateKey: dk, seed, runId: seed.toString(36) + Date.now().toString(36).slice(-3), rng: seededRng(seed), regRng: mulberry32(seed ^ 0x9e3779b9),
      t: 0, phase: 'play', tips: 0, streak: 0, bestStreak: 0, served: 0, perfects: 0, happy: 0, lost: 0, customers: 0,
      queue: [], leaving: [], nextArrival: 0, pending: null, gap: 0.4, endT: 0, parts: [], pops: [], banner: null, regSeen: new Set(), log: [],
      bannerShown: {},
    };
    setBanner('Rush Hour!', '60 Sekunden – los geht’s');
  }
  function setBanner(a, b) { if (S) S.banner = { a, b, t: 0 }; }

  function spawn() {
    const c = makeCustomer(S);
    S.customers++;
    S.queue.push(c);
    S.log.push(c.drinkId + ':' + c.recipe.layers.map(l => l.target).join('/'));
  }
  function arrivalInterval(C) {
    const p = clamp(C.t / CFG.shiftDur, 0, 1);
    return lerp(CFG.arrivalStart, CFG.arrivalEnd, Math.pow(p, 0.8)) * (0.85 + 0.3 * C.rng());
  }

  function startServing(c) {
    c.state = 'serve';
    S.pending = c.recipe.id;
    const O = OMM();
    if (O && O.startGlass) {
      const r = c.recipe;
      const pp = clamp(S.t / CFG.shiftDur, 0, 1), diff = +lerp(CFG.diffStart, CFG.diffEnd, pp).toFixed(3), rampMul = +lerp(CFG.rampStart, CFG.rampEnd, pp).toFixed(3);
      try { O.startGlass({ id: r.id, glass: r.glass, name: r.name, style: r.style, diff, rampMul, layers: r.layers.map(l => ({ type: l.type, target: l.target })) }); }
      catch (e) { console.error('[rush] startGlass', e); }
    }
  }

  function onGlassDone(res) {
    if (!S || !S.pending || !res) return;
    if (res.recipeId != null && res.recipeId !== S.pending) return;
    const c = S.queue[0];
    if (!c || c.state !== 'serve') return;
    S.pending = null;
    const ev = evaluate(res);
    const r = computeTip(c, ev, S.streak);
    S.streak = r.streak; S.bestStreak = Math.max(S.bestStreak, S.streak);
    S.tips += r.tip; S.served++;
    if (ev.perfect) S.perfects++;
    if (r.mood === 'happy') S.happy++;
    c.mood = r.mood; c.moodT = 0; c.tip = r.tip; c.state = 'leave';
    S.queue.shift(); S.leaving.push(c);
    SAVE.served++; if (r.mood === 'happy') SAVE.happyTotal++;
    if (c.reg && r.mood === 'happy') { const rs = regState(c.reg); rs.hearts = Math.min(5, rs.hearts + 1); if (rs.hearts >= 5) grantGift(c.reg); }
    const px = c.x, py = c.y - 70 * c.scale;
    const label = res.overflow ? 'Übergelaufen!' : res.timeout ? 'Zu spät!' : ev.perfect ? 'Perfekt!' : r.mood === 'happy' ? 'Lecker!' : r.mood === 'neutral' ? (c.late ? 'Endlich …' : 'Geht so …') : 'Hmpf.';
    S.pops.push({ x: px, y: py, text: label, sub: r.tip > 0 ? '+' + r.tip : '', col: r.mood === 'happy' ? '#3f7a2c' : r.mood === 'neutral' ? '#9a7a2a' : '#b5523f', t: 0 });
    if (r.mood === 'happy') burst(px, py + 20, ev.perfect ? 16 : 9, ev.perfect ? 'star' : 'heart');
    else if (r.mood === 'annoyed') burst(px, py + 10, 5, 'puff');
    if (S.streak >= 2 && r.mood === 'happy') S.pops.push({ x: W * 0.5, y: bandY(0.17) + 30 * U, text: 'Serie ' + S.streak + '  ×' + streakMul(S.streak).toFixed(1), col: '#c46a2b', t: 0, big: true });
    sfx(ev.perfect ? 'perfect' : r.mood === 'happy' ? 'tip' : r.mood === 'neutral' ? 'meh' : 'sad');
    if (ev.perfect && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { } }
    S.gap = CFG.gapAfterServe;
    checkUnlocks();
    save();
    if (S.phase === 'last') endShift();
    pushHUD(true);
  }

  function grantGift(regId) {
    const r = REG_BY_ID[regId]; if (!r || !r.gift || SAVE.owned.includes(r.gift)) return;
    SAVE.owned.push(r.gift);
    toast(r.name + ' schenkt dir: ' + SHOP_BY_ID[r.gift].name);
  }
  function checkUnlocks() {
    const live = S && S.phase !== 'end';
    const stats = { happyTotal: SAVE.happyTotal, bestStreak: Math.max(SAVE.bestStreak, live ? S.bestStreak : 0), bestPerfects: Math.max(SAVE.bestPerfects, live ? S.perfects : 0), dailyPlays: SAVE.dailyPlays, totalTips: SAVE.totalTips + (live ? S.tips : 0) };
    for (const r of REGULARS) { const rs = regState(r.id); if (!rs.unlocked && r.test(stats)) { rs.unlocked = true; toast('Neuer Stammgast: ' + r.name + '!'); } }
    for (const id of DRINK_IDS) { const d = DRINKS[id]; if (d.unlock > 0 && SAVE.served >= d.unlock && !SAVE.flags['drink_' + id]) { SAVE.flags['drink_' + id] = 1; toast('Neu auf der Karte: ' + d.name); } }
  }
  function toast(text) { toasts.push({ text, t: 0 }); sfx('unlock'); }

  function endShift() {
    if (!S || S.phase === 'end') return;
    S.phase = 'end'; S.endT = 0;
    for (const c of S.queue) { c.state = 'leave'; c.mood = 'neutral'; c.moodT = 0; S.leaving.push(c); }
    S.queue = [];
    SAVE.shifts++;
    SAVE.tips += S.tips; SAVE.totalTips += S.tips;
    SAVE.bestStreak = Math.max(SAVE.bestStreak, S.bestStreak);
    SAVE.bestPerfects = Math.max(SAVE.bestPerfects, S.perfects);
    let newBest = false;
    if (S.kind === 'daily') {
      SAVE.dailyPlays++;
      const prev = SAVE.daily[S.dateKey] || 0;
      if (S.tips > prev) { SAVE.daily[S.dateKey] = S.tips; newBest = true; }
      const keys = Object.keys(SAVE.daily).sort(); while (keys.length > 30) delete SAVE.daily[keys.shift()];
    } else if (S.tips > SAVE.bestShift) { SAVE.bestShift = S.tips; newBest = true; }
    checkUnlocks();
    save();
    lastResult = { kind: S.kind, dateKey: S.dateKey, tips: S.tips, served: S.served, perfects: S.perfects, happy: S.happy, lost: S.lost, bestStreak: S.bestStreak, newBest, customers: S.customers, seed: S.seed };
    setBanner('Feierabend!', S.tips + ' Trinkgeld verdient');
    sfx('bell');
    const O = OMM(); if (O && O.setHUD) { try { O.setHUD(CFG.ownHUD ? { title: 'Rush Hour', order: false } : { title: 'Rush Hour', score: S.tips, sub: 'Feierabend!' }); } catch (e) { } }
  }

  /* ───────── Update ───────── */
  function update(dt) {
    for (const t of toasts) t.t += dt; toasts = toasts.filter(t => t.t < 3.2);
    if (screen === 'pause' || !S) return;
    const playing = screen === 'play';
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 1.8) S.banner = null; }
    if (playing && S.phase === 'play') {
      S.t += dt;
      if (S.t >= 40 && !S.bannerShown.final) { S.bannerShown.final = 1; setBanner('Endspurt!', 'Noch 20 Sekunden – Tempo!'); sfx('bell'); }
      if (S.t >= CFG.shiftDur) {
        S.t = CFG.shiftDur;
        if (S.pending) { S.phase = 'last'; setBanner('Letzte Bestellung', 'Mach sie noch fertig!'); }
        else endShift();
      }
      if (S.phase === 'play' && S.t >= S.nextArrival && S.queue.length < CFG.maxQueue) { spawn(); S.nextArrival = S.t + arrivalInterval(S); }
    }
    if (S.phase === 'end') { S.endT += dt; if (S.endT > 1.6 && screen === 'play') { screen = 'result'; setPointer(true); } }
    if (playing && S.phase !== 'end') {
      for (let i = S.queue.length - 1; i >= 0; i--) {
        const c = S.queue[i];
        if (c.state === 'walkin' && c.arrived) c.state = 'wait';
        const rate = c.state === 'serve' ? CFG.servePatienceRate : 1;
        if (c.state === 'wait' || c.state === 'serve') c.patience -= dt * rate;
        if (c.patience <= 0) {
          c.patience = 0;
          if (c.state === 'serve') c.late = true;
          else if (c.state === 'wait') {
            c.state = 'leave'; c.mood = 'annoyed'; c.moodT = 0; S.queue.splice(i, 1); S.leaving.push(c);
            S.lost++; S.streak = 0;
            S.pops.push({ x: c.x, y: c.y - 70 * c.scale, text: 'Weg!', col: '#b5523f', t: 0 }); burst(c.x, c.y - 50 * c.scale, 4, 'puff'); sfx('sad');
          }
        }
      }
      if (S.gap > 0) S.gap -= dt;
      const f = S.queue[0];
      if (f && f.state !== 'serve' && !S.pending && S.gap <= 0 && f.arrived && S.phase === 'play') startServing(f);
    }
    S.queue.forEach((c, i) => {
      const slot = slotPos(i);
      if (c.x == null) { c.x = W + 60; c.y = slot.y; c.scale = slot.s; }
      const k = 1 - Math.pow(0.0025, dt);
      c.x += (slot.x - c.x) * k; c.y += (slot.y - c.y) * k; c.scale += (slot.s - c.scale) * k;
      c.arrived = Math.abs(c.x - slot.x) < 6;
      c.bob += dt * (c.state === 'serve' ? 3 : 2);
    });
    for (const c of S.leaving) { c.moodT += dt; if (c.moodT > 0.8) c.x -= dt * (220 + c.moodT * 200); c.bob += dt * 6; }
    S.leaving = S.leaving.filter(c => c.x > -120);
    for (const p of S.pops) p.t += dt; S.pops = S.pops.filter(p => p.t < 1.4);
    for (const p of S.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === 'puff' ? -20 : 60) * dt; }
    S.parts = S.parts.filter(p => p.t < p.life);
    if (playing) pushHUD(false);
  }
  let hudAcc = 0;
  function pushHUD(force) {
    const O = OMM(); if (!O || !O.setHUD || !S) return;
    hudAcc++; if (!force && hudAcc % 12) return;
    const left = Math.max(0, Math.ceil(CFG.shiftDur - S.t));
    try {
      const ttl = S.kind === 'daily' ? 'Tages-Challenge' : 'Rush Hour';
      // Eigene Leiste aktiv → Core zeichnet oben nichts (würde sonst unter der Café-Szene liegen)
      if (CFG.ownHUD) O.setHUD({ title: ttl, order: CFG.coreOrderCard });
      else O.setHUD({ title: ttl, score: S.tips, sub: '0:' + String(left).padStart(2, '0') + (S.streak >= 2 ? '  ·  Serie ×' + streakMul(S.streak).toFixed(1) : ''), order: CFG.coreOrderCard });
    } catch (e) { }
  }
  function burst(x, y, n, kind) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 60 + Math.random() * 90;
      S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.9 + Math.random() * 0.5, kind, r: 4 + Math.random() * 4 });
    }
  }

  /* ───────── Audio (winzig, synthetisch) ───────── */
  let AC = null;
  function sfx(kind) {
    if (!CFG.sound) return;
    try {
      if (!AC) { const Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return; AC = new Ctor(); }
      if (AC.state === 'suspended') AC.resume();
      const notes = { tip: [880, 1320], perfect: [988, 1319, 1760], meh: [520], sad: [330, 262], unlock: [784, 988, 1175], bell: [1046, 784], click: [660] }[kind] || [600];
      notes.forEach((f, i) => {
        const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime + i * 0.07;
        o.type = kind === 'sad' ? 'triangle' : 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + 0.25);
      });
    } catch (e) { }
  }

  /* ───────── Canvas / Layout ───────── */
  let cv = null, ctx = null, W = 390, H = 844, DPR = 1, U = 1;
  let pauseBtn = null;
  const FONT = '"Nunito","Quicksand","Trebuchet MS",system-ui,sans-serif';
  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.id = 'omm-rush';
    cv.setAttribute('aria-label', 'Rush Hour');
    Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', zIndex: '40', pointerEvents: 'none', touchAction: 'none', display: 'none' });
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    cv.addEventListener('pointerdown', onPointer);
    pauseBtn = document.createElement('button');
    pauseBtn.id = 'omm-rush-pause'; pauseBtn.setAttribute('aria-label', 'Pause'); pauseBtn.textContent = 'II';
    Object.assign(pauseBtn.style, { position: 'fixed', zIndex: '41', display: 'none', width: '38px', height: '38px', borderRadius: '19px', border: '0', background: 'rgba(255,253,248,0.92)', color: '#4c5a3d', font: '800 14px ' + FONT, boxShadow: '0 2px 6px rgba(0,0,0,0.12)', touchAction: 'manipulation', padding: '0' });
    pauseBtn.addEventListener('pointerdown', e => e.stopPropagation());
    pauseBtn.addEventListener('click', e => { e.stopPropagation(); if (screen === 'play') { screen = 'pause'; setPointer(true); sfx('click'); } });
    document.body.appendChild(pauseBtn);
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') { screen = 'pause'; setPointer(true); } });
    resize();
  }
  function resize() {
    if (!cv) return;
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = innerWidth; H = innerHeight; U = Math.min(W / 390, H / 760);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    safeT = readSafeTop();
    BH = computeBandH();
    if (pauseBtn) { pauseBtn.style.left = '8px'; pauseBtn.style.top = (bandTopPx() + 23 * U - 19) + 'px'; }
    reserveCore();
  }
  // Café-Szene oben beim Core reservieren → „PERFEKTES GLAS!“ & Co. erscheinen darunter (Core ≥ 1.1)
  function reserveCore() { const O = OMM(); if (O && typeof O.reserveTop === 'function') O.reserveTop(screen === 'off' ? 0 : bandTopPx() + BH); }
  let safeT = 0, BH = 300;
  function readSafeTop() {
    const el = document.getElementById('safe');
    if (el) return parseFloat(getComputedStyle(el).paddingTop) || 0;
    return 0;
  }
  // Nachbau der Core-Geometrie (game.js resize()): Oberkante der Kanne über dem hohen Glas.
  function coreJugTopPx() {
    const O = OMM(); // Core ≥ 1.1 liefert die Geometrie selbst (CSS px) → keine doppelte Formel
    if (O && typeof O.layout === 'function') { try { const l = O.layout(); if (l && isFinite(l.jugTop)) return l.jugTop; } catch (e) {} }
    const T = O && O.T; if (!T || !T.GLASS || T.stub) return null; // Fallback: Nachbau der Core-Formel (Core 1.0)
    const sc = Math.min(W / (T.W || 400), H / (T.MIN_H || 700)), VH = H / sc;
    const sb = (() => { const el = document.getElementById('safe'); return el ? (parseFloat(getComputedStyle(el).paddingBottom) || 0) / sc : 0; })();
    const st = safeT / sc;
    const GS = clamp((VH - st - sb - 360) / 330, 0.82, 1.18), GY = VH - 112 - sb;
    let maxH = 0; for (const k in T.GLASS) maxH = Math.max(maxH, T.GLASS[k].H || 0);
    const top = GY - (maxH || 320) * GS - 92 * GS; // Kanne sitzt ~78·GS über dem Rand, ragt ~14·GS höher
    return top * sc;
  }
  function computeBandH() {
    if (typeof CFG.bandH === 'number') return H * CFG.bandH;
    const j = coreJugTopPx();
    const want = j == null ? H * 0.36 : j - 6;
    return clamp(want, H * CFG.bandMin, H * CFG.bandMax) - bandTopPx();
  }
  const bandTopPx = () => H * CFG.bandTop + safeT;
  const bandHpx = () => BH;
  const bandY = f => bandTopPx() + bandHpx() * f;
  function slotPos(i) {
    const counterY = bandY(0.86), k = clamp(BH / (300 * U), 0.6, 1.15);
    if (i === 0) return { x: W * 0.2, y: counterY, s: 1.0 * U * k };
    const s = [0, 0.8, 0.7, 0.62][i] || 0.6;
    return { x: W * (0.67 + (i - 1) * 0.13), y: counterY - 6 * U * k * i, s: s * U * k };
  }
  function setPointer(on) { if (cv) cv.style.pointerEvents = on ? 'auto' : 'none'; if (pauseBtn) pauseBtn.style.display = screen === 'play' ? 'block' : 'none'; reserveCore(); }

  /* ───────── Zeichnen: Grundformen ───────── */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function txt(s, x, y, size, col, weight, align, base) {
    ctx.font = (weight || 700) + ' ' + Math.round(size) + 'px ' + FONT; ctx.fillStyle = col || '#3d4a33';
    ctx.textAlign = align || 'center'; ctx.textBaseline = base || 'middle'; ctx.fillText(s, x, y);
  }
  function leaf(x, y, r) { // Trinkgeld-Symbol (Münze mit Teeblatt)
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#e9c85a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#c9a43a'; ctx.lineWidth = r * 0.18; ctx.stroke();
    ctx.fillStyle = '#5f8f3e'; ctx.rotate(-0.6); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 0.32, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#e9f3d9'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(-r * 0.5, 0); ctx.lineTo(r * 0.5, 0); ctx.stroke();
    ctx.restore();
  }
  function heart(x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9); ctx.fill();
  }
  function star(x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); }
    ctx.closePath(); ctx.fill();
  }

  // Mini-Glas (Bestellung, Shop-Vorschau)
  function miniGlass(x, y, w, h, layers, style, glassType) {
    const sh = glassType === 'cup' ? [4, 4, w * 0.45, w * 0.45] : glassType === 'short' ? [3, 3, 8, 8] : [3, 3, 7, 7];
    ctx.save(); rr(x, y, w, h, sh); ctx.clip();
    ctx.fillStyle = style === 'g_pastel' ? 'rgba(255,214,224,0.6)' : style === 'g_bamboo' ? 'rgba(214,190,140,0.5)' : style === 'g_neon' ? 'rgba(200,255,230,0.5)' : 'rgba(240,244,236,0.8)';
    ctx.fillRect(x, y, w, h);
    let prev = 0;
    for (const l of (layers || [])) {
      const y1 = y + h * (1 - prev), y2 = y + h * (1 - l.target);
      ctx.fillStyle = layerCol(l.type); ctx.fillRect(x, y2, w, y1 - y2 + 0.5);
      if (l.type === 'foam') { ctx.fillStyle = 'rgba(210,200,180,0.7)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + w * (0.2 + i * 0.2), y2 + 3, 1.3, 0, 6.28); ctx.fill(); } }
      if (l.type === 'coconut') { ctx.fillStyle = 'rgba(160,130,90,0.35)'; for (let i = 0; i < 3; i++) { ctx.fillRect(x + w * (0.25 + i * 0.22), y2 + (y1 - y2) * 0.5, 1.5, 1.5); } }
      prev = l.target;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x + w * 0.18, y + h * 0.45, w * 0.26, w * 0.26); ctx.fillRect(x + w * 0.55, y + h * 0.6, w * 0.24, w * 0.24);
    if (style === 'g_ribbed') { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 5, y); ctx.lineTo(x + w * i / 5, y + h); ctx.stroke(); } }
    if (style === 'g_bamboo') { ctx.strokeStyle = 'rgba(120,90,50,0.5)'; ctx.lineWidth = 1.5; for (const f of [0.33, 0.66]) { ctx.beginPath(); ctx.moveTo(x, y + h * f); ctx.lineTo(x + w, y + h * f); ctx.stroke(); } }
    ctx.restore();
    ctx.lineWidth = Math.max(1.5, w * 0.06);
    ctx.strokeStyle = style === 'g_gold' ? '#d2a940' : style === 'g_bamboo' ? '#9b7a48' : style === 'g_berry' ? '#e07a8e' : style === 'g_neon' ? '#38d6a0' : style === 'g_pastel' ? '#e7a3b5' : 'rgba(80,95,70,0.55)';
    rr(x, y, w, h, sh); ctx.stroke();
    if (style === 'g_gold') { ctx.strokeStyle = '#e7c35a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + w, y + 1); ctx.stroke(); }
    if (style === 'g_berry') { ctx.fillStyle = '#e0566e'; ctx.beginPath(); ctx.arc(x + w - 2, y + 2, w * 0.16, 0, 6.28); ctx.fill(); ctx.fillStyle = '#5f8f3e'; ctx.fillRect(x + w - 3, y - w * 0.2, 2, w * 0.12); }
    ctx.strokeStyle = 'rgba(60,75,45,0.75)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    for (const l of (layers || [])) { const ly = y + h * (1 - l.target); ctx.beginPath(); ctx.moveTo(x - 3, ly); ctx.lineTo(x + w + 3, ly); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  /* ───────── Zeichnen: Figuren (eigene, simple Designs) ───────── */
  function drawCustomer(c, t) {
    const L = c.look, s = c.scale;
    let bobY = Math.sin(c.bob) * 2 * s;
    let shake = 0;
    if (c.state === 'leave' && c.mood === 'happy') bobY -= Math.abs(Math.sin(c.moodT * 9)) * 10 * s * Math.max(0, 1 - c.moodT);
    if (c.state === 'leave' && c.mood === 'annoyed' && c.moodT < 0.6) shake = Math.sin(c.moodT * 50) * 3 * s;
    const pf = c.patience / c.patienceMax;
    const mood = c.state === 'leave' ? c.mood : (pf < 0.25 ? 'annoyed' : c.state === 'serve' && pf > 0.5 ? 'happy' : 'neutral');
    ctx.save(); ctx.translate(c.x + shake, c.y + bobY);
    ctx.fillStyle = L.shirt; ctx.beginPath(); ctx.ellipse(0, -10 * s, 34 * s, 30 * s, 0, Math.PI, 0); ctx.lineTo(34 * s, 10 * s); ctx.lineTo(-34 * s, 10 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(0, -36 * s, 10 * s, 5 * s, 0, 0, Math.PI); ctx.fill();
    const hy = -66 * s, hr = 25 * s;
    if (L.style === 1 || L.style === 4) { ctx.fillStyle = L.hair; ctx.beginPath(); ctx.ellipse(0, hy + 6 * s, hr * 1.12, hr * 1.05, 0, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(0, hy, hr, 0, 6.283); ctx.fill();
    ctx.fillStyle = L.hair;
    if (L.style === 5) { ctx.beginPath(); ctx.arc(-hr * 0.85, hy - 2 * s, 7 * s, 0, 6.28); ctx.arc(hr * 0.85, hy - 2 * s, 7 * s, 0, 6.28); ctx.fill(); }
    else if (L.style === 3) { ctx.beginPath(); ctx.arc(0, hy - 4 * s, hr, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.beginPath(); ctx.arc(0, hy - hr - 4 * s, 9 * s, 0, 6.28); ctx.fill(); }
    else if (L.style === 2) { ctx.beginPath(); ctx.arc(0, hy - 3 * s, hr * 1.02, Math.PI, Math.PI * 2); ctx.lineTo(hr, hy - 2 * s); ctx.quadraticCurveTo(0, hy - 14 * s, -hr, hy - 2 * s); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, hy - 2 * s, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(hr * 0.2, hy - 10 * s, -hr * 0.3, hy - 16 * s); ctx.quadraticCurveTo(-hr * 0.7, hy - 6 * s, -hr * 1.02, hy - 2 * s); ctx.fill(); }
    const ey = hy + 2 * s, ex = 9 * s;
    ctx.strokeStyle = '#3a2c26'; ctx.fillStyle = '#3a2c26'; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
    if (mood === 'happy') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * ex, ey + 1.5 * s, 3.6 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); } }
    else if (mood === 'annoyed') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * ex - 3.5 * s, ey); ctx.lineTo(sx * ex + 3.5 * s, ey); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx * (ex + 5 * s), ey - 7 * s); ctx.lineTo(sx * (ex - 3 * s), ey - 4.5 * s); ctx.stroke(); } }
    else { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * ex, ey, 2.6 * s, 0, 6.283); ctx.fill(); } }
    ctx.fillStyle = 'rgba(240,120,120,0.35)'; ctx.beginPath(); ctx.ellipse(-15 * s, ey + 8 * s, 4.5 * s, 2.8 * s, 0, 0, 6.28); ctx.ellipse(15 * s, ey + 8 * s, 4.5 * s, 2.8 * s, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#3a2c26'; ctx.lineWidth = 2 * s; ctx.beginPath();
    if (mood === 'happy') { ctx.fillStyle = '#a8443c'; ctx.moveTo(-5 * s, ey + 9 * s); ctx.quadraticCurveTo(0, ey + 17 * s, 5 * s, ey + 9 * s); ctx.closePath(); ctx.fill(); }
    else if (mood === 'annoyed') { ctx.moveTo(-5 * s, ey + 14 * s); ctx.quadraticCurveTo(0, ey + 9 * s, 5 * s, ey + 14 * s); ctx.stroke(); }
    else { ctx.moveTo(-3.5 * s, ey + 12 * s); ctx.lineTo(3.5 * s, ey + 12 * s); ctx.stroke(); }
    if (L.style === 5) { ctx.fillStyle = '#e8e4dc'; ctx.beginPath(); ctx.ellipse(-4 * s, ey + 8 * s, 5 * s, 2.5 * s, 0.3, 0, 6.28); ctx.ellipse(4 * s, ey + 8 * s, 5 * s, 2.5 * s, -0.3, 0, 6.28); ctx.fill(); }
    if (L.acc === 'glasses') { ctx.strokeStyle = '#4a3f39'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.arc(-ex, ey, 6 * s, 0, 6.28); ctx.moveTo(ex + 6 * s, ey); ctx.arc(ex, ey, 6 * s, 0, 6.28); ctx.moveTo(-ex + 6 * s, ey); ctx.lineTo(ex - 6 * s, ey); ctx.stroke(); }
    if (L.acc === 'beanie') { ctx.fillStyle = '#d9735a'; ctx.beginPath(); ctx.arc(0, hy - 6 * s, hr * 1.02, Math.PI, 0); ctx.fill(); ctx.fillRect(-hr * 1.05, hy - 9 * s, hr * 2.1, 7 * s); ctx.beginPath(); ctx.arc(0, hy - hr - 8 * s, 5 * s, 0, 6.28); ctx.fill(); }
    if (L.acc === 'cap') { ctx.fillStyle = '#3f6e8c'; ctx.beginPath(); ctx.arc(0, hy - 6 * s, hr * 0.98, Math.PI, 0); ctx.fill(); ctx.fillRect(0, hy - 9 * s, hr * 1.5, 5 * s); }
    if (L.acc === 'hat') { ctx.fillStyle = '#7d5c8f'; ctx.beginPath(); ctx.ellipse(0, hy - 14 * s, hr * 1.4, 5 * s, 0, 0, 6.28); ctx.fill(); rr(-hr * 0.7, hy - hr - 12 * s, hr * 1.4, 14 * s, 5 * s); ctx.fill(); }
    if (L.acc === 'phones') { ctx.strokeStyle = '#333a44'; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(0, hy, hr + 2 * s, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); ctx.fillStyle = '#e86a5b'; rr(-hr - 6 * s, hy - 6 * s, 9 * s, 14 * s, 4 * s); ctx.fill(); rr(hr - 3 * s, hy - 6 * s, 9 * s, 14 * s, 4 * s); ctx.fill(); }
    if (L.acc === 'bow') { ctx.fillStyle = '#f26f8f'; ctx.beginPath(); const bx = hr * 0.6, by = hy - hr * 0.8; ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * s, by - 6 * s); ctx.lineTo(bx - 9 * s, by + 6 * s); ctx.closePath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 9 * s, by - 6 * s); ctx.lineTo(bx + 9 * s, by + 6 * s); ctx.closePath(); ctx.fill(); }
    if (c.reg) star(hr * 0.95, hy + hr * 0.75, 6 * s, '#f0b93a');
    ctx.restore();
    if (c.state !== 'leave' && !c.noBar) {
      const bw = 40 * s, bx = c.x - bw / 2, by = c.y + hy + bobY - hr - 16 * s;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; rr(bx - 2, by - 2, bw + 4, 8 * s + 4, 6); ctx.fill();
      ctx.fillStyle = pf > 0.5 ? '#7cb95c' : pf > 0.25 ? '#e5b84a' : '#e0674f';
      rr(bx, by, Math.max(2, bw * pf), 8 * s, 4); ctx.fill();
      if (pf < 0.25 && Math.sin(t * 16) > 0) { ctx.strokeStyle = '#e0674f'; ctx.lineWidth = 1.5; rr(bx - 2, by - 2, bw + 4, 8 * s + 4, 6); ctx.stroke(); }
    }
  }

  /* ───────── Zeichnen: Café ───────── */
  function drawDeco(id, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    switch (id) {
      case 'd_plant': ctx.fillStyle = '#4f8a45';
        for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -20, 8, 15, 0, 0, 6.28); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = '#c98f5d'; rr(-12, -4, 24, 22, 4); ctx.fill(); break;
      case 'd_shelf': { ctx.fillStyle = '#b98a5e'; ctx.fillRect(-34, 0, 68, 5); const jc = ['#86ad5c', '#ec8fa0', '#efe2c4', '#7a9e9f'];
        for (let i = 0; i < 4; i++) { ctx.fillStyle = jc[i]; rr(-30 + i * 16, -18, 12, 18, 3); ctx.fill(); ctx.fillStyle = '#6b5a48'; ctx.fillRect(-30 + i * 16, -21, 12, 4); } break; }
      case 'd_neon': ctx.fillStyle = '#3d4a33'; rr(-40, -16, 80, 32, 10); ctx.fill(); ctx.shadowColor = '#7fffc4'; ctx.shadowBlur = 10; ctx.strokeStyle = '#a9ffd8'; ctx.lineWidth = 3; rr(-40, -16, 80, 32, 10); ctx.stroke();
        txt('ombré', 0, 1, 17, '#eafff4', 800); ctx.shadowBlur = 0; break;
      case 'd_cat': ctx.fillStyle = '#5b5560'; ctx.beginPath(); ctx.ellipse(0, -8, 14, 10, 0, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(10, -20, 8, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.moveTo(4, -26); ctx.lineTo(6, -33); ctx.lineTo(10, -27); ctx.moveTo(12, -27); ctx.lineTo(16, -33); ctx.lineTo(17, -24); ctx.fill();
        ctx.strokeStyle = '#5b5560'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-13, -4); ctx.quadraticCurveTo(-24, 0, -20, 10); ctx.stroke(); ctx.fillStyle = '#f4e27a'; ctx.fillRect(7, -22, 2, 2); ctx.fillRect(13, -22, 2, 2); break;
      case 'd_sakura': ctx.strokeStyle = '#6b4a3a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.quadraticCurveTo(0, -12, 30, -4); ctx.moveTo(0, -8); ctx.lineTo(10, -22); ctx.stroke();
        for (const [px, py] of [[-22, -4], [-8, -10], [6, -10], [20, -6], [10, -22], [28, -2]]) { for (let k = 0; k < 5; k++) { const a = k * 1.256; ctx.fillStyle = '#f7c1d0'; ctx.beginPath(); ctx.arc(px + Math.cos(a) * 3, py + Math.sin(a) * 3, 2.6, 0, 6.28); ctx.fill(); } ctx.fillStyle = '#e8879f'; ctx.beginPath(); ctx.arc(px, py, 1.4, 0, 6.28); ctx.fill(); } break;
      case 'd_vinyl': ctx.fillStyle = '#c9a77c'; rr(-20, -6, 40, 12, 3); ctx.fill(); ctx.fillStyle = '#2b2b2f'; ctx.beginPath(); ctx.ellipse(-2, -7, 15, 5, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = '#e86a5b'; ctx.beginPath(); ctx.ellipse(-2, -7, 4, 1.5, 0, 0, 6.28); ctx.fill(); break;
      case 'd_bowl': ctx.fillStyle = '#6f8f6a'; ctx.beginPath(); ctx.arc(0, -8, 12, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#9dc07a'; ctx.beginPath(); ctx.ellipse(0, -8, 12, 3, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = '#c9a77c'; ctx.fillRect(14, -16, 3, 14); break;
      case 'd_clock': ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#3a2c26'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.moveTo(0, 0); ctx.lineTo(6, 2); ctx.stroke(); break;
      case 'd_lights': for (let k = 0; k < 7; k++) { ctx.fillStyle = ['#ffd46b', '#ff9fb2', '#a7f0c4'][k % 3]; ctx.beginPath(); ctx.arc(-36 + k * 12, Math.sin(k) * 5, 4, 0, 6.28); ctx.fill(); } break;
    }
    ctx.restore();
  }
  function drawCafe(t) {
    const top = bandTopPx(), bh = bandHpx(), cy = bandY(0.8);
    const g = ctx.createLinearGradient(0, top, 0, cy);
    g.addColorStop(0, '#f8efdf'); g.addColorStop(1, '#f1e4cc');
    ctx.fillStyle = g; ctx.fillRect(0, top, W, cy - top);
    ctx.fillStyle = '#d6e2c6'; ctx.fillRect(0, bandY(0.6), W, cy - bandY(0.6));
    ctx.strokeStyle = 'rgba(140,160,120,0.25)'; ctx.lineWidth = 1;
    for (let x = 12; x < W; x += 18) { ctx.beginPath(); ctx.moveTo(x, bandY(0.6)); ctx.lineTo(x, cy); ctx.stroke(); }
    const wx = W * 0.36, wy = bandY(0.2), ww = W * 0.26, wh = bh * 0.34;
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wh); sky.addColorStop(0, '#bfe0ef'); sky.addColorStop(1, '#f6e3cf');
    ctx.fillStyle = '#c9a77c'; rr(wx - 5, wy - 5, ww + 10, wh + 10, 10); ctx.fill();
    ctx.fillStyle = sky; rr(wx, wy, ww, wh, 7); ctx.fill();
    ctx.save(); rr(wx, wy, ww, wh, 7); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); const clx = wx + ((t * 6) % (ww + 40)) - 20; ctx.arc(clx, wy + wh * 0.35, 7, 0, 6.28); ctx.arc(clx + 9, wy + wh * 0.32, 9, 0, 6.28); ctx.arc(clx + 18, wy + wh * 0.36, 6, 0, 6.28); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#c9a77c'; ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh); ctx.fillRect(wx - 8, wy + wh + 2, ww + 16, 5);
    const mx = W * 0.74, my = bandY(0.18), mw = W * 0.22, mh = bh * 0.36;
    ctx.fillStyle = '#4a5a44'; rr(mx, my, mw, mh, 6); ctx.fill(); ctx.strokeStyle = '#b98a5e'; ctx.lineWidth = 3; rr(mx, my, mw, mh, 6); ctx.stroke();
    txt('MENÜ', mx + mw / 2, my + 11 * U, 10 * U, '#f5f0e0', 800);
    const unlocked = DRINK_IDS.filter(id => SAVE.served >= DRINKS[id].unlock || (S && S.kind === 'daily'));
    unlocked.forEach((id, i) => { const ly = my + 24 * U + i * 10.5 * U; const Ls = DRINKS[id].layers; ctx.fillStyle = layerCol(Ls[Ls.length - 1][0] === 'foam' ? Ls[Ls.length - 2][0] : Ls[Ls.length - 1][0]); ctx.beginPath(); ctx.arc(mx + 8 * U, ly, 2.6 * U, 0, 6.28); ctx.fill(); txt(DRINKS[id].name.replace('Iced ', ''), mx + 13 * U, ly, 7.2 * U, '#f5f0e0', 600, 'left'); });
    const D = SAVE.deco;
    if (D.includes('d_lights')) {
      const ly0 = bandY(0.15);
      ctx.strokeStyle = '#7a6a58'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, ly0); for (let x = 0; x <= W; x += 10) ctx.lineTo(x, ly0 + Math.sin(x / W * Math.PI * 3) * 6 + 6); ctx.stroke();
      for (let i = 0; i < 14; i++) { const x = (i + 0.5) * W / 14, y = ly0 + Math.sin(x / W * Math.PI * 3) * 6 + 9; ctx.fillStyle = ['#ffd46b', '#ff9fb2', '#a7f0c4'][i % 3]; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + i); ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; }
    }
    if (D.includes('d_sakura')) drawDeco('d_sakura', wx - 2, wy - 4, U);
    if (D.includes('d_cat')) drawDeco('d_cat', wx + ww * 0.78, wy + wh + 1, U * 0.8);
    if (D.includes('d_neon')) drawDeco('d_neon', W * 0.19, bandY(0.3), U * 0.85);
    if (D.includes('d_clock')) drawDeco('d_clock', W * 0.67, bandY(0.32), U);
    if (D.includes('d_shelf')) drawDeco('d_shelf', W * 0.85, bandY(0.7), U * 0.9);
  }
  function drawCounter() {
    const cy = bandY(0.8), bottom = bandTopPx() + bandHpx();
    ctx.fillStyle = '#e9dcc3'; ctx.fillRect(0, cy - 6 * U, W, 10 * U);
    ctx.fillStyle = '#fbf5e8'; ctx.fillRect(0, cy - 8 * U, W, 4 * U);
    const g = ctx.createLinearGradient(0, cy, 0, bottom); g.addColorStop(0, '#9dbb83'); g.addColorStop(1, '#7f9f68');
    ctx.fillStyle = g; ctx.fillRect(0, cy + 4 * U, W, bottom - cy - 4 * U);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
    for (let x = 20; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, cy + 10 * U); ctx.lineTo(x, bottom - 4); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, bottom - 4, W, 4);
    const D = SAVE.deco;
    if (D.includes('d_plant')) drawDeco('d_plant', W * 0.05 + 6, cy - 22 * U, U * 0.85);
    if (D.includes('d_vinyl')) drawDeco('d_vinyl', W * 0.52, cy - 4 * U, U);
    if (D.includes('d_bowl')) drawDeco('d_bowl', W * 0.42, cy - 2 * U, U);
  }
  function drawOrderBubble(c) {
    if (!c || c.x == null) return;
    const d = DRINKS[c.drinkId];
    const bx = c.x + 42 * U, by = bandY(0.21), bw = W * 0.36, bh = bandHpx() * 0.52;
    ctx.save(); ctx.globalAlpha = c.arrived ? 1 : 0.5;
    ctx.fillStyle = '#fffdf8'; ctx.shadowColor = 'rgba(80,60,30,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    rr(bx, by, bw, bh, 14); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.moveTo(bx + 4, by + bh * 0.6); ctx.lineTo(bx - 10 * U, by + bh * 0.78); ctx.lineTo(bx + 6, by + bh * 0.78); ctx.fill();
    const gw = d.glass === 'cup' ? 32 * U : 24 * U, ghFull = bh - 22 * U, gh = d.glass === 'tall' ? ghFull : d.glass === 'short' ? ghFull * 0.75 : ghFull * 0.6;
    miniGlass(bx + 10 * U, by + 11 * U + (ghFull - gh), gw, gh, c.recipe.layers, SAVE.glass, d.glass);
    const tx = bx + gw + 18 * U;
    txt(c.name + (c.reg ? ' ★' : ''), tx, by + 13 * U, 9.5 * U, c.reg ? '#c48a1f' : '#9a8f7a', 700, 'left');
    const nm = d.name.split(' ');
    const l1 = nm.length > 2 ? nm.slice(0, 2).join(' ') : nm[0], l2 = nm.length > 2 ? nm.slice(2).join(' ') : nm.slice(1).join(' ');
    txt(l1, tx, by + 28 * U, 12 * U, '#3d4a33', 800, 'left');
    if (l2) txt(l2, tx, by + 42 * U, 12 * U, '#3d4a33', 800, 'left');
    let ly = by + (l2 ? 56 : 44) * U;
    if (c.note) { txt(c.note, tx, ly, 8.5 * U, '#8a7b62', 600, 'left'); ly += 12 * U; }
    c.recipe.layers.slice().reverse().forEach((l, i) => {
      const yy = ly + i * 10.5 * U; if (yy > by + bh - 5 * U) return;
      ctx.fillStyle = layerCol(l.type); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tx + 4 * U, yy, 3.5 * U, 0, 6.28); ctx.fill(); ctx.stroke();
      txt(LAYER_NAME[l.type], tx + 11 * U, yy, 8.5 * U, '#5b6650', 600, 'left');
    });
    ctx.restore();
  }
  function drawHUD(t) {
    if (!CFG.ownHUD || !S) return;
    const y = bandTopPx() + 8 * U, h = 30 * U, x0 = 52, w = W - x0 - 64;
    ctx.save(); ctx.translate(x0 - 8, 0);
    ctx.fillStyle = 'rgba(255,253,248,0.94)'; rr(8, y, w, h, h / 2); ctx.fill();
    const p = clamp(S.t / CFG.shiftDur, 0, 1), left = Math.max(0, Math.ceil(CFG.shiftDur - S.t));
    const barX = 86 * U, barW = w - barX - (S.streak >= 2 ? 92 : 52) * U;
    leaf(24 * U, y + h / 2, 9 * U); txt(String(S.tips), 38 * U, y + h / 2 + 1, 15 * U, '#3d4a33', 800, 'left');
    ctx.fillStyle = '#ece3d0'; rr(barX, y + h / 2 - 5 * U, barW, 10 * U, 5 * U); ctx.fill();
    const late = left <= 10;
    ctx.fillStyle = late ? (Math.sin(t * 10) > 0 ? '#e0674f' : '#ee8f72') : p > 0.66 ? '#e5a24a' : '#86ad5c';
    rr(barX, y + h / 2 - 5 * U, Math.max(4, barW * (1 - p)), 10 * U, 5 * U); ctx.fill();
    txt('0:' + String(left).padStart(2, '0'), barX + barW + 7 * U, y + h / 2 + 1, 13 * U, late ? '#c4523c' : '#3d4a33', 800, 'left');
    if (S.streak >= 2) { ctx.fillStyle = '#f6b25a'; rr(8 + w - 40 * U, y + 4 * U, 34 * U, h - 8 * U, 8 * U); ctx.fill(); txt('×' + streakMul(S.streak).toFixed(1), 8 + w - 23 * U, y + h / 2 + 1, 10.5 * U, '#fff', 800); }
    ctx.restore();
    muteHole();
    if (S.kind === 'daily') txt('Tages-Challenge ' + dateLabel(S.dateKey), W / 2, y + h + 9 * U, 9 * U, '#8a7b62', 700);
  }
  // Stummschalter des Cores (oben rechts) bleibt sichtbar und klickbar: Loch in die Szene stanzen
  function muteHole() {
    const T = OMM() && OMM().T; if (!T || T.stub) return;
    const sc = Math.min(W / (T.W || 400), H / (T.MIN_H || 700)), x = W - 32 * sc, y = safeT + 30 * sc, r = 21 * sc;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,253,248,0.94)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
  }
  function drawFX() {
    for (const p of S.parts) {
      ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
      if (p.kind === 'heart') heart(p.x, p.y, p.r * 1.2, '#f07c95');
      else if (p.kind === 'star') star(p.x, p.y, p.r * 1.4, '#f3c446');
      else { ctx.fillStyle = 'rgba(150,140,130,0.7)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.t), 0, 6.28); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (const p of S.pops) {
      const k = p.t / 1.4; ctx.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
      const y = p.y - ease(k) * 30 * U, sc = p.t < 0.15 ? 0.6 + p.t / 0.15 * 0.4 : 1;
      ctx.lineWidth = 4 * U; ctx.strokeStyle = 'rgba(255,253,248,0.9)'; ctx.lineJoin = 'round';
      ctx.font = '800 ' + Math.round((p.big ? 15 : 14) * U * sc) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(p.text, p.x, y);
      txt(p.text, p.x, y, (p.big ? 15 : 14) * U * sc, p.col, 800);
      if (p.sub) { leaf(p.x - 12 * U, y + 18 * U, 7 * U); ctx.font = '800 ' + Math.round(13 * U) + 'px ' + FONT; ctx.textAlign = 'left'; ctx.strokeText(p.sub, p.x - 2 * U, y + 19 * U); txt(p.sub, p.x - 2 * U, y + 19 * U, 13 * U, '#3f7a2c', 800, 'left'); }
    }
    ctx.globalAlpha = 1;
    if (S.banner) {
      const b = S.banner, k = b.t / 1.8, a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      const y = bandTopPx() + bandHpx() + 40 * U;
      ctx.fillStyle = 'rgba(61,74,51,0.9)'; rr(W * 0.15, y - 26 * U, W * 0.7, 52 * U, 18 * U); ctx.fill();
      txt(b.a, W / 2, y - 7 * U, 20 * U, '#fffbea', 800); txt(b.b, W / 2, y + 13 * U, 11 * U, '#dfe8cf', 600);
      ctx.globalAlpha = 1;
    }
  }

  /* ───────── Menüs ───────── */
  let buttons = [];
  function button(id, x, y, w, h, label, opt) {
    opt = opt || {};
    buttons.push({ id, x, y, w, h, data: opt.data, disabled: !!opt.disabled });
    ctx.fillStyle = opt.disabled ? '#e4dccb' : (opt.bg || '#5f8a43');
    ctx.shadowColor = 'rgba(60,50,30,0.16)'; ctx.shadowBlur = (opt.disabled || opt.bg === 'transparent') ? 0 : 6; ctx.shadowOffsetY = 2;
    rr(x, y, w, h, opt.r || 16); ctx.fill(); ctx.shadowColor = 'transparent';
    txt(label, x + w / 2, y + h / 2 + (opt.sub ? -7 * U : 1), (opt.size || 16) * U, opt.disabled ? '#a59c88' : (opt.fg || '#fff'), 800);
    if (opt.sub) txt(opt.sub, x + w / 2, y + h / 2 + 11 * U, 10.5 * U, opt.disabled ? '#a59c88' : (opt.subfg || 'rgba(255,255,255,0.88)'), 600);
  }
  function panelBg(alpha) { ctx.fillStyle = 'rgba(248,241,226,' + (alpha == null ? 0.97 : alpha) + ')'; ctx.fillRect(0, 0, W, H); }
  function header(t1, t2) {
    txt(t1, W / 2, 66 * U, 30 * U, '#3d4a33', 800);
    if (t2) txt(t2, W / 2, 94 * U, 12 * U, '#8a7b62', 600);
    ctx.fillStyle = 'rgba(255,253,248,0.95)'; rr(W - 112 * U, 16 * U, 98 * U, 28 * U, 14 * U); ctx.fill();
    leaf(W - 96 * U, 30 * U, 9 * U); txt(String(SAVE.tips), W - 82 * U, 31 * U, 14 * U, '#3d4a33', 800, 'left');
  }
  function demoGuest(x, y, look, t, i, sc) { drawCustomer({ x, y, scale: (sc || 0.85) * U, look, state: 'leave', mood: 'happy', moodT: 2, bob: t * 2 + i, patience: 1, patienceMax: 1, reg: null }, t); }
  function drawHub(t) {
    panelBg();
    header('Rush Hour', title() + ' · Café-Modus');
    demoGuest(W * 0.3, 252 * U, REGULARS[0].look, t, 0); demoGuest(W * 0.5, 246 * U, REGULARS[1].look, t, 1); demoGuest(W * 0.7, 252 * U, REGULARS[4].look, t, 2);
    ctx.fillStyle = '#9dbb83'; rr(W * 0.12, 250 * U, W * 0.76, 30 * U, 8); ctx.fill(); ctx.fillStyle = '#fbf5e8'; ctx.fillRect(W * 0.12, 247 * U, W * 0.76, 5 * U);
    const bw = W - 48 * U, bx = 24 * U;
    let y = 306 * U;
    button('shift', bx, y, bw, 64 * U, 'Schicht starten', { sub: '60 Sekunden · Bestwert ' + SAVE.bestShift + ' Trinkgeld', size: 19 });
    y += 76 * U;
    const dk = dateKey(), best = SAVE.daily[dk] || 0;
    button('daily', bx, y, bw, 64 * U, 'Tages-Challenge', { sub: dateLabel(dk) + ' · gleiche Gäste für alle · Bestes: ' + best, bg: '#e7a457', size: 18 });
    y += 76 * U;
    const hw = (bw - 12 * U) / 2;
    button('shop', bx, y, hw, 54 * U, 'Café-Shop', { bg: '#fffdf8', fg: '#3d4a33', size: 15 });
    const unl = REGULARS.filter(r => regState(r.id).unlocked).length;
    button('regulars', bx + hw + 12 * U, y, hw, 54 * U, 'Stammgäste', { bg: '#fffdf8', fg: '#3d4a33', size: 15, sub: unl + ' / ' + REGULARS.length, subfg: '#8a7b62' });
    y += 66 * U;
    button('back', bx, y, bw, 44 * U, 'Zurück zum Menü', { bg: 'transparent', fg: '#7a6e58', size: 14 });
    y += 64 * U;
    const next = DRINK_IDS.map(id => DRINKS[id]).find(d => SAVE.served < d.unlock);
    txt(next ? 'Noch ' + (next.unlock - SAVE.served) + ' Gäste bis „' + next.name + '“' : 'Alle Getränke freigeschaltet', W / 2, y, 11.5 * U, '#8a7b62', 600);
    txt('Bediente Gäste: ' + SAVE.served + '  ·  Schichten: ' + SAVE.shifts, W / 2, y + 18 * U, 10.5 * U, '#a59c88', 600);
  }
  function drawResult(t) {
    const R = lastResult; if (!R) return;
    panelBg(0.95);
    header(R.kind === 'daily' ? 'Tages-Challenge' : 'Feierabend!', R.kind === 'daily' ? dateLabel(R.dateKey) : 'Schicht beendet');
    const cy = 168 * U;
    const tw = (String(R.tips).length * 24 + 40) * U;
    leaf(W / 2 - tw / 2 + 18 * U, cy, 20 * U); txt(String(R.tips), W / 2 - tw / 2 + 46 * U, cy + 2, 44 * U, '#3d4a33', 800, 'left');
    txt('Trinkgeld', W / 2, cy + 36 * U, 12 * U, '#8a7b62', 600);
    if (R.newBest) { ctx.fillStyle = '#f6b25a'; rr(W / 2 - 62 * U, cy + 50 * U, 124 * U, 24 * U, 12 * U); ctx.fill(); txt('Neuer Bestwert!', W / 2, cy + 62 * U, 12 * U, '#fff', 800); }
    const rows = [['Gäste bedient', R.served], ['Glücklich', R.happy], ['Perfekt', R.perfects], ['Beste Serie', R.bestStreak], ['Gegangen', R.lost]];
    let y = cy + 96 * U;
    ctx.fillStyle = 'rgba(255,253,248,0.95)'; rr(32 * U, y - 14 * U, W - 64 * U, rows.length * 26 * U + 10 * U, 14 * U); ctx.fill();
    rows.forEach(([k, v], i) => { txt(k, 50 * U, y + i * 26 * U + 4 * U, 13 * U, '#5b6650', 600, 'left'); txt(String(v), W - 50 * U, y + i * 26 * U + 4 * U, 14 * U, '#3d4a33', 800, 'right'); });
    y += rows.length * 26 * U + 16 * U;
    if (R.kind === 'daily') { txt('Dein Tagesbestes: ' + (SAVE.daily[R.dateKey] || 0) + ' · Rangliste folgt', W / 2, y + 4 * U, 11 * U, '#8a7b62', 600); y += 18 * U; }
    y += 10 * U;
    const bw = W - 48 * U;
    button(R.kind === 'daily' ? 'daily' : 'shift', 24 * U, y, bw, 58 * U, 'Nochmal', { size: 18 });
    y += 70 * U;
    const hw = (bw - 12 * U) / 2;
    button('shop', 24 * U, y, hw, 50 * U, 'Café-Shop', { bg: '#fffdf8', fg: '#3d4a33', size: 15 });
    button('hub', 24 * U + hw + 12 * U, y, hw, 50 * U, 'Übersicht', { bg: '#fffdf8', fg: '#3d4a33', size: 15 });
  }
  function drawPause() {
    panelBg(0.86);
    txt('Pause', W / 2, H * 0.34, 30 * U, '#3d4a33', 800);
    txt('Die Gäste warten geduldig.', W / 2, H * 0.34 + 30 * U, 12 * U, '#8a7b62', 600);
    const bw = W - 96 * U;
    button('resume', 48 * U, H * 0.45, bw, 56 * U, 'Weiter', { size: 18 });
    button('quit', 48 * U, H * 0.45 + 68 * U, bw, 54 * U, 'Schicht abbrechen', { bg: '#fffdf8', fg: '#b5523f', size: 14, sub: 'Trinkgeld dieser Schicht verfällt', subfg: '#a59c88' });
  }
  function drawShop(t) {
    panelBg();
    header('Café-Shop', 'Nur Kosmetik · feste Preise · kein Echtgeld');
    const tw = (W - 48 * U - 10 * U) / 2;
    button('tab', 24 * U, 112 * U, tw, 36 * U, 'Gläser', { data: 'glass', bg: shopTab === 'glass' ? '#5f8a43' : '#fffdf8', fg: shopTab === 'glass' ? '#fff' : '#3d4a33', size: 14, r: 18 });
    button('tab', 34 * U + tw, 112 * U, tw, 36 * U, 'Deko', { data: 'deco', bg: shopTab === 'deco' ? '#5f8a43' : '#fffdf8', fg: shopTab === 'deco' ? '#fff' : '#3d4a33', size: 14, r: 18 });
    const items = SHOP.filter(i => i.kind === shopTab);
    const cols = 3, gap = 8 * U, cw = (W - 48 * U - gap * (cols - 1)) / cols, ch = 118 * U;
    items.forEach((it, i) => {
      const x = 24 * U + (i % cols) * (cw + gap), y = 160 * U + Math.floor(i / cols) * (ch + gap);
      const owned = SAVE.owned.includes(it.id), equipped = it.kind === 'glass' ? SAVE.glass === it.id : SAVE.deco.includes(it.id);
      ctx.fillStyle = '#fffdf8'; rr(x, y, cw, ch, 14); ctx.fill();
      if (equipped) { ctx.strokeStyle = '#86ad5c'; ctx.lineWidth = 3; rr(x, y, cw, ch, 14); ctx.stroke(); }
      if (it.kind === 'glass') miniGlass(x + cw / 2 - 12 * U, y + 10 * U, 24 * U, 48 * U, [{ type: 'milk', target: 0.5 }, { type: 'matcha', target: 0.85 }], it.id, 'tall');
      else { ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, 62 * U); ctx.clip(); drawDeco(it.id, x + cw / 2, y + (it.id === 'd_clock' || it.id === 'd_neon' || it.id === 'd_lights' ? 34 : 50) * U, U * (it.id === 'd_neon' ? 0.7 : 0.9)); ctx.restore(); }
      const nm = it.name.length > 14 ? it.name.split(' ') : [it.name];
      nm.slice(0, 2).forEach((n, k) => txt(n, x + cw / 2, y + (nm.length > 1 ? 66 : 72) * U + k * 12 * U, 10.5 * U, '#3d4a33', 800));
      let label, opt = { size: 11, r: 11, data: it.id };
      if (owned) { label = equipped ? (it.kind === 'glass' ? 'Aktiv' : 'Steht') : (it.kind === 'glass' ? 'Benutzen' : 'Aufstellen'); opt.bg = equipped ? '#dfe8cf' : '#5f8a43'; opt.fg = equipped ? '#4c5a3d' : '#fff'; }
      else if (it.price < 0) { label = 'Geschenk'; opt.disabled = true; }
      else { label = it.price + ''; opt.disabled = SAVE.tips < it.price; opt.bg = '#e7a457'; }
      button('item', x + 8 * U, y + ch - 32 * U, cw - 16 * U, 26 * U, label, opt);
      if (!owned && it.price > 0) leaf(x + 20 * U, y + ch - 19 * U, 6 * U);
    });
    txt('Geschenke bekommst du von Stammgästen (5 Herzen).', W / 2, H - 86 * U, 10.5 * U, '#a59c88', 600);
    button('hub', 24 * U, H - 66 * U, W - 48 * U, 46 * U, 'Fertig', { size: 15 });
  }
  function drawRegulars(t) {
    panelBg();
    header('Stammgäste', 'Kommen in normalen Schichten · Trinkgeld ×1,5');
    REGULARS.forEach((r, i) => {
      const rs = regState(r.id), y = 116 * U + i * 96 * U, x = 24 * U, w = W - 48 * U;
      ctx.fillStyle = '#fffdf8'; rr(x, y, w, 86 * U, 14); ctx.fill();
      ctx.save(); rr(x, y, 80 * U, 86 * U, 14); ctx.clip();
      if (rs.unlocked) demoGuest(x + 42 * U, y + 106 * U, r.look, t, i);
      else { ctx.fillStyle = '#e4dccb'; ctx.beginPath(); ctx.arc(x + 42 * U, y + 42 * U, 22 * U, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 42 * U, y + 96 * U, 30 * U, 28 * U, 0, Math.PI, 0); ctx.fill(); txt('?', x + 42 * U, y + 43 * U, 20 * U, '#fffdf8', 800); }
      ctx.restore();
      txt(rs.unlocked ? r.name : '???', x + 90 * U, y + 20 * U, 15 * U, '#3d4a33', 800, 'left');
      txt(rs.unlocked ? DRINKS[r.drink].name + ' · ' + r.note : 'Freischalten: ' + r.cond, x + 90 * U, y + 40 * U, 10.5 * U, '#8a7b62', 600, 'left');
      for (let k = 0; k < 5; k++) heart(x + 98 * U + k * 17 * U, y + 63 * U, 6 * U, k < rs.hearts ? '#f07c95' : '#ece3d0');
      const g = SHOP_BY_ID[r.gift];
      txt(rs.hearts >= 5 ? 'Geschenk: ' + g.name : '→ ' + g.name, x + 186 * U, y + 64 * U, 9 * U, '#a59c88', 600, 'left');
    });
    button('hub', 24 * U, H - 66 * U, W - 48 * U, 46 * U, 'Fertig', { size: 15 });
  }
  function drawIntro() {
    panelBg(0.95);
    header('So läuft die Schicht', '');
    const lines = ['Gäste stellen sich an die Theke.', 'Die Sprechblase zeigt die Bestellung:', 'welche Schichten bis zu welchem Strich.', 'Einmal halten pro Schicht – Loslassen = fertig.', '', 'Gieß sauber und genau: mehr Trinkgeld.', 'Glückliche Gäste in Folge = Serie bis ×3.', 'Lass niemanden zu lang warten!', '', 'Trinkgeld gibst du nur im Café-Shop aus –', 'für Gläser und Deko. Kein Echtgeld.'];
    lines.forEach((l, i) => txt(l, W / 2, 150 * U + i * 24 * U, 13.5 * U, '#4c5a3d', 600));
    button('introok', 24 * U, H - 120 * U, W - 48 * U, 58 * U, 'Los geht’s!', { size: 18 });
  }
  function drawToasts() {
    toasts.slice(0, 3).forEach((tt, i) => {
      const a = tt.t < 0.25 ? tt.t / 0.25 : tt.t > 2.8 ? (3.2 - tt.t) / 0.4 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      const y = H - 130 * U - i * 46 * U;
      ctx.fillStyle = 'rgba(61,74,51,0.94)'; rr(20 * U, y, W - 40 * U, 38 * U, 19 * U); ctx.fill();
      star(42 * U, y + 19 * U, 8 * U, '#f3c446');
      txt(tt.text, 58 * U, y + 20 * U, 12.5 * U, '#fffbea', 700, 'left');
      ctx.globalAlpha = 1;
    });
  }

  function render(t) {
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    buttons = [];
    if (S && (screen === 'play' || screen === 'pause' || screen === 'result')) {
      drawCafe(t);
      for (let i = S.queue.length - 1; i >= 0; i--) drawCustomer(S.queue[i], t);
      for (const c of S.leaving) drawCustomer(c, t);
      drawCounter();
      if (S.queue[0] && S.phase !== 'end') drawOrderBubble(S.queue[0]);
      drawHUD(t);
      drawFX();
    }
    if (screen === 'hub') drawHub(t);
    else if (screen === 'pause') drawPause();
    else if (screen === 'result') drawResult(t);
    else if (screen === 'shop') drawShop(t);
    else if (screen === 'regulars') drawRegulars(t);
    else if (screen === 'intro') drawIntro();
    drawToasts();
  }

  /* ───────── Eingabe (nur Menüs; im Spiel geht jeder Touch an den Core) ───────── */
  function onPointer(e) {
    if (screen === 'play') return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { e.preventDefault(); action(b.id, b.data); return; } }
  }
  let pendingKind = 'shift';
  function action(id, data) {
    sfx('click');
    switch (id) {
      case 'shift': case 'daily': pendingKind = id; if (!SAVE.seenIntro) screen = 'intro'; else startRun(id); break;
      case 'introok': SAVE.seenIntro = true; save(); startRun(pendingKind); break;
      case 'shop': screen = 'shop'; break;
      case 'regulars': screen = 'regulars'; break;
      case 'hub': toHub(); break;
      case 'back': exit(); return;
      case 'resume': screen = 'play'; break;
      case 'quit': abortRun(); toHub(); break;
      case 'tab': shopTab = data; break;
      case 'item': buyOrEquip(data); break;
    }
    setPointer(screen !== 'play');
  }
  function buyOrEquip(itemId) {
    const it = SHOP_BY_ID[itemId]; if (!it) return false;
    if (!SAVE.owned.includes(it.id)) {
      if (it.price < 0 || SAVE.tips < it.price) return false;
      SAVE.tips -= it.price; SAVE.owned.push(it.id); sfx('unlock');
      if (it.kind === 'deco') SAVE.deco.push(it.id); else SAVE.glass = it.id;
    } else if (it.kind === 'glass') SAVE.glass = it.id;
    else { const i = SAVE.deco.indexOf(it.id); if (i >= 0) SAVE.deco.splice(i, 1); else SAVE.deco.push(it.id); }
    save(); return true;
  }

  /* ───────── Lebenszyklus ───────── */
  function subscribe() {
    const O = OMM(); if (!O || !O.onGlassDone) return;
    if (unsub) { try { unsub(); } catch (e) { } }
    const u = O.onGlassDone(r => { if (active) onGlassDone(r); });
    unsub = typeof u === 'function' ? u : null;
  }
  function startRun(kind) {
    newShift(kind);
    subscribe();
    screen = 'play'; setPointer(false);
    pushHUD(true);
  }
  function abortRun() { S = null; }
  function toHub() {
    S = null;
    screen = 'hub'; setPointer(true);
    const O = OMM(); if (O && O.setHUD) { try { O.setHUD(null); } catch (e) { } }
  }
  let rafId = 0, lastT = 0, clock = 0, paused = false;
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
    if (!paused) { clock += dt; update(dt); }
    render(clock);
  }
  function open() {     // Core ruft start() → open()
    ensureCanvas(); active = true; resize();
    cv.style.display = 'block';
    const O = OMM(); if (O && typeof O.setMode !== 'function') { try { O.mode = MODE_ID; } catch (e) { } }
    subscribe();
    screen = 'off'; toHub();
    if (!rafId) { lastT = performance.now(); rafId = requestAnimationFrame(loop); }
  }
  function close() {    // Core ruft stop() → close()
    active = false; S = null; screen = 'off';
    if (unsub) { try { unsub(); } catch (e) { } unsub = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (cv) { cv.style.display = 'none'; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }
    setPointer(false);
  }
  function exit() {
    const O = OMM();
    if (O && typeof O.setMode === 'function') { O.setMode('menu'); if (screen !== 'off') close(); }
    else { close(); if (O) { try { O.mode = 'menu'; } catch (e) { } } }
    try { window.dispatchEvent(new CustomEvent('omm:rush-exit')); } catch (e) { }
  }

  let registered = false;
  function register() {
    if (registered) return true;
    const O = OMM();
    if (O && typeof O.registerMode === 'function') {
      O.registerMode(MODE_ID, { label: 'Rush Hour', start() { open(); }, stop() { close(); } });
      registered = true; return true;
    }
    return false;
  }
  if (!register()) {
    let tries = 0; const iv = setInterval(() => { if (register() || ++tries > 100) clearInterval(iv); }, 50);
  }

  /* ───────── Öffentliche API ───────── */
  function dailySequence(k, n) {
    const seed = dailySeed(k);
    const C = { kind: 'daily', rng: seededRng(seed), regRng: mulberry32(0), t: 0, customers: 0, runId: 'seq', regSeen: new Set() };
    const out = [];
    for (let i = 0; i < (n || 12); i++) { const c = makeCustomer(C); out.push(c.drinkId + ':' + c.recipe.layers.map(l => l.target).join('/')); C.customers++; C.t += arrivalInterval(C); }
    return out;
  }
  window.OMMRush = {
    VERSION, MODE_ID, CFG, DRINKS, REGULARS, SHOP,
    open, close, exit, register,
    get save() { return SAVE; },
    resetSave() { SAVE = DEFAULT_SAVE(); save(); },
    daily: {
      key: dateKey, seed: dailySeed, sequence: dailySequence,
      best: k => SAVE.daily[k || dateKey()] || 0,
      // Rangliste-fertig: das schickt man später an einen Server
      payload(k) { k = k || dateKey(); return { game: 'ombre-bar', mode: MODE_ID, v: VERSION, date: k, seed: dailySeed(k), score: SAVE.daily[k] || 0 }; },
    },
    debug: {
      layout: () => ({ W, H, U, safeT, bandTop: bandTopPx(), bandH: bandHpx(), jugTop: coreJugTopPx() }),
      get state() { return S; }, get screen() { return screen; }, get buttons() { return buttons.slice(); },
      start(kind) { if (screen === 'off') open(); SAVE.seenIntro = true; startRun(kind || 'shift'); },
      pause(v) { paused = !!v; }, step(dt, n) { n = n || 1; for (let i = 0; i < n; i++) update(dt); clock += dt * n; render(clock); },
      action, evaluate, computeTip, buyOrEquip, streakMul, checkUnlocks, endShift,
      setScreen(s) { screen = s; setPointer(s !== 'play'); },
      giveTips(n) { SAVE.tips += n; save(); },
    },
  };
})();
