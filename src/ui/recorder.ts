import { MAX_RAW_SECONDS, findTakes, toMono, type Mono } from "../dsp/prep";
import { $ } from "./dom";
import { commit } from "./history";
import { markFresh, renderLibrary } from "./home";
import { audio } from "./playback";
import { state, uid, type Clip } from "./state";
import { toast } from "./toast";

// The record button: one tap to record anything, one tap to stop. It lands in the library straight away.

/** Safety stop for a recording that was never stopped. */
const MAX_RECORD_SECONDS = 20;
/** Most recordings kept in the library. */
export const MAX_CLIPS = 100;

/** Set by main.ts: shows the home screen with a recording opened for tagging. */
let showEntry: (id: string) => void = () => {};
export const setShowEntry = (fn: (id: string) => void) => (showEntry = fn);

/** Adds a recording to the library. Returns null (and says why) if it's silent or the library is full. */
export function addRecording(m: Mono | null, tags: string[] = [], at = Date.now()): Clip | null {
  if (!m) {
    toast("That was silent. Try again closer to the mic.");
    return null;
  }
  if (state.lib.clips.length >= MAX_CLIPS) {
    toast(`Your library is full (${MAX_CLIPS}). Delete a few to make room.`);
    return null;
  }
  const c: Clip = { id: uid(), raw: m, takes: findTakes(m), gate: 0, at, tags, projects: [] };
  state.lib.clips.push(c);
  return c;
}

/** After a new recording: show it, save it, offer to tag it. */
function added(c: Clip, note = "Saved to your sounds"): void {
  if (state.filter !== "all" && !c.tags.includes(state.filter)) state.filter = "all";
  markFresh(c.id);
  renderLibrary();
  commit();
  toast(note, { label: "Tag it", run: () => showEntry(c.id) });
}

let recorder: MediaRecorder | null = null;
let recTimer: ReturnType<typeof setTimeout> | undefined;

/** Live input level drives the ring around the button, so people can see the mic is hearing them. */
function startMeter(stream: MediaStream, rec: MediaRecorder): void {
  const ctx = audio();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const input = ctx.createMediaStreamSource(stream);
  input.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const ring = $("ring");
  const t0 = performance.now();
  const tick = () => {
    if (rec.state !== "recording") {
      input.disconnect();
      ring.style.transform = "";
      $("timer").textContent = "";
      return;
    }
    analyser.getFloatTimeDomainData(buf);
    const peak = buf.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    ring.style.transform = `scale(${1 + Math.min(1, peak) * 0.35})`;
    ring.classList.toggle("hot", peak > 0.98);
    $("timer").textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
    requestAnimationFrame(tick);
  };
  tick();
}

function setRecording(on: boolean): void {
  $("rec").classList.toggle("on", on);
  $("rec").setAttribute("aria-label", on ? "Stop recording" : "Record");
  $("recHint").textContent = on ? "Tap to stop" : "Record anything";
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
    toast("The microphone is blocked. Allow it for this page, or upload a recording with ↑.");
    return;
  }
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  recorder = rec;
  const at = Date.now();
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = async () => {
    clearTimeout(recTimer);
    stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    try {
      const ab = await new Blob(chunks).arrayBuffer();
      const c = addRecording(toMono(await audio().decodeAudioData(ab)), [], at);
      if (c) added(c);
    } catch {
      toast("Couldn't read that recording. Try again.");
    }
  };
  rec.start();
  setRecording(true);
  startMeter(stream, rec);
  recTimer = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORD_SECONDS * 1000);
}

export async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  try {
    const decoded = await audio().decodeAudioData(await f.arrayBuffer());
    const name = f.name.replace(/\.[^.]+$/, "").toLowerCase().slice(0, 24);
    const c = addRecording(toMono(decoded), name ? [name] : []);
    if (c) added(c, decoded.duration > MAX_RAW_SECONDS ? `Added the first ${MAX_RAW_SECONDS} seconds` : "Added to your sounds");
  } catch {
    toast("Couldn't read that file. Try WAV, MP3, M4A or OGG.");
  }
  input.value = "";
}

export function initRecorder(): void {
  $("rec").onclick = toggleRecord;
  $("fileIn").onchange = onFile;
}
