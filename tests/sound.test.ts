import { describe, expect, it } from "vitest";
import { findTakes, sliceSource } from "../src/dsp/prep";
import { mulberry32 } from "../src/dsp/rng";
import { DEFAULT_FX, DEFAULT_SPREAD, nudge, renderSound, spreadPitches, takeOrder, type Effects, type LayerSettings, type Part } from "../src/dsp/sound";
import { EXAMPLES, makeExample, type ExampleName } from "../src/sounds/examples";
import { maxAbsDiff } from "./helpers";

const NEUTRAL: LayerSettings = { volume: 0, pitch: 0, tone: 0, delay: 0, reverse: false };
const peak = (d: Float32Array) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/** First take of an example, as the app would use it. */
function take(name: ExampleName = EXAMPLES[1], i = 0): AudioBuffer {
  const m = makeExample(name);
  return sliceSource(m, findTakes(m)[i])!;
}

const part = (buf: AudioBuffer, s: Partial<LayerSettings> = {}): Part => ({ ...NEUTRAL, ...s, buf });
const fx = (f: Partial<Effects> = {}): Effects => ({ ...DEFAULT_FX, ...f });

describe("renderSound", () => {
  it("leaves the recording as it is when every setting is neutral", async () => {
    const src = take();
    const out = await renderSound([part(src)], DEFAULT_FX);
    // Same samples, only rescaled from a 0.9 to a 0.891 peak (the last 8 ms fade out)
    const expected = src.getChannelData(0).map((x) => (x * 0.891) / 0.9);
    const body = Math.floor(out.length - 0.01 * 44100);
    expect(maxAbsDiff(out.getChannelData(0).subarray(0, body), expected.subarray(0, body))).toBeLessThan(1e-4);
  });

  it("peaks at -1 dBFS", async () => {
    const out = await renderSound([part(take(), { pitch: -5 }), part(take(), { pitch: 7, delay: 30 })], fx({ distort: 0.5, reverb: 0.4 }));
    expect(peak(out.getChannelData(0))).toBeCloseTo(0.891, 3);
  });

  it("an octave down is twice as long, like a tape", async () => {
    const src = take(EXAMPLES[4]);
    const a = await renderSound([part(src)], DEFAULT_FX);
    const b = await renderSound([part(src, { pitch: -12 })], DEFAULT_FX);
    expect(b.duration / a.duration).toBeGreaterThan(1.8);
    expect(b.duration / a.duration).toBeLessThan(2.1);
  });

  it("reverse plays the take backwards", async () => {
    const src = take();
    const out = (await renderSound([part(src, { reverse: true })], DEFAULT_FX)).getChannelData(0);
    // A knock is loud at the start; reversed, the loud part is at the end
    const n = out.length;
    expect(peak(out.subarray(Math.floor(n * 0.7)))).toBeGreaterThan(peak(out.subarray(0, Math.floor(n * 0.3))) * 3);
  });

  it("starts a delayed layer later, and drops silence at the front", async () => {
    const src = take();
    const one = await renderSound([part(src)], DEFAULT_FX);
    const two = await renderSound([part(src), part(src, { delay: 200 })], DEFAULT_FX);
    expect(two.duration - one.duration).toBeCloseTo(0.2, 1);
    const late = await renderSound([part(src, { delay: 100 })], DEFAULT_FX);
    expect(Math.abs(late.length - one.length)).toBeLessThan(10);
  });

  it("every effect changes the sound, and reverb adds a tail", async () => {
    const src = take();
    const dry = (await renderSound([part(src)], DEFAULT_FX)).getChannelData(0);
    for (const f of [{ compress: 0.7 }, { distort: 0.5 }, { lofi: 0.6 }, { reverb: 0.5 }, { pitch: 0, tone: -0.5 }]) {
      const isFx = !("tone" in f);
      const out = (await renderSound([part(src, isFx ? {} : f)], isFx ? fx(f) : DEFAULT_FX)).getChannelData(0);
      expect(maxAbsDiff(out, dry), JSON.stringify(f)).toBeGreaterThan(0.05);
    }
    const wet = await renderSound([part(src)], fx({ reverb: 0.5, room: 0.6 }));
    expect(wet.length).toBeGreaterThan(dry.length + 0.3 * 44100);
  });

  it("gives the same samples for the same settings", async () => {
    const parts = [part(take(), { pitch: -3, tone: 0.3 })];
    const a = await renderSound(parts, fx({ reverb: 0.3, distort: 0.2 }));
    const b = await renderSound(parts, fx({ reverb: 0.3, distort: 0.2 }));
    expect(Array.from(a.getChannelData(0))).toEqual(Array.from(b.getChannelData(0)));
  });
});

describe("variations", () => {
  it("spread pitches evenly, so no two in a set are close", () => {
    for (const seed of [1, 2, 3]) {
      const p = spreadPitches(8, 2, mulberry32(seed)).sort((a, b) => a - b);
      for (let i = 1; i < p.length; i++) expect(p[i] - p[i - 1]).toBeGreaterThan(0.2);
      expect(p[p.length - 1] - p[0]).toBeGreaterThan(3);
      expect(Math.max(...p.map(Math.abs))).toBeLessThanOrEqual(2);
    }
  });

  it("use every take before repeating one, never twice in a row", () => {
    for (const seed of [1, 2, 3, 4]) {
      const o = takeOrder(8, 3, mulberry32(seed));
      expect(new Set(o.slice(0, 3)).size).toBe(3);
      for (let i = 1; i < o.length; i++) expect(o[i]).not.toBe(o[i - 1]);
    }
    expect(takeOrder(4, 1, mulberry32(1))).toEqual([0, 0, 0, 0]);
  });

  it("nudges follow the seed and keep layer 1 on time", () => {
    const layers = [NEUTRAL, { ...NEUTRAL, delay: 50 }];
    const a = nudge(layers, { seed: 5, pitch: 1.5, takes: [0, 0] }, DEFAULT_SPREAD);
    expect(a).toEqual(nudge(layers, { seed: 5, pitch: 1.5, takes: [0, 0] }, DEFAULT_SPREAD));
    expect(a[0].delay).toBe(0);
    expect(Math.abs(a[0].pitch - 1.5)).toBeLessThanOrEqual(DEFAULT_SPREAD.pitch * 0.15);
    expect(nudge(layers, { seed: 6, pitch: 1.5, takes: [0, 0] }, DEFAULT_SPREAD)).not.toEqual(a);
  });

  it("are clearly different from each other", async () => {
    const m = makeExample(EXAMPLES[1]);
    const takes = findTakes(m).map((r) => sliceSource(m, r)!);
    const pitches = spreadPitches(4, 2, mulberry32(9));
    const order = takeOrder(4, takes.length, mulberry32(9));
    const outs = await Promise.all(pitches.map((p, i) => renderSound([part(takes[order[i]], { pitch: p })], DEFAULT_FX)));
    for (let i = 0; i < outs.length; i++)
      for (let j = i + 1; j < outs.length; j++) {
        const a = outs[i].getChannelData(0);
        const b = outs[j].getChannelData(0);
        expect(maxAbsDiff(a, b)).toBeGreaterThan(0.3);
      }
  });
});
