// @ts-nocheck
// Prototype code, moved as-is. Phase 1 splits this into src/dsp, src/recipes and src/ui.
import JSZip from "jszip";

const SR = 44100;
const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- DSP building blocks ---------- */
function srcNode(ctx, buf, rate, when = 0) { const n = ctx.createBufferSource(); n.buffer = buf; n.playbackRate.value = rate; n.start(when); return n; }
function biquad(ctx, type, f, q = 0.707, g = 0) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; }
function gainNode(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g; }
function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
function env(ctx, { attack = 0.002, hold = 0, decay = 0.2, peak = 1, start = 0 }) {
  const g = ctx.createGain(); const p = Math.max(peak, 0.0002);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(p, start + attack);
  g.gain.setValueAtTime(p, start + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + decay);
  return g;
}
function shaper(ctx, amount) {
  const n = 2048, c = new Float32Array(n), k = amount * 60;
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
  const w = ctx.createWaveShaper(); w.curve = c; w.oversample = "4x"; return w;
}
function noiseBuf(ctx, dur, rand) { const b = ctx.createBuffer(1, Math.max(1, Math.ceil(dur * SR)), SR); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1; return b; }
function noiseSrc(ctx, dur, rand, when = 0) { const n = ctx.createBufferSource(); n.buffer = noiseBuf(ctx, dur, rand); n.start(when); return n; }
function thump(ctx, out, { f0, f1, t = 0.06, decay = 0.1, gain = 0.5, start = 0 }) {
  if (gain <= 0.005) return;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(f0, start); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), start + t);
  const e = env(ctx, { attack: 0.002, decay, peak: gain, start });
  o.connect(e); e.connect(out); o.start(start); o.stop(start + decay + 0.05);
}
function makeIR(ctx, seconds, rand, damp = 0.5) {
  const len = Math.max(64, Math.floor(seconds * SR)); const b = ctx.createBuffer(1, len, SR); const d = b.getChannelData(0);
  let lp = 0; const a = 0.15 + damp * 0.7;
  for (let i = 0; i < len; i++) { const w = rand() * 2 - 1; lp = lp + (w - lp) * (1 - a * i / len); d[i] = lp * Math.pow(1 - i / len, 2.5); }
  return b;
}
function sendReverb(ctx, input, out, seconds, wet, rand, damp) {
  if (wet <= 0.005) return;
  const c = ctx.createConvolver(); c.buffer = makeIR(ctx, seconds, rand, damp);
  input.connect(c); c.connect(gainNode(ctx, wet)).connect(out);
}

