import { DEFAULT_EXPORT, type ExportOptions } from "../dsp/encode";
import { findTakes, type Mono, type Range } from "../dsp/prep";
import { DEFAULT_FX, DEFAULT_SPREAD, defaultLayer, type VarSpec } from "../dsp/sound";
import { newProject, state, uid, type Clip, type Project, type VarMeta } from "./state";

// Saves the session in this browser (IndexedDB) so a refresh or closed tab doesn't lose work.
// Nothing leaves the device. Every call is wrapped so private windows or blocked storage just skip saving.
// Recordings live in their own store and are written once; the session itself is small.

const DB_NAME = "we-are-mic-foley";
const SESSION = "session";
const CLIPS = "clips";
const KEY = "current";
const SCHEMA = 2;

type ClipMeta = Omit<Clip, "raw">;
type SavedVar = VarSpec & { kept: boolean };

interface SavedSession {
  schema: 2;
  savedAt: number;
  project: Omit<Project, "clips"> & { clips: ClipMeta[] };
  selClip: string;
  selTake: number;
  exportOptions: ExportOptions;
  evenLoudness: boolean;
  vars: SavedVar[];
  varMeta: (Omit<VarMeta, "sources"> & { sources: ClipMeta[] }) | null;
}

/** What version 0.2 saved: one recording and a recipe. */
interface SavedV1 {
  schema: 1;
  srcName: string;
  raw: Mono | null;
  trim: Range | null;
  gate: number;
  exportOptions?: ExportOptions;
  evenLoudness?: boolean;
}

export interface Loaded {
  project: Project;
  selClip: string;
  selTake: number;
  exportOptions: ExportOptions;
  evenLoudness: boolean;
  vars: SavedVar[];
  varMeta: VarMeta | null;
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

function fromV1(s: SavedV1): Loaded | null {
  if (!s.raw) return null;
  const project = newProject();
  const c: Clip = { id: uid(), name: s.srcName || "Recording 1", raw: s.raw, takes: findTakes(s.raw), gate: s.gate ?? 0 };
  project.clips.push(c);
  project.layers.push(defaultLayer(c.id));
  return { project, selClip: c.id, selTake: 0, exportOptions: s.exportOptions ?? DEFAULT_EXPORT, evenLoudness: s.evenLoudness ?? true, vars: [], varMeta: null };
}

export async function loadSession(): Promise<Loaded | null> {
  try {
    const d = await db();
    const s = await get<SavedSession | SavedV1>(d.transaction(SESSION, "readonly").objectStore(SESSION), KEY);
    if (!s) return null;
    if (s.schema === 1) return fromV1(s);
    if (s.schema !== SCHEMA) return null;
    // All reads are started at once, inside one transaction
    const clipStore = d.transaction(CLIPS, "readonly").objectStore(CLIPS);
    const ids = [...new Set([...s.project.clips, ...(s.varMeta?.sources ?? [])].map((m) => m.id))];
    const found = await Promise.all(ids.map((id) => get<Mono>(clipStore, id)));
    const raws = new Map<string, Mono>();
    ids.forEach((id, i) => {
      const raw = found[i];
      if (raw) {
        raws.set(id, raw);
        stored.add(id);
      }
    });
    const withRaw = (list: ClipMeta[]) => list.flatMap((m) => (raws.has(m.id) ? [{ ...m, raw: raws.get(m.id)! }] : []));
    const project: Project = {
      ...newProject(),
      ...s.project,
      fx: { ...DEFAULT_FX, ...s.project.fx },
      spread: { ...DEFAULT_SPREAD, ...s.project.spread },
      clips: withRaw(s.project.clips),
    };
    const sources = s.varMeta ? withRaw(s.varMeta.sources) : [];
    const varMeta = s.varMeta && sources.length === s.varMeta.sources.length ? { ...s.varMeta, sources } : null;
    void collectGarbage();
    return {
      project,
      selClip: s.selClip,
      selTake: s.selTake,
      exportOptions: s.exportOptions ?? DEFAULT_EXPORT,
      evenLoudness: s.evenLoudness ?? true,
      vars: varMeta ? s.vars : [],
      varMeta,
    };
  } catch {
    return null;
  }
}

/** Deletes stored recordings nothing refers to any more (deleted from the library in an earlier visit). */
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

function collect(): SavedSession {
  const p = state.project;
  return {
    schema: SCHEMA,
    savedAt: Date.now(),
    project: { ...p, clips: p.clips.map(meta) },
    selClip: state.selClip,
    selTake: state.selTake,
    exportOptions: readExport(),
    evenLoudness: state.evenLoudness,
    vars: state.vars.map((v) => ({ seed: v.seed, pitch: v.pitch, takes: v.takes, kept: v.kept })),
    varMeta: state.varMeta && { ...state.varMeta, sources: state.varMeta.sources.map(meta) },
  };
}

let enabled = false;
let queued = false;

function save(): void {
  queued = false;
  const session = collect();
  const fresh = [...state.project.clips, ...(state.varMeta?.sources ?? [])].filter((c) => !stored.has(c.id));
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
