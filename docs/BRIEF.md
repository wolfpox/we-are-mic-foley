# We Are Mic Foley: project brief

*Sounds Like A Good Idea.*

## What it is
A free, browser-based tool that turns sounds you record yourself (mouth noises, desk taps, cloth swishes) into game-ready sound effects. You pick the sound you want, record a source, shape it with a few plain-language sliders, generate variations, and export a named pack.

## Who it's for
Solo and small indie game developers with no audio budget and no audio-engineering background. Easy to start; the depth is there for people who go looking for it.

## Decisions
- **Game sound effects come first.** Film-style foley comes later, if at all.
- **Phones from day one** for the record, shape and export path. The advanced editor can be desktop-only.
- **Small files are fine.** Export Ogg Vorbis first (Godot, Unity and GameMaker all import it), then MP3. Offer 22 kHz output.
- **No backend.** Static site. Audio never leaves the device.

## Core loop
1. Pick the sound you need (a recipe). The recipe tells you what to record.
2. Record or upload a source. The useful part is selected automatically; handles adjust it, and a slider cleans up background noise. Built-in examples work without a mic.
3. Shape it with 3 to 5 sliders named in plain words (Weight, Surface, Space).
4. Generate 4 to 12 variations so repeated sounds don't feel robotic. Discard the ones you don't like and replace them. Loudness is matched across the set.
5. Export a zip (Ogg Vorbis, MP3 or WAV; 44.1 or 22 kHz) plus a `recipe.json` with the settings and seeds that reproduce the pack.

Undo/redo covers every sound change, and the session is saved in the browser as you go.

## First recipes (from the prototype)
- **Footstep, hard** (wood to stone): pitch down with weight, high-pass, presence boost at 1.5 to 3.8 kHz, short envelope, synthesized low thump layer, small room reverb.
- **Footstep, soft** (carpet to gravel): low-pass 1.6 to 5 kHz, softer attack, longer decay, granular noise "crunch" layer, faint thump.
- **Impact, hard**: pitch down, waveshaper crunch, low-mid body boost, sine sub hit (90 to 30 Hz), bright transient click, compression.
- **Critical hit**: two pitched-down layers a fifth apart with heavy distortion, long sub drop (110 to 28 Hz), inharmonic metallic ring, bitcrush blend, bigger reverb.
- **Whiff / swing** (dagger to greatsword): band-pass filter that sweeps up then down, shaped swell envelope, added air noise, speed controls length.

## Architecture
- Vite + TypeScript static site. Deploy to GitHub Pages or itch.io.
- Web Audio API. Every render is an OfflineAudioContext pass, so output is deterministic and faster than real time.
- Recipes are data plus a small build function: parameters (id, label, low and high names, default), a "what to record" tip, and a chain built from shared DSP blocks (filters, envelope, waveshaper, thump/sub/ring oscillators, noise layers, convolution reverb from a generated impulse, bitcrush).
- Variations come from a seeded random generator that jitters pitch, filter frequency and decay.
- Recording uses getUserMedia and MediaRecorder with echo cancellation, noise suppression and auto gain turned off. Upload stays as a fallback.
- Export uses JSZip and a plain WAV encoder.

### Determinism caveat
Browsers render audio slightly differently. The same `recipe.json` gives an identical pack in the same browser and a very close one elsewhere. Tests compare against reference renders with a small tolerance.

### Microphone on phones
Browsers allow the mic only on `https://` or `localhost`. Testing on a phone over Wi-Fi needs the dev server on HTTPS (for example `@vitejs/plugin-basic-ssl`). The deployed site is HTTPS, so this only affects development.

## Layout
```
src/
  dsp/       blocks.ts  render.ts  prep.ts  wav.ts  rng.ts
  recipes/   footstepHard.ts  footstepSoft.ts  impactHard.ts
             criticalHit.ts  whiff.ts  index.ts  types.ts  examples.ts
  ui/        source.ts  recipes.ts  sliders.ts  variations.ts  export.ts
             dom.ts  playback.ts  state.ts
  main.ts
tests/       wav.test.ts  determinism.test.ts  golden.test.ts  golden/
```

## Roadmap
Done: Phase 0 and Phase 1 (2026-10-31), Phase 2 (2026-11-01). Live at https://wolfpox.github.io/we-are-mic-foley/.

0. **Setup.** Node LTS, git, Vite + TypeScript, Vitest browser tests in Playwright Firefox. The prototype runs as-is from `src/legacy/app.js`.
1. **Port, no change in sound.** Split into the layout above. Save reference renders of each recipe from the prototype with fixed seeds and test against them. Test the WAV encoder. Remove the 4-second recording cap.
2. **Easy start, small files.** Trim handles on the waveform, noise gate, one-tap re-record. Keep or discard single variations. Undo, A/B source vs result. Autosave the session. Loudness option. Ogg Vorbis and MP3 export, 22 kHz option. Goal: a newcomer gets from page open to downloaded pack in under 2 minutes.
3. **More recipes.** One file per recipe, plus a dev "recipe lab" page. In order: UI click/confirm/cancel, coin/pickup, jump/land, hit/hurt, explosion, magic zap, laser, door, creak, break/shatter. Allow synth-only recipes that need no recording.
4. **Depth, behind an Advanced toggle.** Editable effect chain, layering several recordings, custom recipes as JSON, per-engine export presets, audio sprites for Phaser and Howler.
5. **Ship.** Static hosting, works offline, privacy note, users own what they make.
