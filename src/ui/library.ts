import { MAX_RAW_SECONDS, findTakes, toMono, type Mono } from "../dsp/prep";
import { ALL_TAKES } from "../dsp/sound";
import { EXAMPLES, makeExample } from "../sounds/examples";
import { $, showNote } from "./dom";
import { takeBuffer } from "./engine";
import { commit } from "./history";
import { renderLayers } from "./layers";
import { audio, drawWave, play } from "./playback";
import { clipById, state, uid, type Clip } from "./state";
import { initTrim, setTrimView } from "./trim";
import { scheduleRender } from "./variations";

// Your sounds: recordings, uploads and examples, each split into takes.

/** Safety stop for a recording that was never stopped. */
const MAX_RECORD_SECONDS = 20;
/** Most recordings kept in the library. */
export const MAX_CLIPS = 24;

const note = () => $("srcNote");
const secs = (n: number, sr: number) => `${(n / sr).toFixed(1)} s`;
const takeMs = (c: Clip, i: number) => {
  const t = c.takes[i];
  return t ? `${Math.round(((t.end - t.start) / c.raw.sampleRate) * 1000)} ms` : "";
};

export const selectedClip = (): Clip | undefined => clipById(state.selClip);

/** Plays one take of a recording, cleaned up as it will be used. */
export function playTake(c: Clip | undefined, i: number): void {
  if (c) play(takeBuffer(c, i));
}

/** Adds a recording to the library and selects it. With a single layer, that layer switches to it. */
export function addClip(m: Mono | null, name: string): Clip | null {
  if (!m) {
    showNote(note(), "That recording is silent. Try again a little closer to the mic.");
    return null;
  }
  const p = state.project;
  if (p.clips.length >= MAX_CLIPS) {
    showNote(note(), `Your library is full (${MAX_CLIPS} sounds). Delete one to make room.`);
    return null;
  }
  const c: Clip = { id: uid(), name, raw: m, takes: findTakes(m), gate: 0 };
  p.clips.push(c);
  state.selClip = c.id;
  state.selTake = 0;
  if (p.layers.length === 1) {
    p.layers[0].clip = c.id;
    p.layers[0].take = ALL_TAKES;
    note().hidden = true;
  } else if (p.layers.length > 1) {
    showNote(note(), `Added “${name}”. Choose it in one of the layers below.`, true);
  }
  renderLibrary();
  renderLayers();
  scheduleRender(false);
  return c;
}

const exampleName = (name: string) => `${name} (example)`;

/** Selects an example, adding it to the library the first time. */
export function useExample(name: (typeof EXAMPLES)[number]): void {
  const p = state.project;
  const existing = p.clips.find((c) => c.name === exampleName(name));
  if (existing) {
    selectClip(existing.id);
    if (p.layers.length === 1) {
      p.layers[0].clip = existing.id;
      p.layers[0].take = ALL_TAKES;
      renderLayers();
      scheduleRender(false);
    }
  } else addClip(makeExample(name), exampleName(name));
  playTake(selectedClip(), 0);
  commit();
}

export function selectClip(id: string, take = 0): void {
  state.selClip = id;
  state.selTake = take;
  renderLibrary();
}

function nextRecordingName(): string {
  const used = state.project.clips.map((c) => /^Recording (\d+)$/.exec(c.name)?.[1]).filter(Boolean).map(Number);
  return `Recording ${Math.max(0, ...used) + 1}`;
}

/** Draws the list of recordings and the editor for the selected one. */
export function renderLibrary(): void {
  const p = state.project;
  if (!selectedClip() && p.clips.length) state.selClip = p.clips[0].id;
  const box = $("clips");
  box.innerHTML = "";
  for (const c of p.clips) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "clip";
    b.setAttribute("aria-pressed", String(c.id === state.selClip));
    const nm = document.createElement("span");
    nm.className = "cname";
    nm.textContent = c.name;
    const meta = document.createElement("span");
    meta.className = "cmeta";
    meta.textContent = `${c.takes.length} take${c.takes.length === 1 ? "" : "s"} · ${secs(c.raw.data.length, c.raw.sampleRate)}`;
    b.append(nm, meta);
    b.onclick = () => {
      selectClip(c.id);
      playTake(c, 0);
    };
    box.appendChild(b);
  }
  renderEditor();
}

/** The selected recording: its waveform, takes, trim handles and noise cleanup. */
function renderEditor(): void {
  const c = selectedClip();
  $("clipEditor").hidden = !c;
  if (!c) return;
  state.selTake = Math.min(state.selTake, c.takes.length - 1);
  $<HTMLInputElement>("clipName").value = c.name;
  $<HTMLButtonElement>("delClip").disabled = state.project.clips.length <= 1;
  drawClipWave();
  const t = c.takes[state.selTake];
  setTrimView(c.raw.data.length, c.raw.sampleRate, t);
  $("srcDur").textContent = takeMs(c, state.selTake);
  $("srcName").textContent = `Take ${state.selTake + 1} of ${c.takes.length}`;

  const box = $("takes");
  box.innerHTML = "";
  c.takes.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = `Take ${i + 1}`;
    b.setAttribute("aria-pressed", String(i === state.selTake));
    b.onclick = () => {
      state.selTake = i;
      renderEditor();
      playTake(c, i);
    };
    box.appendChild(b);
  });
  $<HTMLButtonElement>("delTake").disabled = c.takes.length <= 1;

  const v = Math.round(c.gate * 100);
  $<HTMLInputElement>("gateAmt").value = String(v);
  gateLabel(v);
}

