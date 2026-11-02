import { TWO_WAY, clampFader, defaultOf, echoMs, echoRepeats, isSet, lowCutHz, speedX, type FaderKey, type Faders } from "../dsp/faders";
import { el } from "./dom";
import type { Design } from "./state";

// The mixing desk: groups of vertical faders, wider than the screen, panned sideways.
// Drag a fader up or down; double-tap to reset; the lock on top stops dragging, reset and Random.

interface FaderInfo {
  k: FaderKey;
  label: string;
  /** The number above the handle. */
  num: (v: number) => string;
  unit?: string;
  /** What it does at this value, in plain words. */
  say: (v: number, f: Faders) => string;
}

const pc = (v: number) => String(Math.round(v * 100));
const sg = (n: number) => (n > 0 ? "+" + n : n < 0 ? "−" + -n : "0");
const db12 = (v: number) => sg(Math.round(v * 12));
const needs = (f: Faders, k: FaderKey, name: string) => (isSet(f, k) ? "" : ` (turn up ${name} to hear it)`);

export const GROUPS: { name: string; faders: FaderInfo[] }[] = [
  { name: "Clean up", faders: [
    { k: "clean", label: "Clean", num: pc, say: (v) => (v ? "quiets hiss between sounds" : "off") },
    { k: "lowcut", label: "Low cut", num: (v) => (v ? String(Math.round(lowCutHz(v))) : "0"), unit: " Hz", say: (v) => (v ? "removes rumble and bumps" : "off") },
  ] },
  { name: "Pitch & time", faders: [
    { k: "pitch", label: "Pitch", num: db12, unit: " st", say: (v) => (v < 0 ? "deeper, same length" : v > 0 ? "higher, same length" : "as recorded") },
    { k: "speed", label: "Speed", num: (v) => speedX(v).toFixed(1) + "×", say: (v) => (v < 0 ? "slower, longer, same pitch" : v > 0 ? "quicker, shorter, same pitch" : "as recorded") },
  ] },
  { name: "Shape", faders: [
    { k: "attack", label: "Attack", num: (v) => sg(Math.round(v * 100)), say: (v) => (v < 0 ? "softer start" : v > 0 ? "sharper hit" : "as recorded") },
    { k: "fade", label: "Fade", num: pc, say: (v) => (v ? "ends sooner" : "full length") },
  ] },
  { name: "EQ", faders: [
    { k: "low", label: "Low", num: db12, unit: " dB", say: (v) => (v < 0 ? "less boom" : v > 0 ? "more boom" : "flat") },
    { k: "mid", label: "Mid", num: db12, unit: " dB", say: (v) => (v < 0 ? "hollower" : v > 0 ? "more body, honkier" : "flat") },
    { k: "high", label: "High", num: db12, unit: " dB", say: (v) => (v < 0 ? "darker, duller" : v > 0 ? "brighter, crisper" : "flat") },
  ] },
  { name: "Character", faders: [
    { k: "punch", label: "Punch", num: pc, say: (v) => (v ? "fuller, tighter (compression)" : "off") },
    { k: "grit", label: "Grit", num: pc, say: (v) => (v ? "dirtier (distortion)" : "off") },
    { k: "lofi", label: "Lo-fi", num: pc, say: (v) => (v ? "old game console" : "off") },
  ] },
  { name: "Echo", faders: [
    { k: "echo", label: "Echo", num: pc, say: (v) => (v ? "repeats the sound" : "off") },
    { k: "etime", label: "Time", num: (v) => String(Math.round(echoMs(v))), unit: " ms", say: (_, f) => "gap between repeats" + needs(f, "echo", "Echo") },
    { k: "erep", label: "Repeats", num: (v) => String(echoRepeats(v)), say: (_, f) => "how many you hear" + needs(f, "echo", "Echo") },
  ] },
  { name: "Reverb", faders: [
    { k: "reverb", label: "Reverb", num: pc, say: (v) => (v ? "further away" : "dry, right in front of you") },
    { k: "room", label: "Room", num: pc, say: (v, f) => (v > 0.65 ? "hall" : v > 0.3 ? "room" : "small room") + needs(f, "reverb", "Reverb") },
  ] },
  { name: "Output", faders: [
    { k: "level", label: "Level", num: db12, unit: " dB", say: (v) => (v < 0 ? "quieter" : v > 0 ? "louder, denser" : "as recorded") },
  ] },
];

