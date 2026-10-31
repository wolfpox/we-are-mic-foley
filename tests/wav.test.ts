import { describe, expect, it } from "vitest";
import { encodeWavSamples } from "../src/dsp/wav";
import { decodeWav16 } from "./helpers";

describe("encodeWav", () => {
  const samples = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2]);
  const ab = encodeWavSamples(samples, 44100);
  const v = new DataView(ab);
  const tag = (o: number) => String.fromCharCode(...new Uint8Array(ab, o, 4));

  it("writes a valid 16-bit mono PCM header", () => {
    expect(ab.byteLength).toBe(44 + samples.length * 2);
    expect(tag(0)).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(ab.byteLength - 8);
    expect(tag(8)).toBe("WAVE");
    expect(tag(12)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(88200);
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(tag(36)).toBe("data");
    expect(v.getUint32(40, true)).toBe(samples.length * 2);
  });

  it("converts samples to 16-bit and clips out-of-range values", () => {
    const pcm = Array.from({ length: samples.length }, (_, i) => v.getInt16(44 + i * 2, true));
    expect(pcm).toEqual([0, 16383, -16384, 32767, -32768, 32767, -32768]);
  });

  it("round-trips through the decoder", () => {
    const back = decodeWav16(ab);
    expect(back.sampleRate).toBe(44100);
    expect(back.samples[1]).toBeCloseTo(0.5, 4);
    expect(back.samples[2]).toBeCloseTo(-0.5, 4);
  });

  it("handles an empty buffer", () => {
    expect(encodeWavSamples(new Float32Array(0), 22050).byteLength).toBe(44);
  });
});
