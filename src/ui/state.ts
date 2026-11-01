import type { Mono, Range } from "../dsp/prep";
import { DEFAULT_FX, DEFAULT_SPREAD, type Effects, type Layer, type Spread, type VarSpec } from "../dsp/sound";

/** One recording in your library. */
export interface Clip {
  id: string;
  name: string;
  /** The whole recording. Never changed after it's made, so it can be shared freely. */
  raw: Mono;
  /** The separate sounds in it. */
  takes: Range[];
  /** Background noise cleanup, 0 (off) to 1. */
  gate: number;
}

/** Everything you're making: undo, autosave and export all work on this. */
export interface Project {
  clips: Clip[];
  layers: Layer[];
  fx: Effects;
  spread: Spread;
  /** How many variations to make. */
  count: number;
  /** Base for exported file names, e.g. footstep → footstep_01.ogg. */
  name: string;
}

export interface Variation extends VarSpec {
  name: string;
  /** False once the person discards it. Discarded variations are left out of the export. */
  kept: boolean;
  /** As rendered (peak at -1 dBFS). */
  rendered: AudioBuffer;
  /** What you hear and what's exported: `rendered` times `gain`. */
  buf: AudioBuffer;
  gain: number;
}

/** The settings the current variations were made with, so discarded ones can be remade to match. */
export interface VarMeta {
  layers: Layer[];
  fx: Effects;
  spread: Spread;
  name: string;
  /** Copies of the recordings as they were (takes and cleanup can change later). */
  sources: Clip[];
}

export const newProject = (): Project => ({
  clips: [],
  layers: [],
  fx: { ...DEFAULT_FX },
  spread: { ...DEFAULT_SPREAD },
  count: 8,
  name: "sound",
});

export const state = {
  project: newProject(),
  /** Recording and take shown in the editor. */
  selClip: "",
  selTake: 0,
  /** The base sound, as previewed. */
  out: null as AudioBuffer | null,
  /** Match the loudness of kept variations instead of only their peaks. */
  evenLoudness: true,
  vars: [] as Variation[],
  varMeta: null as VarMeta | null,
};

export const clipById = (id: string, clips = state.project.clips): Clip | undefined => clips.find((c) => c.id === id);

/** Copies a project. Recordings are shared, not copied (they never change). */
export function copyProject(p: Project): Project {
  return {
    clips: p.clips.map(copyClip),
    layers: p.layers.map((l) => ({ ...l })),
    fx: { ...p.fx },
    spread: { ...p.spread },
    count: p.count,
    name: p.name,
  };
}

export const copyClip = (c: Clip): Clip => ({ ...c, takes: c.takes.map((r) => ({ ...r })) });

/** Recordings the layers use. */
export const usedClips = (p: Project): Clip[] => p.clips.filter((c) => p.layers.some((l) => l.clip === c.id));

/** A text fingerprint of what shapes the sound, for "did anything change?". Recordings are identified by id. */
export const soundKey = (layers: Layer[], fx: Effects, spread: Spread, clips: Clip[]): string =>
  JSON.stringify({ layers, fx, spread, clips: clips.map((c) => [c.id, c.takes, c.gate]) });

let n = 0;
export const uid = () => `${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
