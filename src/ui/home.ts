import { $, el } from "./dom";
import { drawWave, play, stop } from "./playback";
import { panel, resetPanel } from "./panel";
import { dayText, displayName, seconds, state, timeText, type Clip } from "./state";

// Home: your recordings, newest first. Tap a row's waveform to play it; tap the rest of the row to
// open it into the sound panel, where it's made into a sound effect.

const plural = (n: number, w: string) => `×${n} ${w}${n === 1 ? "" : "s"}`;
const projectsInUse = () => [...new Set([...state.lib.projects, ...state.lib.clips.flatMap((c) => c.projects)])];
const made = (c: Clip) => state.lib.designs[c.id]?.vars.length ?? 0;

// ---- Playing a whole recording, with a moving playhead ----

function resetHeads(): void {
  document.querySelectorAll(".wavebtn.playing").forEach((w) => {
    w.classList.remove("playing");
    const h = w.querySelector<HTMLElement>(".head")!;
    h.style.transition = "none";
    h.style.left = "0";
  });
}

let playingId = "";

/** Plays a whole recording, at a comfortable level. Tapping the one that's playing stops it. */
export function playClip(c: Clip): void {
  if (playingId === c.id) return stop();
  const { data, sampleRate } = c.raw;
  const peak = data.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;
  const buf = new AudioBuffer({ length: data.length, sampleRate, numberOfChannels: 1 });
  buf.getChannelData(0).set(data.map((x) => (x * 0.9) / peak));
  play(buf, () => {
    playingId = "";
    resetHeads();
  });
  playingId = c.id;
  const w = document.querySelector<HTMLElement>(`.wavebtn[data-id="${c.id}"]`);
  if (!w) return;
  const h = w.querySelector<HTMLElement>(".head")!;
  w.classList.add("playing");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      h.style.transition = `left ${buf.duration}s linear`;
      h.style.left = "calc(100% - 2px)";
    }),
  );
}

// ---- The list ----

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
  if (c.id === state.openId || f === "all") return true;
  if (f === "untagged") return !c.tags.length;
  if (f.startsWith("p:")) return c.projects.includes(f.slice(2));
  return c.tags.includes(f);
};

/** Updates the dock for what's open: the big button records a new take into an open sound. */
function updateDock(): void {
  const c = state.lib.clips.find((x) => x.id === state.openId);
  document.body.classList.toggle("sound-open", !!c);
  if (!$("rec").classList.contains("on")) $("recHint").textContent = c ? `New take · ${displayName(c)}` : "Record anything";
  $("rec").setAttribute("aria-label", c ? `Record a new take of ${displayName(c)}` : "Record");
}

export function renderLibrary(): void {
  const clips = state.lib.clips;
  if (state.openId && !clips.some((c) => c.id === state.openId)) state.openId = "";
  if (state.filter !== "all" && !clips.some(shown)) state.filter = "all";
  renderTagbar();
  $("libCount").textContent = `${clips.length} recording${clips.length === 1 ? "" : "s"}`;
  const box = $("lib");
  box.innerHTML = "";
  updateDock();
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
    list!.appendChild(c.id === state.openId ? openEntry(c) : entry(c));
  }
}

let freshId = "";
export const markFresh = (id: string) => (freshId = id);

/** Opens a recording into the panel (or closes it if it's open) and brings it into view. */
export function openSound(id: string, edit = false): void {
  stop();
  if (state.openId === id && !edit) state.openId = "";
  else {
    state.openId = id;
    state.selTake = 0;
    resetPanel(edit);
  }
  renderLibrary();
  document.querySelector(".entry.open")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function openEntry(c: Clip): HTMLElement {
  const card = el("div", "entry open" + (c.id === freshId ? " fresh" : ""));
  if (c.id === freshId) freshId = "";
  card.appendChild(panel(c));
  return card;
}

/** One row: [waveform, tap to play] [time / length] [name and tags] | [projects / variations] */
function entry(c: Clip): HTMLElement {
  const n = made(c);
  const card = el("div", "entry" + (c.id === freshId ? " fresh" : ""));
  if (c.id === freshId) freshId = "";

  const hit = el("button", "hit");
  hit.type = "button";
  hit.setAttribute("aria-label", `Open ${displayName(c)}, recorded ${timeText(c.at)}`);
  hit.onclick = () => openSound(c.id);

  const row = el("div", "row");
  const w = el("button", "wavebtn" + (n ? "" : " raw"));
  w.type = "button";
  w.dataset.id = c.id;
  w.setAttribute("aria-label", "Play " + displayName(c));
  const canvas = el("canvas");
  w.append(canvas, el("span", "head"));
  w.onclick = () => playClip(c);

  const when = el("div", "when");
  when.append(el("b", null, timeText(c.at)), seconds(c));

  const tags = el("div", "tags");
  // Your own tags before "example"
  const labels = [...(c.name.trim() ? [c.name.trim()] : []), ...c.tags.filter((t) => t !== "example"), ...c.tags.filter((t) => t === "example")];
  if (!labels.length) tags.appendChild(el("span", "untagged", "no tags"));
  labels.slice(0, 2).forEach((t, k) => tags.appendChild(el("span", "tag" + (k === 0 && c.name.trim() ? " named" : ""), k === 1 && labels.length > 2 ? `${t} +${labels.length - 2}` : t)));

  const counts = el("div", "counts");
  counts.append(el("span", "count" + (c.projects.length ? "" : " none"), plural(c.projects.length, "project")), el("span", "count" + (n ? "" : " none"), plural(n, "variation")));

  row.append(w, when, tags, counts);
  card.append(hit, row);
  requestAnimationFrame(() => drawWave(canvas, c.raw.data, n ? "--wave" : "--raw"));
  return card;
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
