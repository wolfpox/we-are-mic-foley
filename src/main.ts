import "./style.css";
import { toMono } from "./dsp/prep";
import { makeExample } from "./recipes/examples";
import { RECIPES } from "./recipes";
import { $ } from "./ui/dom";
import { exportPack, initExportControls } from "./ui/export";
import { initHistory } from "./ui/history";
import { drawWave, play, playSequence } from "./ui/playback";
import { buildRecipes, selectRecipe } from "./ui/recipes";
import { buildExamples, initSource, onFile, setGate, setRaw, toggleRecord } from "./ui/source";
import { state } from "./ui/state";
import { generate, redrawVariations, replaceDiscarded, scheduleRender } from "./ui/variations";

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
$("genBtn").onclick = generate;
$("replaceBtn").onclick = replaceDiscarded;
$("exportBtn").onclick = exportPack;

selectRecipe(RECIPES[0].id, false);
setRaw(toMono(makeExample("Tongue click")), "Tongue click");

initHistory((s) => {
  state.params = s.params;
  setGate(s.gate);
  selectRecipe(s.recipe, false);
  if (s.raw) setRaw(s.raw, s.srcName, s.trim ?? undefined);
  scheduleRender(true); // play the restored result so the change is audible
});

// Waveforms are drawn at the canvas's pixel size and in the theme's colors, so redraw when either changes.
const redraw = () => {
  drawWave($<HTMLCanvasElement>("srcWave"), state.raw?.data ?? null);
  drawWave($<HTMLCanvasElement>("outWave"), state.out);
  redrawVariations();
};
window.addEventListener("resize", redraw);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
