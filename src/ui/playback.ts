let actx: AudioContext | null = null;
let current: { node: AudioBufferSourceNode; onEnd?: () => void } | null = null;

/** The live audio context, created on first use (browsers require a user gesture). */
export function audio(): AudioContext {
  if (!actx) actx = new AudioContext();
  if (actx.state === "suspended") void actx.resume();
  return actx;
}

/** Stops whatever is playing. Its onEnd runs straight away, so its playhead resets. */
export function stop(): void {
  const c = current;
  current = null;
  if (!c) return;
  try {
    c.node.stop();
  } catch {
    // already stopped
  }
  c.onEnd?.();
}

/** Plays a buffer, stopping whatever was playing. onEnd runs once, when it ends or is stopped. */
export function play(buf: AudioBuffer | null, onEnd?: () => void): void {
  stop();
  if (!buf) return;
  const ctx = audio();
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.onended = () => {
    if (current?.node !== node) return;
    current = null;
    onEnd?.();
  };
  node.start();
  current = { node, onEnd };
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Draws a waveform scaled to its own peak between samples a and b, so quiet recordings are still
 * easy to see. Mirrored bars, at least a hairline where it's silent.
 */
export function drawWave(canvas: HTMLCanvasElement, d: Float32Array | null, color = "--wave", a = 0, b = d?.length ?? 0): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!d || b <= a) return;
  let peak = 0;
  for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(d[i]));
  const step = (b - a) / w;
  const mid = h / 2;
  g.fillStyle = cssVar(color);
  for (let x = 0; x < w; x++) {
    let m = 0;
    const i0 = a + Math.floor(x * step);
    const i1 = Math.min(b, Math.max(i0 + 1, a + Math.floor((x + 1) * step)));
    for (let i = i0; i < i1; i++) m = Math.max(m, Math.abs(d[i]));
    const y = Math.max(0.75, (m / (peak || 1)) * mid * 0.92);
    g.fillRect(x, mid - y, 1, y * 2);
  }
}
