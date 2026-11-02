import { DEFAULT_EXPORT, type ExportOptions } from "../dsp/encode";
import { FADER_KEYS, clampFader, defaultFaders, toFaders, type FaderKey, type Faders } from "../dsp/faders";
import { findTakes, type Mono, type Range } from "../dsp/prep";
import { newLibrary, pristine, state, uid, type Clip, type Design, type Library } from "./state";

// Saves the library in this browser (IndexedDB) so a refresh or closed tab doesn't lose work.
// Nothing leaves the device. Every call is wrapped so private windows or blocked storage just skip saving.
// Recordings live in their own store and are written only when they change; the session itself is small.

const DB_NAME = "we-are-mic-foley";
const SESSION = "session";
const CLIPS = "clips";
const KEY = "current";
const SCHEMA = 4;

type ClipMeta = Omit<Clip, "raw">;

interface SavedV4 {
  schema: 4;
  savedAt: number;
  clips: ClipMeta[];
  designs: Record<string, Design>;
  projects: string[];
  checklist: Library["checklist"];
  exportOptions: ExportOptions;
  evenLoudness: boolean;
}

// ---- Older versions ----

/** v0.2–v0.4 sound settings: layers of recordings through mix effects. */
interface OldLayer {
  clip: string;
  take: number;
  volume: number;
  pitch: number;
  tone: number;
  delay: number;
  reverse: boolean;
}
interface OldFx {
  compress: number;
  distort: number;
  lofi: number;
  reverb: number;
  room: number;
}
interface OldDesign {
  layers: OldLayer[];
  fx: Partial<OldFx>;
  name: string;
  vars: { kept: boolean }[];
}
type OldClipMeta = Omit<ClipMeta, "name"> & { gate?: number; name?: string };

/** What v0.4 saved. */
interface SavedV3 {
  schema: 3;
  savedAt: number;
  clips: OldClipMeta[];
  designs: Record<string, OldDesign>;
  projects: string[];
  checklist: Library["checklist"];
  exportOptions: ExportOptions;
  evenLoudness: boolean;
}

/** What v0.3 saved: one project with a library of named recordings. */
interface SavedV2 {
  schema: 2;
  savedAt: number;
  project: { clips: { id: string; name: string; takes: Range[]; gate: number }[]; layers: OldLayer[]; fx: Partial<OldFx>; name: string };
  exportOptions: ExportOptions;
  evenLoudness: boolean;
  vars: { kept: boolean }[];
}

/** What v0.2 saved: one recording and a recipe. */
interface SavedV1 {
  schema: 1;
  srcName: string;
  raw: Mono | null;
  gate: number;
  exportOptions?: ExportOptions;
  evenLoudness?: boolean;
}

export interface Loaded {
  lib: Library;
  exportOptions: ExportOptions;
  evenLoudness: boolean;
}

/**
 * Fader settings closest to an old sound: layer 1's tape-style pitch becomes Pitch plus Speed (so it
 * sounds the same), Tone becomes High (and Low cut when bright), and the mix effects map one to one.
 */
function oldToFaders(l: OldLayer | undefined, fx: Partial<OldFx>, gate: number): Faders {
  const f = defaultFaders();
  const set = (k: FaderKey, v: number) => (f[k] = clampFader(k, v));
  set("clean", gate);
  if (l) {
    set("pitch", l.pitch / 12);
    set("speed", l.pitch / 12);
    if (l.tone < 0) set("high", l.tone);
    else if (l.tone > 0) {
      set("high", l.tone * 0.5);
      set("lowcut", l.tone * 0.6);
    }
  }
  set("punch", fx.compress ?? 0);
  set("grit", fx.distort ?? 0);
  set("lofi", fx.lofi ?? 0);
  set("reverb", fx.reverb ?? 0);
  set("room", fx.room ?? 0.3);
  return f;
}

