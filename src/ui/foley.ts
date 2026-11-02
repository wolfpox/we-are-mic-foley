import { $ } from "./dom";

// How to think like a Foley artist: one idea per card.

const CARDS: [string, string][] = [
  ["Listen to the sound, not the thing.", "Film punches are often a slap on raw meat. Breaking bones are snapped celery."],
  ["Everything in reach is an instrument.", "Keys, rice, a towel, a pan, a zip, your mouth."],
  ["Get close.", "A hand's width from the mic. Close sounds big and clean."],
  ["Do it five times.", "No two takes match. That's what keeps a game from sounding robotic."],
  ["Slower is bigger.", "Pitch a sound down and it grows. Pitch it up and it shrinks."],
  ["Stack it.", "Big sounds are small sounds layered. A slap plus a thump is a punch."],
  ["Record now, sort later.", "Heard something interesting? Hit record. Tag it whenever you like."],
];

let i = 0;
let onRecord: () => void = () => {};

export function renderCard(): void {
  const [h, p] = CARDS[i];
  const card = $("card");
  card.innerHTML = "";
  const n = document.createElement("div");
  n.className = "n";
  n.textContent = `${i + 1} / ${CARDS.length}`;
  const body = document.createElement("div");
  body.className = "card-body";
  const h2 = document.createElement("h2");
  h2.textContent = h;
  const para = document.createElement("p");
  para.textContent = p;
  body.append(h2, para);
  card.append(n, body);
  if (i === CARDS.length - 1) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "try";
    b.textContent = "● Record something now";
    b.onclick = onRecord;
    card.appendChild(b);
  } else card.appendChild(document.createElement("div"));
  $<HTMLButtonElement>("prev").disabled = i === 0;
  $<HTMLButtonElement>("next").disabled = i === CARDS.length - 1;
  const dots = $("dots");
  dots.innerHTML = "";
  CARDS.forEach((_, k) => {
    const d = document.createElement("i");
    if (k === i) d.className = "on";
    dots.appendChild(d);
  });
}

const go = (k: number) => {
  i = Math.max(0, Math.min(CARDS.length - 1, k));
  renderCard();
};

export function initFoley(record: () => void): void {
  onRecord = record;
  $("prev").onclick = () => go(i - 1);
  $("next").onclick = () => go(i + 1);
  // Swipe between cards
  let sx: number | null = null;
  const card = $("card");
  card.addEventListener("pointerdown", (e) => (sx = e.clientX));
  card.addEventListener("pointerup", (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
  });
}
