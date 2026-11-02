# We Are Mic Foley: project brief

*Sounds Like A Good Idea.*

## What it is
A free, browser-based tool that turns sounds you record yourself (mouth noises, desk taps, cloth swishes) into game-ready sound effects. You build a library of your own recordings, shape each one with a desk of plain, direct faders, save named variations, and export every variation of every take as a named pack.

## Who it's for
Solo and small indie game developers with no audio budget and no audio-engineering background. Easy to start; the depth is there for people who go looking for it.

## Decisions
- **Game sound effects come first.** Film-style foley comes later, if at all.
- **Phones from day one** for the record, shape and export path. The advanced editor can be desktop-only.
- **Small files are fine.** Export Ogg Vorbis first (Godot, Unity and GameMaker all import it), then MP3. Offer 22 kHz output.
- **No backend.** Static site. Audio never leaves the device.
- **Your recording is the star (v0.3, 2026-11-01).** v0.2's recipes added synthesized layers (sub thumps, metallic rings, noise) that drowned out the recording, and their sliders were hard to relate to the result. Now nothing is synthesized: every control is a plain effect on your own sound, and everything starts off. Presets and sound-specific sliders come back only where mouth, hand and desk sounds can't get there with direct controls.
- **Build a library.** Recordings are kept and reused.
- **Record first, organize later (v0.4, 2026-11-01).** A catalog of 40 sound types with walkthroughs felt like homework. Now the home screen is your sounds, newest first, and a big record button sits at the bottom in thumb reach on every screen. One tap records; the recording is saved with a timestamp straight away. Tags and projects are optional and come later. Project needs (the checklist) and learning (how to think like a Foley artist) are two separate doors, kept short.
- **Variations come from takes.** Record a sound several times; every take is exported, so a game never plays the same one twice in a row. That is far more natural than nudging one recording.
- **Everything in the list (v0.5, 2026-11-02).** The separate sound screen is gone. Tapping a recording opens it in place: name and tags, a variation picker, the waveform with crop handles, and a desk of 18 faders that pans sideways. The whole panel fits on a phone screen (375×667) above the record button; only the faders scroll. Named variations ("slow", "big", "crunchy") replace v0.4's random variation sets, and each is exported once per take. Locks keep faders safe from dragging and Random. Layers are gone for now; they may return later.

## Screens
- **Home.** Two doors (Create your checklist; How to think like a Foley artist), then your sounds grouped by day. Each row: a compressed waveform (tap to play; grey as recorded, amber once it has saved variations), time and length, name and up to two tags, and boxed counts of projects and variations. Tap the rest of the row to open the sound panel. A tag bar filters by project, tag or untagged.
- **Sound panel** (one open at a time), top to bottom:
  - Name and tags, ✎ to edit them (plus projects, removing a take, deleting the sound), ▴ to close.
  - Variation: the current name with a dot when changed since saved, ▾ to list them (each with a fingerprint of its faders, ▶ to hear it, × to delete), and + Add / Update / Saved ✓.
  - Waveform of the selected take with crop handles; take tabs 1 2 3 in its corner; tap plays the result, hold plays the take as recorded. Touching a fader shows what it does along the waveform's bottom edge.
  - The desk: Clean up (Clean, Low cut), Pitch & time (Pitch, Speed), Shape (Attack, Fade), EQ (Low, Mid, High), Character (Punch, Grit, Lo-fi), Echo (Echo, Time, Repeats), Reverb (Reverb, Room), Output (Level). Each fader shows its value above the handle and a lock on top. Drag up or down, double-tap to reset, arrow keys work too.
  - ⚄ Random (3 to 5 unlocked faders, never Clean, Low cut or Level), ⚙ file settings, Export N sounds.
- **Dock.** Record in the middle (the ring follows the input level; 20 s cap), undo/redo on the left, upload on the right. With a sound open, the button shrinks and records a new take of that sound. Otherwise a toast confirms each new recording and offers "Tag it".
- **Checklist.** The sounds your game needs, ticked off as you go, with one-tap suggestions and a count of recordings whose tags match.
- **How to think like a Foley artist.** Seven swipeable cards; the last one starts a recording.

First visit seeds three example recordings (tagged "example"). Sessions saved by v0.4 keep their recordings; a sound effect with kept variations becomes a variation called "main", with layer 1's tape-style pitch as Pitch plus Speed, Tone as High (and Low cut), the mix effects as Punch, Grit, Lo-fi, Reverb and Room, and noise cleanup as Clean. v0.3 and v0.2 sessions upgrade the same way.

