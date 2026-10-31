import { biquad, chain, gainNode, noiseSrc, srcNode } from "../dsp/blocks";
import { lerp } from "../dsp/rng";
import { defineRecipe } from "./types";

export const whiff = defineRecipe({
  id: "whiff",
  name: "Whiff / swing",
  file: "swing",
  tip: "Blow a quick “fwoo” past the mic, not into it. Or swish a towel or a thin stick near it.",
  example: "Breath ‘fwoo’",
  params: [
    { id: "speed", label: "Speed", lo: "Slow", hi: "Fast", def: 0.55 },
    { id: "weight", label: "Weapon", lo: "Dagger", hi: "Greatsword", def: 0.4 },
    { id: "sweep", label: "Pitch sweep", lo: "Low", hi: "High", def: 0.5 },
    { id: "air", label: "Air", lo: "Breathy", hi: "Windy", def: 0.3 },
  ],
  setup(p, j) {
    const rate = lerp(0.9, 1.8, p.speed) * j(0.08);
    const len = lerp(0.6, 0.22, p.speed) * lerp(0.9, 1.3, p.weight) * j(0.12);
    return { rate, len, peakT: len * lerp(0.55, 0.4, p.speed), roomSize: 0.3, wet: 0.08, damp: 0.7, dur: len + 0.3, comp: [-18, 3] };
  },
  build(ctx, s, src, p, j, rand, mix) {
    const bus = ctx.createGain();
    srcNode(ctx, src, s.rate).connect(bus);
    chain(noiseSrc(ctx, s.len, rand), gainNode(ctx, 0.08 + p.air * 0.6), bus);
    // Band-pass that sweeps up to the swing's peak, then back down
    const lo = lerp(350, 180, p.weight);
    const hi = lerp(1200, 4500, p.sweep) * lerp(1, 0.6, p.weight) * j(0.15);
    const bp = biquad(ctx, "bandpass", lo, lerp(2.5, 1.1, p.air));
    bp.frequency.setValueAtTime(lo, 0);
    bp.frequency.exponentialRampToValueAtTime(hi, s.peakT);
    bp.frequency.exponentialRampToValueAtTime(lo * 0.8, s.len);
    // Swell envelope: rises to peakT, then falls away
    const shape = ctx.createGain();
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * s.len;
      curve[i] = Math.max(0.0001, t < s.peakT ? Math.pow(t / s.peakT, 2) : Math.pow((s.len - t) / (s.len - s.peakT), 1.5));
    }
    shape.gain.setValueCurveAtTime(curve, 0, s.len);
    chain(bus, bp, biquad(ctx, "lowpass", lerp(9000, 3500, p.weight)), gainNode(ctx, 3), shape, mix);
  },
});
