import { biquad, chain, env, srcNode, thump } from "../dsp/blocks";
import { lerp } from "../dsp/rng";
import { defineRecipe } from "./types";

export const footstepHard = defineRecipe({
  id: "footstep_hard",
  name: "Footstep, hard",
  file: "footstep_hard",
  tip: "Click your tongue against the roof of your mouth, or tap a fingernail on a table. Short and sharp works best.",
  example: "Tongue click",
  params: [
    { id: "weight", label: "Weight", lo: "Light", hi: "Heavy", def: 0.45 },
    { id: "surface", label: "Surface", lo: "Wood", hi: "Stone", def: 0.5 },
    { id: "length", label: "Ring-out", lo: "Dry", hi: "Long", def: 0.3 },
    { id: "room", label: "Space", lo: "Outdoors", hi: "Hallway", def: 0.3 },
  ],
  setup(p, j) {
    const rate = lerp(1.2, 0.72, p.weight) * j(0.08);
    const decay = lerp(0.05, 0.22, p.length) * j(0.15);
    const roomSize = lerp(0.15, 0.9, p.room);
    return { rate, decay, roomSize, wet: p.room * 0.35, damp: 1 - p.surface * 0.6, dur: 0.03 + decay + roomSize * 0.9 + 0.05, comp: [-18, 4] };
  },
  build(ctx, s, src, p, j, _rand, mix) {
    chain(
      srcNode(ctx, src, s.rate),
      biquad(ctx, "highpass", lerp(160, 260, p.surface)),
      biquad(ctx, "peaking", lerp(1500, 3800, p.surface) * j(0.15), 1.4, 6),
      biquad(ctx, "lowpass", lerp(6000, 11000, p.surface)),
      env(ctx, { attack: 0.0015, hold: 0.008, decay: s.decay }),
      mix,
    );
    const f0 = lerp(170, 95, p.weight) * j(0.1);
    thump(ctx, mix, { f0, f1: f0 * 0.55, t: 0.06, decay: lerp(0.04, 0.09, p.weight), gain: lerp(0.15, 0.7, p.weight) * (1 - p.surface * 0.3) });
  },
});
