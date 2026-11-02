import { describe, expect, it } from "vitest";
import { FADER_KEYS, TWO_WAY, anySet, defaultFaders, isSet, randomFaders, toFaders, type FaderKey, type Faders } from "../src/dsp/faders";
import { findTakes, sliceSource } from "../src/dsp/prep";
import { mulberry32 } from "../src/dsp/rng";
import { CEILING, renderFaders } from "../src/dsp/sound";
import { stretch } from "../src/dsp/stretch";
import { EXAMPLES, makeExample, type ExampleName } from "../src/sounds/examples";
import { maxAbsDiff } from "./helpers";

const peak = (d: Float32Array) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);

/** A take of an example, as the app would use it. */
function take(name: ExampleName = EXAMPLES[1], i = 0): AudioBuffer {
  const m = makeExample(name);
  return sliceSource(m, findTakes(m)[i])!;
}

const fx = (o: Partial<Faders> = {}): Faders => ({ ...defaultFaders(), ...o });

/** Zero crossings per second: a rough pitch measure for a steady tone. */
function crossings(d: Float32Array, sr: number): number {
  let n = 0;
  for (let i = 1; i < d.length; i++) if (d[i - 1] < 0 !== d[i] < 0) n++;
  return n / (d.length / sr);
}

function tone(hz: number, seconds: number, sr = 44100): AudioBuffer {
  const b = new AudioBuffer({ length: Math.floor(seconds * sr), sampleRate: sr, numberOfChannels: 1 });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.9 * Math.sin((2 * Math.PI * hz * i) / sr) * Math.min(1, i / 400, (d.length - i) / 400);
  return b;
}

describe("renderFaders", () => {
  it("leaves the recording as it is when every fader is at its default", async () => {
    const src = take();
    const out = await renderFaders(src, defaultFaders());
    // Same samples, only rescaled from a 0.9 to a 0.891 peak (the last 8 ms fade out)
    const expected = src.getChannelData(0).map((x) => (x * CEILING) / 0.9);
    const body = Math.floor(out.length - 0.01 * 44100);
    expect(maxAbsDiff(out.getChannelData(0).subarray(0, body), expected.subarray(0, body))).toBeLessThan(1e-4);
  });

  it("peaks at -1 dBFS at Level 0, whatever else is set", async () => {
    const out = await renderFaders(take(), fx({ pitch: -0.4, grit: 0.5, reverb: 0.4, echo: 0.5, punch: 0.7, attack: 0.5 }));
    expect(peak(out.getChannelData(0))).toBeCloseTo(CEILING, 3);
  });

  it("Pitch keeps the length and Speed keeps the pitch", async () => {
    const src = tone(440, 0.6);
    const base = await renderFaders(src, defaultFaders());
    const up = await renderFaders(src, fx({ pitch: 1 }));
    const slow = await renderFaders(src, fx({ speed: -1 }));
    expect(up.duration / base.duration).toBeGreaterThan(0.95);
    expect(up.duration / base.duration).toBeLessThan(1.05);
    expect(crossings(up.getChannelData(0), 44100) / crossings(base.getChannelData(0), 44100)).toBeCloseTo(2, 1);
    expect(slow.duration / base.duration).toBeCloseTo(2, 1);
    expect(crossings(slow.getChannelData(0), 44100) / crossings(base.getChannelData(0), 44100)).toBeCloseTo(1, 1);
  });

  it("echo and reverb add a tail; Fade shortens the sound", async () => {
    const src = take();
    const base = await renderFaders(src, defaultFaders());
    expect((await renderFaders(src, fx({ echo: 0.6 }))).duration).toBeGreaterThan(base.duration + 0.2);
    expect((await renderFaders(src, fx({ reverb: 0.6, room: 0.8 }))).duration).toBeGreaterThan(base.duration + 0.5);
    const breath = take(EXAMPLES[4]);
    const long = await renderFaders(breath, defaultFaders());
    const faded = await renderFaders(breath, fx({ fade: 0.9 }));
    expect(faded.duration).toBeLessThan(long.duration * 0.8);
  });

  it("Level below 0 is quieter; above 0 is denser at the same peak", async () => {
    const src = take();
    const base = (await renderFaders(src, defaultFaders())).getChannelData(0);
    const quiet = (await renderFaders(src, fx({ level: -0.5 }))).getChannelData(0);
    const loud = (await renderFaders(src, fx({ level: 0.5 }))).getChannelData(0);
    expect(peak(quiet)).toBeCloseTo(CEILING / 2, 2);
    expect(peak(loud)).toBeCloseTo(CEILING, 3);
    expect(rms(loud)).toBeGreaterThan(rms(base) * 1.2);
  });

  it("every fader changes the sound", async () => {
    const src = take();
    const base = (await renderFaders(src, defaultFaders())).getChannelData(0);
    // Clean is applied when the take is cut from the recording (sliceSource), not here
    for (const k of FADER_KEYS.filter((x) => x !== "clean")) {
      // Echo time and repeats only matter with echo on, room only with reverb on
      const on: Partial<Faders> = k === "etime" || k === "erep" ? { echo: 0.5 } : k === "room" ? { reverb: 0.5 } : {};
      const ref = Object.keys(on).length ? (await renderFaders(src, fx(on))).getChannelData(0) : base;
      const v = k === "etime" || k === "erep" || k === "room" ? 0.9 : TWO_WAY.has(k) ? -0.6 : 0.6;
      const out = (await renderFaders(src, fx({ ...on, [k]: v }))).getChannelData(0);
      const differs = out.length !== ref.length || maxAbsDiff(out, ref) > 0.01;
      expect(differs, k).toBe(true);
    }
  });

  it("gives the same samples for the same settings", async () => {
    const f = fx({ pitch: 0.3, speed: -0.2, echo: 0.4, reverb: 0.3, lofi: 0.4 });
    const [a, b] = await Promise.all([renderFaders(take(), f), renderFaders(take(), f)]);
    expect(Array.from(a.getChannelData(0))).toEqual(Array.from(b.getChannelData(0)));
  });
});

