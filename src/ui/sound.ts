import { ALL_TAKES } from "../dsp/sound";
import { $ } from "./dom";
import { takeBuffer } from "./engine";
import { commit } from "./history";
import { renderFx, renderLayers, renderStarts } from "./layers";
import { scheduleSave } from "./persist";
import { drawWave, play } from "./playback";
import { clipById, clipLabel, newDesign, state, type Clip } from "./state";
import { initTrim, setTrimView } from "./trim";
import { renderSpread, restoreVariations, scheduleRender } from "./variations";

// The sound screen: one recording made into a sound effect. Takes, shape, variations, export.

export const mainClip = (): Clip | undefined => clipById(state.soundId);

/** Plays one take, cleaned up as it will be used. */
export function playTake(c: Clip | undefined, i: number): void {
  if (c) play(takeBuffer(c, i));
}

const takeMs = (c: Clip, i: number) => {
  const t = c.takes[i];
  return t ? `${Math.round(((t.end - t.start) / c.raw.sampleRate) * 1000)} ms` : "";
};

export function drawTakesWave(): void {
  const c = mainClip();
  if (state.screen === "sound") drawWave($<HTMLCanvasElement>("srcWave"), c?.raw.data ?? null, c ? c.takes.filter((_, i) => i !== state.selTake) : []);
}

const gateLabel = (v: number) => {
  $("gateOut").textContent = v === 0 ? "Off" : String(v);
};

export function renderTakes(): void {
  const c = mainClip();
  if (!c) return;
  state.selTake = Math.min(state.selTake, c.takes.length - 1);
  drawTakesWave();
  setTrimView(c.raw.data.length, c.raw.sampleRate, c.takes[state.selTake]);
  $("srcDur").textContent = takeMs(c, state.selTake);
  const box = $("takes");
  box.innerHTML = "";
  c.takes.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = String(i + 1);
    b.setAttribute("aria-label", `Take ${i + 1}`);
    b.setAttribute("aria-pressed", String(i === state.selTake));
    b.onclick = () => {
      state.selTake = i;
      renderTakes();
      playTake(c, i);
    };
    box.appendChild(b);
  });
  $<HTMLButtonElement>("delTake").disabled = c.takes.length <= 1;
  const v = Math.round(c.gate * 100);
  $<HTMLInputElement>("gateAmt").value = String(v);
  gateLabel(v);
}

/** Something about the recording changed: re-render, and make it undoable. */
function clipChanged(): void {
  renderTakes();
  renderLayers();
  scheduleRender(false);
  commit();
}

export function renderSound(): void {
  const c = mainClip();
  if (!c) return;
  $("soundTitle").textContent = clipLabel(c);
  renderTakes();
  renderStarts();
  renderLayers();
  renderFx();
  renderSpread();
}

/** Opens a recording's sound effect, making one (a single layer, all effects off) the first time. */
export async function openSound(id: string): Promise<void> {
  const c = clipById(id);
  if (!c) return;
  if (!state.lib.designs[id]) {
    state.lib.designs[id] = newDesign(c);
    scheduleSave();
  }
  state.soundId = id;
  state.selTake = 0;
  state.vars = [];
  state.out = null;
  renderSound();
  scheduleRender(false);
  await restoreVariations();
}

export function initSound(): void {
  initTrim((r, done) => {
    const c = mainClip();
    if (!c) return;
    c.takes[state.selTake] = r;
    $("srcDur").textContent = takeMs(c, state.selTake);
    if (done) {
      playTake(c, state.selTake);
      clipChanged();
    }
  });
  $("srcWave").addEventListener("click", () => playTake(mainClip(), state.selTake));

  const gate = $<HTMLInputElement>("gateAmt");
  gate.addEventListener("input", () => gateLabel(Number(gate.value)));
  // Applied on release: cleanup re-processes the take
  gate.addEventListener("change", () => {
    const c = mainClip();
    if (!c) return;
    c.gate = Number(gate.value) / 100;
    playTake(c, state.selTake);
    clipChanged();
  });

  $("delTake").onclick = () => {
    const c = mainClip();
    if (!c || c.takes.length <= 1) return;
    c.takes.splice(state.selTake, 1);
    for (const d of Object.values(state.lib.designs)) for (const l of d.layers) if (l.clip === c.id && l.take >= c.takes.length) l.take = ALL_TAKES;
    state.selTake = Math.max(0, state.selTake - 1);
    clipChanged();
  };

  $("addTake").onclick = () => {
    const c = mainClip();
    if (!c) return;
    // Starts as a copy of the selected take; drag the handles onto the sound you want
    c.takes.splice(state.selTake + 1, 0, { ...c.takes[state.selTake] });
    state.selTake++;
    clipChanged();
  };
}
