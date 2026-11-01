import { describe, expect, it } from "vitest";
import { encodeSound, resample, type ExportOptions } from "../src/dsp/encode";
import { findTakes, sliceSource } from "../src/dsp/prep";
import { DEFAULT_FX, renderSound } from "../src/dsp/sound";
import { makeExample } from "../src/sounds/examples";

async function sound(): Promise<AudioBuffer> {
  const m = makeExample("Knuckle knock");
  const buf = sliceSource(m, findTakes(m)[0])!;
  return renderSound([{ buf, volume: 0, pitch: -5, tone: -0.2, delay: 0, reverse: false }], { ...DEFAULT_FX, compress: 0.6, reverb: 0.2 });
}

const decode = (bytes: Uint8Array) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.slice().buffer);
const peak = (b: AudioBuffer) => b.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const text = (bytes: Uint8Array, from: number, len: number) => String.fromCharCode(...bytes.subarray(from, from + len));

describe("resample", () => {
  it("halves the sample count at 22 kHz and keeps the duration", async () => {
    const src = await sound();
    const out = await resample(src, 22050);
    expect(out.sampleRate).toBe(22050);
    expect(Math.abs(out.length - src.length / 2)).toBeLessThanOrEqual(1);
  });
});

describe("encodeSound", () => {
  const cases: ExportOptions[] = [
    { format: "ogg", quality: "balanced", sampleRate: 44100 },
    { format: "ogg", quality: "small", sampleRate: 22050 },
    { format: "mp3", quality: "balanced", sampleRate: 44100 },
    { format: "mp3", quality: "small", sampleRate: 22050 },
    { format: "wav", quality: "balanced", sampleRate: 22050 },
  ];

  for (const o of cases) {
    it(`${o.format} ${o.quality} ${o.sampleRate} decodes back to the same sound`, async () => {
      const src = await sound();
      const bytes = await encodeSound(src, o);
      if (o.format === "ogg") {
        expect(text(bytes, 0, 4)).toBe("OggS");
        expect(text(bytes, 0, 200)).toContain("vorbis");
      } else if (o.format === "mp3") {
        // LAME VBR files start with a frame sync (11 set bits)
        expect(bytes[0]).toBe(0xff);
        expect(bytes[1] & 0xe0).toBe(0xe0);
      } else {
        expect(text(bytes, 0, 4)).toBe("RIFF");
      }
      const back = await decode(bytes);
      // MP3 adds encoder delay and pads to whole frames, so allow a little extra length
      const slack = o.format === "mp3" ? 0.08 : 0.005;
      expect(back.duration).toBeGreaterThanOrEqual(src.duration - 0.005);
      expect(back.duration).toBeLessThan(src.duration + slack);
      expect(peak(back)).toBeGreaterThan(0.6);
      expect(peak(back)).toBeLessThan(1.05);
    });
  }

  it("ogg is much smaller than wav", async () => {
    const src = await sound();
    const wav = await encodeSound(src, { format: "wav", quality: "balanced", sampleRate: 44100 });
    const ogg = await encodeSound(src, { format: "ogg", quality: "balanced", sampleRate: 44100 });
    const small = await encodeSound(src, { format: "ogg", quality: "small", sampleRate: 22050 });
    expect(ogg.length).toBeLessThan(wav.length / 4);
    expect(small.length).toBeLessThan(ogg.length);
  });

  it("can encode many sounds in a row with one encoder", async () => {
    const src = await sound();
    const sizes = [];
    for (let i = 0; i < 4; i++) sizes.push((await encodeSound(src, { format: "ogg", quality: "balanced", sampleRate: 44100 })).length);
    expect(new Set(sizes).size).toBe(1);
  });
});
