import "./style.css";
import { toMono } from "./dsp/prep";
import { makeExample } from "./recipes/examples";
import { RECIPES, byId, defaultParams } from "./recipes";
import { $ } from "./ui/dom";
import { exportPack, initExportControls, readExportOptions, setExportOptions } from "./ui/export";
import { commit, initHistory, resetHistory } from "./ui/history";
import { enableSaving, loadSession, scheduleSave, setExportReader, type SavedSession } from "./ui/persist";
import { drawWave, play, playSequence } from "./ui/playback";
import { buildRecipes, selectRecipe } from "./ui/recipes";
import { buildExamples, initSource, onFile, setGate, setRaw, toggleRecord } from "./ui/source";
import { state } from "./ui/state";
import { clearVars, generate, redrawVariations, replaceDiscarded, restoreVariations, scheduleRender } from "./ui/variations";

buildExamples();
buildRecipes();
initSource();
initExportControls();

$("recBtn").onclick = toggleRecord;
$("fileIn").onchange = onFile;
$("playOut").onclick = () => play(state.out);
$("playSrc").onclick = () => play(state.src);
$("compareBtn").onclick = () => playSequence([state.src, state.out]);
$("outWave").onclick = () => play(state.out);
$("varAmt").oninput = () => {
  $("varAmtOut").textContent = $<HTMLInputElement>("varAmt").value;
};
$("varAmt").addEventListener("change", scheduleSave);
$("varCount").addEventListener("change", scheduleSave);
$("genBtn").onclick = generate;
$("replaceBtn").onclick = replaceDiscarded;
$("exportBtn").onclick = exportPack;
setExportReader(readExportOptions);

/** Fresh start: default settings for every recipe, first recipe, first example. Undo can bring the old work back. */
function startOver(): void {
  state.params = Object.fromEntries(RECIPES.map((r) => [r.id, defaultParams(r)]));
  setGate(0);
  selectRecipe(RECIPES[0].id, false);
  setRaw(toMono(makeExample("Tongue click")), "Tongue click");
}

/** Puts a saved session back. Recipes added since it was saved get their defaults. */
async function restore(s: SavedSession): Promise<void> {
  state.params = Object.fromEntries(RECIPES.map((r) => [r.id, { ...defaultParams(r), ...(s.params[r.id] ?? {}) }]));
  setGate(s.gate);
  selectRecipe(byId[s.recipe] ? s.recipe : RECIPES[0].id, false);
  if (s.raw) setRaw(s.raw, s.srcName, s.trim ?? undefined);
  $<HTMLInputElement>("varAmt").value = String(s.varAmt);
  $("varAmtOut").textContent = String(s.varAmt);
  $<HTMLSelectElement>("varCount").value = String(s.varCount);
  setExportOptions(s.exportOptions);
  if (s.varMeta) await restoreVariations(s.varMeta, s.vars);
}

$("startOver").onclick = () => {
  startOver();
  commit();
};

initHistory((s) => {
  state.params = s.params;
  setGate(s.gate);
  selectRecipe(s.recipe, false);
  if (s.raw) setRaw(s.raw, s.srcName, s.trim ?? undefined);
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
      startOver(); // a saved session from an older version that no longer fits
      clearVars();
    }
    resetHistory();
  }
  enableSaving();
})();

// Waveforms are drawn at the canvas's pixel size and in the theme's colors, so redraw when either changes.
const redraw = () => {
  drawWave($<HTMLCanvasElement>("srcWave"), state.raw?.data ?? null);
  drawWave($<HTMLCanvasElement>("outWave"), state.out);
  redrawVariations();
};
window.addEventListener("resize", redraw);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
