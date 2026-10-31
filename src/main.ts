import "./style.css";
import { makeExample } from "./recipes/examples";
import { RECIPES } from "./recipes";
import { $ } from "./ui/dom";
import { exportPack } from "./ui/export";
import { drawWave, play } from "./ui/playback";
import { buildRecipes, selectRecipe } from "./ui/recipes";
import { buildExamples, onFile, setSource, toggleRecord } from "./ui/source";
import { state } from "./ui/state";
import { generate, redrawVariations } from "./ui/variations";

buildExamples();
buildRecipes();

$("recBtn").onclick = toggleRecord;
$("fileIn").onchange = onFile;
$("playOut").onclick = () => play(state.out);
$("playSrc").onclick = () => play(state.src);
$("srcWave").onclick = () => play(state.src);
$("outWave").onclick = () => play(state.out);
$("varAmt").oninput = () => {
  $("varAmtOut").textContent = $<HTMLInputElement>("varAmt").value;
};
$("genBtn").onclick = generate;
$("exportBtn").onclick = exportPack;

selectRecipe(RECIPES[0].id, false);
setSource(makeExample("Tongue click"), "Tongue click");

// Waveforms are drawn at the canvas's pixel size and in the theme's colors, so redraw when either changes.
const redraw = () => {
  drawWave($<HTMLCanvasElement>("srcWave"), state.src);
  drawWave($<HTMLCanvasElement>("outWave"), state.out);
  redrawVariations();
};
window.addEventListener("resize", redraw);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
