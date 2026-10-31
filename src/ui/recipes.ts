import { RECIPES, byId } from "../recipes";
import { $ } from "./dom";
import { buildSliders } from "./sliders";
import { state } from "./state";
import { clearVars, scheduleRender } from "./variations";

export function buildRecipes(): void {
  const box = $("recipes");
  for (const r of RECIPES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "recipe";
    b.dataset.id = r.id;
    const name = document.createElement("span");
    name.className = "rname";
    name.textContent = r.name;
    const file = document.createElement("span");
    file.className = "rfile";
    file.textContent = r.file + "_01.wav";
    b.append(name, file);
    b.onclick = () => selectRecipe(r.id, true);
    box.appendChild(b);
  }
}

/** Switches recipe. `user` is true when the click came from the person, so the result plays. */
export function selectRecipe(id: string, user: boolean): void {
  state.recipe = id;
  const r = byId[id];
  document.querySelectorAll<HTMLElement>(".recipe").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));

  const tip = $("tip");
  tip.innerHTML = "<b>What to record:</b> ";
  tip.append(r.tip + " ");
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = `Example to try: ${r.example}.`;
  tip.append(hint);

  buildSliders(r);
  clearVars();
  scheduleRender(user);
}
