import "./style.css";
import { makeExample, type ExampleName } from "./sounds/examples";
import { initChecklist, renderChecklist } from "./ui/checklist";
import { $ } from "./ui/dom";
import { baseTake, takeBuffer } from "./ui/engine";
import { exportPack, initExportControls, readExportOptions, setExportOptions } from "./ui/export";
import { initFoley, renderCard } from "./ui/foley";
import { initHistory, resetHistory } from "./ui/history";
import { renderHome, renderLibrary, setOpenSound, stopPlaying } from "./ui/home";
import { initLayers } from "./ui/layers";
import { enableSaving, loadSession, setExportReader } from "./ui/persist";
import { drawWave, play, playSequence } from "./ui/playback";
import { addRecording, initRecorder, setShowEntry, toggleRecord } from "./ui/recorder";
import { drawTakesWave, initSound, openSound, renderSound } from "./ui/sound";
import { clipById, design, state, type Screen } from "./ui/state";
import { initVariations, redrawVariations, scheduleRender, setEvenLoudness } from "./ui/variations";

const SCREENS: Screen[] = ["home", "checklist", "guide", "sound"];

function show(s: Screen): void {
  if (s !== "sound") state.soundId = "";
  stopPlaying();
  state.screen = s;
  for (const id of SCREENS) $(id).hidden = id !== s;
  document.body.dataset.screen = s;
  window.scrollTo(0, 0);
}

function goHome(): void {
  show("home");
  renderHome();
}

document.querySelectorAll<HTMLElement>("[data-home]").forEach((b) => (b.onclick = goHome));
$("toChecklist").onclick = () => {
  show("checklist");
  renderChecklist();
};
$("toGuide").onclick = () => {
  show("guide");
  renderCard();
};

setOpenSound((id) => {
  show("sound");
  void openSound(id);
});
setShowEntry((id) => {
  if (state.screen !== "home") show("home");
  state.openId = id;
  renderHome();
  document.querySelector(".entry.open")?.scrollIntoView({ block: "center", behavior: "smooth" });
});

initRecorder();
initChecklist();
initFoley(() => {
  goHome();
  void toggleRecord();
});
initSound();
initLayers();
initVariations();
initExportControls();
setExportReader(readExportOptions);

/** Layer 1's take as recorded, for Before / after. */
function before(): AudioBuffer | null {
  const l = design()?.layers[0];
  const c = l && clipById(l.clip);
  return c && l ? takeBuffer(c, baseTake(l)) : null;
}

$("playOut").onclick = () => play(state.out);
$("outWave").onclick = () => play(state.out);
$("compareBtn").onclick = () => playSequence([before(), state.out]);
$("exportBtn").onclick = exportPack;

initHistory(() => {
  if (state.screen === "sound") {
    if (!clipById(state.soundId) || !design()) return goHome();
    renderSound();
    scheduleRender(true); // play the restored result so the change is audible
  } else if (state.screen === "checklist") renderChecklist();
  else renderHome();
});

const FIRST: [ExampleName, string][] = [
  ["Tongue click", "click"],
  ["Knuckle knock", "knock"],
  ["Breath ‘fwoo’", "whoosh"],
];

/** First visit: a few example recordings, so the list isn't empty and there's something to try. */
function seed(): void {
  const t = Date.now() - FIRST.length * 60000;
  FIRST.forEach(([name, tag], i) => addRecording(makeExample(name), ["example", tag], t + i * 60000));
}

void (async () => {
  const saved = await loadSession();
  if (saved) {
    state.lib = saved.lib;
    setExportOptions(saved.exportOptions);
    setEvenLoudness(saved.evenLoudness);
  } else seed();
  resetHistory();
  enableSaving();
  goHome();
})();

// Waveforms are drawn at the canvas's pixel size and in the theme's colors, so redraw when either changes.
const redraw = () => {
  if (state.screen === "home") renderLibrary();
  if (state.screen === "sound") {
    drawTakesWave();
    drawWave($<HTMLCanvasElement>("outWave"), state.out);
    redrawVariations();
  }
};
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redraw, 120);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