/** An old sound effect. If it had kept variations, its settings are saved as a variation called "main". */
function oldDesign(d: OldDesign, gate: number): Design {
  const f = oldToFaders(d.layers[0], d.fx ?? {}, gate);
  const made = d.vars?.some((v) => v.kept);
  return { f, vars: made ? [{ name: "main", f: { ...f } }] : [], loaded: made ? "main" : "", locks: [] };
}

/** A recording's background cleanup moves onto its faders. */
function withGate(lib: Library, id: string, gate: number): void {
  if (gate > 0 && !lib.designs[id]) lib.designs[id] = { f: { ...defaultFaders(), clean: clampFader("clean", gate) }, vars: [], loaded: "", locks: [] };
}

// ---- IndexedDB ----

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(SESSION)) d.createObjectStore(SESSION);
      if (!d.objectStoreNames.contains(CLIPS)) d.createObjectStore(CLIPS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (t: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error);
  });

const get = <T>(store: IDBObjectStore, key: IDBValidKey) =>
  new Promise<T | undefined>((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });

/** The audio stored for each recording, so it's written again only when it changes (a new take). */
const stored = new Map<string, Mono>();

/** Reads the given recordings in one batch. */
async function readRaws(ids: string[]): Promise<Map<string, Mono>> {
  const store = (await db()).transaction(CLIPS, "readonly").objectStore(CLIPS);
  const found = await Promise.all(ids.map((id) => get<Mono>(store, id)));
  const raws = new Map<string, Mono>();
  ids.forEach((id, i) => {
    const raw = found[i];
    if (raw) {
      raws.set(id, raw);
      stored.set(id, raw);
    }
  });
  return raws;
}

/** A tag from an old recording name, unless it's a default like "Recording 3". */
const nameTag = (name: string) => (/^Recording \d+$/.test(name) || !name ? [] : [name.replace(/ \(example\)$/, "").toLowerCase().slice(0, 24)]);

const loaded = (lib: Library, s: { exportOptions?: ExportOptions; evenLoudness?: boolean }): Loaded => ({
  lib,
  exportOptions: s.exportOptions ?? DEFAULT_EXPORT,
  evenLoudness: s.evenLoudness ?? true,
});

function fromV1(s: SavedV1): Loaded | null {
  if (!s.raw) return null;
  const lib = newLibrary();
  const id = uid();
  lib.clips.push({ id, raw: s.raw, takes: findTakes(s.raw), at: Date.now(), name: "", tags: nameTag(s.srcName), projects: [] });
  withGate(lib, id, s.gate ?? 0);
  return loaded(lib, s);
}

async function fromV2(s: SavedV2): Promise<Loaded> {
  const p = s.project;
  const raws = await readRaws(p.clips.map((c) => c.id));
  const lib = newLibrary();
  p.clips.forEach((c, i) => {
    const raw = raws.get(c.id);
    if (!raw) return;
    const tags = nameTag(c.name);
    if (c.name.endsWith("(example)")) tags.unshift("example");
    lib.clips.push({ id: c.id, raw, takes: c.takes, at: s.savedAt - (p.clips.length - i) * 60000, name: "", tags, projects: [] });
  });
  const main = p.layers[0]?.clip;
  const gateOf = (id: string) => p.clips.find((c) => c.id === id)?.gate ?? 0;
  if (main && raws.has(main)) lib.designs[main] = oldDesign({ layers: p.layers, fx: p.fx, name: p.name, vars: s.vars ?? [] }, gateOf(main));
  for (const c of p.clips) withGate(lib, c.id, c.gate);
  return loaded(lib, s);
}

async function fromV3(s: SavedV3): Promise<Loaded> {
  const raws = await readRaws(s.clips.map((c) => c.id));
  const lib: Library = { clips: [], designs: {}, projects: s.projects ?? [], checklist: s.checklist ?? [] };
  for (const { gate, ...m } of s.clips) {
    const raw = raws.get(m.id);
    if (!raw) continue;
    lib.clips.push({ ...m, name: m.name ?? "", raw });
    const d = s.designs[m.id];
    if (d) lib.designs[m.id] = oldDesign(d, gate ?? 0);
    else withGate(lib, m.id, gate ?? 0);
  }
  return loaded(lib, s);
}

