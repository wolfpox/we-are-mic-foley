import type { Faders } from "../dsp/faders";
import { sliceSource } from "../dsp/prep";
import { renderFaders } from "../dsp/sound";
import type { Clip } from "./state";

// Turns a take and fader settings into audio. Cleaned-up takes are cached, since fader moves re-render often.

const cache = new Map<string, AudioBuffer | null>();

/** One take of a recording, trimmed, cleaned up and normalized. null if it's silent. */
export function takeBuffer(c: Clip, i: number, clean = 0): AudioBuffer | null {
  const t = c.takes[Math.max(0, Math.min(i, c.takes.length - 1))];
  if (!t) return null;
  const key = `${c.id}|${c.raw.data.length}|${t.start}|${t.end}|${clean}`;
  if (!cache.has(key)) {
    if (cache.size > 300) cache.clear();
    cache.set(key, sliceSource(c.raw, t, clean));
  }
  return cache.get(key) ?? null;
}

/** One take through the faders. null if the take is silent. */
export function renderTake(c: Clip, i: number, f: Faders): Promise<AudioBuffer> | null {
  const buf = takeBuffer(c, i, f.clean);
  return buf ? renderFaders(buf, f) : null;
}
