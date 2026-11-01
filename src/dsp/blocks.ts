// Small Web Audio building blocks the renderer is made from.

export const SR = 44100;

type Ctx = BaseAudioContext;

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

/** Generated reverb impulse: filtered noise with a fading tail. damp 1 is darker. */
export function makeIR(ctx: Ctx, seconds: number, rand: () => number, damp = 0.5): AudioBuffer {
  const len = Math.max(64, Math.floor(seconds * ctx.sampleRate));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
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