const isKey = (k: string): k is FaderKey => (FADER_KEYS as readonly string[]).includes(k);

async function fromV4(s: SavedV4): Promise<Loaded> {
  const raws = await readRaws(s.clips.map((c) => c.id));
  const lib: Library = { clips: [], designs: {}, projects: s.projects ?? [], checklist: s.checklist ?? [] };
  for (const m of s.clips) {
    const raw = raws.get(m.id);
    if (!raw) continue;
    lib.clips.push({ ...m, raw });
    const d = s.designs[m.id];
    if (d)
      lib.designs[m.id] = {
        f: toFaders(d.f),
        vars: (d.vars ?? []).map((v) => ({ name: String(v.name), f: toFaders(v.f) })),
        loaded: d.loaded ?? "",
        locks: (d.locks ?? []).filter(isKey),
      };
  }
  return loaded(lib, s);
}

export async function loadSession(): Promise<Loaded | null> {
  try {
    const d = await db();
    const s = await get<SavedV1 | SavedV2 | SavedV3 | SavedV4>(d.transaction(SESSION, "readonly").objectStore(SESSION), KEY);
    if (!s) return null;
    const out =
      s.schema === 1 ? fromV1(s) : s.schema === 2 ? await fromV2(s) : s.schema === 3 ? await fromV3(s) : s.schema === SCHEMA ? await fromV4(s) : null;
    if (out) void collectGarbage();
    return out;
  } catch {
    return null;
  }
}

/** Deletes stored recordings nothing refers to any more (deleted in an earlier visit). */
async function collectGarbage(): Promise<void> {
  try {
    const t = (await db()).transaction(CLIPS, "readwrite");
    const st = t.objectStore(CLIPS);
    const r = st.getAllKeys();
    // Deletes are issued inside the success callback, while the transaction is still open
    r.onsuccess = () => r.result.forEach((k) => stored.has(String(k)) || st.delete(k));
    await done(t);
  } catch {
    // not important
  }
}

/** Set by main.ts: reads the export settings. Kept as a hook to avoid an import cycle with export.ts. */
let readExport: () => ExportOptions = () => DEFAULT_EXPORT;
export function setExportReader(fn: () => ExportOptions): void {
  readExport = fn;
}

const meta = ({ raw: _raw, ...m }: Clip): ClipMeta => m;

function collect(): SavedV4 {
  const l = state.lib;
  return {
    schema: SCHEMA,
    savedAt: Date.now(),
    clips: l.clips.map(meta),
    // Designs nobody has touched yet aren't worth saving
    designs: Object.fromEntries(Object.entries(l.designs).filter(([id, d]) => !pristine(d) && l.clips.some((c) => c.id === id))),
    projects: l.projects,
    checklist: l.checklist,
    exportOptions: readExport(),
    evenLoudness: state.evenLoudness,
  };
}

let enabled = false;
let queued = false;

function save(): void {
  queued = false;
  const session = collect();
  const fresh = state.lib.clips.filter((c) => stored.get(c.id) !== c.raw).map((c) => [c.id, c.raw] as const);
  void db()
    .then((d) => {
      const t = d.transaction([SESSION, CLIPS], "readwrite");
      for (const [id, raw] of fresh) t.objectStore(CLIPS).put(raw, id);
      t.objectStore(SESSION).put(session, KEY);
      return done(t);
    })
    .then(() => fresh.forEach(([id, raw]) => stored.set(id, raw)))
    .catch(() => {});
}

/** Turns saving on. Called once the saved session (if any) has been restored, so it isn't overwritten first. */
export function enableSaving(): void {
  enabled = true;
}

/**
 * Saves right after the current change. Only finished changes call this (never mid-drag), so it's
 * cheap; saving at once matters because browsers drop storage writes started while a page closes.
 */
export function scheduleSave(): void {
  if (!enabled || queued) return;
  queued = true;
  queueMicrotask(save);
}
