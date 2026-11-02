import { FADER_KEYS, TWO_WAY, anySet, canRandomize, defaultFaders, defaultOf, randomFaders, sameFaders, type Faders } from "../dsp/faders";
import { clampRange } from "../dsp/prep";
import { desk, showFaders, type DeskHooks } from "./desk";
import { btn, el } from "./dom";
import { renderTake, takeBuffer } from "./engine";
import { exportSound, fileCount, openExportSettings } from "./export";
import { commit } from "./history";
import { drawWave, play, stop } from "./playback";
import { designOf, displayName, openClip, state, type Clip, type Design, type SavedVar } from "./state";
import { toast } from "./toast";

// The sound panel: a recording opened in the list. Name and tags, the variation picker, the waveform
// with crop handles, the faders right under it, then Random and Export. It fits on a phone screen
// above the record button; only the faders scroll, sideways.

const SUGGEST_TAGS = ["footsteps", "hit", "whoosh", "click", "door", "voice", "metal", "wood", "cloth", "water", "keys"];

let editing = false;
let listOpen = false;
let hintShown = false;
let rerenderList: () => void = () => {};

export function initPanel(rerender: () => void): void {
  rerenderList = rerender;
  // Tapping anywhere else closes the variation list
  document.addEventListener("pointerdown", (e) => {
    if (listOpen && !(e.target as Element).closest?.(".vbar")) {
      listOpen = false;
      refreshVarBar();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && listOpen) {
      listOpen = false;
      refreshVarBar();
    }
  });
}

/** Call when a different sound opens: closes the editor and the variation list. */
export function resetPanel(edit = false): void {
  editing = edit;
  listOpen = false;
}

const projectsInUse = () => [...new Set([...state.lib.projects, ...state.lib.clips.flatMap((c) => c.projects)])];
const cur = (): { c: Clip; d: Design } | null => {
  const c = openClip();
  return c ? { c, d: designOf(c.id) } : null;
};
const loadedVar = (d: Design) => d.vars.find((v) => v.name === d.loaded);

// ---- Playing the result ----

const renders = new Map<string, AudioBuffer | null>();
let playToken = 0;

/** The open take through the given faders, cached so repeat taps play at once. */
async function result(c: Clip, i: number, f: Faders): Promise<AudioBuffer | null> {
  const t = c.takes[i];
  const key = JSON.stringify([c.id, c.raw.data.length, t.start, t.end, f]);
  if (!renders.has(key)) {
    if (renders.size > 24) renders.delete(renders.keys().next().value!);
    const job = renderTake(c, i, f);
    renders.set(key, job ? await job : null);
  }
  return renders.get(key) ?? null;
}

/** Plays the open sound through its faders (or `f`), or the take as recorded. */
export async function playResult(f?: Faders, original = false): Promise<void> {
  const o = cur();
  if (!o) return;
  const i = state.selTake;
  const token = ++playToken;
  const buf = original ? takeBuffer(o.c, i) : await result(o.c, i, f ?? o.d.f);
  if (token !== playToken || !buf) return;
  play(buf, () => playhead(false));
  playhead(true, buf.duration, original);
}

function playhead(on: boolean, dur = 0, original = false): void {
  const w = document.getElementById("wave");
  const o = cur();
  if (!w || !o) return;
  const head = w.querySelector<HTMLElement>(".head")!;
  const [lo, hi] = view(o.c, state.selTake);
  const t = o.c.takes[state.selTake];
  const at = (x: number) => ((x - lo) / (hi - lo)) * 100 + "%";
  w.querySelector(".badge")!.textContent = on ? (original ? "Original" : "Result") : "";
  w.classList.toggle("playing", on);
  head.style.transition = "none";
  head.style.left = at(t.start);
  if (on)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        head.style.transition = `left ${dur}s linear`;
        head.style.left = at(t.end);
      }),
    );
}

// ---- Caption on the waveform ----

let captionTimer: ReturnType<typeof setTimeout> | undefined;

