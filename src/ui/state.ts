import { RECIPES, defaultParams } from "../recipes";
import type { Params } from "../recipes/types";

export interface Variation {
  seed: number;
  name: string;
  /** False once the person discards it. Discarded variations are left out of the export. */
  kept: boolean;
  buf: AudioBuffer;
}

/** Settings the current variations were made with, saved into recipe.json on export. */
export interface VariationMeta {
  recipe: string;
  params: Params;
  variation: number;
  source: string;
}

export const state = {
  src: null as AudioBuffer | null,
  srcName: "",
  recipe: RECIPES[0].id,
  /** Slider values per recipe, so switching recipes keeps each one's settings. */
  params: Object.fromEntries(RECIPES.map((r) => [r.id, defaultParams(r)])) as Record<string, Params>,
  out: null as AudioBuffer | null,
  vars: [] as Variation[],
  varMeta: null as VariationMeta | null,
};
