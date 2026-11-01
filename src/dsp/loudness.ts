// Perceived loudness per ITU-R BS.1770 / EBU R128: K-weighting filter, then mean square over
// 400 ms windows ("momentary" loudness). For short game sounds we use the loudest window.

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * The two K-weighting stages for any sample rate (Brecht De Man's derivation). At 48 kHz this
 * reproduces the coefficients printed in BS.1770 to 12 decimal places.
 */
function kWeighting(sampleRate: number): [Biquad, Biquad] {
  // Stage 1: high shelf, about +4 dB above 1.5 kHz (models the head)
  let K = Math.tan((Math.PI * 1681.9744509555319) / sampleRate);
  let Q = 0.7071752369554193;
  const Vh = Math.pow(10, 3.99984385397 / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: high pass at about 38 Hz. The standard leaves its numerator unnormalized.
  K = Math.tan((Math.PI * 38.13547087613982) / sampleRate);
  Q = 0.5003270373253953;
  a0 = 1 + K / Q + K * K;
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, hp];
}

function filter(d: Float32Array, f: Biquad): Float32Array {
  const out = new Float32Array(d.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Loudest momentary loudness in LUFS: the loudest 400 ms window, stepped every 10 ms.
 * Sounds shorter than 400 ms are measured as if followed by silence, as the standard does.
 */
export function maxMomentaryLoudness(d: Float32Array, sampleRate: number): number {
  const [shelf, hp] = kWeighting(sampleRate);
  const k = filter(filter(d, shelf), hp);
  const win = Math.round(0.4 * sampleRate);
  const step = Math.max(1, Math.round(0.01 * sampleRate));
  // Running sum of squares, so each window costs O(1)
  const cum = new Float64Array(k.length + 1);
  for (let i = 0; i < k.length; i++) cum[i + 1] = cum[i] + k[i] * k[i];
  let best = 0;
  const last = Math.max(0, k.length - win);
  for (let a = 0; a <= last; a += step) {
    const b = Math.min(k.length, a + win);
    best = Math.max(best, (cum[b] - cum[a]) / win);
  }
  if (last % step) best = Math.max(best, (cum[k.length] - cum[last]) / win);
  return best > 0 ? -0.691 + 10 * Math.log10(best) : -Infinity;
}

const peakOf = (d: Float32Array) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/**
 * Gains (linear) that make every sound equally loud without any peak going over `ceiling`.
 * Louder sounds are turned down to match; nothing is turned up past its headroom.
 */
export function matchLoudnessGains(sounds: Float32Array[], sampleRate: number, ceiling = 0.891): number[] {
  if (!sounds.length) return [];
  const loud = sounds.map((d) => maxMomentaryLoudness(d, sampleRate));
  const headroomDb = sounds.map((d) => 20 * Math.log10(ceiling / Math.max(peakOf(d), 1e-9)));
  const finite = loud.filter(Number.isFinite);
  if (!finite.length) return sounds.map(() => 1);
  const target = Math.min(...loud.map((l, i) => (Number.isFinite(l) ? l + headroomDb[i] : Infinity)));
  return loud.map((l) => (Number.isFinite(l) ? Math.pow(10, (target - l) / 20) : 1));
}
