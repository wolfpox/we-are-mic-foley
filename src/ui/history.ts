import { $ } from "./dom";
import { scheduleSave } from "./persist";
import { copyLibrary, pristine, state, type Design, type Library } from "./state";

// Undo / redo over the whole library: recordings, tags, faders, locks, variations and the checklist.

const LIMIT = 50;
const undoStack: Library[] = [];
const redoStack: Library[] = [];
let current: Library | null = null;
let restoreFn: () => void = () => {};
let restoring = false;

/**
 * What counts as a change. A recording's audio is compared by length (it's only ever replaced by a
 * longer one, with a new take). Designs nobody has touched are the same as none.
 */
const key = (l: Library) =>
  JSON.stringify({ ...l, designs: Object.fromEntries(Object.entries(l.designs).filter(([, d]) => !pristine(d as Design))) }, (k, v) => (k === "raw" ? v.data.length : v));

function updateButtons(): void {
  $<HTMLButtonElement>("undoBtn").hidden = !undoStack.length;
  $<HTMLButtonElement>("redoBtn").hidden = !redoStack.length;
}

export function initHistory(restore: () => void): void {
  restoreFn = restore;
  current = copyLibrary(state.lib);
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    // Let text fields undo their own typing
    if (e.target instanceof HTMLInputElement && e.target.type !== "range" && e.target.type !== "checkbox") return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) undo();
    else if ((k === "z" && e.shiftKey) || k === "y") redo();
    else return;
    e.preventDefault();
  });
  updateButtons();
}

/** Call after a finished change (slider released, recording added, tag set…). */
export function commit(): void {
  if (restoring || !current) return;
  const s = copyLibrary(state.lib);
  if (key(s) !== key(current)) {
    undoStack.push(current);
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
    current = s;
    updateButtons();
  }
  scheduleSave();
}

/** Starts history over from the current state, e.g. after loading a saved session. */
export function resetHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  current = copyLibrary(state.lib);
  updateButtons();
}

function go(from: Library[], to: Library[]): void {
  const s = from.pop();
  if (!s || !current) return;
  to.push(current);
  current = s;
  const next = copyLibrary(s);
  restoring = true;
  try {
    state.lib = next;
    restoreFn();
  } finally {
    restoring = false;
  }
  updateButtons();
  scheduleSave();
}

export const undo = () => go(undoStack, redoStack);
export const redo = () => go(redoStack, undoStack);