function caption(lead: string, rest: string, value?: string, ms = 3000): void {
  const box = document.getElementById("caption");
  if (!box) return;
  box.innerHTML = "";
  const line = el("div");
  if (lead) line.appendChild(el("b", null, lead + (value ? " " : "")));
  if (value) line.appendChild(el("span", "v", value));
  line.append(rest);
  box.appendChild(line);
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => (box.innerHTML = ""), ms);
}

// ---- After a change ----

/** A fader, lock or variation changed: save it, update what depends on it, and play the result. */
function changed(playIt = true): void {
  commit();
  refreshVarBar();
  drawMain();
  if (playIt) void playResult();
}

function refreshVarBar(): void {
  const o = cur();
  const old = document.querySelector(".vbar");
  if (o && old) old.replaceWith(varBar(o.c, o.d));
}

// ---- The panel ----

export function panel(c: Clip): HTMLElement {
  const d = designOf(c.id);
  state.selTake = Math.max(0, Math.min(state.selTake, c.takes.length - 1));
  const p = el("div", "panel");
  p.append(header(c), ...(editing ? [editor(c)] : []), varBar(c, d));
  const hooks: DeskHooks = { caption, changed: () => changed() };
  const stage = el("div", "stage");
  stage.append(waveBox(c), desk(d, hooks, true));
  p.append(stage, tools(c, d));
  return p;
}

function header(c: Clip): HTMLElement {
  const ph = el("div", "ph");
  const main = el("div", "ph-main");
  const h = el("h3");
  h.append(displayName(c));
  const tags = c.tags.filter((t) => t.toLowerCase() !== displayName(c).toLowerCase());
  if (tags.length) h.appendChild(el("span", "tg", tags.join(" · ")));
  main.appendChild(h);
  const pen = btn("icon", editing ? "✓" : "✎", () => {
    editing = !editing;
    rerenderList();
  }, editing ? "Done editing" : "Edit name, tags and projects");
  const close = btn("icon", "▴", () => {
    stop();
    state.openId = "";
    editing = false;
    rerenderList();
  }, "Close");
  ph.append(main, pen, close);
  return ph;
}

