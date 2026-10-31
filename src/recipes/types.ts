export type Params = Record<string, number>;

/** Random nudge factor around 1. j(0.1) returns roughly 0.9 to 1.1, scaled by the variation amount. */
export type Jitter = (amount: number) => number;

export interface ParamDef {
  id: string;
  label: string;
  /** Name for the slider's left end. */
  lo: string;
  /** Name for the slider's right end. */
  hi: string;
  /** Default value, 0 to 1. */
  def: number;
}

export interface Crush {
  /** Blend of the bitcrushed signal, 0 to 1. */
  mix: number;
  bits: number;
  /** Sample-and-hold length in samples. */
  hold: number;
}

/** Values every recipe's setup must return. Recipes can add their own. */
export interface Setup {
  /** Total render length in seconds, before trimming. */
  dur: number;
  roomSize: number;
  wet: number;
  damp: number;
  /** Compressor threshold (dB) and ratio. */
  comp: [number, number];
  crush?: Crush;
}

export interface Recipe<S extends Setup = Setup> {
  id: string;
  name: string;
  /** Base for exported file names, e.g. footstep_hard_01.wav. */
  file: string;
  /** What to record for this sound. */
  tip: string;
  /** Name of the built-in example source that suits this recipe. */
  example: string;
  params: ParamDef[];
  /** Turns slider values into concrete numbers. Called before the render context exists. */
  setup(p: Params, j: Jitter): S;
  /** Builds the audio graph into `mix`. */
  build(ctx: BaseAudioContext, s: S, src: AudioBuffer, p: Params, j: Jitter, rand: () => number, mix: AudioNode): void;
}

/** Helper that keeps each recipe's own setup type while checking it against Recipe. */
export const defineRecipe = <S extends Setup>(r: Recipe<S>): Recipe<S> => r;
