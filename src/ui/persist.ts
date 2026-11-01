import type { ExportOptions } from "../dsp/encode";
import type { Mono, Range } from "../dsp/prep";
import type { Params } from "../recipes/types";
import { $ } from "./dom";
import { state, type VariationMeta } from "./state";

// Saves the session in this browser (IndexedDB) so a refresh or closed tab doesn't lose work.
// Nothing leaves the device. Every call is wrapped so private windows or blocked storage just skip saving.

const DB_NAME = "we-are-mic-foley";
const STORE = "session";
const KEY = "current";
const SCHEMA = 1;

export interface SavedSession {
  schema: number;
  savedAt: number;
  recipe: string;
  params: Record<string, Params>;
  srcName: string;
  raw: Mono | null;
  trim: Range | null;
  gate: number;
  varAmt: number;
  varCount: number;
  exportOptions: ExportOptions;
  /** Variations are stored as seeds and re-rendered on load. */
  vars: { seed: number; kept: boolean }[];
  varMeta: VariationMeta | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const s = await request<SavedSession | undefined>("readonly", (st) => st.get(KEY));
    return s && s.schema === SCHEMA ? s : null;
  } catch {
    return null;
  }
}

/** Set by main.ts: reads the export controls. Kept as a hook to avoid an import cycle with export.ts. */
let readExport: () => ExportOptions = () => ({ format: "ogg", quality: "balanced", sampleRate: 44100 });
export function setExportReader(fn: () => ExportOptions): void {
  readExport = fn;
}

function collect(): SavedSession {
  return {
    schema: SCHEMA,
    savedAt: Date.now(),
    recipe: state.recipe,
    params: state.params,
    srcName: state.srcName,
    raw: state.raw,
    trim: state.trim,
    gate: state.gate,
    varAmt: Number($<HTMLInputElement>("varAmt").value),
    varCount: Number($<HTMLSelectElement>("varCount").value),
    exportOptions: readExport(),
    vars: state.vars.map((v) => ({ seed: v.seed, kept: v.kept })),
    varMeta: state.varMeta,
  };
}

let enabled = false;
let queued = false;

function save(): void {
  queued = false;
  request("readwrite", (st) => st.put(collect(), KEY)).catch(() => {});
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
