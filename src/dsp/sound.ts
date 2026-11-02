import { SR, biquad, gainNode, makeIR, shaper } from "./blocks";
import { echoFeedback, echoMs, eqDb, isSet, levelDb, lowCutHz, pitchSt, roomSeconds, speedX, type Faders } from "./faders";
import { lerp, mulberry32 } from "./rng";
import { stretch } from "./stretch";

// One take through the faders. Nothing is synthesized: every fader is a plain effect on your recording.

const MAX_RENDER_SECONDS = 12;
/** Peak level of every render at Level 0: -1 dBFS. */
export const CEILING = 0.891;

const dbToGain = (db: number) => Math.pow(10, db / 20);

/**
 * Renders a take (already trimmed and cleaned up) through the faders. Peaks at -1 dBFS at Level 0,
 * with the silent tail trimmed. With every fader at its default, the output is the take itself.
 */
export async function renderFaders(take: AudioBuffer, f: Faders): Promise<AudioBuffer> {
  const sr = take.sampleRate;
  // Pitch is stretch then playback rate, so it keeps the length; Speed is stretch only, so it keeps the pitch
  const rate = Math.pow(2, pitchSt(f.pitch) / 12);
  const src = stretch(take.getChannelData(0), rate / speedX(f.speed), sr);
  const body = src.length / rate / sr;

  const echoOn = isSet(f, "echo");
  const reverbOn = isSet(f, "reverb");
  const gap = echoMs(f.etime) / 1000;
  const feedback = echoFeedback(f.erep);
  const echoTail = echoOn ? Math.min(4, (gap * Math.log(0.01)) / Math.log(feedback)) : 0;
  const room = roomSeconds(f.room);
  const dur = Math.min(MAX_RENDER_SECONDS, body + echoTail + (reverbOn ? room : 0) + 0.02);
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);

  const buf = ctx.createBuffer(1, src.length, sr);
  buf.copyToChannel(src, 0);
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.playbackRate.value = rate;
  let out: AudioNode = n;
  const add = (node: AudioNode) => {
    out.connect(node);
    out = node;
  };

  if (isSet(f, "lowcut")) add(biquad(ctx, "highpass", lowCutHz(f.lowcut)));
  if (isSet(f, "low")) add(biquad(ctx, "lowshelf", 200, 0.707, eqDb(f.low)));
  if (isSet(f, "mid")) add(biquad(ctx, "peaking", 1200, 0.8, eqDb(f.mid)));
  if (isSet(f, "high")) add(biquad(ctx, "highshelf", 4500, 0.707, eqDb(f.high)));
  if (isSet(f, "grit")) {
    add(gainNode(ctx, 1 + f.grit * 5));
    add(shaper(ctx, f.grit));
  }
  if (isSet(f, "punch")) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = lerp(-6, -42, f.punch);
    c.ratio.value = lerp(2, 12, f.punch);
    c.knee.value = 6;
    c.attack.value = 0.006; // lets the first few ms of the hit through
    c.release.value = 0.12;
    add(c);
  }
  if (echoOn) {
    // A feedback delay; each repeat is a little darker, like a real echo
    const sum = gainNode(ctx, 1);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = gap;
    const damp = biquad(ctx, "lowpass", 5000);
    const fb = gainNode(ctx, feedback);
    const wet = gainNode(ctx, f.echo * 0.9);
    out.connect(sum);
    out.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(wet).connect(sum);
    out = sum;
  }
  if (reverbOn) {
    out.connect(gainNode(ctx, 1 - f.reverb * 0.5)).connect(ctx.destination);
    const conv = ctx.createConvolver();
    // The same room every time, so takes and variations differ only where you asked them to
    conv.buffer = makeIR(ctx, room, mulberry32(77), lerp(0.7, 0.35, f.room));
    out.connect(conv).connect(gainNode(ctx, f.reverb * 1.2)).connect(ctx.destination);
  } else out.connect(ctx.destination);

  n.start();
  return finish(await ctx.startRendering(), f);
}

const peakOf = (d: Float32Array) => {
  let p = 0;
  for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
  return p;
};

function scale(d: Float32Array, g: number): void {
  for (let i = 0; i < d.length; i++) d[i] *= g;
}

/** Above 60% of the ceiling, peaks are squashed smoothly instead of clipped. */
function softLimit(d: Float32Array): void {
  const t = 0.6 * CEILING;
  const room = CEILING - t;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > t) d[i] = Math.sign(d[i]) * (t + room * Math.tanh((a - t) / room));
  }
}

/** Attack, fade, lo-fi and level, then normalization and a trimmed tail. Changes `buf` in place. */
export function finish(buf: AudioBuffer, f: Faders): AudioBuffer {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const peak = peakOf(d);
  if (peak === 0) return buf;
  let onset = 0;
  while (onset < d.length && Math.abs(d[onset]) < peak * 0.1) onset++;

  if (isSet(f, "fade")) {
    const tau = 0.03 + 1.6 * Math.pow(1 - f.fade, 3);
    for (let i = onset; i < d.length; i++) d[i] *= Math.exp(-(i - onset) / sr / tau);
  }
  if (f.attack < -0.004) {
    // Fades in over up to 120 ms
    const soft = -f.attack * 0.12 * sr;
    for (let i = 0; i < Math.min(d.length, onset + soft); i++) d[i] *= Math.max(0, (i - onset) / soft);
  } else if (f.attack > 0.004) {
    // Lifts the first few ms of the hit
    for (let i = onset; i < d.length; i++) d[i] *= 1 + f.attack * 2.5 * Math.exp(-(i - onset) / (sr * 0.012));
  }

  scale(d, CEILING / peakOf(d));
  if (isSet(f, "lofi")) {
    // Fewer bits and a lower sample rate, like an old game console
    const q = Math.pow(2, Math.round(lerp(12, 3, f.lofi)) - 1);
    const hold = Math.max(1, Math.round(lerp(1, 12, f.lofi)));
    let held = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % hold === 0) held = Math.round(d[i] * q) / q;
      d[i] = held;
    }
  }
  const db = levelDb(f.level);
  if (db > 0.05) {
    // Louder means denser: push into a soft limiter, then back to the ceiling
    scale(d, dbToGain(db));
    softLimit(d);
    scale(d, CEILING / (peakOf(d) || 1));
  } else scale(d, (CEILING / (peakOf(d) || 1)) * dbToGain(Math.min(0, db)));

  // Trim the silent tail and fade the last 8 ms
  let last = d.length - 1;
  while (last > 0 && Math.abs(d[last]) < 0.0005) last--;
  const len = Math.max(1, Math.min(d.length, last + Math.floor(0.005 * sr) + 1));
  const out = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 });
  const o = out.getChannelData(0);
  o.set(d.subarray(0, len));
  const fadeLen = Math.min(len, Math.floor(0.008 * sr));
  for (let i = len - fadeLen; i < len; i++) o[i] *= (len - i) / fadeLen;
  return out;
}
