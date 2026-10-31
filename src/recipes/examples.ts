import { SR } from "../dsp/blocks";
import { prepSource } from "../dsp/prep";
import { mulberry32 } from "../dsp/rng";

// Built-in example sources, synthesized so the tool works before anyone records anything.

export const EXAMPLES = ["Tongue click", "Palm rub", "Knuckle knock", "Hard ‘kuh’", "Breath ‘fwoo’"] as const;
export type ExampleName = (typeof EXAMPLES)[number];

const DURATIONS: Record<ExampleName, number> = {
  "Tongue click": 0.05,
  "Palm rub": 0.28,
  "Knuckle knock": 0.16,
  "Hard ‘kuh’": 0.22,
  "Breath ‘fwoo’": 0.6,
};

export function makeExample(kind: ExampleName): AudioBuffer {
  const rand = mulberry32(kind.length * 977 + 13);
  const dur = DURATIONS[kind];
  const len = Math.ceil(dur * SR);
  const d = new Float32Array(len);
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const w = rand() * 2 - 1;
    if (kind === "Tongue click") {
      d[i] = (Math.sin(2 * Math.PI * 2300 * t) * 0.8 + w * 0.5) * Math.exp(-t / 0.007);
    } else if (kind === "Palm rub") {
      lp += (w - lp) * 0.35;
      const e = Math.sin((Math.PI * t) / dur);
      d[i] = lp * e * (0.6 + 0.4 * Math.sin(2 * Math.PI * 23 * t));
    } else if (kind === "Knuckle knock") {
      lp += (w - lp) * 0.25;
      d[i] = (Math.sin(2 * Math.PI * 190 * t) * 0.9 + lp * 0.8) * Math.exp(-t / 0.035);
    } else if (kind === "Hard ‘kuh’") {
      lp += (w - lp) * 0.5;
      lp2 += (w - lp2) * 0.08;
      d[i] = lp * Math.exp(-t / 0.012) * 1.2 + (lp2 * 2 + Math.sin(2 * Math.PI * 140 * t) * 0.4) * Math.exp(-t / 0.08) * (t > 0.01 ? 1 : t / 0.01);
    } else {
      lp += (w - lp) * 0.2;
      const e = Math.pow(Math.sin(Math.PI * Math.pow(t / dur, 0.7)), 2);
      d[i] = lp * e * 1.5;
    }
  }
  const buf = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 1 });
  buf.copyToChannel(d, 0);
  // Examples are never silent, so prepSource always returns a buffer here.
  return prepSource(buf)!;
}