/* ---------- Recipes ---------- */
const RECIPES = [
  {
    id: "footstep_hard", name: "Footstep, hard", file: "footstep_hard",
    tip: "Click your tongue against the roof of your mouth, or tap a fingernail on a table. Short and sharp works best.",
    example: "Tongue click",
    params: [
      { id: "weight", label: "Weight", lo: "Light", hi: "Heavy", def: 0.45 },
      { id: "surface", label: "Surface", lo: "Wood", hi: "Stone", def: 0.5 },
      { id: "length", label: "Ring-out", lo: "Dry", hi: "Long", def: 0.3 },
      { id: "room", label: "Space", lo: "Outdoors", hi: "Hallway", def: 0.3 },
    ],
    setup(p, j) {
      const rate = lerp(1.2, 0.72, p.weight) * j(0.08), decay = lerp(0.05, 0.22, p.length) * j(0.15), roomSize = lerp(0.15, 0.9, p.room);
      return { rate, decay, roomSize, wet: p.room * 0.35, damp: 1 - p.surface * 0.6, dur: 0.03 + decay + roomSize * 0.9 + 0.05, comp: [-18, 4] };
    },
    build(ctx, s, src, p, j, rand, mix) {
      chain(srcNode(ctx, src, s.rate), biquad(ctx, "highpass", lerp(160, 260, p.surface)),
        biquad(ctx, "peaking", lerp(1500, 3800, p.surface) * j(0.15), 1.4, 6),
        biquad(ctx, "lowpass", lerp(6000, 11000, p.surface)),
        env(ctx, { attack: 0.0015, hold: 0.008, decay: s.decay }), mix);
      const f0 = lerp(170, 95, p.weight) * j(0.1);
      thump(ctx, mix, { f0, f1: f0 * 0.55, t: 0.06, decay: lerp(0.04, 0.09, p.weight), gain: lerp(0.15, 0.7, p.weight) * (1 - p.surface * 0.3) });
    },
  },
  {
    id: "footstep_soft", name: "Footstep, soft", file: "footstep_soft",
    tip: "Rub your palms together once, or press a thumb into a pillow. For gravel, crunch a bag of chips.",
    example: "Palm rub",
    params: [
      { id: "weight", label: "Weight", lo: "Light", hi: "Heavy", def: 0.4 },
      { id: "material", label: "Ground", lo: "Carpet", hi: "Gravel", def: 0.35 },
      { id: "length", label: "Length", lo: "Quick", hi: "Dragged", def: 0.35 },
      { id: "room", label: "Space", lo: "Outdoors", hi: "Indoors", def: 0.15 },
    ],
    setup(p, j) {
      const rate = lerp(1.1, 0.75, p.weight) * j(0.08), decay = lerp(0.1, 0.32, p.length) * j(0.15), roomSize = lerp(0.15, 0.7, p.room);
      return { rate, decay, roomSize, wet: p.room * 0.25, damp: 0.8, dur: 0.04 + decay + roomSize * 0.9 + 0.05, comp: [-20, 3] };
    },
    build(ctx, s, src, p, j, rand, mix) {
      chain(srcNode(ctx, src, s.rate), biquad(ctx, "highpass", 90),
        biquad(ctx, "lowpass", lerp(1600, 5000, p.material) * j(0.15)),
        env(ctx, { attack: 0.008, hold: 0.02, decay: s.decay }), mix);
      // Crunch layer: band-limited noise chopped into random grains
      if (p.material > 0.02) {
        const total = 0.03 + s.decay, g = ctx.createGain(); g.gain.setValueAtTime(0, 0);
        for (let t = 0; t < total; t += 0.005) {
          const shape = Math.exp(-3 * t / total);
          g.gain.setValueAtTime(rand() < 0.45 ? rand() * shape : 0.02 * shape, t);
        }
        g.gain.setValueAtTime(0, total);
        chain(noiseSrc(ctx, total, rand), biquad(ctx, "bandpass", lerp(1200, 3500, p.material) * j(0.2), 0.8), g, gainNode(ctx, p.material * 0.55), mix);
      }
      const f0 = lerp(110, 70, p.weight);
      thump(ctx, mix, { f0, f1: f0 * 0.6, t: 0.05, decay: 0.07, gain: p.weight * 0.35 });
    },
  },
  {
    id: "impact_hard", name: "Impact, hard", file: "impact_hard",
    tip: "Smack your lips, pop your cheek with a finger, or punch a couch cushion close to the mic.",
    example: "Knuckle knock",
    params: [
      { id: "weight", label: "Weight", lo: "Punch", hi: "Hammer", def: 0.5 },
      { id: "crunch", label: "Crunch", lo: "Clean", hi: "Crunchy", def: 0.35 },
      { id: "body", label: "Body", lo: "Thin", hi: "Boomy", def: 0.55 },
      { id: "room", label: "Space", lo: "Close", hi: "Big room", def: 0.25 },
    ],
    setup(p, j) {
      const rate = lerp(0.9, 0.5, p.weight) * j(0.08), decay = lerp(0.15, 0.4, p.weight) * j(0.15), roomSize = lerp(0.2, 1.2, p.room);
      return { rate, decay, roomSize, wet: p.room * 0.3, damp: 0.5, dur: 0.02 + decay + roomSize * 0.9 + 0.1, comp: [-14, 6] };
    },
    build(ctx, s, src, p, j, rand, mix) {
      chain(srcNode(ctx, src, s.rate), biquad(ctx, "highpass", 45), shaper(ctx, p.crunch), gainNode(ctx, lerp(1, 0.55, p.crunch)),
        biquad(ctx, "peaking", lerp(140, 90, p.weight), 1, p.body * 9),
        biquad(ctx, "peaking", 2500, 1, p.crunch * 4),
        biquad(ctx, "lowpass", lerp(9000, 5000, p.weight)),
        env(ctx, { attack: 0.001, hold: 0.01, decay: s.decay }), mix);
      thump(ctx, mix, { f0: lerp(90, 60, p.weight) * j(0.1), f1: lerp(45, 30, p.weight), t: 0.12, decay: lerp(0.15, 0.4, p.body), gain: p.body * 0.9 });
      chain(noiseSrc(ctx, 0.02, rand), biquad(ctx, "highpass", 3000), env(ctx, { attack: 0.0005, decay: 0.015, peak: 0.5 }), mix);
    },
  },
  {
    id: "critical_hit", name: "Critical hit", file: "critical_hit",
    tip: "Say a hard “puh!” or “kuh!” close to the mic, or drop a book flat on the floor.",
    example: "Hard ‘kuh’",
    params: [
      { id: "weight", label: "Weight", lo: "Heavy", hi: "Colossal", def: 0.5 },
      { id: "brutal", label: "Brutality", lo: "Grim", hi: "Brutal", def: 0.5 },
      { id: "drop", label: "Sub drop", lo: "Short", hi: "Long", def: 0.5 },
      { id: "ring", label: "Ring", lo: "Dull", hi: "Metallic", def: 0.35 },
      { id: "room", label: "Space", lo: "Close", hi: "Arena", def: 0.4 },
    ],
    setup(p, j) {
      const rate = lerp(0.6, 0.38, p.weight) * j(0.08), decay = lerp(0.35, 0.8, p.weight) * j(0.12), subDur = lerp(0.25, 0.9, p.drop), roomSize = lerp(0.6, 1.8, p.room);
      const ringDur = lerp(0.3, 1.1, p.ring);
      return { rate, decay, subDur, ringDur, roomSize, wet: 0.12 + p.room * 0.3, damp: 0.4,
        dur: Math.max(decay, subDur, ringDur) + 0.05 + roomSize * 0.8, comp: [-12, 8],
        crush: { mix: p.brutal * 0.55, bits: Math.round(lerp(10, 5, p.brutal)), hold: Math.max(1, Math.round(lerp(1, 6, p.brutal))) } };
    },
    build(ctx, s, src, p, j, rand, mix) {
      const bus = ctx.createGain();
      chain(srcNode(ctx, src, s.rate), shaper(ctx, 0.4 + p.brutal * 0.6), gainNode(ctx, 0.6), bus);
      chain(srcNode(ctx, src, s.rate * 1.5, 0.006), shaper(ctx, 0.4 + p.brutal * 0.6), gainNode(ctx, 0.35), bus);
      chain(bus, biquad(ctx, "highpass", 35), biquad(ctx, "peaking", 2800, 0.9, p.brutal * 5),
        biquad(ctx, "lowpass", lerp(8000, 4500, p.weight)), env(ctx, { attack: 0.001, hold: 0.02, decay: s.decay }), mix);
      thump(ctx, mix, { f0: 110 * j(0.1), f1: 28, t: s.subDur * 0.8, decay: s.subDur, gain: 0.9 });
      if (p.ring > 0.02) {
        const base = lerp(420, 700, rand()) * j(0.1);
        [1, 2.76, 5.4].forEach((m, k) => {
          const o = ctx.createOscillator(); o.frequency.value = base * m;
          const e = env(ctx, { attack: 0.002, decay: s.ringDur / (k + 1), peak: p.ring * 0.2 / (k + 1) });
          o.connect(e); e.connect(mix); o.start(0); o.stop(s.ringDur + 0.05);
        });
      }
      chain(noiseSrc(ctx, 0.02, rand), biquad(ctx, "highpass", 2500), env(ctx, { attack: 0.0005, decay: 0.02, peak: 0.7 }), mix);
    },
  },
  {
    id: "whiff", name: "Whiff / swing", file: "swing",
    tip: "Blow a quick “fwoo” past the mic, not into it. Or swish a towel or a thin stick near it.",
    example: "Breath ‘fwoo’",
    params: [
      { id: "speed", label: "Speed", lo: "Slow", hi: "Fast", def: 0.55 },
      { id: "weight", label: "Weapon", lo: "Dagger", hi: "Greatsword", def: 0.4 },
      { id: "sweep", label: "Pitch sweep", lo: "Low", hi: "High", def: 0.5 },
      { id: "air", label: "Air", lo: "Breathy", hi: "Windy", def: 0.3 },
    ],
    setup(p, j) {
      const rate = lerp(0.9, 1.8, p.speed) * j(0.08);
      const len = lerp(0.6, 0.22, p.speed) * lerp(0.9, 1.3, p.weight) * j(0.12);
      return { rate, len, peakT: len * lerp(0.55, 0.4, p.speed), roomSize: 0.3, wet: 0.08, damp: 0.7, dur: len + 0.3, comp: [-18, 3] };
    },
    build(ctx, s, src, p, j, rand, mix) {
      const bus = ctx.createGain();
      srcNode(ctx, src, s.rate).connect(bus);
      chain(noiseSrc(ctx, s.len, rand), gainNode(ctx, 0.08 + p.air * 0.6), bus);
      const lo = lerp(350, 180, p.weight), hi = lerp(1200, 4500, p.sweep) * lerp(1, 0.6, p.weight) * j(0.15);
      const bp = biquad(ctx, "bandpass", lo, lerp(2.5, 1.1, p.air));
      bp.frequency.setValueAtTime(lo, 0);
      bp.frequency.exponentialRampToValueAtTime(hi, s.peakT);
      bp.frequency.exponentialRampToValueAtTime(lo * 0.8, s.len);
      const shape = ctx.createGain(); const n = 256, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / (n - 1) * s.len; curve[i] = Math.max(0.0001, t < s.peakT ? Math.pow(t / s.peakT, 2) : Math.pow((s.len - t) / (s.len - s.peakT), 1.5)); }
      shape.gain.setValueCurveAtTime(curve, 0, s.len);
      chain(bus, bp, biquad(ctx, "lowpass", lerp(9000, 3500, p.weight)), gainNode(ctx, 3), shape, mix);
    },
  },
];
const byId = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/* ---------- Render ---------- */
async function render(recipe, src, p, seed, variation) {
  const rand = mulberry32(seed);
  const j = (amt) => 1 + (rand() * 2 - 1) * amt * variation * 2;
  const s = recipe.setup(p, j, src);
  const ctx = new OfflineAudioContext(1, Math.ceil(s.dur * SR), SR);
  const mix = ctx.createGain(), comp = ctx.createDynamicsCompressor();
  comp.threshold.value = s.comp[0]; comp.ratio.value = s.comp[1]; comp.attack.value = 0.003; comp.release.value = 0.12; comp.knee.value = 6;
  mix.connect(comp); comp.connect(ctx.destination);
  recipe.build(ctx, s, src, p, j, rand, mix);
  sendReverb(ctx, comp, ctx.destination, s.roomSize, s.wet, rand, s.damp);
  const buf = await ctx.startRendering();
  return finish(buf, s);
}
function finish(buf, s) {
  const d = buf.getChannelData(0);
  if (s.crush && s.crush.mix > 0.01) {
    const q = Math.pow(2, s.crush.bits - 1); let held = 0;
    for (let i = 0; i < d.length; i++) { if (i % s.crush.hold === 0) held = Math.round(d[i] * q) / q; d[i] = d[i] * (1 - s.crush.mix) + held * s.crush.mix; }
  }
  let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const norm = peak > 0 ? 0.891 / peak : 1;
  let end = d.length - 1; while (end > 0 && Math.abs(d[end] * norm) < 0.0005) end--;
  const len = Math.min(d.length, end + Math.floor(0.005 * SR) + 1);
  const out = new AudioBuffer({ length: Math.max(1, len), sampleRate: SR, numberOfChannels: 1 }); const o = out.getChannelData(0);
  const fade = Math.min(len, Math.floor(0.008 * SR));
  for (let i = 0; i < len; i++) { o[i] = d[i] * norm; if (i > len - fade) o[i] *= (len - i) / fade; }
  return out;
}

