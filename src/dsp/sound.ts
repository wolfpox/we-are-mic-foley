import { SR, biquad, chain, gainNode, makeIR, shaper } from "./blocks";
import { lerp, mulberry32 } from "./rng";

// The sound is your recordings, layered. Every control is a plain effect on them; nothing is synthesized.

/** Settings of one layer that shape its sound. */
export interface LayerSettings {
  /** dB, -24 to +6. */
  volume: number;
  /** Semitones, -24 to +24. Changes length too, like a tape: lower is slower. */
  pitch: number;
  /** -1 (dark) to 1 (bright). 0 leaves the sound as recorded. */
  tone: number;
  /** Start time in ms, 0 to 500. */
  delay: number;
  reverse: boolean;
}

/** Use every take in turn: each variation picks a different one. */
export const ALL_TAKES = -1;
export const MAX_LAYERS = 4;

export interface Layer extends LayerSettings {
  /** Id of the recording this layer plays. */
  clip: string;
  /** Take index, or ALL_TAKES. */
  take: number;
}

/** Effects on the mix of all layers. Each is 0 (off) to 1. */
export interface Effects {
  compress: number;
  distort: number;
  lofi: number;
  reverb: number;
  /** Size of the reverb's room: 0 small, 1 large hall. */
  room: number;
}

/** How far variations wander from the base sound. */
export interface Spread {
  /** ± semitones across the set. */
  pitch: number;
  /** 0 to 1. */
  tone: number;
  /** 0 to 1: shifts layers against each other by up to ±40 ms. */
  timing: number;
}

export const defaultLayer = (clip: string): Layer => ({ clip, take: ALL_TAKES, volume: 0, pitch: 0, tone: 0, delay: 0, reverse: false });
export const DEFAULT_FX: Effects = { compress: 0, distort: 0, lofi: 0, reverb: 0, room: 0.3 };
export const DEFAULT_SPREAD: Spread = { pitch: 2, tone: 0.3, timing: 0.3 };

/** One layer ready to render: the take's audio plus its final settings. */
export interface Part extends LayerSettings {
  buf: AudioBuffer;
}

const MAX_RENDER_SECONDS = 12;
export const rateOf = (semitones: number) => Math.pow(2, semitones / 12);
export const roomSeconds = (room: number) => lerp(0.25, 3, room);
const dbToGain = (db: number) => Math.pow(10, db / 20);

function reversed(buf: AudioBuffer): AudioBuffer {
  const out = new AudioBuffer({ length: buf.length, sampleRate: buf.sampleRate, numberOfChannels: 1 });
  const d = buf.getChannelData(0);
  const o = out.getChannelData(0);
  for (let i = 0, n = d.length; i < n; i++) o[i] = d[n - 1 - i];
  return out;
}

/** Dark cuts the top end (down to 600 Hz); bright cuts the low end (up to 1.8 kHz) and lifts the top. */
function toneFilters(ctx: BaseAudioContext, tone: number): AudioNode[] {
  if (tone < -0.005) return [biquad(ctx, "lowpass", 20000 * Math.pow(0.03, -tone))];
  if (tone > 0.005) return [biquad(ctx, "highpass", 30 * Math.pow(60, tone)), biquad(ctx, "highshelf", 4000, 0.707, tone * 6)];
  return [];
}

