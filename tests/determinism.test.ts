import { describe, expect, it } from "vitest";
import { render } from "../src/dsp/render";
import { makeExample, type ExampleName } from "../src/recipes/examples";
import { RECIPES, defaultParams } from "../src/recipes";

describe("seeded variations", () => {
  for (const r of RECIPES) {
    const src = () => makeExample(r.example as ExampleName);

    it(`${r.id}: same seed gives the same sound`, async () => {
      const a = await render(r, src(), defaultParams(r), 1234, 0.5);
      const b = await render(r, src(), defaultParams(r), 1234, 0.5);
      expect(Array.from(a.getChannelData(0))).toEqual(Array.from(b.getChannelData(0)));
    });

    it(`${r.id}: different seeds give different sounds`, async () => {
      const a = await render(r, src(), defaultParams(r), 1, 0.5);
      const b = await render(r, src(), defaultParams(r), 2, 0.5);
      expect(Array.from(a.getChannelData(0))).not.toEqual(Array.from(b.getChannelData(0)));
    });

    it(`${r.id}: output peaks at -1 dBFS`, async () => {
      const d = (await render(r, src(), defaultParams(r), 7, 0.3)).getChannelData(0);
      const peak = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      expect(peak).toBeCloseTo(0.891, 2);
    });
  }
});
