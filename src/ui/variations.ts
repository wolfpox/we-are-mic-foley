import { matchLoudnessGains } from "../dsp/loudness";
import { ALL_TAKES, spreadPitches, takeOrder, type VarSpec } from "../dsp/sound";
import { mulberry32 } from "../dsp/rng";
import { percent, slider } from "./controls";
import { $ } from "./dom";
import { renderBase, renderVariation } from "./engine";
import { commit } from "./history";
import { scheduleSave } from "./persist";
import { drawWave, ms, play } from "./playback";
import { clipById, copyClip, design, fileBase, soundKey, state, usedClips, type VarMeta, type Variation } from "./state";

const EMPTY = "";

let renderTimer: ReturnType<typeof setTimeout> | undefined;
let renderToken = 0;

/** Re-renders the base sound shortly after the last change, so slider drags don't queue up renders. */
export function scheduleRender(autoplay: boolean): void {
  clearTimeout(renderTimer);
  updateStale();
  renderTimer = setTimeout(async () => {
    const d = design();
    if (!d) return;
    const token = ++renderToken;
    const job = renderBase(d.layers, d.fx, state.lib.clips);
    const buf = job && (await job);
    if (token !== renderToken) return; // a newer render started meanwhile
    state.out = buf;
    $("outDur").textContent = ms(buf);
    drawWave($<HTMLCanvasElement>("outWave"), buf);
    if (buf && autoplay && $<HTMLInputElement>("autoplay").checked) play(buf);
  }, 140);
}

/** Copies the variations' settings into the open sound effect, so they're saved and counted. */
function syncSaved(): void {
  const d = design();
  if (d) d.vars = state.vars.map((v) => ({ seed: v.seed, pitch: v.pitch, takes: v.takes, kept: v.kept }));
}

function scaled(b: AudioBuffer, gain: number): AudioBuffer {
  if (gain === 1) return b;
  const out = new AudioBuffer({ length: b.length, sampleRate: b.sampleRate, numberOfChannels: 1 });
  const d = b.getChannelData(0);
  const o = out.getChannelData(0);
  for (let i = 0; i < d.length; i++) o[i] = d[i] * gain;
  return out;
}

/** Applies "Even out loudness": kept variations are matched to the quietest one. Discarded ones are left as rendered. */
function levelPack(): void {
  const kept = state.vars.filter((v) => v.kept);
  const gains = state.evenLoudness ? matchLoudnessGains(kept.map((v) => v.rendered.getChannelData(0)), kept[0]?.rendered.sampleRate ?? 44100) : [];
  for (const v of state.vars) {
    const k = kept.indexOf(v);
    const g = k >= 0 && state.evenLoudness ? gains[k] : 1;
    if (g !== v.gain) {
      v.gain = g;
      v.buf = scaled(v.rendered, g);
    }
  }
}

/** Turns loudness matching on or off and updates the variations. */
export function setEvenLoudness(on: boolean): void {
  state.evenLoudness = on;
  $<HTMLInputElement>("evenLoud").checked = on;
  levelPack();
  redrawVariations();
}

/** Name for the n-th file (1-based), e.g. footstep_03. */
export const varName = (file: string, n: number) => `${file}_${String(n).padStart(2, "0")}`;


/** Shows a hint when the settings changed after the variations were made. */
function updateStale(): void {
  const d = design();
  const m = d?.varMeta;
  const stale = !!d && !!m && state.vars.length > 0 && soundKey(m.layers, m.fx, m.spread, m.sources) !== soundKey(d.layers, d.fx, d.spread, usedClips(d.layers));
  $("staleNote").hidden = !stale;
}

/** Updates the buttons and counts that depend on which variations are kept. */
function updateControls(): void {
  const total = state.vars.length;
  const kept = state.vars.filter((v) => v.kept).length;
  const discarded = total - kept;
  $<HTMLButtonElement>("exportBtn").disabled = kept === 0;
  $<HTMLButtonElement>("exportBtn").textContent = kept ? `Export ${kept} sounds` : "Export .zip";
  const replace = $<HTMLButtonElement>("replaceBtn");
  replace.hidden = discarded === 0;
  replace.textContent = `Replace ${discarded} discarded`;
  updateStale();
}

/** What a tile says about its variation, e.g. "take 2 · +1.4 st", or "takes 2, 3" with several recordings. */
function describe(v: Variation, m: VarMeta): string {
  const takes = [...takeGroups(m).values()].filter((g) => g.count > 1).map((g) => v.takes[g.layers[0]] + 1);
  const p = Math.round(v.pitch * 10) / 10;
  return [takes.length ? `take${takes.length > 1 ? "s" : ""} ${takes.join(", ")}` : "", p ? `${p > 0 ? "+" : "−"}${Math.abs(p)} st` : ""].filter(Boolean).join(" · ");
}

