let actx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

/** The live audio context, created on first use (browsers require a user gesture). */
export function audio(): AudioContext {
  if (!actx) actx = new AudioContext();
  if (actx.state === "suspended") void actx.resume();
  return actx;
}

/** Plays a buffer, stopping whatever was playing. */
export function play(buf: AudioBuffer | null, onEnd?: () => void): void {
  if (!buf) return;
  const ctx = audio();
  if (current) {
    try {
      current.stop();
    } catch {
      // already stopped
    }
  }
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.connect(ctx.destination);
  n.onended = onEnd ?? null;
  n.start();
  current = n;
}

/** Plays buffers one after another with a short gap, e.g. source then result. */
export function playSequence(bufs: (AudioBuffer | null)[], gapMs = 250): void {
  const list = bufs.filter((b): b is AudioBuffer => !!b);
  const next = (i: number) => {
    if (i < list.length) play(list[i], () => setTimeout(() => next(i + 1), gapMs));
  };
  next(0);
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Draws a waveform. `bands` marks parts of it (e.g. takes) in sample positions. */
export function drawWave(canvas: HTMLCanvasElement, buf: AudioBuffer | Float32Array | null, bands: { start: number; end: number }[] = []): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, w * dpr);
  canvas.height = Math.max(1, h * dpr);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = cssVar("--wave-dim");
  g.fillRect(0, h / 2 - 0.5, w, 1);
  if (!buf) return;
  const d = buf instanceof Float32Array ? buf : buf.getChannelData(0);
  const step = d.length / w;
  g.fillStyle = cssVar("--band");
  for (const b of bands) g.fillRect(b.start / step, 0, Math.max(1, (b.end - b.start) / step), h);
  g.fillStyle = cssVar("--wave");
  for (let x = 0; x < w; x++) {
    let mn = 1;
    let mx = -1;
    const a = Math.floor(x * step);
    const b = Math.max(a + 1, Math.floor((x + 1) * step));
    for (let i = a; i < b && i < d.length; i++) {
      if (d[i] < mn) mn = d[i];
      if (d[i] > mx) mx = d[i];
    }
    if (mx < mn) continue;
    g.fillRect(x, ((1 - mx) * h) / 2, 1, Math.max(1, ((mx - mn) * h) / 2));
  }
}

export const ms = (buf: AudioBuffer | null): string => (buf ? Math.round(buf.duration * 1000) + " ms" : "");
