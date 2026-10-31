import { criticalHit } from "./criticalHit";
import { footstepHard } from "./footstepHard";
import { footstepSoft } from "./footstepSoft";
import { impactHard } from "./impactHard";
import type { Params, Recipe } from "./types";
import { whiff } from "./whiff";

export const RECIPES: Recipe[] = [footstepHard, footstepSoft, impactHard, criticalHit, whiff];

export const byId: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export const defaultParams = (r: Recipe): Params => Object.fromEntries(r.params.map((p) => [p.id, p.def]));
