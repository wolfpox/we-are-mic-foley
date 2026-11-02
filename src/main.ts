import "./style.css";
import { makeExample, type ExampleName } from "./sounds/examples";
import { initChecklist, renderChecklist } from "./ui/checklist";
import { $ } from "./ui/dom";
import { initExportControls, readExportOptions, setExportOptions } from "./ui/export";
import { initFoley, renderCard } from "./ui/foley";
import { initHistory, resetHistory } from "./ui/history";
import { openSound, renderHome, renderLibrary } from "./ui/home";
import { initPanel, redrawPanel } from "./ui/panel";
import { enableSaving, loadSession, setExportReader } from "./ui/persist";
import { stop } from "./ui/playback";
import { addRecording, initRecorder, setShowEntry, toggleRecord } from "./ui/recorder";
import { state, type Screen } from "./ui/state";

const SCREENS: Screen[] = ["home", "checklist", "guide"];

function show(s: Screen): void {
  stop();
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

initPanel(renderLibrary);
setShowEntry((id) => {
  if (state.screen !== "home") goHome();
  openSound(id, true);
});

initRecorder();
initChecklist();
initFoley(() => {
  goHome();
  void toggleRecord();
});
initExportControls();
setExportReader(readExportOptions);

initHistory(() => {
  if (state.screen === "checklist") renderChecklist();
  else renderHome();
});

const FIRST: [ExampleName, string, string][] = [
  ["Tongue click", "Tongue click", "click"],
  ["Knuckle knock", "Knuckle knock", "knock"],
  ["Breath ‘fwoo’", "Breath", "whoosh"],
];

/** First visit: a few example recordings, so the list isn't empty and there's something to try. */
function seed(): void {
  const t = Date.now() - FIRST.length * 60000;
  FIRST.forEach(([kind, name, tag], i) => {
    const c = addRecording(makeExample(kind), ["example", tag], t + i * 60000);
    if (c) c.name = name;
  });
}

void (async () => {
  const saved = await loadSession();
  if (saved) {
    state.lib = saved.lib;
    setExportOptions(saved.exportOptions, saved.evenLoudness);
  } else seed();
  resetHistory();
  enableSaving();
  goHome();
})();

// Waveforms are drawn at the canvas's pixel size and in the theme's colors, so redraw when either changes.
const redraw = () => {
  if (state.screen === "home") renderLibrary();
  else redrawPanel();
};
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
let lastWidth = innerWidth;
window.addEventListener("resize", () => {
  // Phones resize the page when the on-screen keyboard opens; only a width change needs a redraw
  if (innerWidth === lastWidth) return;
  lastWidth = innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redraw, 120);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
