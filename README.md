# We Are Mic Foley

*Sounds Like A Good Idea.*

A free browser tool that turns sounds you record yourself (mouth noises, desk taps, cloth swishes) into game-ready sound effects. Pick the sound you want, record a source, shape it with a few plain-language sliders, generate variations, and export a named pack.

Everything runs in your browser. Your recordings never leave your device.

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

- `index.html`, `src/` — the app
- `src/legacy/app.js` — the prototype code, moved as-is (Phase 1 splits it up)
- `tests/` — browser tests
- `prototype/` — the original single-file prototype, kept as the sound reference
- `docs/BRIEF.md` — what we're building and the roadmap