function chipRow(all: string[], on: string[], cls: string, toggle: (v: string) => void, placeholder: string, add: (v: string) => void): HTMLElement {
  const box = el("div", "chips");
  for (const v of all) {
    const b = btn(`chip ${cls}${on.includes(v) ? " on" : ""}`, v, () => toggle(v));
    b.setAttribute("aria-pressed", String(on.includes(v)));
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

/** Name, tags, projects, removing a take and deleting the recording. */
function editor(c: Clip): HTMLElement {
  const box = el("div", "edit");
  const done = () => {
    rerenderList();
    commit();
  };
  const toggle = (list: string[], v: string) => {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
    done();
  };
  const addTo = (list: string[], v: string) => {
    if (!list.includes(v)) list.push(v);
    done();
  };
  const name = el("input", "name-in");
  name.type = "text";
  name.value = c.name;
  name.placeholder = displayName(c) === "Untitled" ? "Name it" : displayName(c);
  name.maxLength = 40;
  name.setAttribute("aria-label", "Name");
  name.onchange = () => {
    c.name = name.value.trim();
    done();
  };
  name.onkeydown = (e) => e.key === "Enter" && name.blur();

  const acts = el("div", "edit-acts");
  if (c.takes.length > 1)
    acts.appendChild(
      btn("ghost", `Remove take ${state.selTake + 1}`, () => {
        c.takes.splice(state.selTake, 1);
        state.selTake = Math.max(0, state.selTake - 1);
        done();
        toast("Take removed", { label: "Undo", run: () => document.getElementById("undoBtn")?.click() });
      }),
    );
  acts.appendChild(
    btn("ghost del", "Delete sound", () => {
      stop();
      state.lib.clips = state.lib.clips.filter((x) => x !== c);
      delete state.lib.designs[c.id];
      state.openId = "";
      editing = false;
      done();
      toast("Deleted", { label: "Undo", run: () => document.getElementById("undoBtn")?.click() });
    }),
  );

  box.append(
    name,
    el("div", "label", "Tags"),
    chipRow([...new Set([...c.tags, ...SUGGEST_TAGS])], c.tags, "", (t) => toggle(c.tags, t), "+ tag", (v) => addTo(c.tags, v.toLowerCase())),
    el("div", "label", "Projects"),
    chipRow(projectsInUse(), c.projects, "proj", (p) => toggle(c.projects, p), "+ project", (v) => {
      if (!state.lib.projects.includes(v)) state.lib.projects.push(v);
      addTo(c.projects, v);
    }),
    acts,
  );
  return box;
}

// ---- Variations: the current name, the list, save ----

const cleanName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);

function varBar(c: Clip, d: Design): HTMLElement {
  const bar = el("div", "vbar");
  const slot = el("div", "slot");
  const inp = el("input");
  inp.id = "varName";
  inp.value = d.loaded;
  inp.placeholder = d.vars.length ? "Name a new one" : "Name it";
  inp.maxLength = 24;
  inp.autocomplete = "off";
  inp.spellcheck = false;
  inp.setAttribute("autocapitalize", "off");
  inp.setAttribute("aria-label", "Variation name");
  const lv = loadedVar(d);
  const edited = !!lv && !sameFaders(lv.f, d.f);
  const drop = btn("drop", "▾", () => {
    listOpen = !listOpen;
    refreshVarBar();
  }, "Show variations");
  drop.setAttribute("aria-expanded", String(listOpen));
  slot.append(el("span", "lbl", "Variation"), inp);
  if (edited) {
    const dot = el("span", "edited");
    dot.title = "Changed since saved";
    dot.setAttribute("aria-label", "changed since saved");
    slot.appendChild(dot);
  }
  slot.appendChild(drop);

  const save = btn("save", "", () => saveVariation(c, d, inp.value));
  const label = () => {
    const name = cleanName(inp.value);
    const v = d.vars.find((x) => x.name === name);
    if (!name) {
      save.textContent = "+ Add";
      save.disabled = !anySet(d.f);
    } else if (v) {
      const same = sameFaders(v.f, d.f);
      save.textContent = same ? "Saved ✓" : "Update";
      save.disabled = same;
    } else {
      save.textContent = "+ Add";
      save.disabled = false;
    }
  };
  label();
  inp.addEventListener("input", label);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !save.disabled) save.click();
  });
  bar.append(slot, save);
  if (listOpen) bar.appendChild(varList(d));
  return bar;
}

function varList(d: Design): HTMLElement {
  const box = el("div", "vlist");
  const asRecorded = { name: "as recorded", f: defaultFaders() };
  for (const v of [asRecorded, ...d.vars]) {
    const base = v === asRecorded;
    const isCur = base ? !anySet(d.f) && !d.loaded : d.loaded === v.name;
    const row = el("div", "vrow" + (base ? " base" : "") + (isCur ? " cur" : ""));
    const pick = btn("vpick", null, () => {
      // Picking a variation sets every fader, locked or not
      d.f = { ...v.f };
      d.loaded = base ? "" : v.name;
      listOpen = false;
      showFaders(document.querySelector(".desk"), true);
      changed();
    });
    pick.append(fingerprint(v.f), el("span", null, v.name));
    row.append(pick, btn("vplay", "▶", () => void playResult(v.f), "Play " + v.name));
    if (!base)
      row.appendChild(
        btn("vdel", "×", () => {
          d.vars = d.vars.filter((x) => x !== v);
          if (d.loaded === v.name) d.loaded = "";
          changed(false);
          rerenderList();
          toast(`Deleted “${v.name}”`, { label: "Undo", run: () => document.getElementById("undoBtn")?.click() });
        }, "Delete " + v.name),
      );
    else row.appendChild(el("span"));
    box.appendChild(row);
  }
  return box;
}

