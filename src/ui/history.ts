import { $ } from "./dom";
import { scheduleSave } from "./persist";
import { copyProject, state, type Project } from "./state";

/** Everything you've made except the variations (those keep the settings they were made with). */
export interface Snapshot {
  project: Project;
  selClip: string;
  selTake: number;
}

const LIMIT = 50;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
let current: Snapshot | null = null;
let restoreFn: (s: Snapshot) => void = () => {};
let restoring = false;

export const snapshot = (): Snapshot => ({ project: copyProject(state.project), selClip: state.selClip, selTake: state.selTake });

/** Recordings never change, so comparing them by id is enough. */
const key = (s: Snapshot) => JSON.stringify(s.project, (k, v) => (k === "raw" ? undefined : v));

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
    // Let text fields undo their own typing
    if (e.target instanceof HTMLInputElement && e.target.type === "text") return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) undo();
    else if ((k === "z" && e.shiftKey) || k === "y") redo();
    else return;
    e.preventDefault();
  });
  updateButtons();
}

/** Call after a finished change (slider released, recording added, take trimmed…). */
export function commit(): void {
  if (restoring || !current) return;
  const s = snapshot();
  if (key(s) === key(current)) {
    current = s; // selection may have moved
    scheduleSave();
    return;
  }
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
    restoreFn({ ...s, project: copyProject(s.project) });
  } finally {
    restoring = false;
  }
  updateButtons();
  scheduleSave();
}

export const undo = () => go(undoStack, redoStack);
export const redo = () => go(redoStack, undoStack);
