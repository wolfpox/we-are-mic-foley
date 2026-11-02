import { anySet, defaultFaders, type FaderKey, type Faders } from "../dsp/faders";
import type { Mono, Range } from "../dsp/prep";

/** One recording in your library. */
export interface Clip {
  id: string;
  /**
   * The recording. Replaced (never changed in place) when a new take is recorded into it, so
   * undo snapshots can share it.
   */
  raw: Mono;
  /** The separate sounds in it. */
  takes: Range[];
  /** When it was recorded (ms since 1970). */
  at: number;
  /** Optional; tags stand in for it. */
  name: string;
  tags: string[];
  projects: string[];
}

/** A named set of fader settings, e.g. "slow" or "crunchy". Each one is exported once per take. */
export interface SavedVar {
  name: string;
  f: Faders;
}

/** How a recording is made into a sound effect. */
export interface Design {
  /** The faders as they are now. */
  f: Faders;
  vars: SavedVar[];
  /** Name of the variation last picked or saved, or "" if none. */
  loaded: string;
  /** Faders that dragging, reset and Random leave alone. */
  locks: FaderKey[];
}

export interface CheckItem {
  name: string;
  done: boolean;
}

/** Everything you've made. Undo and autosave work on this. */
export interface Library {
  clips: Clip[];
  /** Keyed by recording id. */
  designs: Record<string, Design>;
  projects: string[];
  checklist: CheckItem[];
}

export type Screen = "home" | "checklist" | "guide";

export const newLibrary = (): Library => ({ clips: [], designs: {}, projects: [], checklist: [] });
export const newDesign = (): Design => ({ f: defaultFaders(), vars: [], loaded: "", locks: [] });

/** Nothing set, saved or locked yet: the same as having no design. */
export const pristine = (d: Design) => !d.vars.length && !d.locks.length && !d.loaded && !anySet(d.f);

export const state = {
  lib: newLibrary(),
  screen: "home" as Screen,
  /** Recording opened into the sound panel, or "". */
  openId: "",
  /** List filter: "all", "untagged", a tag, or "p:" + project. */
  filter: "all",
  /** Take shown in the panel. */
  selTake: 0,
  /** Match the loudness of each variation's takes when exporting. */
  evenLoudness: true,
};

export const clipById = (id: string, clips = state.lib.clips): Clip | undefined => clips.find((c) => c.id === id);
export const openClip = (): Clip | undefined => (state.openId ? clipById(state.openId) : undefined);

/** The recording's design, made (all faders at default) the first time it's needed. */
export function designOf(id: string): Design {
  return (state.lib.designs[id] ??= newDesign());
}

export const copyClip = (c: Clip): Clip => ({ ...c, takes: c.takes.map((r) => ({ ...r })), tags: [...c.tags], projects: [...c.projects] });

export const copyDesign = (d: Design): Design => ({ f: { ...d.f }, vars: d.vars.map((v) => ({ name: v.name, f: { ...v.f } })), loaded: d.loaded, locks: [...d.locks] });

/** Copies the library. Recordings' audio is shared, not copied (it's never changed in place). */
export function copyLibrary(l: Library): Library {
  return {
    clips: l.clips.map(copyClip),
    designs: Object.fromEntries(Object.entries(l.designs).map(([k, d]) => [k, copyDesign(d)])),
    projects: [...l.projects],
    checklist: l.checklist.map((c) => ({ ...c })),
  };
}

/** Lowercase letters, digits, - and _ only, so the names work in every engine and file system. */
export const fileBase = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "sound";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What to call a recording: its name, else its first tag, else "Untitled". */
export function displayName(c: Clip): string {
  if (c.name.trim()) return c.name.trim();
  const t = c.tags.find((x) => x !== "example");
  return t ? cap(t) : "Untitled";
}

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

export const seconds = (c: Clip) => `${(c.raw.data.length / c.raw.sampleRate).toFixed(1)} s`;

let n = 0;
export const uid = () => `${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