/** A tiny bar per fader: which ones a variation uses, and which way. */
function fingerprint(f: Faders): HTMLElement {
  const p = el("span", "print");
  p.setAttribute("aria-hidden", "true");
  for (const k of FADER_KEYS) {
    const i = el("i");
    const b = el("b");
    const delta = f[k] - defaultOf(k);
    const on = Math.abs(delta) > 0.004;
    if (TWO_WAY.has(k)) {
      b.style.top = (delta >= 0 ? 50 - delta * 50 : 50) + "%";
      b.style.height = (on ? Math.max(12, Math.abs(delta) * 50) : 0) + "%";
    } else {
      b.style.bottom = "0";
      b.style.height = (on ? Math.max(12, f[k] * 100) : 0) + "%";
    }
    i.appendChild(b);
    p.appendChild(i);
  }
  return p;
}

function saveVariation(c: Clip, d: Design, raw: string): void {
  let name = cleanName(raw);
  if (!name) {
    let n = d.vars.length + 1;
    while (d.vars.some((v) => v.name === `idea ${n}`)) n++;
    name = `idea ${n}`;
  }
  const old = d.vars.find((v) => v.name === name);
  if (old) old.f = { ...d.f };
  else d.vars.push({ name, f: { ...d.f } } satisfies SavedVar);
  d.loaded = name;
  listOpen = false;
  commit();
  rerenderList();
  const files = fileCount(c, d);
  toast(old ? `Updated “${name}”` : `Added “${name}” · ${files} sound${files === 1 ? "" : "s"} to export`);
}

// ---- The waveform: crop handles, takes, caption ----

/**
 * The part of the recording shown for a take: from the end of the take before it to the start of
 * the one after, but no more than about the take's length again on each side.
 */
function view(c: Clip, i: number): [number, number] {
  const n = c.raw.data.length;
  const t = c.takes[i];
  const order = c.takes.map((r, j) => ({ r, j })).sort((a, b) => a.r.start - b.r.start);
  const at = order.findIndex((x) => x.j === i);
  const prev = order[at - 1]?.r;
  const next = order[at + 1]?.r;
  const room = Math.max(Math.round(0.4 * c.raw.sampleRate), t.end - t.start);
  const pad = Math.round(0.06 * c.raw.sampleRate);
  const lo = Math.max(0, t.start - room, Math.min(prev ? prev.end : 0, t.start - pad));
  const hi = Math.min(n, t.end + room, Math.max(next ? next.start : n, t.end + pad));
  return [lo, Math.max(lo + 1, hi)];
}

function drawMain(): void {
  const o = cur();
  const canvas = document.getElementById("waveCanvas") as HTMLCanvasElement | null;
  if (!o || !canvas) return;
  const [lo, hi] = view(o.c, state.selTake);
  drawWave(canvas, o.c.raw.data, anySet(o.d.f) ? "--wave" : "--raw", lo, hi);
}

export const redrawPanel = drawMain;

