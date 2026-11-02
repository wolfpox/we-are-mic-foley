import { $ } from "./dom";
import { commit } from "./history";
import { audio, drawWave } from "./playback";
import { dayText, keptCount, seconds, state, timeText, type Clip } from "./state";
import { toast } from "./toast";

// Home: your recordings, newest first. Tap a waveform to play it; tap the rest of the row to tag it,
// add it to projects or make it into a sound effect.

const SUGGEST_TAGS = ["footsteps", "hit", "whoosh", "click", "door", "voice", "metal", "wood", "cloth", "water", "keys"];

/** Set by main.ts, so this module doesn't need to import the sound screen. */
let openSoundFn: (id: string) => void = () => {};
export const setOpenSound = (fn: (id: string) => void) => (openSoundFn = fn);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const plural = (n: number, w: string) => `×${n} ${w}${n === 1 ? "" : "s"}`;
const projectsInUse = () => [...new Set([...state.lib.projects, ...state.lib.clips.flatMap((c) => c.projects)])];

// ---- Playback with a moving playhead ----

let playing: { src: AudioBufferSourceNode; id: string } | null = null;

function stopPlaying(): void {
  if (playing) {
    try {
      playing.src.stop();
    } catch {
      // already stopped
    }
  }
  playing = null;
  document.querySelectorAll(".wavebtn.playing").forEach((w) => {
    w.classList.remove("playing");
    const h = w.querySelector<HTMLElement>(".head")!;
    h.style.transition = "none";
    h.style.left = "0";
  });
}

/** Plays a whole recording, at a comfortable level. Tapping the one that's playing stops it. */
export function playClip(c: Clip): void {
  const again = playing?.id === c.id;
  stopPlaying();
  if (again) return;
  const ctx = audio();
  const { data, sampleRate } = c.raw;
  const peak = data.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;
  const buf = ctx.createBuffer(1, data.length, sampleRate);
  buf.getChannelData(0).set(data.map((x) => (x * 0.9) / peak));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  playing = { src, id: c.id };
  const w = document.querySelector<HTMLElement>(`.wavebtn[data-id="${c.id}"]`);
  if (w) {
    const h = w.querySelector<HTMLElement>(".head")!;
    w.classList.add("playing");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        h.style.transition = `left ${buf.duration}s linear`;
        h.style.left = "calc(100% - 2px)";
      }),
    );
  }
  src.onended = () => {
    if (playing?.src === src) stopPlaying();
  };
}

// ---- The list ----

/** Recordings drawn at full height, however quietly they were recorded. */
const norms = new WeakMap<Float32Array, Float32Array>();
function normalized(c: Clip): Float32Array {
  const d = c.raw.data;
  let n = norms.get(d);
  if (!n) {
    const peak = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;
    n = d.map((x) => x / peak);
    norms.set(d, n);
  }
  return n;
}

function renderTagbar(): void {
  const box = $("tagbar");
  box.innerHTML = "";
  const clips = state.lib.clips;
  const tags = [...new Set(clips.flatMap((c) => c.tags))].sort();
  const opts: [string, string, string?][] = [
    ["all", "All"],
    ...projectsInUse().map((p): [string, string, string] => ["p:" + p, p, "proj"]),
    ...tags.map((t): [string, string] => [t, t]),
    ...(clips.some((c) => !c.tags.length) && tags.length ? [["untagged", "Untagged"] as [string, string]] : []),
  ];
  box.hidden = opts.length < 2;
  for (const [key, label, cls] of opts) {
    const b = el("button", cls, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(state.filter === key));
    b.onclick = () => {
      state.filter = state.filter === key ? "all" : key;
      renderLibrary();
    };
    box.appendChild(b);
  }
}

const shown = (c: Clip) => {
  const f = state.filter;
  if (f === "all") return true;
  if (f === "untagged") return !c.tags.length;
  if (f.startsWith("p:")) return c.projects.includes(f.slice(2));
  return c.tags.includes(f);
};

export function renderLibrary(): void {
  const clips = state.lib.clips;
  if (state.filter !== "all" && !clips.some(shown)) state.filter = "all";
  renderTagbar();
  $("libCount").textContent = `${clips.length} recording${clips.length === 1 ? "" : "s"}`;
  const box = $("lib");
  box.innerHTML = "";
  if (!clips.length) {
    box.appendChild(el("p", "empty", "Tap the red button and record anything."));
    return;
  }
  let day = "";
  let list: HTMLElement | null = null;
  for (const c of clips.filter(shown).sort((a, b) => b.at - a.at)) {
    const d = dayText(c.at);
    if (d !== day) {
      day = d;
      box.appendChild(el("div", "day", d));
      list = el("div", "list");
      box.appendChild(list);
    }
    list!.appendChild(entry(c));
  }
}

let freshId = "";
export const markFresh = (id: string) => (freshId = id);

