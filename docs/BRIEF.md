# We Are Mic Foley: project brief

*Sounds Like A Good Idea.*

## What it is
A free, browser-based tool that turns sounds you record yourself (mouth noises, desk taps, cloth swishes) into game-ready sound effects. You build a library of your own recordings, shape them with plain, direct effects, stack them in layers, generate variations, and export a named pack.

## Who it's for
Solo and small indie game developers with no audio budget and no audio-engineering background. Easy to start; the depth is there for people who go looking for it.

## Decisions
- **Game sound effects come first.** Film-style foley comes later, if at all.
- **Phones from day one** for the record, shape and export path. The advanced editor can be desktop-only.
- **Small files are fine.** Export Ogg Vorbis first (Godot, Unity and GameMaker all import it), then MP3. Offer 22 kHz output.
- **No backend.** Static site. Audio never leaves the device.
- **Your recording is the star (v0.3, 2026-11-01).** v0.2's recipes added synthesized layers (sub thumps, metallic rings, noise) that drowned out the recording, and their sliders were hard to relate to the result. Now nothing is synthesized: every control is a plain effect on your own sound, and everything starts off. Presets and sound-specific sliders come back only where mouth, hand and desk sounds can't get there with direct controls.
- **Build a library.** Recordings are kept and reused. Layers combine them (a slap plus a pitched-down thump makes a big hit).
- **Record first, organize later (v0.4, 2026-11-01).** A catalog of 40 sound types with walkthroughs felt like homework. Now the home screen is your sounds, newest first, and a big record button sits at the bottom in thumb reach on every screen. One tap records; the recording is saved with a timestamp straight away. Tags and projects are optional and come later. Project needs (the checklist) and learning (how to think like a Foley artist) are two separate doors, kept short.
- **Variations come from takes.** Record a sound several times in one go; each variation uses a different take, plus an evenly spread pitch. That is far more natural than nudging one recording.

## Screens
- **Home.** Two doors (Create your checklist; How to think like a Foley artist), then your sounds grouped by day. Each row: a compressed waveform (tap to play; grey as recorded, amber once made into a sound effect), time and length, up to two tags, and boxed counts of projects and kept variations. Tap the rest of the row for tags, projects, "Make variations ›" and Delete (with Undo). A tag bar filters by project, tag or untagged.
- **Dock.** Record in the middle (the ring follows the input level; 20 s cap), undo/redo on the left, upload on the right. A toast confirms each recording and offers "Tag it".
- **Checklist.** The sounds your game needs, ticked off as you go, with one-tap suggestions and a count of recordings whose tags match.
- **How to think like a Foley artist.** Seven swipeable cards; the last one starts a recording.
- **Sound.** One recording made into a sound effect: the core loop below. Each recording has at most one sound effect, saved with its variations.

First visit seeds three example recordings (tagged "example"). Sessions saved by v0.3 become a library with the old sound effect attached to its first layer's recording; v0.2 sessions become one recording.

## Core loop
1. **Record your sounds.** Record or upload; each recording is split into takes automatically (a pause of 150 ms separates them). Handles adjust a take, a slider cleans up background noise, and takes can be added or removed. Built-in examples (three takes each) work without a mic. "Ideas" are short how-tos: what to record, and which settings to start from.
2. **Shape it.** Up to 4 layers, each playing one recording (all its takes, or one) with Pitch (also changes length, like a tape), Tone (darker to brighter), Volume, Start and Reverse. Effects on the mix: Compress, Distort, Lo-fi, Reverb, Room size. Before / after compares the raw take with the result.
3. **Variations.** 4 to 12. Pitches are spaced evenly across the pitch spread so no two are alike, every take is used before any repeats, and tone and timing get small nudges. Layers sharing a recording use the same take. Discard and replace single variations; loudness is matched across the set.
4. **Export** a zip (Ogg Vorbis, MP3 or WAV; 44.1 or 22 kHz) plus a `sound.json` listing layers, takes, effects and each file's pitch, takes and seed.

Undo/redo covers every change except variations (they keep the settings they were made with), and the library is saved in the browser as you go.

## Architecture
- Vite + TypeScript static site. Deploy to GitHub Pages or itch.io.
- Web Audio API. Every render is an OfflineAudioContext pass, so output is deterministic and faster than real time.
- One renderer (`src/dsp/sound.ts`): per layer, a buffer source (playback rate for pitch) through a tone filter and gain; then distortion, a compressor and a convolution reverb from a generated impulse with a fixed seed; then bitcrush, normalization to -1 dBFS and tail trim. With everything neutral the output is the take itself (tested).
- Each variation is saved as a spec (seed, pitch offset, take per layer), so packs can be rebuilt exactly.
- Recording uses getUserMedia and MediaRecorder with echo cancellation, noise suppression and auto gain turned off. Upload stays as a fallback.
- Export uses JSZip and a plain WAV encoder.

### Determinism caveat
Browsers render audio slightly differently. The same `sound.json` gives an identical pack in the same browser and a very close one elsewhere. Tests check behavior (neutral settings return the take unchanged, an octave down doubles the length, variations differ clearly) rather than exact samples.

### Microphone on phones
Browsers allow the mic only on `https://` or `localhost`. Testing on a phone over Wi-Fi needs the dev server on HTTPS (for example `@vitejs/plugin-basic-ssl`). The deployed site is HTTPS, so this only affects development.

## Layout
```
src/
  dsp/       sound.ts  prep.ts  blocks.ts  loudness.ts  encode.ts  wav.ts  rng.ts
  sounds/    examples.ts  ideas.ts
  ui/        home.ts  recorder.ts  checklist.ts  foley.ts  sound.ts  toast.ts
             layers.ts  variations.ts  export.ts  engine.ts
             history.ts  persist.ts  trim.ts  controls.ts  playback.ts  state.ts  dom.ts
  main.ts
tests/       sound.test.ts  prep.test.ts  loudness.test.ts  encode.test.ts  wav.test.ts
```

## Roadmap
Done: Phase 0 and Phase 1 (2026-10-31), Phase 2 (2026-11-01), v0.3 rework around your own recordings (2026-11-01), v0.4 record-first home screen (2026-11-01). Live at https://wolfpox.github.io/we-are-mic-foley/.

0. **Setup.** Node LTS, git, Vite + TypeScript, Vitest browser tests in Playwright Firefox. The prototype runs as-is from `src/legacy/app.js`.
1. **Port, no change in sound.** Split into the layout above. Save reference renders of each recipe from the prototype with fixed seeds and test against them. Test the WAV encoder. Remove the 4-second recording cap.
2. **Easy start, small files.** Trim handles on the waveform, noise gate, one-tap re-record. Keep or discard single variations. Undo, A/B source vs result. Autosave the session. Loudness option. Ogg Vorbis and MP3 export, 22 kHz option. Goal: a newcomer gets from page open to downloaded pack in under 2 minutes.
3. **More ideas, then presets where needed.** Grow the Ideas into short tutorials (text first) on recording reliably good sounds. Add a preset or a sound-specific control only where direct controls on your own recordings fall short. Zoom on the take editor for short sounds in long recordings.
4. **Depth, behind an Advanced toggle.** Per-layer effects and envelopes (fade, length), time-stretch without pitch change, EQ, saved sound settings you can reuse, export of the library itself, per-engine export presets, audio sprites for Phaser and Howler.
5. **Ship.** Static hosting, works offline, privacy note, users own what they make.