/* Source prep: mono, trim silence, normalize, cap at 3 s */
function prepSource(buf) {
  const n = buf.length, ch = buf.numberOfChannels, mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
  if (peak < 1e-4) return null;
  let a = 0; while (a < n && Math.abs(mono[a]) < peak * 0.06) a++;
  let b = n - 1; while (b > a && Math.abs(mono[b]) < peak * 0.01) b--;
  const sr = buf.sampleRate; a = Math.max(0, a - Math.floor(0.004 * sr)); b = Math.min(n, b + Math.floor(0.02 * sr), a + 3 * sr);
  const out = new AudioBuffer({ length: Math.max(1, b - a), sampleRate: sr, numberOfChannels: 1 }); const o = out.getChannelData(0);
  for (let i = 0; i < o.length; i++) o[i] = mono[a + i] * 0.9 / peak;
  return out;
}

/* Example sources, synthesized so the page works before you record anything */
function makeExample(kind) {
  const rand = mulberry32(kind.length * 977 + 13), dur = { "Tongue click": 0.05, "Palm rub": 0.28, "Knuckle knock": 0.16, "Hard ‘kuh’": 0.22, "Breath ‘fwoo’": 0.6 }[kind];
  const len = Math.ceil(dur * SR), d = new Float32Array(len); let lp = 0, lp2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, w = rand() * 2 - 1;
    if (kind === "Tongue click") d[i] = (Math.sin(2 * Math.PI * 2300 * t) * 0.8 + w * 0.5) * Math.exp(-t / 0.007);
    else if (kind === "Palm rub") { lp += (w - lp) * 0.35; const e = Math.sin(Math.PI * t / dur); d[i] = lp * e * (0.6 + 0.4 * Math.sin(2 * Math.PI * 23 * t)); }
    else if (kind === "Knuckle knock") { lp += (w - lp) * 0.25; d[i] = (Math.sin(2 * Math.PI * 190 * t) * 0.9 + lp * 0.8) * Math.exp(-t / 0.035); }
    else if (kind === "Hard ‘kuh’") { lp += (w - lp) * 0.5; lp2 += (w - lp2) * 0.08; d[i] = lp * Math.exp(-t / 0.012) * 1.2 + (lp2 * 2 + Math.sin(2 * Math.PI * 140 * t) * 0.4) * Math.exp(-t / 0.08) * (t > 0.01 ? 1 : t / 0.01); }
    else { lp += (w - lp) * 0.2; const e = Math.pow(Math.sin(Math.PI * Math.pow(t / dur, 0.7)), 2); d[i] = lp * e * 1.5; }
  }
  const buf = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 1 }); buf.copyToChannel(d, 0);
  return prepSource(buf);
}

