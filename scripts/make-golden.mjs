// Renders reference sounds from the original prototype (prototype/Foley Forge.html) in Firefox
// and saves them to tests/golden/. The ported code is tested against these.
// Run once with `npm run golden`. Only re-run on purpose, when a sound is meant to change.
import { firefox } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cases = JSON.parse(await readFile(root + "tests/golden/cases.json", "utf8"));

const browser = await firefox.launch();
const page = await browser.newPage();
// The prototype links Google Fonts and a CDN zip library. Neither affects audio, so skip the network.
await page.route(/^https?:/, (r) => r.abort());
await page.goto(pathToFileURL(root + "prototype/Foley Forge.html").href);
await page.waitForFunction(() => typeof render === "function");

for (const c of cases) {
  const bytes = await page.evaluate(async (c) => {
    const r = byId[c.recipe];
    const params = { ...Object.fromEntries(r.params.map((p) => [p.id, p.def])), ...(c.params || {}) };
    const buf = await render(r, makeExample(c.source), params, c.seed, c.variation);
    return Array.from(new Uint8Array(encodeWav(buf)));
  }, c);
  await writeFile(root + "tests/golden/" + c.file, Uint8Array.from(bytes));
  console.log(c.file, bytes.length, "bytes");
}
await browser.close();
