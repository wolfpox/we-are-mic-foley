import { describe, expect, it } from "vitest";
import { render } from "../src/dsp/render";
import { encodeWav } from "../src/dsp/wav";
import { makeExample, type ExampleName } from "../src/recipes/examples";
import { byId, defaultParams } from "../src/recipes";
import cases from "./golden/cases.json";
import { decodeWav16, maxAbsDiff } from "./helpers";

// Reference WAVs rendered from the original prototype by `npm run golden`.
const files = import.meta.glob<string>("./golden/*.wav", { query: "?url", import: "default", eager: true });

describe("sounds match the prototype", () => {
  for (const c of cases) {
    it(c.file, async () => {
      const url = files["./golden/" + c.file];
      expect(url, `missing reference ${c.file}; run npm run golden`).toBeTruthy();
      const ref = decodeWav16(await (await fetch(url)).arrayBuffer());

      const r = byId[c.recipe];
      const params = { ...defaultParams(r), ...(c.params ?? {}) };
      const out = await render(r, makeExample(c.source as ExampleName), params, c.seed, c.variation);
      const got = decodeWav16(encodeWav(out));

      expect(got.samples.length).toBe(ref.samples.length);
      // Identical in the same browser. The tolerance only covers 16-bit rounding.
      expect(maxAbsDiff(got.samples, ref.samples)).toBeLessThan(1e-4);
    });
  }
});
