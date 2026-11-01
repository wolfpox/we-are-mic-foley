import { RECIPES, defaultParams } from "../recipes";
import type { Mono, Range } from "../dsp/prep";
import type { Params } from "../recipes/types";

export interface Variation {
  seed: number;
  name: string;
  /** False once the person discards it. Discarded variations are left out of the export. */
  kept: boolean;
  /** As rendered (peak at -1 dBFS). */
  rendered: AudioBuffer;
  /** What you hear and what's exported: `rendered` times `gain`. */
  buf: AudioBuffer;
  gain: number;
}

/** Settings the current variations were made with, saved into recipe.json on export. */
export interface VariationMeta {
  recipe: string;
  params: Params;
  variation: number;
  source: string;
  /** Selected part of the source, in milliseconds. */
  sourceTrimMs: [number, number];
  noiseCleanup: number;
}

export const state = {
  /** The whole recording, upload or example, before trimming. */
  raw: null as Mono | null,
  /** Part of `raw` in use. */
  trim: null as Range | null,
  /** Background noise cleanup, 0 (off) to 1. */
  gate: 0,
  /** The trimmed, cleaned source that recipes are rendered from. */
  src: null as AudioBuffer | null,
  srcName: "",
  recipe: RECIPES[0].id,
  /** Slider values per recipe, so switching recipes keeps each one's settings. */
  params: Object.fromEntries(RECIPES.map((r) => [r.id, defaultParams(r)])) as Record<string, Params>,
  out: null as AudioBuffer | null,
  /** Match the loudness of kept variations instead of only their peaks. */
  evenLoudness: true,
  vars: [] as Variation[],
  varMeta: null as VariationMeta | null,
};