## Core loop
1. **Record.** Record or upload; each recording is split into takes automatically (a pause of 150 ms separates them). With a sound open, recording again adds takes to it.
2. **Shape.** Crop each take; move faders. Nothing is synthesized: every fader is a plain effect on the recording, and all at default leaves it unchanged.
3. **Name variations.** Save the faders under a name; pick one to load it back. Random suggests ideas.
4. **Export** every variation × every take (`desk_knock_big_01.ogg` …) as Ogg Vorbis, MP3 or WAV at 44.1 or 22 kHz, zipped with a `sound.json` listing takes and each variation's settings. Loudness can be matched across a variation's takes.

Undo/redo covers every change (faders, locks, variations, takes, tags), and the library is saved in the browser as you go.

## Architecture
- Vite + TypeScript static site. Deploy to GitHub Pages or itch.io.
- Web Audio API. Every render is an OfflineAudioContext pass, so output is deterministic and faster than real time.
- One renderer (`src/dsp/sound.ts`): the take (cleaned by the noise gate) is time-stretched with WSOLA (`src/dsp/stretch.ts`) and played at a rate, so Pitch keeps the length and Speed keeps the pitch; then low cut, three-band EQ, distortion, a compressor, a feedback echo with damping and a convolution reverb from a generated impulse with a fixed seed; then attack and fade envelopes, bitcrush, level (a soft limiter above 0 dB), normalization to -1 dBFS and tail trim. With every fader at default the output is the take itself (tested).
- Faders are defined in `src/dsp/faders.ts` (keys, ranges, defaults, Random); their labels and plain-language descriptions in `src/ui/desk.ts`.
- Recording uses getUserMedia and MediaRecorder with echo cancellation, noise suppression and auto gain turned off. Upload stays as a fallback.
- Export uses JSZip and a plain WAV encoder.

### Determinism caveat
Browsers render audio slightly differently. The same `sound.json` gives an identical pack in the same browser and a very close one elsewhere. Tests check behavior (neutral settings return the take unchanged, Pitch keeps the length and Speed the pitch, every fader changes the sound, Random respects locks) rather than exact samples.

### Microphone on phones
Browsers allow the mic only on `https://` or `localhost`. Testing on a phone over Wi-Fi needs the dev server on HTTPS (for example `@vitejs/plugin-basic-ssl`). The deployed site is HTTPS, so this only affects development.

## Layout
```
src/
  dsp/       sound.ts  faders.ts  stretch.ts  prep.ts  blocks.ts  loudness.ts  encode.ts  wav.ts  rng.ts
  sounds/    examples.ts
  ui/        home.ts  panel.ts  desk.ts  recorder.ts  checklist.ts  foley.ts  toast.ts
             export.ts  engine.ts  history.ts  persist.ts  playback.ts  state.ts  dom.ts
  main.ts
tests/       sound.test.ts  prep.test.ts  loudness.test.ts  encode.test.ts  wav.test.ts
```

## Roadmap
Done: Phase 0 and Phase 1 (2026-10-31), Phase 2 (2026-11-01), v0.3 rework around your own recordings (2026-11-01), v0.4 record-first home screen (2026-11-01), v0.5 sound panel in the list (2026-11-02). Live at https://wolfpox.github.io/we-are-mic-foley/.

0. **Setup.** Node LTS, git, Vite + TypeScript, Vitest browser tests in Playwright Firefox. The prototype runs as-is from `src/legacy/app.js`.
1. **Port, no change in sound.** Split into the layout above. Save reference renders of each recipe from the prototype with fixed seeds and test against them. Test the WAV encoder. Remove the 4-second recording cap.
2. **Easy start, small files.** Trim handles on the waveform, noise gate, one-tap re-record. Keep or discard single variations. Undo, A/B source vs result. Autosave the session. Loudness option. Ogg Vorbis and MP3 export, 22 kHz option. Goal: a newcomer gets from page open to downloaded pack in under 2 minutes.
3. **More ideas, then presets where needed.** Grow the Ideas into short tutorials (text first) on recording reliably good sounds. Add a preset or a sound-specific control only where direct controls on your own recordings fall short. Zoom on the take editor for short sounds in long recordings.
4. **Depth, behind an Advanced toggle.** Per-layer effects and envelopes (fade, length), time-stretch without pitch change, EQ, saved sound settings you can reuse, export of the library itself, per-engine export presets, audio sprites for Phaser and Howler.
5. **Ship.** Static hosting, works offline, privacy note, users own what they make.
