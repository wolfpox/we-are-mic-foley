import { biquad, chain, env, gainNode, noiseSrc, shaper, srcNode, thump } from "../dsp/blocks";
import { lerp } from "../dsp/rng";
import { defineRecipe } from "./types";

export const criticalHit = defineRecipe({
  id: "critical_hit",
  name: "Critical hit",
  file: "critical_hit",
  tip: "Say a hard “puh!” or “kuh!” close to the mic, or drop a book flat on the floor.",
  example: "Hard ‘kuh’",
  params: [
    { id: "weight", label: "Weight", lo: "Heavy", hi: "Colossal", def: 0.5 },
    { id: "brutal", label: "Brutality", lo: "Grim", hi: "Brutal", def: 0.5 },
    { id: "drop", label: "Sub drop", lo: "Short", hi: "Long", def: 0.5 },
    { id: "ring", label: "Ring", lo: "Dull", hi: "Metallic", def: 0.35 },
    { id: "room", label: "Space", lo: "Close", hi: "Arena", def: 0.4 },
  ],
  setup(p, j) {
    const rate = lerp(0.6, 0.38, p.weight) * j(0.08);
    const decay = lerp(0.35, 0.8, p.weight) * j(0.12);
    const subDur = lerp(0.25, 0.9, p.drop);
    const roomSize = lerp(0.6, 1.8, p.room);
    const ringDur = lerp(0.3, 1.1, p.ring);
    return {
      rate, decay, subDur, ringDur, roomSize,
      wet: 0.12 + p.room * 0.3,
      damp: 0.4,
      dur: Math.max(decay, subDur, ringDur) + 0.05 + roomSize * 0.8,
      comp: [-12, 8],
      crush: { mix: p.brutal * 0.55, bits: Math.round(lerp(10, 5, p.brutal)), hold: Math.max(1, Math.round(lerp(1, 6, p.brutal))) },
    };
  },
  build(ctx, s, src, p, j, rand, mix) {
    // Two distorted copies of the source, the second a fifth higher and slightly late
    const bus = ctx.createGain();
    chain(srcNode(ctx, src, s.rate), shaper(ctx, 0.4 + p.brutal * 0.6), gainNode(ctx, 0.6), bus);
    chain(srcNode(ctx, src, s.rate * 1.5, 0.006), shaper(ctx, 0.4 + p.brutal * 0.6), gainNode(ctx, 0.35), bus);
    chain(
      bus,
      biquad(ctx, "highpass", 35),
      biquad(ctx, "peaking", 2800, 0.9, p.brutal * 5),
      biquad(ctx, "lowpass", lerp(8000, 4500, p.weight)),
      env(ctx, { attack: 0.001, hold: 0.02, decay: s.decay }),
      mix,
    );
    thump(ctx, mix, { f0: 110 * j(0.1), f1: 28, t: s.subDur * 0.8, decay: s.subDur, gain: 0.9 });
    // Inharmonic metallic ring
    if (p.ring > 0.02) {
      const base = lerp(420, 700, rand()) * j(0.1);
      [1, 2.76, 5.4].forEach((m, k) => {
        const o = ctx.createOscillator();
        o.frequency.value = base * m;
        const e = env(ctx, { attack: 0.002, decay: s.ringDur / (k + 1), peak: (p.ring * 0.2) / (k + 1) });
        o.connect(e);
        e.connect(mix);
        o.start(0);
        o.stop(s.ringDur + 0.05);
      });
    }
    chain(noiseSrc(ctx, 0.02, rand), biquad(ctx, "highpass", 2500), env(ctx, { attack: 0.0005, decay: 0.02, peak: 0.7 }), mix);
  },
});
