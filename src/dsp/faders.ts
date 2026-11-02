import { lerp } from "./rng";

// The faders that shape a sound. Each is a number: -1 to 1 for two-way faders, 0 to 1 otherwise.
// Every fader at its default leaves the recording as it is.

export const FADER_KEYS = [
  "clean", "lowcut",
  "pitch", "speed",
  "attack", "fade",
  "low", "mid", "high",
  "punch", "grit", "lofi",
  "echo", "etime", "erep",
  "reverb", "room",
  "level",
] as const;

export type FaderKey = (typeof FADER_KEYS)[number];
export type Faders = Record<FaderKey, number>;

/** Faders that go both ways from the middle. */
export const TWO_WAY: ReadonlySet<FaderKey> = new Set(["pitch", "speed", "attack", "low", "mid", "high", "level"]);

const DEFAULTS: Faders = Object.fromEntries(FADER_KEYS.map((k) => [k, 0])) as Faders;
// Echo time, repeats and room size only matter once echo or reverb is up, so they start mid-way
DEFAULTS.etime = 0.4;
DEFAULTS.erep = 0.3;
DEFAULTS.room = 0.3;

export const defaultFaders = (): Faders => ({ ...DEFAULTS });
export const defaultOf = (k: FaderKey) => DEFAULTS[k];
export const minOf = (k: FaderKey) => (TWO_WAY.has(k) ? -1 : 0);

/** Keeps a value in range, rounded to 0.01 so saved settings stay tidy. */
export const clampFader = (k: FaderKey, v: number) => Math.round(Math.max(minOf(k), Math.min(1, v)) * 100) / 100;

const EPS = 0.004;
export const isSet = (f: Faders, k: FaderKey) => Math.abs(f[k] - DEFAULTS[k]) > EPS;
/** True if anything differs from the recording as it is. */
export const anySet = (f: Faders) => FADER_KEYS.some((k) => isSet(f, k));
export const sameFaders = (a: Faders, b: Faders) => FADER_KEYS.every((k) => Math.abs(a[k] - b[k]) < EPS);

/** A full set from saved data, which may be from an older version with fewer faders. */
export function toFaders(o: Partial<Record<string, unknown>> | null | undefined): Faders {
  const f = defaultFaders();
  for (const k of FADER_KEYS) {
    const v = o?.[k];
    if (typeof v === "number" && Number.isFinite(v)) f[k] = clampFader(k, v);
  }
  return f;
}

// ---- What each fader means in sound terms ----

export const pitchSt = (v: number) => v * 12;
/** 0.5× to 2×. */
export const speedX = (v: number) => Math.pow(2, v);
/** 20 Hz to 600 Hz. */
export const lowCutHz = (v: number) => 20 * Math.pow(30, v);
export const eqDb = (v: number) => v * 12;
export const levelDb = (v: number) => v * 12;
/** 40 ms to 600 ms. */
export const echoMs = (v: number) => 40 + v * v * 560;
/** How much of each echo carries into the next. */
export const echoFeedback = (v: number) => lerp(0.15, 0.8, v);
/** Echoes you can hear before they fade below 5%. */
export const echoRepeats = (v: number) => Math.max(1, Math.round(Math.log(0.05) / Math.log(echoFeedback(v))));
/** Reverb length: 0.25 s (small room) to 2.75 s (hall). */
export const roomSeconds = (v: number) => 0.25 + v * 2.5;

/** Faders Random leaves alone: cleanup and level are about the recording, not the idea. */
const NOT_RANDOM: ReadonlySet<FaderKey> = new Set(["clean", "lowcut", "level"]);

/** False when every fader Random could change is locked. */
export const canRandomize = (locked: ReadonlySet<FaderKey>) => FADER_KEYS.some((k) => !NOT_RANDOM.has(k) && !locked.has(k));

/**
 * A random idea: 3 to 5 unlocked faders get new values and the other unlocked ones go back to their
 * defaults, so each idea is easy to hear. Echo and reverb turn on when only their settings were picked.
 */
export function randomFaders(from: Faders, locked: ReadonlySet<FaderKey>, rand: () => number = Math.random): Faders {
  const keys = FADER_KEYS.filter((k) => !NOT_RANDOM.has(k) && !locked.has(k));
  const f = { ...from };
  if (!keys.length) return f;
  for (const k of keys) f[k] = DEFAULTS[k];
  const want = Math.min(keys.length, 3 + Math.floor(rand() * 3));
  const pool = [...keys];
  const picked: FaderKey[] = [];
  while (picked.length < want) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  for (const k of picked) {
    const v = TWO_WAY.has(k) ? (rand() * 2 - 1) * 0.75 : k === "etime" || k === "erep" || k === "room" ? 0.15 + rand() * 0.75 : 0.1 + Math.pow(rand(), 1.3) * 0.65;
    f[k] = clampFader(k, v);
  }
  if ((picked.includes("etime") || picked.includes("erep")) && !isSet(f, "echo") && keys.includes("echo")) f.echo = 0.3;
  if (picked.includes("room") && !isSet(f, "reverb") && keys.includes("reverb")) f.reverb = 0.25;
  return f;
}
