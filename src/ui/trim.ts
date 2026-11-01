import { clampRange, type Range } from "../dsp/prep";
import { $ } from "./dom";

// Two draggable handles over the source waveform. Works with mouse, touch and keyboard.

type Side = "start" | "end";

let total = 1;
let sampleRate = 44100;
let range: Range = { start: 0, end: 1 };
let onChange: (r: Range, done: boolean) => void = () => {};

const pct = (n: number) => `${(n / total) * 100}%`;
const msText = (n: number) => `${Math.round((n / sampleRate) * 1000)} ms`;

function layout(): void {
  $("shadeL").style.width = pct(range.start);
  $("shadeR").style.left = pct(range.end);
  for (const side of ["start", "end"] as const) {
    const h = $(side === "start" ? "trimStart" : "trimEnd");
    h.style.left = pct(range[side]);
    h.setAttribute("aria-valuemin", "0");
    h.setAttribute("aria-valuemax", String(Math.round((total / sampleRate) * 1000)));
    h.setAttribute("aria-valuenow", String(Math.round((range[side] / sampleRate) * 1000)));
    h.setAttribute("aria-valuetext", msText(range[side]));
  }
}

function move(side: Side, to: number, done: boolean): void {
  range = clampRange(total, sampleRate, { ...range, [side]: to }, side);
  layout();
  onChange(range, done);
}

function bind(side: Side, el: HTMLElement): void {
  const box = el.parentElement!;
  const toSample = (clientX: number) => {
    const r = box.getBoundingClientRect();
    return (Math.min(Math.max(clientX - r.left, 0), r.width) / r.width) * total;
  };
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => {
    if (el.hasPointerCapture(e.pointerId)) move(side, toSample(e.clientX), false);
  });
  el.addEventListener("pointerup", (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    move(side, toSample(e.clientX), true);
  });
  el.addEventListener("keydown", (e) => {
    const step = (e.shiftKey ? 0.05 : 0.005) * sampleRate;
    const at = range[side];
    const to = { ArrowLeft: at - step, ArrowDown: at - step, ArrowRight: at + step, ArrowUp: at + step, Home: 0, End: total }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    move(side, to, true);
  });
}

export function initTrim(handler: (r: Range, done: boolean) => void): void {
  onChange = handler;
  bind("start", $("trimStart"));
  bind("end", $("trimEnd"));
}

/** Shows the handles for a recording of `length` samples with `r` selected. */
export function setTrimView(length: number, rate: number, r: Range): void {
  total = Math.max(1, length);
  sampleRate = rate;
  range = r;
  layout();
}