function waveBox(c: Clip): HTMLElement {
  const w = el("div", "wave");
  w.id = "wave";
  w.setAttribute("aria-label", "Waveform. Tap to hear the result, hold for the original.");
  const canvas = el("canvas");
  canvas.id = "waveCanvas";
  const shadeL = el("div", "shade l");
  const shadeR = el("div", "shade r");
  const handles = { start: el("div", "handle"), end: el("div", "handle") };
  const cap = el("div", "wcap");
  cap.id = "caption";
  cap.setAttribute("aria-live", "polite");
  w.append(canvas, shadeL, shadeR, el("div", "head"), handles.start, handles.end, el("div", "badge"), cap);

  if (c.takes.length > 1) {
    const tabs = el("div", "wtakes");
    c.takes.forEach((_, i) => {
      const b = btn(null, String(i + 1), () => {
        state.selTake = i;
        rerenderList();
        void playResult();
      }, `Take ${i + 1}`);
      b.setAttribute("aria-pressed", String(i === state.selTake));
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("pointerup", (e) => e.stopPropagation());
      tabs.appendChild(b);
    });
    w.appendChild(tabs);
  }

  const i = state.selTake;
  let [lo, hi] = view(c, i);
  const sr = c.raw.sampleRate;
  const pct = (x: number) => ((x - lo) / (hi - lo)) * 100;
  const place = () => {
    const t = c.takes[i];
    shadeL.style.width = pct(t.start) + "%";
    shadeR.style.width = 100 - pct(t.end) + "%";
    for (const side of ["start", "end"] as const) {
      const h = handles[side];
      h.style.left = pct(t[side]) + "%";
      h.setAttribute("aria-valuetext", `${Math.round((t[side] / sr) * 1000)} ms`);
    }
  };
  const move = (side: "start" | "end", to: number) => {
    const r = clampRange(c.raw.data.length, sr, { ...c.takes[i], [side]: Math.max(lo, Math.min(hi, to)) }, side);
    c.takes[i] = r;
    place();
  };
  const cropDone = () => {
    // The view widens if a handle was pulled to its edge
    [lo, hi] = view(c, i);
    place();
    drawMain();
    commit();
    void playResult();
  };
  for (const side of ["start", "end"] as const) {
    const h = handles[side];
    h.tabIndex = 0;
    h.setAttribute("role", "slider");
    h.setAttribute("aria-label", side === "start" ? "Start of the take" : "End of the take");
    h.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      h.setPointerCapture(e.pointerId);
    });
    h.addEventListener("pointermove", (e) => {
      if (!h.hasPointerCapture(e.pointerId)) return;
      const r = w.getBoundingClientRect();
      move(side, lo + (Math.min(Math.max(e.clientX - r.left, 0), r.width) / r.width) * (hi - lo));
    });
    h.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      if (!h.hasPointerCapture(e.pointerId)) return;
      h.releasePointerCapture(e.pointerId);
      cropDone();
    });
    let keyTimer: ReturnType<typeof setTimeout> | undefined;
    h.addEventListener("keydown", (e) => {
      const step = (e.shiftKey ? 0.05 : 0.005) * sr;
      const at = c.takes[i][side];
      const to = { ArrowLeft: at - step, ArrowDown: at - step, ArrowRight: at + step, ArrowUp: at + step }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      move(side, to);
      clearTimeout(keyTimer);
      keyTimer = setTimeout(cropDone, 350);
    });
  }
  place();

  // Tap plays the result; hold plays the take as recorded
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  let down = false;
  w.addEventListener("pointerdown", () => {
    held = false;
    down = true;
    holdTimer = setTimeout(() => {
      held = true;
      void playResult(undefined, true);
    }, 280);
  });
  w.addEventListener("pointerup", () => {
    clearTimeout(holdTimer);
    if (down && !held) void playResult();
    down = false;
  });
  w.addEventListener("pointerleave", () => {
    clearTimeout(holdTimer);
    down = false;
  });
  w.tabIndex = 0;
  w.addEventListener("keydown", (e) => {
    if (e.target !== w || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    void playResult(undefined, e.shiftKey);
  });

  if (!hintShown) {
    hintShown = true;
    requestAnimationFrame(() => caption("", "Tap to play · hold for the original", undefined, 4000));
  }
  requestAnimationFrame(drawMain);
  return w;
}

// ---- Random and export ----

function tools(c: Clip, d: Design): HTMLElement {
  const row = el("div", "tools");
  const rnd = btn("tool", "⚄ Random", () => {
    const locked = new Set(d.locks);
    if (!canRandomize(locked)) {
      toast("Everything Random can change is locked.");
      return;
    }
    d.f = randomFaders(d.f, locked);
    d.loaded = "";
    showFaders(document.querySelector(".desk"), true);
    changed();
    caption("Random idea.", " Name it to keep it.");
  }, "Random settings, for ideas");
  const gear = btn("icon gear", "⚙", openExportSettings, "File settings");
  const n = fileCount(c, d);
  const ex = btn("export", `Export ${n} sound${n === 1 ? "" : "s"}`, () => void exportSound(c, d, ex));
  ex.title = d.vars.length ? `${d.vars.length} variation${d.vars.length === 1 ? "" : "s"} × ${c.takes.length} take${c.takes.length === 1 ? "" : "s"}` : `${c.takes.length} take${c.takes.length === 1 ? "" : "s"}, as set now`;
  row.append(rnd, el("span", "grow"), gear, ex);
  return row;
}
