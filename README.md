# We Are Mic Foley

*Sounds Like A Good Idea.*

A free browser tool that turns sounds you record yourself (mouth noises, desk taps, cloth swishes) into game-ready sound effects. Pick the sound you want, record a source, shape it with a few plain-language sliders, generate variations, and export a named pack.

Everything runs in your browser. Your recordings never leave your device.

**Try it:** https://wolfpox.github.io/we-are-mic-foley/ (works on phones; allow the microphone when asked)

## Run it

Needs Node 20 or newer. The project pins Node 26 in `.nvmrc`. If Node is installed with nvm but not loaded in your shell, run `source ~/.nvm/nvm.sh && nvm use` first.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # tests run in a real Firefox via Playwright
npm run build    # static site in dist/
```

The microphone only works on `localhost` or `https://`. To try it on a phone, run `npm run dev -- --host` and see the note on HTTPS in `docs/BRIEF.md`.

## Layout

- `src/dsp/` — audio engine: building blocks, rendering, source cleanup, WAV encoding
- `src/recipes/` — one file per target sound, plus the built-in example sources
- `src/ui/` — the page: source, recipes, sliders, variations, export
- `tests/` — browser tests, run in Firefox
- `tests/golden/` — reference sounds rendered from the original prototype
- `prototype/` — the original single-file prototype

## Reference sounds

`tests/golden.test.ts` checks that every recipe still sounds exactly like the prototype. When you change a recipe's sound on purpose, the test fails; update `prototype/` or regenerate the references with `npm run golden` only once you're happy with the new sound.
- `docs/BRIEF.md` — what we're building and the roadmap
