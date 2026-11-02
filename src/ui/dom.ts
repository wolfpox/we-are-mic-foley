export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
};

export function showNote(el: HTMLElement, text: string, ok = false): void {
  el.textContent = text;
  el.classList.toggle("ok", ok);
  el.hidden = false;
}

/** A new element with an optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** A button that doesn't submit anything. */
export function btn(cls: string | null, text: string | null, onClick: (e: MouseEvent) => void, label?: string): HTMLButtonElement {
  const b = el("button", cls, text ?? undefined);
  b.type = "button";
  b.onclick = onClick;
  if (label) b.setAttribute("aria-label", label);
  return b;
}
