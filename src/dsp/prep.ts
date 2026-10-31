/** Longest source kept after the first sound, in seconds. */
export const MAX_SOURCE_SECONDS = 3;

/**
 * Cleans up a recording or upload: mixes to mono, trims silence at both ends,
 * normalizes and keeps at most MAX_SOURCE_SECONDS. Returns null if the input is silent.
 */
export function prepSource(buf: AudioBuffer): AudioBuffer | null {
  const n = buf.length;
  const ch = buf.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
  if (peak < 1e-4) return null;
  let a = 0;
  while (a < n && Math.abs(mono[a]) < peak * 0.06) a++;
  let b = n - 1;
  while (b > a && Math.abs(mono[b]) < peak * 0.01) b--;
  const sr = buf.sampleRate;
  a = Math.max(0, a - Math.floor(0.004 * sr));
  b = Math.min(n, b + Math.floor(0.02 * sr), a + MAX_SOURCE_SECONDS * sr);
  const out = new AudioBuffer({ length: Math.max(1, b - a), sampleRate: sr, numberOfChannels: 1 });
  const o = out.getChannelData(0);
  for (let i = 0; i < o.length; i++) o[i] = (mono[a + i] * 0.9) / peak;
  return out;
}
