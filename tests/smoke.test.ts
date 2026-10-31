import { describe, expect, it } from "vitest";

// Phase 1 tests render recipes offline in a real browser. This checks that the setup can do that.
async function renderTone(): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 4410, 44100);
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  osc.connect(ctx.destination);
  osc.start();
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

describe("browser audio", () => {
  it("renders sound offline", async () => {
    const d = await renderTone();
    const peak = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    expect(d.length).toBe(4410);
    expect(peak).toBeGreaterThan(0.9);
  });

  it("renders the same samples every time", async () => {
    const [a, b] = await Promise.all([renderTone(), renderTone()]);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
