import { describeFormat, encodeSound, type ExportOptions, type Format, type OutputRate, type Quality } from "../dsp/encode";
import { FADER_KEYS, isSet, type Faders } from "../dsp/faders";
import { matchLoudnessGains } from "../dsp/loudness";
import { FADER_INFO } from "./desk";
import { $ } from "./dom";
import { renderTake } from "./engine";
import { scheduleSave } from "./persist";
import { displayName, fileBase, state, type Clip, type Design } from "./state";
import { toast } from "./toast";

// Export: every saved variation × every take, as a zip with a sound.json that says how they were made.
// With no variations saved, the faders as they are now.

const TOOL = "We Are Mic Foley v0.5";

const HINTS: Record<Format, string> = {
  ogg: "Ogg Vorbis works in Godot, Unity, GameMaker and every web browser. Good default for games.",
  mp3: "MP3 plays anywhere, but adds a few milliseconds of silence at the start. For sounds that must hit exactly on time, use Ogg or WAV.",
  wav: "WAV keeps every detail and loads instantly, but files are several times larger.",
};

/** How many files Export makes. */
export const fileCount = (c: Clip, d: Design) => Math.max(1, d.vars.length) * c.takes.length;

export function readExportOptions(): ExportOptions {
  return {
    format: $<HTMLSelectElement>("expFormat").value as Format,
    quality: $<HTMLSelectElement>("expQuality").value as Quality,
    sampleRate: Number($<HTMLSelectElement>("expRate").value) as OutputRate,
  };
}

function updateHint(): void {
  const o = readExportOptions();
  $("formatHint").textContent = HINTS[o.format];
  // Quality has no effect on WAV
  $<HTMLSelectElement>("expQuality").disabled = o.format === "wav";
}

export function setExportOptions(o: ExportOptions, evenLoudness: boolean): void {
  $<HTMLSelectElement>("expFormat").value = o.format;
  $<HTMLSelectElement>("expQuality").value = o.quality;
  $<HTMLSelectElement>("expRate").value = String(o.sampleRate);
  $<HTMLInputElement>("evenLoud").checked = evenLoudness;
  state.evenLoudness = evenLoudness;
  updateHint();
}

export function openExportSettings(): void {
  $<HTMLDialogElement>("exportDlg").showModal();
}

export function initExportControls(): void {
  for (const id of ["expFormat", "expQuality", "expRate"]) {
    $(id).addEventListener("change", () => {
      updateHint();
      scheduleSave();
    });
  }
  $("evenLoud").addEventListener("change", () => {
    state.evenLoudness = $<HTMLInputElement>("evenLoud").checked;
    scheduleSave();
  });
  // Tapping outside the dialog closes it
  const dlg = $<HTMLDialogElement>("exportDlg");
  dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
  updateHint();
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
const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places;
const msOf = (n: number, sr: number) => Math.round((n / sr) * 1000);

function scaled(b: AudioBuffer, gain: number): AudioBuffer {
  if (gain === 1) return b;
  const out = new AudioBuffer({ length: b.length, sampleRate: b.sampleRate, numberOfChannels: 1 });
  const d = b.getChannelData(0);
  const o = out.getChannelData(0);
  for (let i = 0; i < d.length; i++) o[i] = d[i] * gain;
  return out;
}

/** The faders a variation moves, in plain units (for people) and as stored (to rebuild it exactly). */
function settingsOf(f: Faders) {
  const used = FADER_KEYS.filter((k) => isSet(f, k));
  return {
    settings: Object.fromEntries(used.map((k) => [FADER_INFO[k].label, FADER_INFO[k].num(f[k]) + (FADER_INFO[k].unit ?? "")])),
    faders: Object.fromEntries(used.map((k) => [k, f[k]])),
  };
}

/** Renders, encodes and downloads the sound's files. */
export async function exportSound(c: Clip, d: Design, btn: HTMLButtonElement): Promise<void> {
  const opts = readExportOptions();
  const vars = d.vars.length ? d.vars : [{ name: "", f: d.f }];
  const base = fileBase(displayName(c));
  const total = vars.length * c.takes.length;
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const files: { name: string; data: Uint8Array; info: Record<string, unknown> }[] = [];
    let done = 0;
    for (const v of vars) {
      const bufs: AudioBuffer[] = [];
      const takes: number[] = [];
      for (let i = 0; i < c.takes.length; i++) {
        btn.textContent = `Rendering ${++done}/${total}…`;
        const job = renderTake(c, i, v.f);
        const b = job && (await job);
        if (b) {
          bufs.push(b);
          takes.push(i);
        }
      }
      // Even out loudness across this variation's takes; Level still sets the variation's own loudness
      const gains = state.evenLoudness && bufs.length > 1 ? matchLoudnessGains(bufs.map((b) => b.getChannelData(0)), bufs[0].sampleRate) : bufs.map(() => 1);
      const stem = base + (v.name ? "_" + fileBase(v.name) : "");
      for (const [k, b] of bufs.entries()) {
        const out = scaled(b, gains[k]);
        const name = total === 1 ? `${stem}.${opts.format}` : `${stem}_${String(k + 1).padStart(2, "0")}.${opts.format}`;
        btn.textContent = "Encoding…";
        const data = await encodeSound(out, opts);
        files.push({ name, data, info: { name, variation: v.name || null, take: takes[k] + 1, ms: Math.round(out.duration * 1000), gainDb: round(20 * Math.log10(gains[k])), bytes: data.length } });
      }
    }
    if (!files.length) throw new Error("Every take is silent.");
    const bytes = files.reduce((s, f) => s + f.data.length, 0);
    if (files.length === 1) download(new Blob([files[0].data as BlobPart]), files[0].name);
    else {
      const { default: JSZip } = await import("jszip"); // loaded on first export only
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.data);
      const sr = c.raw.sampleRate;
      const info = {
        tool: TOOL,
        name: base,
        recording: { recorded: new Date(c.at).toISOString(), tags: c.tags, takesMs: c.takes.map((t) => [msOf(t.start, sr), msOf(t.end, sr)]) },
        variations: vars.map((v) => ({ name: v.name || null, ...settingsOf(v.f) })),
        loudness: state.evenLoudness ? "takes matched within each variation (max momentary loudness, BS.1770)" : "peak",
        export: opts,
        format: describeFormat(opts, state.evenLoudness),
        files: files.map((f) => f.info),
      };
      zip.file("sound.json", JSON.stringify(info, null, 2));
      download(await zip.generateAsync({ type: "blob" }), `${base}_pack.zip`);
    }
    toast(`Saved ${files.length} sound${files.length === 1 ? "" : "s"}, ${kb(bytes)}`);
  } catch (e) {
    toast("Couldn't export. " + (e instanceof Error ? e.message : ""));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
