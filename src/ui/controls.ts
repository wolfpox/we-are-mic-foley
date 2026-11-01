// Builds the labelled sliders used for layers, effects and variations.

export interface SliderSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Shown under the left and right ends. */
  lo?: string;
  hi?: string;
  /** One line on what it's for. */
  hint?: string;
  format: (v: number) => string;
  /** While dragging. */
  onInput: (v: number) => void;
  /** On release. */
  onChange?: (v: number) => void;
}

export function slider(s: SliderSpec): HTMLElement {
  const el = document.createElement("div");
  el.className = "slider";
  const label = document.createElement("label");
  label.htmlFor = s.id;
  const name = document.createElement("span");
  name.textContent = s.label;
  const out = document.createElement("output");
  out.htmlFor.add(s.id);
  out.textContent = s.format(s.value);
  label.append(name, out);
  const input = document.createElement("input");
  input.type = "range";
  input.id = s.id;
  input.min = String(s.min);
  input.max = String(s.max);
  input.step = String(s.step ?? 1);
  input.value = String(s.value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    out.textContent = s.format(v);
    s.onInput(v);
  });
  input.addEventListener("change", () => s.onChange?.(Number(input.value)));
  el.append(label, input);
  if (s.lo || s.hi) {
    const ends = document.createElement("div");
    ends.className = "ends";
    for (const t of [s.lo ?? "", s.hi ?? ""]) {
      const sp = document.createElement("span");
      sp.textContent = t;
      ends.appendChild(sp);
    }
    el.appendChild(ends);
  }
  if (s.hint) {
    const h = document.createElement("p");
    h.className = "slider-hint";
    h.textContent = s.hint;
    el.appendChild(h);
  }
  return el;
}

export const signed = (v: number, unit: string) => (v === 0 ? `0 ${unit}` : `${v > 0 ? "+" : "−"}${Math.abs(v)} ${unit}`);
export const percent = (v: number) => (v === 0 ? "Off" : String(v));
export const toneText = (v: number) => (v === 0 ? "As recorded" : v < 0 ? `Darker ${-v}` : `Brighter ${v}`);

export function option(value: string, text: string, selected = false): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  o.selected = selected;
  return o;
}
