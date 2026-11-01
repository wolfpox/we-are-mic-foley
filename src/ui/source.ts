import { MAX_RAW_SECONDS, autoTrim, sliceSource, toMono, type Mono, type Range } from "../dsp/prep";
import { EXAMPLES, makeExample } from "../recipes/examples";
import { $, showNote } from "./dom";
import { audio, drawWave, ms, play } from "./playback";
import { state } from "./state";
import { initTrim, setTrimView } from "./trim";
import { clearVars, scheduleRender } from "./variations";

/** Safety stop for a recording that was never stopped. */
const MAX_RECORD_SECONDS = 20;

const note = () => $("srcNote");

/** Uses a new recording, upload or example. Selects the useful part automatically. */
export function setRaw(m: Mono | null, name: string, trim?: Range): void {
  if (!m) {
    showNote(note(), "That recording is silent. Try again a little closer to the mic.");
    return;
  }
  state.raw = m;
  state.trim = trim ?? autoTrim(m);
  state.srcName = name;
  note().hidden = true;
  $("srcName").textContent = name;
  drawWave($<HTMLCanvasElement>("srcWave"), m.data);
  setTrimView(m.data.length, m.sampleRate, state.trim);
  document.querySelectorAll<HTMLElement>("#examples .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.name === name)));
  applySource();
}

/** Rebuilds the source from the recording, trim and noise cleanup, then re-renders the result. */
function applySource(): boolean {
  const { raw, trim } = state;
  if (!raw || !trim) return false;
  const src = sliceSource(raw, trim, state.gate);
  if (!src) {
    showNote(note(), "The selected part is silent. Move the handles over the sound you want.");
    return false;
  }
  note().hidden = true;
  state.src = src;
  $("srcDur").textContent = ms(src);
  clearVars();
  scheduleRender(false);
  return true;
}

const selectedMs = (r: Range) => (state.raw ? Math.round(((r.end - r.start) / state.raw.sampleRate) * 1000) + " ms" : "");

export function initSource(): void {
  initTrim((r, done) => {
    state.trim = r;
    $("srcDur").textContent = selectedMs(r);
    if (done && applySource()) play(state.src);
  });

  const gate = $<HTMLInputElement>("gateAmt");
  const label = () => {
    $("gateOut").textContent = gate.value === "0" ? "Off" : gate.value;
  };
  gate.addEventListener("input", label);
  // Apply on release: cleanup re-processes the whole selection
  gate.addEventListener("change", () => {
    state.gate = Number(gate.value) / 100;
    label();
    if (applySource()) play(state.src);
  });

  $("srcWave").addEventListener("click", () => play(state.src));
}

export function buildExamples(): void {
  const box = $("examples");
  for (const name of EXAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.name = name;
    b.textContent = name + " (example)";
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      setRaw(toMono(makeExample(name)), name);
      play(state.src);
    };
    box.appendChild(b);
  }
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
    $("recLabel").textContent = "Record again";
    try {
      const ab = await new Blob(chunks).arrayBuffer();
      setRaw(toMono(await audio().decodeAudioData(ab)), "Recording " + new Date().toLocaleTimeString());
      if (state.src) play(state.src);
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
    setRaw(toMono(decoded), f.name);
    if (decoded.duration > MAX_RAW_SECONDS && state.raw) {
      showNote(note(), `Long file: using the first ${MAX_RAW_SECONDS} seconds.`, true);
    }
  } catch {
    showNote(note(), "Couldn't read that file. Try a WAV, MP3, M4A or OGG.");
  }
  input.value = "";
}
