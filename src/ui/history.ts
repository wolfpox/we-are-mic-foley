import type { Mono, Range } from "../dsp/prep";
import type { Params } from "../recipes/types";
import { $ } from "./dom";
import { scheduleSave } from "./persist";
import { state } from "./state";

/** Everything that shapes the sound. Variations aren't included; they're re-rolled after any change. */
export interface Snapshot {
  recipe: string;
  params: Record<string, Params>;
  raw: Mono | null;
  srcName: string;
  trim: Range | null;
  gate: number;
}

const LIMIT = 50;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
let current: Snapshot | null = null;
let restoreFn: (s: Snapshot) => void = () => {};
let restoring = false;

const copyParams = (p: Record<string, Params>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v }]));

export function snapshot(): Snapshot {
  return {
    recipe: state.recipe,
    params: copyParams(state.params),
    raw: state.raw, // recordings are never modified in place, so sharing is safe
    srcName: state.srcName,
    trim: state.trim && { ...state.trim },
    gate: state.gate,
  };
}

const same = (a: Snapshot, b: Snapshot) =>
  a.recipe === b.recipe &&
  a.raw === b.raw &&
  a.gate === b.gate &&
  a.trim?.start === b.trim?.start &&
  a.trim?.end === b.trim?.end &&
  JSON.stringify(a.params) === JSON.stringify(b.params);

function updateButtons(): void {
  $<HTMLButtonElement>("undoBtn").disabled = !undoStack.length;
  $<HTMLButtonElement>("redoBtn").disabled = !redoStack.length;
  $("undoBar").hidden = !undoStack.length && !redoStack.length;
}

export function initHistory(restore: (s: Snapshot) => void): void {
  restoreFn = restore;
  current = snapshot();
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) undo();
    else if ((k === "z" && e.shiftKey) || k === "y") redo();
    else return;
    e.preventDefault();
  });
  updateButtons();
}

/** Call after a finished change (slider released, recipe picked, new recording…). */
export function commit(): void {
  if (restoring || !current) return;
  const s = snapshot();
  if (same(s, current)) return;
  undoStack.push(current);
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
  current = s;
  updateButtons();
  scheduleSave();
}

/** Starts history over from the current state, e.g. after loading a saved session. */
export function resetHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  current = snapshot();
  updateButtons();
}

function go(from: Snapshot[], to: Snapshot[]): void {
  const s = from.pop();
  if (!s || !current) return;
  to.push(current);
  current = s;
  restoring = true;
  try {
    restoreFn({ ...s, params: copyParams(s.params) });
  } finally {
    restoring = false;
  }
  updateButtons();
  scheduleSave();
}

export const undo = () => go(undoStack, redoStack);
export const redo = () => go(redoStack, undoStack);
