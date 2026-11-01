import { encodeWav } from "./wav";

export type Format = "ogg" | "mp3" | "wav";
export type Quality = "small" | "balanced" | "high";
export type OutputRate = 44100 | 22050;

export interface ExportOptions {
  format: Format;
  quality: Quality;
  sampleRate: OutputRate;
}

export const DEFAULT_EXPORT: ExportOptions = { format: "ogg", quality: "balanced", sampleRate: 44100 };

export const FORMAT_LABEL: Record<Format, string> = {
  ogg: "Ogg Vorbis",
  mp3: "MP3",
  wav: "WAV 16-bit",
};

// Vorbis quality runs -1..10 (higher is better); LAME VBR runs 0..9.999 (lower is better).
const OGG_Q: Record<Quality, number> = { small: 1, balanced: 4, high: 7 };
const MP3_Q: Record<Quality, number> = { small: 7, balanced: 4, high: 2 };

/** Converts to another sample rate using the browser's own resampler. */
export async function resample(buf: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (buf.sampleRate === rate) return buf;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.round(buf.duration * rate)), rate);
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.connect(ctx.destination);
  n.start();
  return ctx.startRendering();
}

type Encoder = Awaited<ReturnType<typeof import("wasm-media-encoders").createEncoder>>;
const encoders: Partial<Record<"ogg" | "mp3", Promise<Encoder>>> = {};

/** Loads an encoder the first time it's needed, so the page itself stays small. */
function getEncoder(format: "ogg" | "mp3"): Promise<Encoder> {
  encoders[format] ??= (async () => {
    const { createEncoder } = await import("wasm-media-encoders");
    const wasm =
      format === "ogg"
        ? (await import("wasm-media-encoders/wasm/ogg?url")).default
        : (await import("wasm-media-encoders/wasm/mp3?url")).default;
    return createEncoder(format === "ogg" ? "audio/ogg" : "audio/mpeg", wasm);
  })();
  return encoders[format];
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Encodes one mono sound in the chosen format. */
export async function encodeSound(buf: AudioBuffer, opts: ExportOptions): Promise<Uint8Array> {
  const b = await resample(buf, opts.sampleRate);
  if (opts.format === "wav") return new Uint8Array(encodeWav(b));
  const enc = await getEncoder(opts.format);
  if (opts.format === "ogg") enc.configure({ channels: 1, sampleRate: b.sampleRate, vbrQuality: OGG_Q[opts.quality] });
  else enc.configure({ channels: 1, sampleRate: b.sampleRate, vbrQuality: MP3_Q[opts.quality] });
  // The encoder reuses its output memory, so each chunk is copied before the next call.
  const parts = [enc.encode([b.getChannelData(0)]).slice()];
  parts.push(enc.finalize().slice());
  return concat(parts);
}

export function describeFormat(o: ExportOptions): string {
  const rate = o.sampleRate === 44100 ? "44.1 kHz" : "22.05 kHz";
  const q = o.format === "wav" ? "" : `, ${o.quality} quality`;
  return `${FORMAT_LABEL[o.format]} ${rate} mono${q}, peak -1 dBFS`;
}
