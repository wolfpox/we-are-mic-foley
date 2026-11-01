import { lerp } from "./rng";

/** Longest take, in seconds. Game sounds are short. */
export const MAX_SOURCE_SECONDS = 3;
/** Longest recording or upload kept for trimming, in seconds. */
export const MAX_RAW_SECONDS = 30;

/** A mono recording before trimming. */
export interface Mono {
  data: Float32Array;
  sampleRate: number;
}

/** Selected part of a recording, in samples. end is exclusive. */
export interface Range {
  start: number;
  end: number;
}

/** Mixes to mono and keeps at most maxSeconds. Returns null if the input is silent. */
export function toMono(buf: AudioBuffer, maxSeconds = MAX_RAW_SECONDS): Mono | null {
  const n = Math.min(buf.length, Math.floor(maxSeconds * buf.sampleRate));
  const ch = buf.numberOfChannels;
  const data = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) data[i] += d[i] / ch;
  }
  return peakOf(data) < 1e-4 ? null : { data, sampleRate: buf.sampleRate };
}

function peakOf(d: Float32Array, start = 0, end = d.length): number {
  let peak = 0;
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(d[i]));
  return peak;
}

/**
 * Background level, measured before the first sound starts (where a recording has only room hiss):
 * the median peak of the 10 ms blocks there. 0 if there's too little lead-in to tell.
 */
function noiseFloor(d: Float32Array, sampleRate: number, onset: number): number {
  const block = Math.max(1, Math.floor(0.01 * sampleRate));
  const peaks: number[] = [];
  for (let a = 0; a + block <= onset; a += block) peaks.push(peakOf(d, a, a + block));
  if (peaks.length < 5) return 0;
  peaks.sort((x, y) => x - y);
  return peaks[Math.floor(peaks.length / 2)];
}

/** Most takes found in one recording. */
export const MAX_TAKES = 16;

/**
 * Finds each separate sound in a recording (a "take"): from just before it starts to just after
 * it fades, ending at a pause of 150 ms or more, each at most MAX_SOURCE_SECONDS long. Sounds much
 * quieter than the loudest one (bumps, breaths) are skipped. Always returns at least one take.
 */
export function findTakes(m: Mono): Range[] {
  const { data: d, sampleRate: sr } = m;
  const n = d.length;
  const peak = peakOf(d);
  const onset = peak * 0.06;
  const next = (from: number) => {
    let i = from;
    while (i < n && Math.abs(d[i]) < onset) i++;
    return i;
  };
  let a = next(0);
  // "Quiet" means below 1% of the peak, or close to the background noise if that is louder
  const quiet = Math.max(peak * 0.01, noiseFloor(d, sr, a) * 2);
  const pause = Math.floor(0.15 * sr);
  const pre = Math.floor(0.004 * sr);
  const post = Math.floor(0.02 * sr);
  const max = Math.floor(MAX_SOURCE_SECONDS * sr);
  const found: Range[] = [];
  while (a < n) {
    let b = a;
    for (let i = a, run = 0; i < n; i++) {
      if (Math.abs(d[i]) >= quiet) {
        b = i;
        run = 0;
      } else if (++run >= pause) break;
    }
    const start = Math.max(0, a - pre, found.length ? found[found.length - 1].end : 0);
    const end = Math.min(n, b + post, start + max);
    found.push({ start, end: Math.max(start + 1, end) });
    a = next(b + 1);
  }
  if (!found.length) return [{ start: 0, end: Math.max(1, Math.min(n, max)) }];
  const loud = found.filter((r) => peakOf(d, r.start, r.end) >= peak * 0.25);
  return (loud.length ? loud : found).slice(0, MAX_TAKES);
}

/** The first take: the part worth using when only one is needed. */
export function autoTrim(m: Mono): Range {
  return findTakes(m)[0];
}

/** Keeps a range within the recording, at least 10 ms and at most MAX_SOURCE_SECONDS long. */
export function clampRange(n: number, sampleRate: number, r: Range, moving: "start" | "end" = "end"): Range {
  const min = Math.min(n, Math.floor(0.01 * sampleRate));
  const max = Math.floor(MAX_SOURCE_SECONDS * sampleRate);
  let start = Math.max(0, Math.min(Math.round(r.start), n - min));
  let end = Math.max(start + min, Math.min(Math.round(r.end), n));
  if (end - start > max) {
    if (moving === "start") end = start + max;
    else start = end - max;
  }
  return { start, end };
}

/**
 * Downward expander that turns down background noise between sounds. amount 0 is off;
 * 1 is strong. Looks a couple of milliseconds ahead so attacks aren't clipped.
 */
export function noiseGate(d: Float32Array, sampleRate: number, amount: number): Float32Array {
  const out = new Float32Array(d);
  if (amount <= 0.001) return out;
  const peak = peakOf(d);
  if (peak === 0) return out;
  const threshold = peak * Math.pow(10, lerp(-55, -18, amount) / 20);
  const ratio = lerp(2, 10, amount);
  const look = Math.floor(0.002 * sampleRate);
  const envRelease = Math.exp(-1 / (0.02 * sampleRate));
  const gainRelease = Math.exp(-1 / (0.05 * sampleRate));
  let env = 0;
  let gain = 0;
  // Prime the envelope with the lookahead window
  for (let i = 0; i < Math.min(look, d.length); i++) env = Math.max(Math.abs(d[i]), env * envRelease);
  for (let i = 0; i < d.length; i++) {
    const ahead = i + look < d.length ? Math.abs(d[i + look]) : 0;
    env = Math.max(ahead, env * envRelease);
    const target = env >= threshold ? 1 : Math.pow(env / threshold, ratio - 1);
    // Open instantly, close smoothly
    gain = target > gain ? target : gain * gainRelease + target * (1 - gainRelease);
    out[i] = d[i] * gain;
  }
  return out;
}

/** Cuts the range out of the recording, cleans it up and normalizes it to a 0.9 peak. */
export function sliceSource(m: Mono, r: Range, gate = 0): AudioBuffer | null {
  const sel = noiseGate(m.data.subarray(r.start, r.end), m.sampleRate, gate);
  const peak = peakOf(sel);
  if (peak < 1e-4) return null;
  const out = new AudioBuffer({ length: Math.max(1, sel.length), sampleRate: m.sampleRate, numberOfChannels: 1 });
  const o = out.getChannelData(0);
  for (let i = 0; i < o.length; i++) o[i] = (sel[i] * 0.9) / peak;
  return out;
}

/**
 * One-step cleanup with automatic trimming: mono, trimmed, normalized, at most MAX_SOURCE_SECONDS.
 * Returns null if the input is silent.
 */
export function prepSource(buf: AudioBuffer): AudioBuffer | null {
  const m = toMono(buf, Infinity);
  return m && sliceSource(m, autoTrim(m));
}
