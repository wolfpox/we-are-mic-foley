import "./style.css";
import { defaultLayer } from "./dsp/sound";
import { $ } from "./ui/dom";
import { exportPack, initExportControls, readExportOptions, setExportOptions } from "./ui/export";
import { commit, initHistory, resetHistory } from "./ui/history";
import { addClip, drawClipWave, initLibrary, renderLibrary } from "./ui/library";
import { initLayers, renderFx, renderLayers } from "./ui/layers";
import { enableSaving, loadSession, setExportReader, type Loaded } from "./ui/persist";
import { drawWave, play, playSequence } from "./ui/playback";
import { makeExample } from "./sounds/examples";
import { newProject, state } from "./ui/state";
import { takeBuffer, baseTake } from "./ui/engine";
import { clearVars, initVariations, redrawVariations, renderSpread, restoreVariations, scheduleRender, setEvenLoudness } from "./ui/variations";

initLibrary();
initLayers();
initVariations();
initExportControls();
setExportReader(readExportOptions);

/** The first layer's take as recorded, for Before / after. */
function before(): AudioBuffer | null {
  const l = state.project.layers[0];
  const c = l && state.project.clips.find((x) => x.id === l.clip);
  return c ? takeBuffer(c, baseTake(l)) : null;
}

$("playOut").onclick = () => play(state.out);
$("outWave").onclick = () => play(state.out);
$("compareBtn").onclick = () => playSequence([before(), state.out]);
$("exportBtn").onclick = exportPack;

/** Redraws every panel from state.project. */
function renderAll(): void {
  renderLibrary();
  renderLayers();
  renderFx();
  renderSpread();
}

/** Fresh start: one example recording on one layer, every effect off. Undo can bring the old work back. */
function startOver(): void {
  state.project = newProject();
  state.selClip = "";
  const c = addClip(makeExample("Tongue click"), "Tongue click (example)");
  if (c) state.project.layers = [defaultLayer(c.id)];
  renderAll();
  scheduleRender(false);
}

async function restore(s: Loaded): Promise<void> {
  if (!s.project.clips.length) return;
  state.project = s.project;
  // A layer whose recording went missing plays the first one instead
  for (const l of state.project.layers) if (!state.project.clips.some((c) => c.id === l.clip)) l.clip = state.project.clips[0].id;
  if (!state.project.layers.length) state.project.layers = [defaultLayer(state.project.clips[0].id)];
  state.selClip = s.selClip;
  state.selTake = s.selTake;
  setExportOptions(s.exportOptions);
  setEvenLoudness(s.evenLoudness);
  renderAll();
  scheduleRender(false);
  if (s.varMeta) await restoreVariations(s.varMeta, s.vars);
}

$("startOver").onclick = () => {
  startOver();
  clearVars();
  commit();
};

initHistory((s) => {
  state.project = s.project;
  state.selClip = s.selClip;
  state.selTake = s.selTake;
  renderAll();
  scheduleRender(true); // play the restored result so the change is audible
});

startOver();
resetHistory();
void (async () => {
  const saved = await loadSession();
  if (saved) {
    try {
      await restore(saved);
    } catch {
      startOver(); // a saved session that no longer fits
      clearVars();
    }
    resetHistory();
  }
  enableSaving();
})();

// Waveforms are drawn at the canvas's pixel size and in the theme's colors, so redraw when either changes.
const redraw = () => {
  drawClipWave();
  drawWave($<HTMLCanvasElement>("outWave"), state.out);
  redrawVariations();
};
window.addEventListener("resize", redraw);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
