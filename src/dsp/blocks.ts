// Shared Web Audio building blocks that recipes are made from.

export const SR = 44100;

type Ctx = BaseAudioContext;

export function srcNode(ctx: Ctx, buf: AudioBuffer, rate: number, when = 0): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.playbackRate.value = rate;
  n.start(when);
  return n;
}

export function biquad(ctx: Ctx, type: BiquadFilterType, f: number, q = 0.707, g = 0): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = g;
  return b;
}

export function gainNode(ctx: Ctx, v: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

/** Connects nodes in order and returns the last one. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

export interface EnvOptions {
  attack?: number;
  hold?: number;
  decay?: number;
  peak?: number;
  start?: number;
}

/** Gain node with an exponential attack, hold and decay. */
export function env(ctx: Ctx, { attack = 0.002, hold = 0, decay = 0.2, peak = 1, start = 0 }: EnvOptions): GainNode {
  const g = ctx.createGain();
  const p = Math.max(peak, 0.0002);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(p, start + attack);
  g.gain.setValueAtTime(p, start + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + decay);
  return g;
}

/** Soft-clipping distortion. amount 0 is clean, 1 is heavy. */
export function shaper(ctx: Ctx, amount: number): WaveShaperNode {
  const n = 2048;
  const c = new Float32Array(n);
  const k = amount * 60;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  const w = ctx.createWaveShaper();
  w.curve = c;
  w.oversample = "4x";
  return w;
}

export function noiseBuf(ctx: Ctx, dur: number, rand: () => number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, Math.ceil(dur * SR)), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return b;
}

export function noiseSrc(ctx: Ctx, dur: number, rand: () => number, when = 0): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf(ctx, dur, rand);
  n.start(when);
  return n;
}

export interface ThumpOptions {
  f0: number;
  f1: number;
  t?: number;
  decay?: number;
  gain?: number;
  start?: number;
}

/** Sine hit that sweeps down from f0 to f1: the low "body" of footsteps and impacts. */
export function thump(ctx: Ctx, out: AudioNode, { f0, f1, t = 0.06, decay = 0.1, gain = 0.5, start = 0 }: ThumpOptions): void {
  if (gain <= 0.005) return;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f0, start);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), start + t);
  const e = env(ctx, { attack: 0.002, decay, peak: gain, start });
  o.connect(e);
  e.connect(out);
  o.start(start);
  o.stop(start + decay + 0.05);
}

/** Generated reverb impulse: filtered noise with a fading tail. damp 1 is darker. */
export function makeIR(ctx: Ctx, seconds: number, rand: () => number, damp = 0.5): AudioBuffer {
  const len = Math.max(64, Math.floor(seconds * SR));
  const b = ctx.createBuffer(1, len, SR);
  const d = b.getChannelData(0);
  let lp = 0;
  const a = 0.15 + damp * 0.7;
  for (let i = 0; i < len; i++) {
    const w = rand() * 2 - 1;
    lp = lp + (w - lp) * (1 - (a * i) / len);
    d[i] = lp * Math.pow(1 - i / len, 2.5);
  }
  return b;
}

export function sendReverb(ctx: Ctx, input: AudioNode, out: AudioNode, seconds: number, wet: number, rand: () => number, damp: number): void {
  if (wet <= 0.005) return;
  const c = ctx.createConvolver();
  c.buffer = makeIR(ctx, seconds, rand, damp);
  input.connect(c);
  c.connect(gainNode(ctx, wet)).connect(out);
}