/* ---------- WAV ---------- */
function encodeWav(buf) {
  const d = buf.getChannelData(0), n = d.length, ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, d[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return ab;
}

/* ---------- Playback + drawing ---------- */
let actx = null, current = null;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); return actx; }
function play(buf, onEnd) {
  if (!buf) return; const ctx = audio();
  if (current) { try { current.stop(); } catch (e) {} }
  const n = ctx.createBufferSource(); n.buffer = buf; n.connect(ctx.destination); n.onended = onEnd || null; n.start(); current = n;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function drawWave(canvas, buf) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
  const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.fillStyle = cssVar("--wave-dim"); g.fillRect(0, h / 2 - 0.5, w, 1);
  if (!buf) return;
  const d = buf.getChannelData(0), step = d.length / w; g.fillStyle = cssVar("--wave");
  for (let x = 0; x < w; x++) {
    let mn = 1, mx = -1; const a = Math.floor(x * step), b = Math.max(a + 1, Math.floor((x + 1) * step));
    for (let i = a; i < b && i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
    if (mx < mn) continue; g.fillRect(x, (1 - mx) * h / 2, 1, Math.max(1, (mx - mn) * h / 2));
  }
}
const ms = (buf) => buf ? Math.round(buf.duration * 1000) + " ms" : "";

/* ---------- State + UI ---------- */
const state = { src: null, srcName: "", recipe: RECIPES[0].id, params: {}, out: null, vars: [] };
RECIPES.forEach((r) => { state.params[r.id] = Object.fromEntries(r.params.map((p) => [p.id, p.def])); });

function setSource(buf, name) {
  if (!buf) { showNote($("srcNote"), "That recording is silent. Try again a little closer to the mic."); return; }
  state.src = buf; state.srcName = name; $("srcNote").hidden = true;
  $("srcName").textContent = name; $("srcDur").textContent = ms(buf); drawWave($("srcWave"), buf);
  document.querySelectorAll("#examples .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.name === name)));
  clearVars(); scheduleRender(false);
}
function showNote(el, text, ok) { el.textContent = text; el.classList.toggle("ok", !!ok); el.hidden = false; }

function buildExamples() {
  const box = $("examples");
  ["Tongue click", "Palm rub", "Knuckle knock", "Hard ‘kuh’", "Breath ‘fwoo’"].forEach((name) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.name = name; b.textContent = name + " (example)";
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => { setSource(makeExample(name), name); play(state.src); };
    box.appendChild(b);
  });
}
function buildRecipes() {
  const box = $("recipes");
  RECIPES.forEach((r) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "recipe"; b.dataset.id = r.id;
    b.innerHTML = `<span class="rname"></span><span class="rfile"></span>`;
    b.querySelector(".rname").textContent = r.name; b.querySelector(".rfile").textContent = r.file + "_01.wav";
    b.onclick = () => selectRecipe(r.id, true); box.appendChild(b);
  });
}
function selectRecipe(id, user) {
  state.recipe = id; const r = byId[id];
  document.querySelectorAll(".recipe").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  $("tip").innerHTML = "<b>What to record:</b> "; $("tip").append(r.tip + " ");
  const hint = document.createElement("span"); hint.className = "hint"; hint.textContent = `Example to try: ${r.example}.`; $("tip").append(hint);
  const box = $("sliders"); box.innerHTML = "";
  r.params.forEach((p) => {
    const v = state.params[id][p.id], el = document.createElement("div"); el.className = "slider";
    const sid = `p_${id}_${p.id}`;
    el.innerHTML = `<label for="${sid}"><span></span><output>${Math.round(v * 100)}</output></label><input id="${sid}" type="range" min="0" max="100" value="${Math.round(v * 100)}"><div class="ends"><span></span><span></span></div>`;
    el.querySelector("label span").textContent = p.label;
    const ends = el.querySelectorAll(".ends span"); ends[0].textContent = p.lo; ends[1].textContent = p.hi;
    const input = el.querySelector("input"), out = el.querySelector("output");
    input.oninput = () => { state.params[id][p.id] = input.value / 100; out.textContent = input.value; scheduleRender(true); };
    box.appendChild(el);
  });
  clearVars(); scheduleRender(user);
}

