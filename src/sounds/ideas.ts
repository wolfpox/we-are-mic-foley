import type { Effects, LayerSettings, Spread } from "../dsp/sound";

// Short how-tos: what to record, and which plain settings get it most of the way there.
// "Use these settings" only moves the normal sliders, so you can see and change everything it did.

export interface Idea {
  id: string;
  name: string;
  /** Base for exported file names. */
  file: string;
  record: string;
  shape: string;
  /** One entry per layer. Each layer keeps the recording it already plays. */
  layers: Partial<LayerSettings>[];
  fx: Partial<Effects>;
  spread?: Partial<Spread>;
}

export const IDEAS: Idea[] = [
  {
    id: "footstep",
    name: "Footsteps",
    file: "footstep",
    record: "Knock a knuckle or the heel of your hand on a desk, five times in one recording, a little differently each time.",
    shape: "Pitch down 3 for weight, a little darker, some Compress so the scuff after the hit comes through, and a tiny room.",
    layers: [{ pitch: -3, tone: -0.25 }],
    fx: { compress: 0.45, reverb: 0.1, room: 0.15 },
    spread: { pitch: 1.5 },
  },
  {
    id: "hit",
    name: "Punch or hit",
    file: "hit",
    record: "Slap your forearm, or punch a cushion, close to the mic. Do it a few times.",
    shape: "Pitch down 4, darker, Compress high, and a little Distort to make it feel harder.",
    layers: [{ pitch: -4, tone: -0.3 }],
    fx: { compress: 0.65, distort: 0.2, reverb: 0.12, room: 0.25 },
    spread: { pitch: 2 },
  },
  {
    id: "impact",
    name: "Big impact (two layers)",
    file: "impact",
    record: "Big hits are usually two sounds at once: a sharp front (a slap or a clap) and a low weight (a fist on a sofa or a closed book). Record both, then give each layer its own recording.",
    shape: "Layer 1 stays as recorded and a bit brighter. Layer 2 is pitched down a whole octave (−12) and dark, for the weight. Compress, Distort and a medium room glue them together.",
    layers: [{ pitch: 0, tone: 0.2 }, { pitch: -12, tone: -0.6, volume: -2 }],
    fx: { compress: 0.7, distort: 0.3, reverb: 0.35, room: 0.6 },
    spread: { pitch: 1 },
  },
  {
    id: "swing",
    name: "Swing or whoosh",
    file: "swing",
    record: "Blow a quick “fwoo” past the mic (not into it), or swish a towel or a ruler through the air.",
    shape: "Pitch down for heavy weapons, up for daggers. Pitch also changes length, so lower is slower. A wide pitch spread makes every swing different.",
    layers: [{ pitch: -3, tone: -0.1 }],
    fx: { reverb: 0.15, room: 0.3 },
    spread: { pitch: 2.5 },
  },
  {
    id: "click",
    name: "Menu click",
    file: "ui_click",
    record: "A tongue click, a pen click or a fingernail tap on plastic.",
    shape: "Pitch up 5, brighter, no reverb. Keep the pitch spread small so menus feel consistent.",
    layers: [{ pitch: 5, tone: 0.35 }],
    fx: {},
    spread: { pitch: 0.5, tone: 0.1 },
  },
  {
    id: "coin",
    name: "Coin or pickup",
    file: "pickup",
    record: "Tap a glass or a mug with a spoon.",
    shape: "Two layers of the same tap: the second 7 semitones higher and 70 ms later makes the classic two-note “ding”.",
    layers: [{ pitch: 5, tone: 0.3 }, { pitch: 12, tone: 0.3, delay: 70, volume: -3 }],
    fx: { reverb: 0.2, room: 0.3 },
    spread: { pitch: 0.5, timing: 0 },
  },
  {
    id: "creature",
    name: "Creature",
    file: "creature",
    record: "Growl, groan or gargle into the mic. Try a few different ones in one recording.",
    shape: "Pitch way down, Distort for teeth, and reverb for size.",
    layers: [{ pitch: -9, tone: -0.2 }],
    fx: { compress: 0.4, distort: 0.35, reverb: 0.3, room: 0.5 },
    spread: { pitch: 2 },
  },
  {
    id: "magic",
    name: "Magic swell",
    file: "magic",
    record: "A long “shhh”, or a slow breath out.",
    shape: "Reverse it so it swells in instead of fading out, pitch it up and add a big room.",
    layers: [{ pitch: 4, tone: 0.2, reverse: true }],
    fx: { reverb: 0.55, room: 0.8 },
    spread: { pitch: 2 },
  },
  {
    id: "retro",
    name: "Retro blip",
    file: "blip",
    record: "Any short sound: a click, a “bip” with your voice, a tap.",
    shape: "Lo-fi crunches it down to old-console quality. Pitch up for jumps and blips.",
    layers: [{ pitch: 7 }],
    fx: { lofi: 0.7 },
    spread: { pitch: 1 },
  },
];
