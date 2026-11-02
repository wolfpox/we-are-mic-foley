# We Are Mic Foley

*Sounds Like A Good Idea.*

A free browser tool that turns sounds you record yourself (mouth noises, desk taps, cloth swishes) into game-ready sound effects. Tap the big red button and record anything; it lands in your library with a timestamp, and you can tag it or add it to a project later. Tap a recording to open it right in the list: crop it, push a row of faders (pitch, speed, EQ, punch, grit, lo-fi, echo, reverb and more), lock the ones you like, roll the dice for ideas, and name what works as variations. With a sound open, the record button adds another take. Export gives you every variation of every take as a named pack. Nothing is synthesized: every sound you export is made from your recordings.

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

- `src/dsp/` — audio engine: take finding and cleanup, the faders and their render, time stretch, loudness, encoding
- `src/sounds/` — built-in example recordings and the "Ideas" how-tos
- `src/ui/` — the page: home and library, the sound panel and its faders, record dock, checklist, Foley cards, export, undo, autosave
- `tests/` — browser tests, run in Firefox
- `prototype/` — the original single-file prototype (the recipe-based v0.2 is tagged `v0.2`)
- `docs/BRIEF.md` — what we're building and the roadmap