let renderTimer = null, renderToken = 0;
function scheduleRender(autoplay) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(async () => {
    if (!state.src) return; const token = ++renderToken; const r = byId[state.recipe];
    const buf = await render(r, state.src, state.params[r.id], 1, 0);
    if (token !== renderToken) return;
    state.out = buf; $("outName").textContent = r.file + " · base"; $("outDur").textContent = ms(buf); drawWave($("outWave"), buf);
    if (autoplay && $("autoplay").checked) play(buf);
  }, 140);
}
function clearVars() { state.vars = []; $("vars").innerHTML = '<p class="empty">Variations appear here. Tap one to hear it.</p>'; $("exportBtn").disabled = true; }

async function generate() {
  if (!state.src) return; const r = byId[state.recipe], n = +$("varCount").value, amt = $("varAmt").value / 100;
  $("genBtn").disabled = true; $("genBtn").textContent = "Rendering…";
  const vars = [];
  for (let i = 0; i < n; i++) {
    const seed = (Math.random() * 1e9) | 0;
    vars.push({ seed, name: `${r.file}_${String(i + 1).padStart(2, "0")}.wav`, buf: await render(r, state.src, state.params[r.id], seed, amt) });
  }
  state.vars = vars; state.varMeta = { recipe: r.id, params: { ...state.params[r.id] }, variation: amt, source: state.srcName };
  const box = $("vars"); box.innerHTML = "";
  vars.forEach((v) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "var"; b.setAttribute("aria-label", "Play " + v.name);
    const c = document.createElement("canvas"); const nm = document.createElement("span"); nm.className = "vname"; nm.textContent = v.name;
    b.append(c, nm); box.appendChild(b); drawWave(c, v.buf);
    b.onclick = () => { document.querySelectorAll(".var").forEach((x) => x.classList.remove("playing")); b.classList.add("playing"); play(v.buf, () => b.classList.remove("playing")); };
  });
  $("genBtn").disabled = false; $("genBtn").textContent = "Generate variations"; $("exportBtn").disabled = false;
  // Audition them in sequence so the spread is easy to judge
  let k = 0; const tiles = box.querySelectorAll(".var");
  const next = () => { if (k >= vars.length) return; tiles.forEach((x) => x.classList.remove("playing")); tiles[k].classList.add("playing"); const t = tiles[k]; play(vars[k++].buf, () => { t.classList.remove("playing"); setTimeout(next, 120); }); };
  next();
}

