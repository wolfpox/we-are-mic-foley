import { ALL_TAKES, DEFAULT_FX, MAX_LAYERS, defaultLayer, renderSound, type Effects, type Layer } from "../dsp/sound";
import { IDEAS, type Idea } from "../sounds/ideas";
import { option, percent, signed, slider, toneText } from "./controls";
import { $, showNote } from "./dom";
import { baseTake, takeBuffer } from "./engine";
import { commit } from "./history";
import { play } from "./playback";
import { clipById, state } from "./state";
import { renameVariations, renderSpread, scheduleRender } from "./variations";

// Step 2: the layers you stack, and the effects on the mix.

const changed = () => scheduleRender(true);

function layerCard(l: Layer, i: number): HTMLElement {
  const p = state.project;
  const card = document.createElement("div");
  card.className = "layer";

  const head = document.createElement("div");
  head.className = "layer-head";
  const title = document.createElement("h3");
  title.textContent = `Layer ${i + 1}`;

  const clipSel = document.createElement("select");
  clipSel.setAttribute("aria-label", `Recording for layer ${i + 1}`);
  for (const c of p.clips) clipSel.appendChild(option(c.id, c.name, c.id === l.clip));
  clipSel.onchange = () => {
    l.clip = clipSel.value;
    l.take = ALL_TAKES;
    renderLayers();
    changed();
    commit();
  };

  const takeSel = document.createElement("select");
  takeSel.setAttribute("aria-label", `Take for layer ${i + 1}`);
  const clip = clipById(l.clip);
  const n = clip?.takes.length ?? 1;
  takeSel.appendChild(option(String(ALL_TAKES), n > 1 ? `All ${n} takes` : "Take 1", l.take === ALL_TAKES));
  if (n > 1) for (let k = 0; k < n; k++) takeSel.appendChild(option(String(k), `Only take ${k + 1}`, l.take === k));
  takeSel.onchange = () => {
    l.take = Number(takeSel.value);
    changed();
    commit();
  };

  const solo = document.createElement("button");
  solo.type = "button";
  solo.textContent = "▶ Layer";
  solo.setAttribute("aria-label", `Play layer ${i + 1} on its own`);
  solo.onclick = async () => {
    const c = clipById(l.clip);
    const buf = c && takeBuffer(c, baseTake(l));
    if (buf) play(await renderSound([{ ...l, buf }], DEFAULT_FX));
  };

  head.append(title, clipSel, takeSel, solo);
  if (p.layers.length > 1) {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "layer-x";
    x.textContent = "Remove";
    x.setAttribute("aria-label", `Remove layer ${i + 1}`);
    x.onclick = () => {
      p.layers.splice(i, 1);
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
    slider({ id: id("pitch"), label: "Pitch", min: -24, max: 24, value: l.pitch, lo: "Lower, slower", hi: "Higher, quicker", format: (v) => signed(v, "st"), onInput: (v) => set("pitch", v), onChange: commit }),
    slider({ id: id("tone"), label: "Tone", min: -100, max: 100, value: Math.round(l.tone * 100), lo: "Darker", hi: "Brighter", format: toneText, onInput: (v) => set("tone", v / 100), onChange: commit }),
    slider({ id: id("volume"), label: "Volume", min: -24, max: 6, value: l.volume, lo: "Quieter", hi: "Louder", format: (v) => signed(v, "dB"), onInput: (v) => set("volume", v), onChange: commit }),
    slider({ id: id("delay"), label: "Start", min: 0, max: 500, step: 5, value: l.delay, lo: "Right away", hi: "Later", format: (v) => `${v} ms`, onInput: (v) => set("delay", v), onChange: commit }),
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
  rev.append(box, " Reverse (play it backwards, so it swells in)");

  card.append(head, grid, rev);
  return card;
}

export function renderLayers(): void {
  const box = $("layers");
  box.innerHTML = "";
  state.project.layers.forEach((l, i) => box.appendChild(layerCard(l, i)));
  $<HTMLButtonElement>("addLayer").disabled = state.project.layers.length >= MAX_LAYERS;
}

const FX: { k: keyof Effects; label: string; lo: string; hi: string; hint: string }[] = [
  { k: "compress", label: "Compress", lo: "Natural", hi: "Squashed", hint: "Brings up the quiet tail so the sound feels fuller and louder. Good for hits and footsteps." },
  { k: "distort", label: "Distort", lo: "Clean", hi: "Crunchy", hint: "Adds grit. A little makes hits feel harder; a lot sounds broken or angry." },
  { k: "lofi", label: "Lo-fi", lo: "Clean", hi: "8-bit", hint: "Fewer bits and a lower sample rate, like an old console." },
  { k: "reverb", label: "Reverb", lo: "Dry", hi: "Wet", hint: "Puts the sound in a space. Keep it low for footsteps and menus." },
  { k: "room", label: "Room size", lo: "Small room", hi: "Big hall", hint: "How big that space is. Only matters with Reverb on." },
];

export function renderFx(): void {
  const box = $("fx");
  box.innerHTML = "";
  const fx = state.project.fx;
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
        hint: f.hint,
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

/** Puts an idea's settings on the sliders. Layers keep their recordings; extra layers reuse layer 1's. */
export function applyIdea(idea: Idea): void {
  const p = state.project;
  const first = p.layers[0]?.clip ?? p.clips[0]?.id ?? "";
  p.layers = idea.layers.map((s, i) => {
    const old = p.layers[i];
    return { ...defaultLayer(old?.clip ?? first), take: old?.take ?? ALL_TAKES, ...s };
  });
  p.fx = { ...DEFAULT_FX, ...idea.fx };
  p.spread = { ...p.spread, pitch: 1, tone: 0.3, timing: 0.3, ...idea.spread };
  p.name = idea.file;
  renderLayers();
  renderFx();
  renderSpread();
  renameVariations();
  changed();
  commit();
  const two = idea.layers.length > 1 ? " Layer 2 uses the same recording for now; pick a different one there if you have it." : "";
  showNote($("ideaNote"), `${idea.name} settings are on the sliders below.${two}`, true);
}

function buildIdeas(): void {
  const box = $("ideas");
  for (const idea of IDEAS) {
    const d = document.createElement("details");
    d.className = "idea";
    const s = document.createElement("summary");
    s.textContent = idea.name;
    const rec = document.createElement("p");
    rec.innerHTML = "<b>Record:</b> ";
    rec.append(idea.record);
    const shape = document.createElement("p");
    shape.innerHTML = "<b>Shape:</b> ";
    shape.append(idea.shape);
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Use these settings";
    b.onclick = () => applyIdea(idea);
    d.append(s, rec, shape, b);
    box.appendChild(d);
  }
}

export function initLayers(): void {
  buildIdeas();
  $("addLayer").onclick = () => {
    const p = state.project;
    if (p.layers.length >= MAX_LAYERS) return;
    // A new layer plays the selected recording an octave down and darker: it adds weight and is easy to hear
    p.layers.push({ ...defaultLayer(state.selClip || p.clips[0].id), pitch: -12, tone: -0.4 });
    renderLayers();
    changed();
    commit();
  };
}
