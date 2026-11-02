import { $ } from "./dom";
import { commit } from "./history";
import { state } from "./state";

// The sounds your game needs. Tick them off as you make them.

const SUGGEST = ["Footsteps", "Jump", "Land", "Hit", "Hurt", "Coin", "Door", "Menu click", "Whoosh", "Explosion", "Pickup", "Splash", "Laser", "Level up", "Monster", "Magic"];

/** Recordings whose tags match a checklist item, e.g. "footsteps" for "Footsteps". */
function matching(name: string): number {
  const n = name.toLowerCase();
  return state.lib.clips.filter((c) => c.tags.some((t) => t === n || n.startsWith(t) || t.startsWith(n))).length;
}

export function renderChecklist(): void {
  const list = state.lib.checklist;
  const done = list.filter((c) => c.done).length;
  $("checkSummary").textContent = list.length ? `${done} of ${list.length} done` : "List the sounds your game needs.";
  const box = $("checks");
  box.innerHTML = "";
  for (const item of list) {
    const row = document.createElement("div");
    row.className = "check-row" + (item.done ? " done" : "");
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "tick";
    tick.textContent = item.done ? "✓" : "";
    tick.setAttribute("aria-label", (item.done ? "Untick " : "Tick ") + item.name);
    tick.onclick = () => {
      item.done = !item.done;
      renderChecklist();
      commit();
    };
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = item.name;
    const have = document.createElement("span");
    have.className = "have";
    const n = matching(item.name);
    have.textContent = n ? `${n} rec` : "";
    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "×";
    x.setAttribute("aria-label", "Remove " + item.name);
    x.onclick = () => {
      state.lib.checklist = list.filter((y) => y !== item);
      renderChecklist();
      commit();
    };
    row.append(tick, nm, have, x);
    box.appendChild(row);
  }
  const sug = $("suggest");
  sug.innerHTML = "";
  const left = SUGGEST.filter((s) => !list.some((c) => c.name.toLowerCase() === s.toLowerCase()));
  $("suggestLabel").hidden = !left.length;
  for (const s of left) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = "+ " + s;
    b.onclick = () => add(s);
    sug.appendChild(b);
  }
}

function add(name: string): void {
  const v = name.trim().slice(0, 40);
  if (v && !state.lib.checklist.some((c) => c.name.toLowerCase() === v.toLowerCase())) state.lib.checklist.push({ name: v, done: false });
  renderChecklist();
  commit();
}

export function initChecklist(): void {
  $("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    add($<HTMLInputElement>("addIn").value);
    $<HTMLInputElement>("addIn").value = "";
  });
}
