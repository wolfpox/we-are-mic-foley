import { describe, expect, it } from "vitest";
import { matchLoudnessGains, maxMomentaryLoudness } from "../src/dsp/loudness";

const sine = (freq: number, amp: number, seconds: number, sr = 44100) =>
  Float32Array.from({ length: Math.round(seconds * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / sr));

const peak = (d: Float32Array) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("maxMomentaryLoudness", () => {
  it("reads a full-scale 1 kHz sine as -3.01 LUFS (the BS.1770 reference)", () => {
    expect(maxMomentaryLoudness(sine(997, 1, 1), 44100)).toBeCloseTo(-3.01, 1);
    expect(maxMomentaryLoudness(sine(997, 1, 1, 48000), 48000)).toBeCloseTo(-3.01, 1);
  });

  it("drops 6 dB when the level halves", () => {
    const a = maxMomentaryLoudness(sine(997, 1, 1), 44100);
    const b = maxMomentaryLoudness(sine(997, 0.5, 1), 44100);
    expect(a - b).toBeCloseTo(6.02, 1);
  });

  it("hears bass as quieter than treble at the same peak (K-weighting)", () => {
    expect(maxMomentaryLoudness(sine(50, 1, 1), 44100)).toBeLessThan(maxMomentaryLoudness(sine(3000, 1, 1), 44100) - 3);
  });

  it("treats a short sound as followed by silence", () => {
    // 100 ms of tone in a 400 ms window: a quarter of the energy, about -6 dB
    expect(maxMomentaryLoudness(sine(997, 1, 0.1), 44100)).toBeCloseTo(-3.01 - 6.02, 0);
  });

  it("returns -Infinity for silence", () => {
    expect(maxMomentaryLoudness(new Float32Array(1000), 44100)).toBe(-Infinity);
  });
});

describe("matchLoudnessGains", () => {
  it("makes sounds equally loud and keeps peaks under the ceiling", () => {
    const sounds = [sine(100, 0.891, 0.3), sine(2500, 0.891, 0.3), sine(1000, 0.5, 0.3)];
    const gains = matchLoudnessGains(sounds, 44100);
    const out = sounds.map((d, i) => d.map((x) => x * gains[i]));
    const l = out.map((d) => maxMomentaryLoudness(d, 44100));
    expect(Math.max(...l) - Math.min(...l)).toBeLessThan(0.05);
    for (const d of out) expect(peak(d)).toBeLessThanOrEqual(0.8911);
  });

  it("leaves a single sound alone", () => {
    expect(matchLoudnessGains([sine(500, 0.891, 0.2)], 44100)[0]).toBeCloseTo(1, 4);
  });
});
