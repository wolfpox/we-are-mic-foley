import type { Recipe } from "../recipes/types";
import { $ } from "./dom";
import { commit } from "./history";
import { state } from "./state";
import { scheduleRender } from "./variations";

/** Builds the "Shape it" sliders for a recipe. */
export function buildSliders(r: Recipe): void {
  const box = $("sliders");
  box.innerHTML = "";
  for (const p of r.params) {
    const v = Math.round(state.params[r.id][p.id] * 100);
    const sid = `p_${r.id}_${p.id}`;
    const el = document.createElement("div");
    el.className = "slider";
    el.innerHTML = `<label for="${sid}"><span></span><output>${v}</output></label><input id="${sid}" type="range" min="0" max="100" value="${v}"><div class="ends"><span></span><span></span></div>`;
    el.querySelector("label span")!.textContent = p.label;
    const ends = el.querySelectorAll(".ends span");
    ends[0].textContent = p.lo;
    ends[1].textContent = p.hi;
    const input = el.querySelector("input")!;
    const out = el.querySelector("output")!;
    input.oninput = () => {
      state.params[r.id][p.id] = Number(input.value) / 100;
      out.textContent = input.value;
      scheduleRender(true);
    };
    input.addEventListener("change", commit);
    box.appendChild(el);
  }
}
