import { prepSource } from "../dsp/prep";
import { EXAMPLES, makeExample } from "../recipes/examples";
import { $, showNote } from "./dom";
import { audio, drawWave, ms, play } from "./playback";
import { state } from "./state";
import { clearVars, scheduleRender } from "./variations";

/** Safety stop for a recording that was never stopped. Only the first few seconds are used anyway. */
const MAX_RECORD_SECONDS = 20;

export function setSource(buf: AudioBuffer | null, name: string): void {
  if (!buf) {
    showNote($("srcNote"), "That recording is silent. Try again a little closer to the mic.");
    return;
  }
  state.src = buf;
  state.srcName = name;
  $("srcNote").hidden = true;
  $("srcName").textContent = name;
  $("srcDur").textContent = ms(buf);
  drawWave($<HTMLCanvasElement>("srcWave"), buf);
  document.querySelectorAll<HTMLElement>("#examples .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.name === name)));
  clearVars();
  scheduleRender(false);
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
      setSource(makeExample(name), name);
      play(state.src);
    };
    box.appendChild(b);
  }
}

let recorder: MediaRecorder | null = null;
let recTimer: ReturnType<typeof setTimeout> | undefined;

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
    showNote($("srcNote"), "The microphone is blocked. Allow mic access for this page, or record a voice memo on your phone and use Upload audio.");
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
    $("recLabel").textContent = "Record";
    try {
      const ab = await new Blob(chunks).arrayBuffer();
      setSource(prepSource(await audio().decodeAudioData(ab)), "Recording " + new Date().toLocaleTimeString());
    } catch {
      showNote($("srcNote"), "Couldn't read that recording. Try again.");
    }
  };
  rec.start();
  $("recBtn").classList.add("on");
  $("recLabel").textContent = "Stop";
  recTimer = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORD_SECONDS * 1000);
}

export async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  try {
    const ab = await f.arrayBuffer();
    setSource(prepSource(await audio().decodeAudioData(ab)), f.name);
  } catch {
    showNote($("srcNote"), "Couldn't read that file. Try a WAV, MP3, M4A or OGG.");
  }
  input.value = "";
}
