/**
 * Changes a sound's length without changing its pitch: the output is about `factor` times as long.
 * WSOLA: short overlapping windows are copied to the output at a fixed spacing, each one taken from
 * near its nominal place in the input where it lines up best with what came before, so the
 * waveform stays continuous and there's no phasey "chorus".
 */
export function stretch(d: Float32Array, factor: number, sampleRate: number): Float32Array<ArrayBuffer> {
  const outLen = Math.max(1, Math.round(d.length * factor));
  if (Math.abs(factor - 1) < 0.005) return new Float32Array(d);
  const N = 2 * Math.round(0.01 * sampleRate); // 20 ms windows, 50% overlap
  const hop = N / 2;
  const tol = Math.round(0.006 * sampleRate); // search ±6 ms
  const n = d.length;
  if (n < N) return new Float32Array(outLen).fill(0).map((_, i) => d[Math.min(n - 1, Math.floor(i / factor))]);

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const out = new Float32Array(outLen + N);
  const norm = new Float32Array(outLen + N);
  const last = n - N;

  // How well the window at `pos` continues the one copied before (its natural next part starts at `want`)
  const score = (want: number, pos: number) => {
    let s = 0;
    for (let i = 0; i < hop; i += 2) s += d[want + i] * d[pos + i];
    return s;
  };

  let prev = 0;
  for (let op = 0; op < outLen; op += hop) {
    const nominal = Math.min(last, Math.round(op / factor));
    let best = nominal;
    if (op > 0) {
      const want = Math.min(last, prev + hop);
      const lo = Math.max(0, nominal - tol);
      const hi = Math.min(last, nominal + tol);
      let top = -Infinity;
      // Coarse pass every 2 samples, then check the neighbors
      for (let p = lo; p <= hi; p += 2) {
        const s = score(want, p);
        if (s > top) {
          top = s;
          best = p;
        }
      }
      for (const p of [best - 1, best + 1]) {
        if (p >= lo && p <= hi) {
          const s = score(want, p);
          if (s > top) {
            top = s;
            best = p;
          }
        }
      }
    }
    for (let i = 0; i < N; i++) {
      out[op + i] += d[best + i] * win[i];
      norm[op + i] += win[i];
    }
    prev = best;
  }
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : out[i];
  return res;
}
