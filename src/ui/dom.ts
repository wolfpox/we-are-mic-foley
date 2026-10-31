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