function download(blob, filename) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function exportPack() {
  const note = $("exportNote");
  if (!state.vars.length) return;
  const zip = new JSZip(); const m = state.varMeta;
  state.vars.forEach((v) => zip.file(v.name, encodeWav(v.buf)));
  zip.file("recipe.json", JSON.stringify({ tool: "We Are Mic Foley v0.1", recipe: m.recipe, source: m.source, params: m.params, variation: m.variation,
    files: state.vars.map((v) => ({ name: v.name, seed: v.seed, ms: Math.round(v.buf.duration * 1000) })), format: "WAV 16-bit 44.1 kHz mono, peak -1 dBFS" }, null, 2));
  try { download(await zip.generateAsync({ type: "blob" }), `${byId[m.recipe].file}_pack.zip`); showNote(note, `Saved ${state.vars.length} sounds.`, true); }
  catch (e) { showNote(note, "Couldn't build the pack. " + (e && e.message ? e.message : "")); }
}

/* Recording. Browsers only allow the mic on https:// or localhost. */
let recorder = null, recTimer = null;
async function toggleRecord() {
  if (recorder && recorder.state === "recording") { recorder.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
  catch (e) { showNote($("srcNote"), "The microphone is blocked. Allow mic access for this page, or record a voice memo on your phone and use Upload audio."); return; }
  const chunks = []; recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = async () => {
    clearTimeout(recTimer); stream.getTracks().forEach((t) => t.stop()); $("recBtn").classList.remove("on"); $("recLabel").textContent = "Record";
    try { const ab = await new Blob(chunks).arrayBuffer(); setSource(prepSource(await audio().decodeAudioData(ab)), "Recording " + new Date().toLocaleTimeString()); }
    catch (e) { showNote($("srcNote"), "Couldn't read that recording. Try again."); }
  };
  recorder.start(); $("recBtn").classList.add("on"); $("recLabel").textContent = "Stop";
  recTimer = setTimeout(() => recorder && recorder.state === "recording" && recorder.stop(), 4000);
}
async function onFile(e) {
  const f = e.target.files[0]; if (!f) return;
  try { const ab = await f.arrayBuffer(); setSource(prepSource(await audio().decodeAudioData(ab)), f.name); }
  catch (err) { showNote($("srcNote"), "Couldn't read that file. Try a WAV, MP3, M4A or OGG."); }
  e.target.value = "";
}

/* ---------- Boot ---------- */
buildExamples(); buildRecipes();
$("recBtn").onclick = toggleRecord;
$("fileIn").onchange = onFile;
$("playOut").onclick = () => play(state.out);
$("playSrc").onclick = () => play(state.src);
$("srcWave").onclick = () => play(state.src);
$("outWave").onclick = () => play(state.out);
$("varAmt").oninput = () => { $("varAmtOut").textContent = $("varAmt").value; };
$("genBtn").onclick = generate;
$("exportBtn").onclick = exportPack;
selectRecipe(RECIPES[0].id, false);
setSource(makeExample("Tongue click"), "Tongue click");
const redraw = () => { drawWave($("srcWave"), state.src); drawWave($("outWave"), state.out); document.querySelectorAll(".var canvas").forEach((c, i) => state.vars[i] && drawWave(c, state.vars[i].buf)); };
window.addEventListener("resize", redraw);
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw); new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); } catch (e) {}
