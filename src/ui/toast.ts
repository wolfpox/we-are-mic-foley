import { $ } from "./dom";

let timer: ReturnType<typeof setTimeout> | undefined;

/** A short message above the record button, with an optional action such as "Undo" or "Tag it". */
export function toast(text: string, action?: { label: string; run: () => void }, ms = 4000): void {
  const el = $("toast");
  $("toastTxt").textContent = text;
  const b = $<HTMLButtonElement>("toastBtn");
  b.hidden = !action;
  b.textContent = action?.label ?? "";
  b.onclick = () => {
    el.hidden = true;
    action?.run();
  };
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (el.hidden = true), ms);
}
