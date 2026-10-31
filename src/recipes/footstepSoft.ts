import { biquad, chain, env, gainNode, noiseSrc, srcNode, thump } from "../dsp/blocks";
import { lerp } from "../dsp/rng";
import { defineRecipe } from "./types";

export const footstepSoft = defineRecipe({
  id: "footstep_soft",
  name: "Footstep, soft",
  file: "footstep_soft",
  tip: "Rub your palms together once, or press a thumb into a pillow. For gravel, crunch a bag of chips.",
  example: "Palm rub",
  params: [
    { id: "weight", label: "Weight", lo: "Light", hi: "Heavy", def: 0.4 },
    { id: "material", label: "Ground", lo: "Carpet", hi: "Gravel", def: 0.35 },
    { id: "length", label: "Length", lo: "Quick", hi: "Dragged", def: 0.35 },
    { id: "room", label: "Space", lo: "Outdoors", hi: "Indoors", def: 0.15 },
  ],
  setup(p, j) {
    const rate = lerp(1.1, 0.75, p.weight) * j(0.08);
    const decay = lerp(0.1, 0.32, p.length) * j(0.15);
    const roomSize = lerp(0.15, 0.7, p.room);
    return { rate, decay, roomSize, wet: p.room * 0.25, damp: 0.8, dur: 0.04 + decay + roomSize * 0.9 + 0.05, comp: [-20, 3] };
  },
  build(ctx, s, src, p, j, rand, mix) {
    chain(
      srcNode(ctx, src, s.rate),
      biquad(ctx, "highpass", 90),
      biquad(ctx, "lowpass", lerp(1600, 5000, p.material) * j(0.15)),
      env(ctx, { attack: 0.008, hold: 0.02, decay: s.decay }),
      mix,
    );
    // Crunch layer: band-limited noise chopped into random grains
    if (p.material > 0.02) {
      const total = 0.03 + s.decay;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, 0);
      for (let t = 0; t < total; t += 0.005) {
        const shape = Math.exp((-3 * t) / total);
        g.gain.setValueAtTime(rand() < 0.45 ? rand() * shape : 0.02 * shape, t);
      }
      g.gain.setValueAtTime(0, total);
      chain(noiseSrc(ctx, total, rand), biquad(ctx, "bandpass", lerp(1200, 3500, p.material) * j(0.2), 0.8), g, gainNode(ctx, p.material * 0.55), mix);
    }
    const f0 = lerp(110, 70, p.weight);
    thump(ctx, mix, { f0, f1: f0 * 0.6, t: 0.05, decay: 0.07, gain: p.weight * 0.35 });
  },
});