describe("stretch", () => {
  it("changes the length by the factor and keeps a tone's pitch", () => {
    const src = tone(300, 0.5).getChannelData(0);
    for (const factor of [0.5, 0.8, 1.6, 2]) {
      const out = stretch(src, factor, 44100);
      expect(out.length).toBe(Math.round(src.length * factor));
      expect(crossings(out, 44100) / crossings(src, 44100)).toBeCloseTo(1, 1);
    }
  });

  it("keeps the level of a steady tone (no gaps or doubling)", () => {
    const src = tone(220, 0.5).getChannelData(0);
    const out = stretch(src, 1.7, 44100);
    expect(rms(out.subarray(2000, out.length - 2000)) / rms(src.subarray(2000, src.length - 2000))).toBeCloseTo(1, 1);
  });
});

describe("faders", () => {
  it("default to the recording as it is", () => {
    expect(anySet(defaultFaders())).toBe(false);
  });

  it("load from older or damaged saves", () => {
    const f = toFaders({ pitch: 5, grit: "x", nonsense: 1 });
    expect(f.pitch).toBe(1);
    expect(f.grit).toBe(0);
    expect(f.room).toBe(defaultFaders().room);
  });

  it("Random leaves locked faders, cleanup and level alone and changes 3 to 5 others", () => {
    const rand = mulberry32(5);
    const from = fx({ clean: 0.4, level: 0.2, pitch: 0.5, grit: 0.3 });
    const locked = new Set<FaderKey>(["pitch", "reverb"]);
    for (let i = 0; i < 50; i++) {
      const f = randomFaders(from, locked, rand);
      expect(f.clean).toBe(0.4);
      expect(f.level).toBe(0.2);
      expect(f.pitch).toBe(0.5);
      expect(f.reverb).toBe(0);
      const changed = FADER_KEYS.filter((k) => isSet(f, k) && !["clean", "level", "pitch"].includes(k));
      expect(changed.length).toBeGreaterThanOrEqual(2); // a picked value can land on the default
      expect(changed.length).toBeLessThanOrEqual(6); // plus echo turned on for its settings
    }
  });

  it("Random turns echo on when it picks only echo's settings", () => {
    const rand = mulberry32(1);
    const locked = new Set<FaderKey>(FADER_KEYS.filter((k) => !["etime", "erep", "echo"].includes(k)));
    for (let i = 0; i < 20; i++) {
      const f = randomFaders(defaultFaders(), locked, rand);
      if (isSet(f, "etime") || isSet(f, "erep")) expect(isSet(f, "echo")).toBe(true);
    }
  });
});
