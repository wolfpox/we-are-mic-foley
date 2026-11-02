import { DEFAULT_EXPORT, type ExportOptions } from "../dsp/encode";
import { findTakes, type Mono, type Range } from "../dsp/prep";
import { DEFAULT_FX, DEFAULT_SPREAD, type Effects, type Layer, type Spread } from "../dsp/sound";
import { fileBase, newLibrary, state, uid, type Clip, type Design, type Library, type SavedVar, type VarMeta } from "./state";

// Saves the library in this browser (IndexedDB) so a refresh or closed tab doesn't lose work.
// Nothing leaves the device. Every call is wrapped so private windows or blocked storage just skip saving.
// Recordings live in their own store and are written once; the session itself is small.

const DB_NAME = "we-are-mic-foley";
const SESSION = "session";
const CLIPS = "clips";
const KEY = "current";
const SCHEMA = 3;

type ClipMeta = Omit<Clip, "raw">;
type SavedDesign = Omit<Design, "varMeta"> & { varMeta: (Omit<VarMeta, "sources"> & { sources: ClipMeta[] }) | null };

interface SavedV3 {
  schema: 3;
  savedAt: number;
  clips: ClipMeta[];
  designs: Record<string, SavedDesign>;
  projects: string[];
  checklist: Library["checklist"];
  exportOptions: ExportOptions;
  evenLoudness: boolean;
}

/** What v0.3 saved: one project with a library of named recordings. */
interface SavedV2 {
  schema: 2;
  savedAt: number;
  project: { clips: { id: string; name: string; takes: Range[]; gate: number }[]; layers: Layer[]; fx: Effects; spread: Spread; count: number; name: string };
  exportOptions: ExportOptions;
  evenLoudness: boolean;
  vars: SavedVar[];
  varMeta: (Omit<VarMeta, "sources"> & { sources: { id: string; takes: Range[]; gate: number }[] }) | null;
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

/** Recordings already in the database, so they aren't written again. */
const stored = new Set<string>();

/** Reads the given recordings in one batch. */
async function readRaws(ids: string[]): Promise<Map<string, Mono>> {
  const store = (await db()).transaction(CLIPS, "readonly").objectStore(CLIPS);
  const found = await Promise.all(ids.map((id) => get<Mono>(store, id)));
  const raws = new Map<string, Mono>();
  ids.forEach((id, i) => {
    const raw = found[i];
    if (raw) {
      raws.set(id, raw);
      stored.add(id);
    }
  });
  return raws;
}

/** A tag from an old recording name, unless it's a default like "Recording 3". */
const nameTag = (name: string) => (/^Recording \d+$/.test(name) || !name ? [] : [name.replace(/ \(example\)$/, "").toLowerCase().slice(0, 24)]);

function fromV1(s: SavedV1): Loaded | null {
  if (!s.raw) return null;
  const lib = newLibrary();
  lib.clips.push({ id: uid(), raw: s.raw, takes: findTakes(s.raw), gate: s.gate ?? 0, at: Date.now(), tags: nameTag(s.srcName), projects: [] });
  return { lib, exportOptions: s.exportOptions ?? DEFAULT_EXPORT, evenLoudness: s.evenLoudness ?? true };
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
    lib.clips.push({ id: c.id, raw, takes: c.takes, gate: c.gate, at: s.savedAt - (p.clips.length - i) * 60000, tags, projects: [] });
  });
  const main = p.layers[0]?.clip;
  if (main && raws.has(main)) {
    const sources = s.varMeta?.sources.flatMap((m) => {
      const c = lib.clips.find((x) => x.id === m.id);
      return c ? [{ ...c, takes: m.takes, gate: m.gate }] : [];
    });
    const ok = !!s.varMeta && sources?.length === s.varMeta.sources.length;
    lib.designs[main] = {
      layers: p.layers.filter((l) => raws.has(l.clip)),
      fx: { ...DEFAULT_FX, ...p.fx },
      spread: { ...DEFAULT_SPREAD, ...p.spread },
      count: p.count,
      name: fileBase(p.name),
      vars: ok ? s.vars : [],
      varMeta: ok ? { ...s.varMeta!, sources: sources! } : null,
    };
  }
  return { lib, exportOptions: s.exportOptions ?? DEFAULT_EXPORT, evenLoudness: s.evenLoudness ?? true };
}

async function fromV3(s: SavedV3): Promise<Loaded> {
  const ids = new Set(s.clips.map((c) => c.id));
  for (const d of Object.values(s.designs)) d.varMeta?.sources.forEach((m) => ids.add(m.id));
  const raws = await readRaws([...ids]);
  const withRaw = (list: ClipMeta[]) => list.flatMap((m) => (raws.has(m.id) ? [{ ...m, raw: raws.get(m.id)! }] : []));
  const lib: Library = { clips: withRaw(s.clips), designs: {}, projects: s.projects ?? [], checklist: s.checklist ?? [] };
  for (const [id, d] of Object.entries(s.designs)) {
    if (!lib.clips.some((c) => c.id === id)) continue;
    const sources = d.varMeta ? withRaw(d.varMeta.sources) : [];
    const ok = !!d.varMeta && sources.length === d.varMeta.sources.length;
    lib.designs[id] = {
      ...d,
      layers: d.layers.filter((l) => raws.has(l.clip)),
      fx: { ...DEFAULT_FX, ...d.fx },
      spread: { ...DEFAULT_SPREAD, ...d.spread },
      vars: ok ? d.vars : [],
      varMeta: ok ? { ...d.varMeta!, sources } : null,
    };
  }
  return { lib, exportOptions: s.exportOptions ?? DEFAULT_EXPORT, evenLoudness: s.evenLoudness ?? true };
}

export async function loadSession(): Promise<Loaded | null> {
  try {
    const d = await db();
    const s = await get<SavedV1 | SavedV2 | SavedV3>(d.transaction(SESSION, "readonly").objectStore(SESSION), KEY);
    if (!s) return null;
    const loaded = s.schema === 1 ? fromV1(s) : s.schema === 2 ? await fromV2(s) : s.schema === SCHEMA ? await fromV3(s) : null;
    if (loaded) void collectGarbage();
    return loaded;
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

/** Set by main.ts: reads the export controls. Kept as a hook to avoid an import cycle with export.ts. */
let readExport: () => ExportOptions = () => DEFAULT_EXPORT;
export function setExportReader(fn: () => ExportOptions): void {
  readExport = fn;
}

const meta = ({ raw: _raw, ...m }: Clip): ClipMeta => m;

function collect(): SavedV3 {
  const l = state.lib;
  return {
    schema: SCHEMA,
    savedAt: Date.now(),
    clips: l.clips.map(meta),
    designs: Object.fromEntries(
      Object.entries(l.designs).map(([id, d]) => [id, { ...d, varMeta: d.varMeta && { ...d.varMeta, sources: d.varMeta.sources.map(meta) } }]),
    ),
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
  const all = [...state.lib.clips, ...Object.values(state.lib.designs).flatMap((d) => d.varMeta?.sources ?? [])];
  const fresh = [...new Map(all.filter((c) => !stored.has(c.id)).map((c) => [c.id, c])).values()];
  void db()
    .then((d) => {
      const t = d.transaction([SESSION, CLIPS], "readwrite");
      for (const c of fresh) t.objectStore(CLIPS).put(c.raw, c.id);
      t.objectStore(SESSION).put(session, KEY);
      return done(t);
    })
    .then(() => fresh.forEach((c) => stored.add(c.id)))
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