/** Draws one tile per variation: tap to play, with a discard / keep toggle. */
function renderTiles(): Element[] {
  const box = $("vars");
  box.innerHTML = "";
  updateControls();
  const m = design()?.varMeta;
  if (!state.vars.length || !m) {
    box.innerHTML = EMPTY;
    return [];
  }
  return state.vars.map((v, i) => {
    const tile = document.createElement("div");
    tile.className = "var";
    tile.classList.toggle("discarded", !v.kept);

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "var-play";
    playBtn.setAttribute("aria-label", "Play " + v.name);
    const c = document.createElement("canvas");
    const nm = document.createElement("span");
    nm.className = "vname";
    nm.textContent = v.name;
    const what = document.createElement("span");
    what.className = "vwhat";
    what.textContent = describe(v, m);
    playBtn.append(c, nm, what);
    playBtn.onclick = () => {
      box.querySelectorAll(".var").forEach((x) => x.classList.remove("playing"));
      tile.classList.add("playing");
      play(v.buf, () => tile.classList.remove("playing"));
    };

    const x = document.createElement("button");
    x.type = "button";
    x.className = "var-x";
    const setX = () => {
      x.textContent = v.kept ? "Discard" : "Keep";
      x.setAttribute("aria-label", (v.kept ? "Discard " : "Keep ") + v.name);
    };
    setX();
    x.onclick = () => {
      state.vars[i].kept = !state.vars[i].kept;
      tile.classList.toggle("discarded", !v.kept);
      setX();
      levelPack();
      redrawVariations();
      updateControls();
      syncSaved();
      scheduleSave();
    };

    tile.append(playBtn, x);
    box.appendChild(tile);
    drawWave(c, v.buf);
    return tile;
  });
}

/** Plays the given tiles one after another, so the spread is easy to judge. */
function audition(tiles: Element[], bufs: AudioBuffer[]): void {
  let k = 0;
  const next = () => {
    if (k >= bufs.length) return;
    document.querySelectorAll(".var").forEach((x) => x.classList.remove("playing"));
    const t = tiles[k];
    t.classList.add("playing");
    play(bufs[k++], () => {
      t.classList.remove("playing");
      setTimeout(next, 120);
    });
  };
  next();
}

