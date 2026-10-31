import { biquad, chain, env, gainNode, noiseSrc, shaper, srcNode, thump } from "../dsp/blocks";
import { lerp } from "../dsp/rng";
import { defineRecipe } from "./types";

export const impactHard = defineRecipe({
  id: "impact_hard",
  name: "Impact, hard",
  file: "impact_hard",
  tip: "Smack your lips, pop your cheek with a finger, or punch a couch cushion close to the mic.",
  example: "Knuckle knock",
  params: [
    { id: "weight", label: "Weight", lo: "Punch", hi: "Hammer", def: 0.5 },
    { id: "crunch", label: "Crunch", lo: "Clean", hi: "Crunchy", def: 0.35 },
    { id: "body", label: "Body", lo: "Thin", hi: "Boomy", def: 0.55 },
    { id: "room", label: "Space", lo: "Close", hi: "Big room", def: 0.25 },
  ],
  setup(p, j) {
    const rate = lerp(0.9, 0.5, p.weight) * j(0.08);
    const decay = lerp(0.15, 0.4, p.weight) * j(0.15);
    const roomSize = lerp(0.2, 1.2, p.room);
    return { rate, decay, roomSize, wet: p.room * 0.3, damp: 0.5, dur: 0.02 + decay + roomSize * 0.9 + 0.1, comp: [-14, 6] };
  },
  build(ctx, s, src, p, j, rand, mix) {
    chain(
      srcNode(ctx, src, s.rate),
      biquad(ctx, "highpass", 45),
      shaper(ctx, p.crunch),
      gainNode(ctx, lerp(1, 0.55, p.crunch)),
      biquad(ctx, "peaking", lerp(140, 90, p.weight), 1, p.body * 9),
      biquad(ctx, "peaking", 2500, 1, p.crunch * 4),
      biquad(ctx, "lowpass", lerp(9000, 5000, p.weight)),
      env(ctx, { attack: 0.001, hold: 0.01, decay: s.decay }),
      mix,
    );
    thump(ctx, mix, { f0: lerp(90, 60, p.weight) * j(0.1), f1: lerp(45, 30, p.weight), t: 0.12, decay: lerp(0.15, 0.4, p.body), gain: p.body * 0.9 });
    chain(noiseSrc(ctx, 0.02, rand), biquad(ctx, "highpass", 3000), env(ctx, { attack: 0.0005, decay: 0.015, peak: 0.5 }), mix);
  },
});
