import type { Mono, Range } from "../dsp/prep";
import { DEFAULT_FX, DEFAULT_SPREAD, defaultLayer, type Effects, type Layer, type Spread, type VarSpec } from "../dsp/sound";

/** One recording in your library. */
export interface Clip {
  id: string;
  /** The whole recording. Never changed after it's made, so it can be shared freely. */
  raw: Mono;
  /** The separate sounds in it. */
  takes: Range[];
  /** Background noise cleanup, 0 (off) to 1. */
  gate: number;
  /** When it was recorded (ms since 1970). */
  at: number;
  tags: string[];
  projects: string[];
}

export type SavedVar = VarSpec & { kept: boolean };

/** The settings the variations were made with, so they can be rebuilt and discarded ones remade to match. */
export interface VarMeta {
  layers: Layer[];
  fx: Effects;
  spread: Spread;
  name: string;
  /** Copies of the recordings as they were (takes and cleanup can change later). */
  sources: Clip[];
}

/** A sound effect made from a recording: its layers, effects and variations. */
export interface Design {
  layers: Layer[];
  fx: Effects;
  spread: Spread;
  count: number;
  /** Base for exported file names, e.g. footstep → footstep_01.ogg. */
  name: string;
  vars: SavedVar[];
  varMeta: VarMeta | null;
}

export interface CheckItem {
  name: string;
  done: boolean;
}

/** Everything you've made. Undo and autosave work on this. */
export interface Library {
  clips: Clip[];
  /** Sound effects, keyed by the recording they were made from. */
  designs: Record<string, Design>;
  projects: string[];
  checklist: CheckItem[];
}

export interface Variation extends VarSpec {
  name: string;
  kept: boolean;
  /** As rendered (peak at -1 dBFS). */
  rendered: AudioBuffer;
  /** What you hear and what's exported: `rendered` times `gain`. */
  buf: AudioBuffer;
  gain: number;
}

export type Screen = "home" | "checklist" | "guide" | "sound";

export const newLibrary = (): Library => ({ clips: [], designs: {}, projects: [], checklist: [] });

export const newDesign = (clip: Clip): Design => ({
  layers: [defaultLayer(clip.id)],
  fx: { ...DEFAULT_FX },
  spread: { ...DEFAULT_SPREAD },
  count: 8,
  name: fileBase(clip.tags.find((t) => t !== "example") ?? "sound"),
  vars: [],
  varMeta: null,
});

export const state = {
  lib: newLibrary(),
  screen: "home" as Screen,
  /** Recording whose sound effect is open on the sound screen. */
  soundId: "",
  /** Recording expanded in the list. */
  openId: "",
  /** List filter: "all", "untagged", a tag, or "p:" + project. */
  filter: "all",
  selTake: 0,
  /** The base sound, as previewed. */
  out: null as AudioBuffer | null,
  /** Match the loudness of kept variations instead of only their peaks. */
  evenLoudness: true,
  /** Rendered variations of the open sound. */
  vars: [] as Variation[],
};

export const clipById = (id: string, clips = state.lib.clips): Clip | undefined => clips.find((c) => c.id === id);
/** The open sound effect. */
export const design = (): Design | undefined => state.lib.designs[state.soundId];
export const keptCount = (d: Design | undefined) => d?.vars.filter((v) => v.kept).length ?? 0;

export const copyClip = (c: Clip): Clip => ({ ...c, takes: c.takes.map((r) => ({ ...r })), tags: [...c.tags], projects: [...c.projects] });

export function copyDesign(d: Design): Design {
  return {
    ...d,
    layers: d.layers.map((l) => ({ ...l })),
    fx: { ...d.fx },
    spread: { ...d.spread },
    vars: d.vars.map((v) => ({ ...v, takes: [...v.takes] })),
    varMeta: d.varMeta && { ...d.varMeta, layers: d.varMeta.layers.map((l) => ({ ...l })), sources: d.varMeta.sources.map(copyClip) },
  };
}

/** Copies the library. Recordings are shared, not copied (they never change). */
export function copyLibrary(l: Library): Library {
  return {
    clips: l.clips.map(copyClip),
    designs: Object.fromEntries(Object.entries(l.designs).map(([k, d]) => [k, copyDesign(d)])),
    projects: [...l.projects],
    checklist: l.checklist.map((c) => ({ ...c })),
  };
}

/** Recordings the layers use. */
export const usedClips = (layers: Layer[]): Clip[] => state.lib.clips.filter((c) => layers.some((l) => l.clip === c.id));

/** A text fingerprint of what shapes the sound, for "did anything change?". Recordings are identified by id. */
export const soundKey = (layers: Layer[], fx: Effects, spread: Spread, clips: Clip[]): string =>
  JSON.stringify({ layers, fx, spread, clips: clips.map((c) => [c.id, c.takes, c.gate]) });

/** Lowercase letters, digits, - and _ only, so the names work in every engine and file system. */
export const fileBase = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "sound";

const DAY = 86400000;

/** "9:01pm" */
export function timeText(t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** "Today", "Yesterday" or "Thursday, Oct 29". */
export function dayText(t: number): string {
  const day = (x: number) => new Date(x).setHours(0, 0, 0, 0);
  const diff = Math.round((day(Date.now()) - day(t)) / DAY);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(t).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

/** Short name for a recording in menus: "Today 9:01pm · step". */
export function clipLabel(c: Clip): string {
  const tags = c.tags.filter((t) => t !== "example");
  return `${dayText(c.at).split(",")[0]} ${timeText(c.at)}${tags.length ? " · " + tags.slice(0, 2).join(", ") : ""}`;
}

export const seconds = (c: Clip) => `${(c.raw.data.length / c.raw.sampleRate).toFixed(1)} s`;

let n = 0;
export const uid = () => `${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
