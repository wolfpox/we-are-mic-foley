import { SR, sendReverb } from "./blocks";
import { mulberry32 } from "./rng";
import type { Params, Recipe, Setup } from "../recipes/types";

/**
 * Renders one sound offline. Same recipe, source, params, seed and variation give the same samples
 * (in the same browser). variation 0 is the base sound; higher values jitter it more.
 */
export async function render(recipe: Recipe, src: AudioBuffer, p: Params, seed: number, variation: number): Promise<AudioBuffer> {
  const rand = mulberry32(seed);
  const j = (amt: number) => 1 + (rand() * 2 - 1) * amt * variation * 2;
  const s = recipe.setup(p, j);
  const ctx = new OfflineAudioContext(1, Math.ceil(s.dur * SR), SR);
  const mix = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = s.comp[0];
  comp.ratio.value = s.comp[1];
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  comp.knee.value = 6;
  mix.connect(comp);
  comp.connect(ctx.destination);
  recipe.build(ctx, s, src, p, j, rand, mix);
  sendReverb(ctx, comp, ctx.destination, s.roomSize, s.wet, rand, s.damp);
  const buf = await ctx.startRendering();
  return finish(buf, s);
}

/** Bitcrush (if the recipe asks for it), normalize to -1 dBFS, trim the silent tail and fade out. */
export function finish(buf: AudioBuffer, s: Setup): AudioBuffer {
  const d = buf.getChannelData(0);
  if (s.crush && s.crush.mix > 0.01) {
    const q = Math.pow(2, s.crush.bits - 1);
    let held = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % s.crush.hold === 0) held = Math.round(d[i] * q) / q;
      d[i] = d[i] * (1 - s.crush.mix) + held * s.crush.mix;
    }
  }
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const norm = peak > 0 ? 0.891 / peak : 1;
  let end = d.length - 1;
  while (end > 0 && Math.abs(d[end] * norm) < 0.0005) end--;
  const len = Math.min(d.length, end + Math.floor(0.005 * SR) + 1);
  const out = new AudioBuffer({ length: Math.max(1, len), sampleRate: SR, numberOfChannels: 1 });
  const o = out.getChannelData(0);
  const fade = Math.min(len, Math.floor(0.008 * SR));
  for (let i = 0; i < len; i++) {
    o[i] = d[i] * norm;
    if (i > len - fade) o[i] *= (len - i) / fade;
  }
  return out;
}
