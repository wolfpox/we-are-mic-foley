import { SR } from "../dsp/blocks";
import type { Mono } from "../dsp/prep";
import { mulberry32 } from "../dsp/rng";

// Built-in example recordings, synthesized so the tool works before anyone records anything.
// Each one holds three takes, a little different from each other, like a real recording would.

export const EXAMPLES = ["Tongue click", "Knuckle knock", "Hard ‘kuh’", "Palm rub", "Breath ‘fwoo’"] as const;
export type ExampleName = (typeof EXAMPLES)[number];

const DURATIONS: Record<ExampleName, number> = {
  "Tongue click": 0.05,
  "Palm rub": 0.28,
  "Knuckle knock": 0.16,
  "Hard ‘kuh’": 0.22,
  "Breath ‘fwoo’": 0.6,
};

/** One take. f scales its pitch and length a little. */
function take(kind: ExampleName, seed: number, f: number): Float32Array {
  const rand = mulberry32(seed);
  const dur = DURATIONS[kind] / f;
  const d = new Float32Array(Math.ceil(dur * SR));
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const w = rand() * 2 - 1;
    if (kind === "Tongue click") {
      d[i] = (Math.sin(2 * Math.PI * 2300 * f * t) * 0.8 + w * 0.5) * Math.exp(-t / 0.007);
    } else if (kind === "Palm rub") {
      lp += (w - lp) * 0.35 * f;
      const e = Math.sin((Math.PI * t) / dur);
      d[i] = lp * e * (0.6 + 0.4 * Math.sin(2 * Math.PI * 23 * f * t));
    } else if (kind === "Knuckle knock") {
      lp += (w - lp) * 0.25;
      d[i] = (Math.sin(2 * Math.PI * 190 * f * t) * 0.9 + lp * 0.8) * Math.exp(-t / 0.035);
    } else if (kind === "Hard ‘kuh’") {
      lp += (w - lp) * 0.5;
      lp2 += (w - lp2) * 0.08;
      d[i] = lp * Math.exp(-t / 0.012) * 1.2 + (lp2 * 2 + Math.sin(2 * Math.PI * 140 * f * t) * 0.4) * Math.exp(-t / 0.08) * (t > 0.01 ? 1 : t / 0.01);
    } else {
      lp += (w - lp) * 0.2 * f;
      const e = Math.pow(Math.sin(Math.PI * Math.pow(t / dur, 0.7)), 2);
      d[i] = lp * e * 1.5;
    }
  }
  return d;
}

const TAKES = [
  { f: 1, gain: 0.8 },
  { f: 0.92, gain: 0.65 },
  { f: 1.09, gain: 0.72 },
];

/** A recording with three takes of the example, 0.3 s apart. */
export function makeExample(kind: ExampleName): Mono {
  const gap = Math.floor(0.3 * SR);
  const parts = TAKES.map((t, k) => {
    const d = take(kind, kind.length * 977 + 13 + k * 101, t.f);
    const peak = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    return d.map((x) => (x / peak) * t.gain);
  });
  const data = new Float32Array(parts.reduce((n, p) => n + p.length + gap, gap));
  let at = Math.floor(0.1 * SR);
  for (const p of parts) {
    data.set(p, at);
    at += p.length + gap;
  }
  return { data, sampleRate: SR };
}