/** One row: [waveform, tap to play] [time / length] [tags] | [projects / variations] */
function entry(c: Clip): HTMLElement {
  const made = keptCount(state.lib.designs[c.id]);
  const open = state.openId === c.id;
  const card = el("div", "entry" + (c.id === freshId ? " fresh" : "") + (open ? " open" : ""));
  if (c.id === freshId) freshId = "";

  const hit = el("button", "hit");
  hit.type = "button";
  hit.setAttribute("aria-expanded", String(open));
  hit.setAttribute("aria-label", `Recording from ${timeText(c.at)}. Tags, projects and variations`);
  hit.onclick = () => {
    state.openId = open ? "" : c.id;
    renderLibrary();
  };

  const row = el("div", "row");
  const w = el("button", "wavebtn" + (made ? "" : " raw"));
  w.type = "button";
  w.dataset.id = c.id;
  w.setAttribute("aria-label", "Play");
  const canvas = el("canvas");
  w.append(canvas, el("span", "head"));
  w.onclick = () => playClip(c);

  const when = el("div", "when");
  when.append(el("b", undefined, timeText(c.at)), seconds(c));

  const tags = el("div", "tags");
  if (!c.tags.length) tags.appendChild(el("span", "untagged", "no tags"));
  c.tags.slice(0, 2).forEach((t, k) => tags.appendChild(el("span", "tag", k === 1 && c.tags.length > 2 ? `${t} +${c.tags.length - 2}` : t)));

  const counts = el("div", "counts");
  counts.append(el("span", "count" + (c.projects.length ? "" : " zero"), plural(c.projects.length, "project")), el("span", "count" + (made ? "" : " zero"), plural(made, "variation")));

  row.append(w, when, tags, counts);
  card.append(hit, row);
  if (open) card.appendChild(details(c));
  requestAnimationFrame(() => drawWave(canvas, normalized(c), [], made ? "--wave" : "--raw"));
  return card;
}

function chipRow(all: string[], on: string[], cls: string, toggle: (v: string) => void, placeholder: string, add: (v: string) => void): HTMLElement {
  const box = el("div", "chips");
  for (const v of all) {
    const b = el("button", `chip ${cls}${on.includes(v) ? " on" : ""}`, v);
    b.type = "button";
    b.setAttribute("aria-pressed", String(on.includes(v)));
    b.onclick = () => toggle(v);
    box.appendChild(b);
  }
  const inp = el("input", "newtag");
  inp.type = "text";
  inp.placeholder = placeholder;
  inp.maxLength = 24;
  inp.setAttribute("aria-label", placeholder);
  inp.onkeydown = (e) => {
    if (e.key === "Enter" && inp.value.trim()) add(inp.value.trim());
  };
  box.appendChild(inp);
  return box;
}

/** Tags, projects and actions for an opened row. */
function details(c: Clip): HTMLElement {
  const box = el("div", "details");
  const changed = () => {
    renderLibrary();
    commit();
  };
  const toggle = (list: string[], v: string) => {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
    changed();
  };
  const addTo = (list: string[], v: string) => {
    if (!list.includes(v)) list.push(v);
    changed();
  };
  box.append(
    el("div", "label", "Tags"),
    chipRow([...new Set([...c.tags, ...SUGGEST_TAGS])], c.tags, "", (t) => toggle(c.tags, t), "+ tag", (v) => addTo(c.tags, v.toLowerCase())),
    el("div", "label", "Projects"),
    chipRow(projectsInUse(), c.projects, "proj", (p) => toggle(c.projects, p), "+ project", (v) => {
      if (!state.lib.projects.includes(v)) state.lib.projects.push(v);
      addTo(c.projects, v);
    }),
  );
  const acts = el("div", "acts");
  const made = keptCount(state.lib.designs[c.id]);
  const go = el("button", "go", made ? "Open sound effect ›" : "Make variations ›");
  go.type = "button";
  go.onclick = () => openSoundFn(c.id);
  const del = el("button", "del", "Delete");
  del.type = "button";
  del.onclick = () => {
    stopPlaying();
    state.lib.clips = state.lib.clips.filter((x) => x !== c);
    delete state.lib.designs[c.id];
    // Other sound effects stop using it as a layer
    for (const [id, d] of Object.entries(state.lib.designs)) {
      d.layers = d.layers.filter((l) => l.clip !== c.id);
      if (!d.layers.length) delete state.lib.designs[id];
    }
    state.openId = "";
    renderLibrary();
    renderDoors();
    commit();
    toast("Deleted", { label: "Undo", run: () => document.getElementById("undoBtn")?.click() });
  };
  acts.append(go, del);
  box.appendChild(acts);
  return box;
}

export function renderDoors(): void {
  const list = state.lib.checklist;
  const done = list.filter((c) => c.done).length;
  $("toChecklist").querySelector("b")!.textContent = list.length ? "Your checklist" : "Create your checklist";
  $("checkSub").textContent = list.length ? `${done} of ${list.length} done` : "What does your game need?";
}

export function renderHome(): void {
  renderDoors();
  renderLibrary();
}

export { stopPlaying };
