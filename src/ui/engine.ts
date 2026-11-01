import { sliceSource } from "../dsp/prep";
import { ALL_TAKES, nudge, renderSound, type Effects, type Layer, type Part, type Spread, type VarSpec } from "../dsp/sound";
import { clipById, type Clip } from "./state";

// Turns layers and recordings into audio. Cleaned-up takes are cached, since slider moves re-render often.

const cache = new Map<string, AudioBuffer | null>();

/** One take of a recording, trimmed, cleaned up and normalized. null if it's silent. */
export function takeBuffer(c: Clip, i: number): AudioBuffer | null {
  const t = c.takes[Math.max(0, Math.min(i, c.takes.length - 1))];
  const key = `${c.id}|${t.start}|${t.end}|${c.gate}`;
  if (!cache.has(key)) {
    if (cache.size > 300) cache.clear();
    cache.set(key, sliceSource(c.raw, t, c.gate));
  }
  return cache.get(key) ?? null;
}

/** Take a layer plays when nothing varies it: its chosen take, or the first. */
export const baseTake = (l: Layer) => (l.take === ALL_TAKES ? 0 : l.take);

/** Layers ready to render, with the given take for each. Layers whose recording is missing or silent are skipped. */
export function partsFor(layers: Layer[], clips: Clip[], takes: number[]): Part[] {
  const parts: Part[] = [];
  layers.forEach((l, i) => {
    const c = clipById(l.clip, clips);
    const buf = c && takeBuffer(c, takes[i]);
    if (buf) parts.push({ ...l, buf });
  });
  return parts;
}

/** The base sound: every layer as set, no variation. */
export function renderBase(layers: Layer[], fx: Effects, clips: Clip[]): Promise<AudioBuffer> | null {
  const parts = partsFor(layers, clips, layers.map(baseTake));
  return parts.length ? renderSound(parts, fx) : null;
}

/** One variation. */
export function renderVariation(layers: Layer[], fx: Effects, spread: Spread, clips: Clip[], spec: VarSpec): Promise<AudioBuffer> | null {
  const varied = nudge(layers, spec, spread).map((s, i) => ({ ...layers[i], ...s }));
  const parts = partsFor(varied, clips, spec.takes);
  return parts.length ? renderSound(parts, fx) : null;
}
