import { render } from "../dsp/render";
import { byId } from "../recipes";
import { $ } from "./dom";
import { scheduleSave } from "./persist";
import { drawWave, ms, play } from "./playback";
import { state, type Variation, type VariationMeta } from "./state";

const EMPTY = '<p class="empty">Variations appear here. Tap one to hear it.</p>';

let renderTimer: ReturnType<typeof setTimeout> | undefined;
let renderToken = 0;

/** Re-renders the base sound shortly after the last change, so slider drags don't queue up renders. */
export function scheduleRender(autoplay: boolean): void {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(async () => {
    if (!state.src) return;
    const token = ++renderToken;
    const r = byId[state.recipe];
    const buf = await render(r, state.src, state.params[r.id], 1, 0);
    if (token !== renderToken) return; // a newer render started meanwhile
    state.out = buf;
    $("outName").textContent = r.file + " · base";
    $("outDur").textContent = ms(buf);
    drawWave($<HTMLCanvasElement>("outWave"), buf);
    if (autoplay && $<HTMLInputElement>("autoplay").checked) play(buf);
  }, 140);
}

export function clearVars(): void {
  state.vars = [];
  state.varMeta = null;
  renderTiles();
  scheduleSave();
}

const keptCount = () => state.vars.filter((v) => v.kept).length;

/** Name for the n-th file (1-based), e.g. footstep_hard_03. */
export const varName = (file: string, n: number) => `${file}_${String(n).padStart(2, "0")}`;

/** Updates the buttons and counts that depend on which variations are kept. */
function updateControls(): void {
  const total = state.vars.length;
  const kept = keptCount();
  const discarded = total - kept;
  $<HTMLButtonElement>("exportBtn").disabled = kept === 0;
  $<HTMLButtonElement>("exportBtn").textContent = kept && discarded ? `Export ${kept} sounds (.zip)` : "Export pack (.zip)";
  const replace = $<HTMLButtonElement>("replaceBtn");
  replace.hidden = discarded === 0;
  replace.textContent = `Replace ${discarded} discarded`;
}

/** Draws one tile per variation: tap to play, with a discard / keep toggle. */
function renderTiles(): Element[] {
  const box = $("vars");
  box.innerHTML = "";
  if (!state.vars.length) {
    box.innerHTML = EMPTY;
    updateControls();
    return [];
  }
  const tiles = state.vars.map((v, i) => {
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
    playBtn.append(c, nm);
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
      updateControls();
      scheduleSave();
    };

    tile.append(playBtn, x);
    box.appendChild(tile);
    drawWave(c, v.buf);
    return tile;
  });
  updateControls();
  return tiles;
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

const newSeed = () => (Math.random() * 1e9) | 0;

export async function generate(): Promise<void> {
  const src = state.src;
  if (!src) return;
  const r = byId[state.recipe];
  const n = Number($<HTMLSelectElement>("varCount").value);
  const amt = Number($<HTMLInputElement>("varAmt").value) / 100;
  const params = { ...state.params[r.id] };
  const vars: Variation[] = await busy($<HTMLButtonElement>("genBtn"), "Rendering…", async () => {
    const out: Variation[] = [];
    for (let i = 0; i < n; i++) {
      const seed = newSeed();
      out.push({ seed, name: varName(r.file, i + 1), kept: true, buf: await render(r, src, params, seed, amt) });
    }
    return out;
  });
  state.vars = vars;
  const trimMs = (n: number) => (state.raw ? Math.round((n / state.raw.sampleRate) * 1000) : 0);
  state.varMeta = {
    recipe: r.id,
    params,
    variation: amt,
    source: state.srcName,
    sourceTrimMs: [trimMs(state.trim?.start ?? 0), trimMs(state.trim?.end ?? 0)],
    noiseCleanup: state.gate,
  };
  const tiles = renderTiles();
  scheduleSave();
  audition(tiles, vars.map((v) => v.buf));
}

/** Re-renders saved variations from their seeds (after a reload). Plays nothing. */
export async function restoreVariations(meta: VariationMeta, saved: { seed: number; kept: boolean }[]): Promise<void> {
  const src = state.src;
  const r = byId[meta.recipe];
  if (!src || !r || meta.recipe !== state.recipe || !saved.length) return;
  const vars: Variation[] = [];
  for (const [i, v] of saved.entries()) {
    vars.push({ seed: v.seed, kept: v.kept, name: varName(r.file, i + 1), buf: await render(r, src, meta.params, v.seed, meta.variation) });
  }
  state.vars = vars;
  state.varMeta = meta;
  renderTiles();
}

/** Re-rolls only the discarded variations, with the settings the set was made with. */
export async function replaceDiscarded(): Promise<void> {
  const m = state.varMeta;
  const src = state.src;
  if (!m || !src) return;
  const r = byId[m.recipe];
  const slots = state.vars.map((v, i) => (v.kept ? -1 : i)).filter((i) => i >= 0);
  await busy($<HTMLButtonElement>("replaceBtn"), "Rendering…", async () => {
    for (const i of slots) {
      const seed = newSeed();
      state.vars[i] = { seed, name: state.vars[i].name, kept: true, buf: await render(r, src, m.params, seed, m.variation) };
    }
  });
  const tiles = renderTiles();
  scheduleSave();
  audition(slots.map((i) => tiles[i]), slots.map((i) => state.vars[i].buf));
}

export function redrawVariations(): void {
  $("vars")
    .querySelectorAll<HTMLCanvasElement>(".var canvas")
    .forEach((c, i) => state.vars[i] && drawWave(c, state.vars[i].buf));
}
