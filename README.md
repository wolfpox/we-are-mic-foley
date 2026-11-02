# We Are Mic Foley

*Sounds Like A Good Idea.*

A free browser tool that turns sounds you record yourself (mouth noises, desk taps, cloth swishes) into game-ready sound effects. Tap the big red button and record anything; it lands in your library with a timestamp, and you can tag it or add it to a project later. When you want a sound effect from it, record a few takes, shape them with plain effects (pitch, tone, compress, distort, lo-fi, reverb), stack them in layers, make a set of variations and export a named pack. Nothing is synthesized: every sound you export is made from your recordings.

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

- `src/dsp/` — audio engine: take finding and cleanup, layer rendering and effects, variations, loudness, encoding
- `src/sounds/` — built-in example recordings and the "Ideas" how-tos
- `src/ui/` — the page: home and library, record dock, checklist, Foley cards, the sound screen (layers, variations, export), undo, autosave
- `tests/` — browser tests, run in Firefox
- `prototype/` — the original single-file prototype (the recipe-based v0.2 is tagged `v0.2`)
- `docs/BRIEF.md` — what we're building and the roadmap
