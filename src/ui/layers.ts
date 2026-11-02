import { ALL_TAKES, DEFAULT_FX, MAX_LAYERS, defaultLayer, renderSound, type Effects, type Layer } from "../dsp/sound";
import { IDEAS, type Idea } from "../sounds/ideas";
import { option, percent, signed, slider, toneText } from "./controls";
import { $ } from "./dom";
import { baseTake, takeBuffer } from "./engine";
import { commit } from "./history";
import { play } from "./playback";
import { clipById, clipLabel, design, state, type Design } from "./state";
import { toast } from "./toast";
import { renameVariations, renderSpread, scheduleRender } from "./variations";

// Shape: the layers you stack, and the effects on the mix.

const changed = () => scheduleRender(true);

function layerCard(d: Design, l: Layer, i: number): HTMLElement {
  const card = document.createElement("div");
  card.className = "layer";

  const head = document.createElement("div");
  head.className = "layer-head";
  const title = document.createElement("h3");
  title.textContent = `Layer ${i + 1}`;
  head.appendChild(title);

  // Layer 1 is the recording this sound effect is made from; others can use any recording
  if (i > 0) {
    const clipSel = document.createElement("select");
    clipSel.setAttribute("aria-label", `Recording for layer ${i + 1}`);
    for (const c of [...state.lib.clips].sort((a, b) => b.at - a.at)) clipSel.appendChild(option(c.id, clipLabel(c), c.id === l.clip));
    clipSel.onchange = () => {
      l.clip = clipSel.value;
      l.take = ALL_TAKES;
      renderLayers();
      changed();
      commit();
    };
    head.appendChild(clipSel);
  }

  const takeSel = document.createElement("select");
  takeSel.setAttribute("aria-label", `Takes for layer ${i + 1}`);
  const n = clipById(l.clip)?.takes.length ?? 1;
  takeSel.appendChild(option(String(ALL_TAKES), n > 1 ? `All ${n} takes` : "1 take", l.take === ALL_TAKES));
  if (n > 1) for (let k = 0; k < n; k++) takeSel.appendChild(option(String(k), `Take ${k + 1} only`, l.take === k));
  takeSel.onchange = () => {
    l.take = Number(takeSel.value);
    changed();
    commit();
  };

  const solo = document.createElement("button");
  solo.type = "button";
  solo.className = "small";
  solo.textContent = "▶";
  solo.setAttribute("aria-label", `Play layer ${i + 1} on its own`);
  solo.onclick = async () => {
    const c = clipById(l.clip);
    const buf = c && takeBuffer(c, baseTake(l));
    if (buf) play(await renderSound([{ ...l, buf }], DEFAULT_FX));
  };
  head.append(takeSel, solo);

  if (i > 0) {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "small layer-x";
    x.textContent = "×";
    x.setAttribute("aria-label", `Remove layer ${i + 1}`);
    x.onclick = () => {
      d.layers.splice(i, 1);
      renderLayers();
      changed();
      commit();
    };
    head.appendChild(x);
  }

  const grid = document.createElement("div");
  grid.className = "sliders";
  const id = (k: string) => `l${i}_${k}`;
  const set = <K extends "volume" | "pitch" | "tone" | "delay">(k: K, v: number) => {
    l[k] = v;
    changed();
  };
  grid.append(
    slider({ id: id("pitch"), label: "Pitch", min: -24, max: 24, value: l.pitch, lo: "Bigger, slower", hi: "Smaller, quicker", format: (v) => signed(v, "st"), onInput: (v) => set("pitch", v), onChange: commit }),
    slider({ id: id("tone"), label: "Tone", min: -100, max: 100, value: Math.round(l.tone * 100), lo: "Darker", hi: "Brighter", format: toneText, onInput: (v) => set("tone", v / 100), onChange: commit }),
    slider({ id: id("volume"), label: "Volume", min: -24, max: 6, value: l.volume, format: (v) => signed(v, "dB"), onInput: (v) => set("volume", v), onChange: commit }),
    slider({ id: id("delay"), label: "Start", min: 0, max: 500, step: 5, value: l.delay, format: (v) => `${v} ms`, onInput: (v) => set("delay", v), onChange: commit }),
  );

  const rev = document.createElement("label");
  rev.className = "toggle";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = l.reverse;
  box.onchange = () => {
    l.reverse = box.checked;
    changed();
    commit();
  };
  rev.append(box, " Reverse");

  card.append(head, grid, rev);
  return card;
}

export function renderLayers(): void {
  const d = design();
  const box = $("layers");
  box.innerHTML = "";
  if (!d) return;
  d.layers.forEach((l, i) => box.appendChild(layerCard(d, l, i)));
  $<HTMLButtonElement>("addLayer").disabled = d.layers.length >= MAX_LAYERS;
}

const FX: { k: keyof Effects; label: string; lo: string; hi: string }[] = [
  { k: "compress", label: "Compress", lo: "Natural", hi: "Fuller" },
  { k: "distort", label: "Distort", lo: "Clean", hi: "Crunchy" },
  { k: "lofi", label: "Lo-fi", lo: "Clean", hi: "8-bit" },
  { k: "reverb", label: "Reverb", lo: "Dry", hi: "Far away" },
  { k: "room", label: "Room size", lo: "Small", hi: "Huge" },
];

export function renderFx(): void {
  const d = design();
  const box = $("fx");
  box.innerHTML = "";
  if (!d) return;
  const fx = d.fx;
  for (const f of FX) {
    box.appendChild(
      slider({
        id: `fx_${f.k}`,
        label: f.label,
        min: 0,
        max: 100,
        value: Math.round(fx[f.k] * 100),
        lo: f.lo,
        hi: f.hi,
        format: f.k === "room" ? String : percent,
        onInput: (v) => {
          fx[f.k] = v / 100;
          changed();
        },
        onChange: commit,
      }),
    );
  }
}

/** Puts a starting point's settings on the sliders. Layers keep their recordings; extra layers reuse layer 1's. */
export function applyIdea(idea: Idea): void {
  const d = design();
  if (!d) return;
  const first = d.layers[0].clip;
  d.layers = idea.layers.map((s, i) => {
    const old = d.layers[i];
    return { ...defaultLayer(old?.clip ?? first), take: old?.take ?? ALL_TAKES, ...s };
  });
  d.fx = { ...DEFAULT_FX, ...idea.fx };
  d.spread = { ...d.spread, pitch: 1, tone: 0.3, timing: 0.3, ...idea.spread };
  d.name = idea.file;
  renderLayers();
  renderFx();
  renderSpread();
  renameVariations();
  changed();
  commit();
  toast(idea.layers.length > 1 ? `${idea.name}: try another recording on layer 2` : `${idea.name} settings on`, { label: "Undo", run: () => document.getElementById("undoBtn")?.click() });
}

/** Starting points: one tap sets the sliders. */
export function renderStarts(): void {
  const box = $("starts");
  box.innerHTML = "";
  for (const idea of IDEAS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = idea.name.replace(" (two layers)", "");
    b.onclick = () => applyIdea(idea);
    box.appendChild(b);
  }
}

export function initLayers(): void {
  $("addLayer").onclick = () => {
    const d = design();
    if (!d || d.layers.length >= MAX_LAYERS) return;
    // A new layer plays the same recording an octave down and darker: it adds weight and is easy to hear
    d.layers.push({ ...defaultLayer(d.layers[0].clip), pitch: -12, tone: -0.4 });
    renderLayers();
    changed();
    commit();
  };
}