export const FADER_INFO = Object.fromEntries(GROUPS.flatMap((g) => g.faders.map((f) => [f.k, f]))) as Record<FaderKey, FaderInfo>;

export interface DeskHooks {
  /** Shows a line on the waveform: a bold lead, then the rest. */
  caption: (lead: string, rest: string, value?: string) => void;
  /** A fader was released, reset or nudged with the keyboard. */
  changed: () => void;
}

const LOCK_SVG =
  '<svg viewBox="0 0 14 16" aria-hidden="true"><path class="shut" d="M3.5 7V4.5a3.5 3.5 0 0 1 7 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="open" d="M3.5 7V4.5a3.5 3.5 0 0 1 6.8-1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1.5" y="7" width="11" height="8" rx="2" fill="currentColor"/></svg>';

/** Room above the track for the number, and below for the handle. */
const PAD_TOP = 24;
const PAD_BOTTOM = 9;

/** Each fader's redraw, so Random and picking a variation can move them all. */
const redraws: (() => void)[] = [];

export function describeFader(k: FaderKey, d: Design, hooks: DeskHooks): void {
  const fi = FADER_INFO[k];
  const v = d.f[k];
  hooks.caption(fi.label, " · " + fi.say(v, d.f), fi.num(v) + (fi.unit ?? ""));
}