export function drawClipWave(): void {
  const c = selectedClip();
  drawWave($<HTMLCanvasElement>("srcWave"), c?.raw.data ?? null, c ? c.takes.filter((_, i) => i !== state.selTake) : []);
}

const gateLabel = (v: number) => {
  $("gateOut").textContent = v === 0 ? "Off" : String(v);
};

/** Something about a recording changed: re-render, and make it undoable. */
function clipChanged(): void {
  renderLibrary();
  scheduleRender(false);
  commit();
}

export function initLibrary(): void {
  const box = $("examples");
  for (const name of EXAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = name;
    b.onclick = () => useExample(name);
    box.appendChild(b);
  }

  initTrim((r, done) => {
    const c = selectedClip();
    if (!c) return;
    c.takes[state.selTake] = r;
    $("srcDur").textContent = takeMs(c, state.selTake);
    if (done) {
      playTake(c, state.selTake);
      clipChanged();
    }
  });
  $("srcWave").addEventListener("click", () => playTake(selectedClip(), state.selTake));

  const gate = $<HTMLInputElement>("gateAmt");
  gate.addEventListener("input", () => gateLabel(Number(gate.value)));
  // Applied on release: cleanup re-processes the take
  gate.addEventListener("change", () => {
    const c = selectedClip();
    if (!c) return;
    c.gate = Number(gate.value) / 100;
    playTake(c, state.selTake);
    clipChanged();
  });

  $("clipName").addEventListener("change", () => {
    const c = selectedClip();
    const v = $<HTMLInputElement>("clipName").value.trim();
    if (!c || !v) return;
    c.name = v.slice(0, 60);
    renderLibrary();
    renderLayers();
    commit();
  });

  $("delClip").onclick = () => {
    const p = state.project;
    const i = p.clips.findIndex((c) => c.id === state.selClip);
    if (i < 0 || p.clips.length <= 1) return;
    p.clips.splice(i, 1);
    const fallback = p.clips[Math.max(0, i - 1)].id;
    for (const l of p.layers) {
      if (!clipById(l.clip)) {
        l.clip = fallback;
        l.take = ALL_TAKES;
      }
    }
    state.selClip = fallback;
    renderLayers();
    clipChanged();
    showNote(note(), "Deleted. Undo brings it back.", true);
  };

  $("delTake").onclick = () => {
    const c = selectedClip();
    if (!c || c.takes.length <= 1) return;
    c.takes.splice(state.selTake, 1);
    for (const l of state.project.layers) if (l.clip === c.id && l.take >= c.takes.length) l.take = ALL_TAKES;
    state.selTake = Math.max(0, state.selTake - 1);
    renderLayers();
    clipChanged();
  };

  $("addTake").onclick = () => {
    const c = selectedClip();
    if (!c) return;
    // Starts as a copy of the selected take; drag the handles onto the sound you want
    c.takes.splice(state.selTake + 1, 0, { ...c.takes[state.selTake] });
    state.selTake++;
    renderLayers();
    clipChanged();
    showNote(note(), "New take added as a copy. Drag the handles onto the sound you want.", true);
  };

  $("recBtn").onclick = toggleRecord;
  $("fileIn").onchange = onFile;
}

let recorder: MediaRecorder | null = null;
let recTimer: ReturnType<typeof setTimeout> | undefined;

/** Live input level and elapsed time while recording, so people can see the mic is working. */
function startMeter(stream: MediaStream, rec: MediaRecorder): void {
  const ctx = audio();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const input = ctx.createMediaStreamSource(stream);
  input.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const level = $("recLevel");
  const t0 = performance.now();
  $("recMeter").hidden = false;
  const tick = () => {
    if (rec.state !== "recording") {
      input.disconnect();
      $("recMeter").hidden = true;
      return;
    }
    analyser.getFloatTimeDomainData(buf);
    const peak = buf.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    level.style.width = `${Math.min(100, peak * 100)}%`;
    level.classList.toggle("hot", peak > 0.98);
    $("recLabel").textContent = `Stop · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    requestAnimationFrame(tick);
  };
  tick();
}

/** Starts recording, or stops it if already recording. The mic needs https:// or localhost. */
export async function toggleRecord(): Promise<void> {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    return;
  }
  let stream: MediaStream;
  try {
    // Raw sound: phone-call processing would smear the transients we care about
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    showNote(note(), "The microphone is blocked. Allow mic access for this page, or record a voice memo on your phone and use Upload audio.");
    return;
  }
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  recorder = rec;
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = async () => {
    clearTimeout(recTimer);
    stream.getTracks().forEach((t) => t.stop());
    $("recBtn").classList.remove("on");
    $("recLabel").textContent = "Record another";
    try {
      const ab = await new Blob(chunks).arrayBuffer();
      const c = addClip(toMono(await audio().decodeAudioData(ab)), nextRecordingName());
      if (c) {
        playTake(c, 0);
        commit();
      }
    } catch {
      showNote(note(), "Couldn't read that recording. Try again.");
    }
  };
  rec.start();
  $("recBtn").classList.add("on");
  startMeter(stream, rec);
  recTimer = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORD_SECONDS * 1000);
}

export async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  try {
    const decoded = await audio().decodeAudioData(await f.arrayBuffer());
    const c = addClip(toMono(decoded), f.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Upload");
    if (c) {
      commit();
      if (decoded.duration > MAX_RAW_SECONDS) showNote(note(), `Long file: using the first ${MAX_RAW_SECONDS} seconds.`, true);
    }
  } catch {
    showNote(note(), "Couldn't read that file. Try a WAV, MP3, M4A or OGG.");
  }
  input.value = "";
}
