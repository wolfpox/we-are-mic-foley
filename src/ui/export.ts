import { describeFormat, encodeSound, type ExportOptions, type Format, type OutputRate, type Quality } from "../dsp/encode";
import { ALL_TAKES } from "../dsp/sound";
import { $, showNote } from "./dom";
import { scheduleSave } from "./persist";
import { clipById, clipLabel, design, state } from "./state";
import { varName } from "./variations";

const TOOL = "We Are Mic Foley v0.4";

const HINTS: Record<Format, string> = {
  ogg: "Ogg Vorbis works in Godot, Unity, GameMaker and every web browser. Good default for games.",
  mp3: "MP3 plays anywhere, but adds a few milliseconds of silence at the start. For sounds that must hit exactly on time, use Ogg or WAV.",
  wav: "WAV keeps every detail and loads instantly, but files are several times larger.",
};

export function readExportOptions(): ExportOptions {
  return {
    format: $<HTMLSelectElement>("expFormat").value as Format,
    quality: $<HTMLSelectElement>("expQuality").value as Quality,
    sampleRate: Number($<HTMLSelectElement>("expRate").value) as OutputRate,
  };
}

export function setExportOptions(o: ExportOptions): void {
  $<HTMLSelectElement>("expFormat").value = o.format;
  $<HTMLSelectElement>("expQuality").value = o.quality;
  $<HTMLSelectElement>("expRate").value = String(o.sampleRate);
  $("expFormat").dispatchEvent(new Event("change"));
}

export function initExportControls(): void {
  const update = () => {
    const o = readExportOptions();
    $("formatHint").textContent = HINTS[o.format];
    // Quality has no effect on WAV
    $<HTMLSelectElement>("expQuality").disabled = o.format === "wav";
  };
  for (const id of ["expFormat", "expQuality", "expRate"]) {
    $(id).addEventListener("change", () => {
      update();
      scheduleSave();
    });
  }
  update();
}

function download(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const msOf = (n: number, sr: number) => Math.round((n / sr) * 1000);
const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places;

/** Zips the kept variations with a sound.json that records exactly how they were made. */
export async function exportPack(): Promise<void> {
  const note = $("exportNote");
  const btn = $<HTMLButtonElement>("exportBtn");
  const m = design()?.varMeta;
  if (!m || !state.vars.some((v) => v.kept)) return;
  const opts = readExportOptions();
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "Encoding…";
  try {
    const { default: JSZip } = await import("jszip"); // loaded on first export only
    const zip = new JSZip();
    const files = [];
    let total = 0;
    const kept = state.vars.filter((v) => v.kept);
    // Number kept sounds 01, 02, 03… with no gaps, so engines can pick from a contiguous range.
    for (const [i, v] of kept.entries()) {
      const name = `${varName(m.name, i + 1)}.${opts.format}`;
      const data = await encodeSound(v.buf, opts);
      zip.file(name, data);
      total += data.length;
      files.push({
        name,
        seed: v.seed,
        pitchSt: round(v.pitch),
        takes: v.takes.map((t) => t + 1),
        ms: Math.round(v.buf.duration * 1000),
        gainDb: round(20 * Math.log10(v.gain)),
        bytes: data.length,
      });
    }
    const info = {
      tool: TOOL,
      name: m.name,
      layers: m.layers.map((l) => {
        const c = clipById(l.clip, m.sources);
        const sr = c?.raw.sampleRate ?? 44100;
        return {
          recording: c ? clipLabel(c) : "?",
          takesMs: c?.takes.map((t) => [msOf(t.start, sr), msOf(t.end, sr)]) ?? [],
          noiseCleanup: c?.gate ?? 0,
          take: l.take === ALL_TAKES ? "all" : l.take + 1,
          pitchSt: l.pitch,
          tone: l.tone,
          volumeDb: l.volume,
          startMs: l.delay,
          reverse: l.reverse,
        };
      }),
      effects: m.fx,
      variation: { pitchSpreadSt: m.spread.pitch, toneSpread: m.spread.tone, timingSpread: m.spread.timing },
      loudness: state.evenLoudness ? "even (matched max momentary loudness, BS.1770)" : "peak",
      export: opts,
      format: describeFormat(opts, state.evenLoudness),
      files,
    };
    zip.file("sound.json", JSON.stringify(info, null, 2));
    download(await zip.generateAsync({ type: "blob" }), `${m.name}_pack.zip`);
    showNote(note, `Saved ${kept.length} sounds, ${kb(total)} in total.`, true);
  } catch (e) {
    showNote(note, "Couldn't build the pack. " + (e instanceof Error ? e.message : ""));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
