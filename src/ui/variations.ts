import { render } from "../dsp/render";
import { byId } from "../recipes";
import { $ } from "./dom";
import { drawWave, ms, play } from "./playback";
import { state, type Variation } from "./state";

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
  $("vars").innerHTML = EMPTY;
  $<HTMLButtonElement>("exportBtn").disabled = true;
}

export async function generate(): Promise<void> {
  if (!state.src) return;
  const r = byId[state.recipe];
  const n = Number($<HTMLSelectElement>("varCount").value);
  const amt = Number($<HTMLInputElement>("varAmt").value) / 100;
  const genBtn = $<HTMLButtonElement>("genBtn");
  genBtn.disabled = true;
  genBtn.textContent = "Rendering…";
  const vars: Variation[] = [];
  for (let i = 0; i < n; i++) {
    const seed = (Math.random() * 1e9) | 0;
    vars.push({ seed, name: `${r.file}_${String(i + 1).padStart(2, "0")}.wav`, buf: await render(r, state.src, state.params[r.id], seed, amt) });
  }
  state.vars = vars;
  state.varMeta = { recipe: r.id, params: { ...state.params[r.id] }, variation: amt, source: state.srcName };

  const box = $("vars");
  box.innerHTML = "";
  const tiles = vars.map((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "var";
    b.setAttribute("aria-label", "Play " + v.name);
    const c = document.createElement("canvas");
    const nm = document.createElement("span");
    nm.className = "vname";
    nm.textContent = v.name;
    b.append(c, nm);
    box.appendChild(b);
    drawWave(c, v.buf);
    b.onclick = () => {
      box.querySelectorAll(".var").forEach((x) => x.classList.remove("playing"));
      b.classList.add("playing");
      play(v.buf, () => b.classList.remove("playing"));
    };
    return b;
  });
  genBtn.disabled = false;
  genBtn.textContent = "Generate variations";
  $<HTMLButtonElement>("exportBtn").disabled = false;

  // Play them in sequence so the spread is easy to judge
  let k = 0;
  const next = () => {
    if (k >= vars.length) return;
    tiles.forEach((x) => x.classList.remove("playing"));
    const t = tiles[k];
    t.classList.add("playing");
    play(vars[k++].buf, () => {
      t.classList.remove("playing");
      setTimeout(next, 120);
    });
  };
  next();
}

export function redrawVariations(): void {
  $("vars")
    .querySelectorAll<HTMLCanvasElement>(".var canvas")
    .forEach((c, i) => state.vars[i] && drawWave(c, state.vars[i].buf));
}