/** Renders the layers through the effects. Peaks at -1 dBFS, with the silent tail trimmed. */
export async function renderSound(parts: Part[], fx: Effects): Promise<AudioBuffer> {
  if (!parts.length) throw new Error("Nothing to render");
  // The earliest layer starts at 0, so there's never silence at the front
  const lead = Math.min(...parts.map((p) => p.delay));
  const end = Math.max(...parts.map((p) => (p.delay - lead) / 1000 + p.buf.duration / rateOf(p.pitch)));
  const reverbOn = fx.reverb > 0.005;
  const room = roomSeconds(fx.room);
  const dur = Math.min(MAX_RENDER_SECONDS, end + (reverbOn ? room : 0) + 0.02);
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);

  const mix = ctx.createGain();
  for (const p of parts) {
    const n = ctx.createBufferSource();
    n.buffer = p.reverse ? reversed(p.buf) : p.buf;
    n.playbackRate.value = rateOf(p.pitch);
    chain(n, ...toneFilters(ctx, p.tone), gainNode(ctx, dbToGain(p.volume)), mix);
    n.start((p.delay - lead) / 1000);
  }

  let out: AudioNode = mix;
  if (fx.distort > 0.005) out = chain(out, gainNode(ctx, 1 + fx.distort * 5), shaper(ctx, fx.distort));
  if (fx.compress > 0.005) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = lerp(-6, -42, fx.compress);
    c.ratio.value = lerp(2, 12, fx.compress);
    c.knee.value = 6;
    c.attack.value = 0.006; // lets the first few ms of the hit through
    c.release.value = 0.12;
    out = chain(out, c);
  }
  if (reverbOn) {
    out.connect(gainNode(ctx, 1 - fx.reverb * 0.5)).connect(ctx.destination);
    const conv = ctx.createConvolver();
    // Same room for every variation, so variations differ only where you asked them to
    conv.buffer = makeIR(ctx, room, mulberry32(77), lerp(0.7, 0.35, fx.room));
    out.connect(conv).connect(gainNode(ctx, fx.reverb * 1.2)).connect(ctx.destination);
  } else out.connect(ctx.destination);

  const buf = await ctx.startRendering();
  return finish(buf, fx.lofi);
}

/** Bitcrush (lofi > 0), normalize to -1 dBFS, trim the silent tail and fade out. */
export function finish(buf: AudioBuffer, lofi = 0): AudioBuffer {
  const d = buf.getChannelData(0);
  if (lofi > 0.005) {
    const q = Math.pow(2, Math.round(lerp(12, 3, lofi)) - 1);
    const hold = Math.max(1, Math.round(lerp(1, 12, lofi)));
    let held = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % hold === 0) held = Math.round(d[i] * q) / q;
      d[i] = held;
    }
  }
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const norm = peak > 0 ? 0.891 / peak : 1;
  let last = d.length - 1;
  while (last > 0 && Math.abs(d[last] * norm) < 0.0005) last--;
  const len = Math.min(d.length, last + Math.floor(0.005 * buf.sampleRate) + 1);
  const out = new AudioBuffer({ length: Math.max(1, len), sampleRate: buf.sampleRate, numberOfChannels: 1 });
  const o = out.getChannelData(0);
  const fade = Math.min(len, Math.floor(0.008 * buf.sampleRate));
  for (let i = 0; i < len; i++) {
    o[i] = d[i] * norm;
    if (i > len - fade) o[i] *= (len - i) / fade;
  }
  return out;
}

// ---- Variations ----

/** What makes one variation different. Saved, so a pack can be rebuilt exactly. */
export interface VarSpec {
  seed: number;
  /** Semitones added to every layer. */
  pitch: number;
  /** Take index used by each layer. */
  takes: number[];
}

/** Applies a variation to the layer settings: its pitch, plus small seeded nudges to pitch, tone and timing. */
export function nudge(layers: LayerSettings[], spec: VarSpec, spread: Spread): LayerSettings[] {
  const rand = mulberry32(spec.seed);
  const tone = (rand() * 2 - 1) * spread.tone * 0.5;
  return layers.map((s, i) => ({
    ...s,
    pitch: s.pitch + spec.pitch + (rand() * 2 - 1) * spread.pitch * 0.15,
    tone: Math.max(-1, Math.min(1, s.tone + tone + (rand() * 2 - 1) * spread.tone * 0.15)),
    delay: i === 0 ? s.delay : Math.max(0, s.delay + (rand() * 2 - 1) * spread.timing * 40),
  }));
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pitch offsets for a set of n, spaced evenly across ±spread and shuffled, so no two sound alike. */
export function spreadPitches(n: number, spread: number, rand: () => number): number[] {
  if (spread <= 0 || n < 1) return Array<number>(Math.max(0, n)).fill(0);
  const slot = (2 * spread) / n;
  const p = Array.from({ length: n }, (_, i) => -spread + slot * (i + 0.5) + (rand() - 0.5) * slot * 0.6);
  return shuffle(p, rand);
}

/** A take for each of n variations: every take is used before any repeats, and never twice in a row. */
export function takeOrder(n: number, takeCount: number, rand: () => number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const round = shuffle(Array.from({ length: takeCount }, (_, i) => i), rand);
    if (takeCount > 1 && round[0] === out[out.length - 1]) round.push(round.shift()!);
    out.push(...round);
  }
  return out.slice(0, n);
}
