import { describe, expect, it } from "vitest";
import { MAX_SOURCE_SECONDS, autoTrim, clampRange, noiseGate, sliceSource, toMono, type Mono } from "../src/dsp/prep";
import { mulberry32 } from "../src/dsp/rng";

const SR = 48000;

/** Quiet hiss with a short loud burst in the middle: a typical phone recording. */
function hissWithBurst(): Mono {
  const rand = mulberry32(5);
  const d = new Float32Array(SR); // 1 s
  for (let i = 0; i < d.length; i++) d[i] = (rand() * 2 - 1) * 0.01;
  const at = SR / 2;
  for (let i = 0; i < 0.05 * SR; i++) d[at + i] += Math.sin(i * 0.2) * 0.8 * Math.exp(-i / (0.01 * SR));
  return { data: d, sampleRate: SR };
}

const rms = (d: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = a; i < b; i++) s += d[i] * d[i];
  return Math.sqrt(s / (b - a));
};

describe("toMono", () => {
  it("averages channels and caps the length", () => {
    const buf = new AudioBuffer({ length: SR * 2, sampleRate: SR, numberOfChannels: 2 });
    buf.getChannelData(0).fill(0.5);
    buf.getChannelData(1).fill(0.1);
    const m = toMono(buf, 1)!;
    expect(m.data.length).toBe(SR);
    expect(m.data[100]).toBeCloseTo(0.3, 6);
  });

  it("returns null for silence", () => {
    expect(toMono(new AudioBuffer({ length: 1000, sampleRate: SR, numberOfChannels: 1 }))).toBeNull();
  });
});

describe("autoTrim", () => {
  it("starts just before the burst and skips the hiss before it", () => {
    const r = autoTrim(hissWithBurst());
    expect(r.start).toBeGreaterThan(SR / 2 - 0.006 * SR);
    expect(r.start).toBeLessThanOrEqual(SR / 2);
    expect(r.end).toBeGreaterThan(SR / 2 + 0.03 * SR);
  });
});

describe("autoTrim with several sounds", () => {
  it("stops at the first pause instead of running into the next sound", () => {
    const rand = mulberry32(9);
    const d = new Float32Array(SR * 4);
    for (let i = 0; i < d.length; i++) d[i] = (rand() * 2 - 1) * 0.015;
    for (const t of [0.5, 1.5, 2.5]) for (let i = 0; i < 0.08 * SR; i++) d[t * SR + i] += Math.sin(i * 0.15) * 0.8 * Math.exp(-i / (0.015 * SR));
    const r = autoTrim({ data: d, sampleRate: SR });
    expect(r.start / SR).toBeCloseTo(0.5, 1);
    expect(r.end / SR).toBeLessThan(0.8);
  });
});

describe("clampRange", () => {
  const m: Mono = { data: new Float32Array(SR * 10), sampleRate: SR };

  it("keeps the range inside the recording", () => {
    expect(clampRange(m.data.length, SR, { start: -50, end: SR * 20 }, "start").start).toBe(0);
    expect(clampRange(m.data.length, SR, { start: 0, end: SR * 20 }, "start").end).toBeLessThanOrEqual(SR * 10);
  });

  it("limits length to MAX_SOURCE_SECONDS, moving the side not being dragged", () => {
    const max = MAX_SOURCE_SECONDS * SR;
    expect(clampRange(m.data.length, SR, { start: 0, end: SR * 5 }, "end")).toEqual({ start: SR * 5 - max, end: SR * 5 });
    expect(clampRange(m.data.length, SR, { start: SR, end: SR * 8 }, "start")).toEqual({ start: SR, end: SR + max });
  });

  it("keeps at least 10 ms selected", () => {
    const r = clampRange(m.data.length, SR, { start: SR, end: SR }, "end");
    expect(r.end - r.start).toBe(0.01 * SR);
  });
});

describe("noiseGate", () => {
  it("does nothing at amount 0", () => {
    const m = hissWithBurst();
    expect(Array.from(noiseGate(m.data, SR, 0))).toEqual(Array.from(m.data));
  });

  it("turns the hiss down a lot and leaves the burst nearly untouched", () => {
    const m = hissWithBurst();
    const out = noiseGate(m.data, SR, 0.6);
    const hissBefore = rms(m.data, 0, SR / 4);
    const hissAfter = rms(out, 0, SR / 4);
    expect(hissAfter).toBeLessThan(hissBefore * 0.1);
    const burst = [SR / 2, SR / 2 + 0.01 * SR] as const;
    expect(rms(out, ...burst)).toBeGreaterThan(rms(m.data, ...burst) * 0.95);
  });

  it("does not clip the start of the burst (lookahead)", () => {
    const m = hissWithBurst();
    const out = noiseGate(m.data, SR, 1);
    const i = SR / 2 + 10; // 10 samples into the burst
    expect(Math.abs(out[i])).toBeGreaterThan(Math.abs(m.data[i]) * 0.9);
  });
});

describe("sliceSource", () => {
  it("normalizes the selection to a 0.9 peak", () => {
    const m = hissWithBurst();
    const b = sliceSource(m, autoTrim(m))!;
    const peak = b.getChannelData(0).reduce((p, x) => Math.max(p, Math.abs(x)), 0);
    expect(peak).toBeCloseTo(0.9, 5);
  });

  it("returns null when the selection is silent", () => {
    const m: Mono = { data: new Float32Array(SR), sampleRate: SR };
    m.data[SR - 1] = 0.5;
    expect(sliceSource(m, { start: 0, end: SR / 2 })).toBeNull();
  });
});
