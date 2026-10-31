/** Reads a 16-bit mono PCM WAV (as written by encodeWav) back into samples in -1..1. */
export function decodeWav16(ab: ArrayBuffer): { sampleRate: number; samples: Float32Array } {
  const v = new DataView(ab);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(36) !== "data") throw new Error("Not a WAV written by encodeWav");
  const n = v.getUint32(40, true) / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = v.getInt16(44 + i * 2, true);
    samples[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return { sampleRate: v.getUint32(24, true), samples };
}

export function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let m = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}