async function busy<T>(btn: HTMLButtonElement, label: string, work: () => Promise<T>): Promise<T> {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    return await work();
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

const newSeed = () => (Math.random() * 2 ** 31) | 0;

/**
 * Which layers vary their take, grouped by recording: layers that play the same recording use the
 * same take in each variation, so a pitched-down copy stays a copy of the same hit.
 */
function takeGroups(m: VarMeta): Map<string, { count: number; layers: number[] }> {
  const groups = new Map<string, { count: number; layers: number[] }>();
  m.layers.forEach((l, i) => {
    if (l.take !== ALL_TAKES) return;
    const g = groups.get(l.clip) ?? { count: clipById(l.clip, m.sources)?.takes.length ?? 1, layers: [] };
    g.layers.push(i);
    groups.set(l.clip, g);
  });
  return groups;
}

/** Specs for a whole set: pitches spread evenly, and each recording works through all its takes. */
function planSet(n: number, m: VarMeta, seed: number): VarSpec[] {
  const rand = mulberry32(seed);
  const pitches = spreadPitches(n, m.spread.pitch, rand);
  const takes = pitches.map(() => m.layers.map((l) => Math.max(0, l.take)));
  for (const g of takeGroups(m).values()) {
    const order = takeOrder(n, g.count, rand);
    for (let k = 0; k < n; k++) for (const i of g.layers) takes[k][i] = order[k];
  }
  return pitches.map((pitch, k) => ({ seed: newSeed(), pitch, takes: takes[k] }));
}

/** A single new spec, for replacing a discarded variation. */
function planOne(m: VarMeta): VarSpec {
  const rand = mulberry32(newSeed());
  const takes = m.layers.map((l) => Math.max(0, l.take));
  for (const g of takeGroups(m).values()) {
    const t = Math.floor(rand() * g.count);
    for (const i of g.layers) takes[i] = t;
  }
  return { seed: newSeed(), pitch: (rand() * 2 - 1) * m.spread.pitch, takes };
}

async function make(m: VarMeta, spec: VarSpec, name: string, kept = true): Promise<Variation | null> {
  const job = renderVariation(m.layers, m.fx, m.spread, m.sources, spec);
  const rendered = job && (await job);
  return rendered ? { ...spec, name, kept, rendered, buf: rendered, gain: 1 } : null;
}

export async function generate(): Promise<void> {
  const d = design();
  if (!d || !d.layers.length) return;
  const id = state.soundId;
  const m: VarMeta = {
    layers: d.layers.map((l) => ({ ...l })),
    fx: { ...d.fx },
    spread: { ...d.spread },
    name: fileBase(d.name),
    sources: usedClips(d.layers).map(copyClip),
  };
  const specs = planSet(d.count, m, newSeed());
  const vars = await busy($<HTMLButtonElement>("genBtn"), "Rendering…", async () => {
    const out: Variation[] = [];
    for (const [i, s] of specs.entries()) {
      const v = await make(m, s, varName(m.name, i + 1));
      if (v) out.push(v);
    }
    return out;
  });
  d.varMeta = m;
  d.vars = vars.map((v) => ({ seed: v.seed, pitch: v.pitch, takes: v.takes, kept: true }));
  scheduleSave();
  if (state.soundId !== id) return; // they moved on to another sound meanwhile
  state.vars = vars;
  levelPack();
  audition(renderTiles(), vars.map((v) => v.buf));
}

/** Re-renders the open sound effect's saved variations. Plays nothing. */
export async function restoreVariations(): Promise<void> {
  const d = design();
  const id = state.soundId;
  const meta = d?.varMeta;
  const vars: Variation[] = [];
  if (d && meta) {
    for (const [i, s] of d.vars.entries()) {
      const v = await make(meta, s, varName(meta.name, i + 1), s.kept);
      if (v) vars.push(v);
      if (state.soundId !== id) return;
    }
  }
  state.vars = vars;
  levelPack();
  renderTiles();
}

/** Re-rolls only the discarded variations, with the settings the set was made with. */
export async function replaceDiscarded(): Promise<void> {
  const m = design()?.varMeta;
  if (!m) return;
  const slots = state.vars.map((v, i) => (v.kept ? -1 : i)).filter((i) => i >= 0);
  await busy($<HTMLButtonElement>("replaceBtn"), "Rendering…", async () => {
    for (const i of slots) {
      const v = await make(m, planOne(m), state.vars[i].name);
      if (v) state.vars[i] = v;
    }
  });
  levelPack();
  syncSaved();
  const tiles = renderTiles();
  scheduleSave();
  audition(slots.map((i) => tiles[i]), slots.map((i) => state.vars[i].buf));
}

/** Renames the current variations to match the sound's name. */
export function renameVariations(): void {
  const d = design();
  const m = d?.varMeta;
  if (!d || !m) return;
  m.name = fileBase(d.name);
  state.vars.forEach((v, i) => (v.name = varName(m.name, i + 1)));
  renderTiles();
  scheduleSave();
}

export function redrawVariations(): void {
  $("vars")
    .querySelectorAll<HTMLCanvasElement>(".var canvas")
    .forEach((c, i) => state.vars[i] && drawWave(c, state.vars[i].buf));
}

/** Variation controls, from the open sound effect's settings. */
export function renderSpread(): void {
  const d = design();
  const box = $("spread");
  box.innerHTML = "";
  if (!d) return;
  const sp = d.spread;
  box.append(
    slider({
      id: "spPitch", label: "Pitch spread", min: 0, max: 6, step: 0.5, value: sp.pitch,
      format: (v) => (v ? `±${v} st` : "Off"),
      onInput: (v) => { sp.pitch = v; updateStale(); },
      onChange: commit,
    }),
    slider({
      id: "spTone", label: "Tone spread", min: 0, max: 100, value: Math.round(sp.tone * 100),
      format: percent,
      onInput: (v) => { sp.tone = v / 100; updateStale(); },
      onChange: commit,
    }),
  );
  if (d.layers.length > 1)
    box.append(
      slider({
        id: "spTiming", label: "Timing spread", min: 0, max: 100, value: Math.round(sp.timing * 100),
        format: (v) => (v ? `±${Math.round(v * 0.4)} ms` : "Off"),
        onInput: (v) => { sp.timing = v / 100; updateStale(); },
        onChange: commit,
      }),
    );
  $<HTMLSelectElement>("varCount").value = String(d.count);
  $<HTMLInputElement>("soundName").value = d.name;
  updateNamePreview();
}

export function updateNamePreview(): void {
  const d = design();
  $("namePreview").textContent = d ? `${varName(fileBase(d.name), 1)}.${$<HTMLSelectElement>("expFormat").value} …` : "";
}

export function initVariations(): void {
  $("varCount").addEventListener("change", () => {
    const d = design();
    if (!d) return;
    d.count = Number($<HTMLSelectElement>("varCount").value);
    commit();
  });
  $("soundName").addEventListener("change", () => {
    const d = design();
    if (!d) return;
    const el = $<HTMLInputElement>("soundName");
    d.name = fileBase(el.value);
    el.value = d.name;
    renameVariations();
    updateNamePreview();
    commit();
  });
  $("expFormat").addEventListener("change", updateNamePreview);
  $("evenLoud").addEventListener("change", () => {
    setEvenLoudness($<HTMLInputElement>("evenLoud").checked);
    scheduleSave();
  });
  $("genBtn").onclick = generate;
  $("replaceBtn").onclick = replaceDiscarded;
}