function fader(d: Design, fi: FaderInfo, hooks: DeskHooks): HTMLElement {
  const k = fi.k;
  const two = TWO_WAY.has(k);
  const box = el("div", "fader");
  box.tabIndex = 0;
  box.setAttribute("role", "slider");
  box.setAttribute("aria-label", fi.label);
  box.setAttribute("aria-valuemin", two ? "-100" : "0");
  box.setAttribute("aria-valuemax", "100");
  const lock = el("button", "lock");
  lock.type = "button";
  lock.innerHTML = LOCK_SVG;
  const track = el("div", "track");
  const mark = el("div", "mark");
  const fill = el("div", "fill");
  const capEl = el("div", "cap");
  const val = el("div", "val");
  track.append(mark, fill, capEl, val);
  box.append(lock, track, el("span", "fl", fi.label));

  const pos = (v: number) => (two ? (1 - v) / 2 : 1 - v);
  const locked = () => d.locks.includes(k);
  const show = () => {
    const v = d.f[k];
    const inner = (track.clientHeight || 146) - PAD_TOP - PAD_BOTTOM;
    const y = PAD_TOP + pos(v) * inner;
    const y0 = PAD_TOP + pos(0) * inner;
    capEl.style.top = val.style.top = y + "px";
    mark.style.top = PAD_TOP + pos(defaultOf(k)) * inner + "px";
    fill.style.top = Math.min(y, y0) + "px";
    fill.style.height = Math.abs(y - y0) + "px";
    val.textContent = fi.num(v);
    box.classList.toggle("set", isSet(d.f, k));
    box.classList.toggle("locked", locked());
    lock.setAttribute("aria-pressed", String(locked()));
    lock.setAttribute("aria-label", (locked() ? "Unlock " : "Lock ") + fi.label);
    box.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    box.setAttribute("aria-valuetext", `${fi.num(v)}${fi.unit ?? ""}, ${fi.say(v, d.f)}`);
  };
  redraws.push(show);
  requestAnimationFrame(show);

  const lockNote = (blocked = false) =>
    hooks.caption(fi.label, blocked ? " is locked. Tap its lock to change it." : locked() ? " locked. Random and dragging leave it alone." : " unlocked.");
  lock.addEventListener("pointerdown", (e) => e.stopPropagation());
  lock.onclick = (e) => {
    e.stopPropagation();
    d.locks = locked() ? d.locks.filter((x) => x !== k) : [...d.locks, k];
    show();
    lockNote();
    hooks.changed();
  };
  const nope = () => {
    box.classList.remove("nope");
    void box.offsetWidth; // restart the shake
    box.classList.add("nope");
    lockNote(true);
  };
  const setV = (v: number) => {
    d.f[k] = clampFader(k, v);
    show();
    describeFader(k, d, hooks);
  };

  // Vertical drags move the fader; the browser keeps horizontal swipes for panning the desk (touch-action: pan-x)
  let startY = 0;
  let startV = 0;
  let moved = false;
  let lastTap = 0;
  let pid: number | null = null;
  box.addEventListener("pointerdown", (e) => {
    pid = e.pointerId;
    startY = e.clientY;
    startV = d.f[k];
    moved = false;
  });
  box.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 5) return;
    if (locked()) {
      if (!moved) nope();
      moved = true;
      return;
    }
    if (!moved) {
      moved = true;
      try {
        box.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone
      }
      box.classList.add("active");
    }
    const inner = track.clientHeight - PAD_TOP - PAD_BOTTOM;
    setV(startV - (dy / inner) * (two ? 2 : 1));
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    pid = null;
    box.classList.remove("active");
    if (e.type === "pointercancel") return; // the desk was panned instead
    const now = performance.now();
    if (!moved) {
      if (now - lastTap < 320) {
        lastTap = 0;
        if (locked()) return nope();
        setV(defaultOf(k));
        hooks.changed();
      } else {
        lastTap = now;
        describeFader(k, d, hooks);
      }
    } else if (!locked()) hooks.changed();
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);

  let keyTimer: ReturnType<typeof setTimeout> | undefined;
  box.addEventListener("keydown", (e) => {
    if (e.target !== box) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    let v: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") v = d.f[k] + step;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") v = d.f[k] - step;
    else if (e.key === "0" || e.key === "Delete" || e.key === "Backspace") v = defaultOf(k);
    else return;
    e.preventDefault();
    if (locked()) return nope();
    setV(v);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(hooks.changed, 350);
  });
  return box;
}

let lastScroll = 0;

/** The desk for a design. Remembers how far it was panned, so re-rendering doesn't jump. */
export function desk(d: Design, hooks: DeskHooks, keepScroll: boolean): HTMLElement {
  redraws.length = 0;
  const wrap = el("div", "deskwrap");
  const strip = el("div", "desk");
  strip.setAttribute("aria-label", "Faders. Swipe sideways for more.");
  for (const g of GROUPS) {
    const ge = el("div", "group");
    ge.setAttribute("role", "group");
    ge.setAttribute("aria-label", g.name);
    const row = el("div", "gf");
    for (const fi of g.faders) row.appendChild(fader(d, fi, hooks));
    ge.append(el("div", "gh", g.name), row);
    strip.appendChild(ge);
  }
  const atEnd = () => wrap.classList.toggle("end", strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4);
  strip.addEventListener(
    "scroll",
    () => {
      lastScroll = strip.scrollLeft;
      atEnd();
    },
    { passive: true },
  );
  wrap.appendChild(strip);
  if (!keepScroll) lastScroll = 0;
  requestAnimationFrame(() => {
    strip.scrollLeft = lastScroll;
    atEnd();
  });
  return wrap;
}

/** Moves every fader to its value, gliding if `animate`. */
export function showFaders(strip: HTMLElement | null, animate: boolean): void {
  if (!strip) return;
  strip.classList.toggle("anim", animate);
  redraws.forEach((r) => r());
  if (animate) setTimeout(() => strip.classList.remove("anim"), 400);
}
