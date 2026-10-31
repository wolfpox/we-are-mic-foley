import JSZip from "jszip";
import { encodeWav } from "../dsp/wav";
import { byId } from "../recipes";
import { $, showNote } from "./dom";
import { state } from "./state";

const TOOL = "We Are Mic Foley v0.1";

function download(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Zips the current variations with a recipe.json that records how to reproduce them. */
export async function exportPack(): Promise<void> {
  const note = $("exportNote");
  const m = state.varMeta;
  if (!state.vars.length || !m) return;
  const zip = new JSZip();
  state.vars.forEach((v) => zip.file(v.name, encodeWav(v.buf)));
  zip.file(
    "recipe.json",
    JSON.stringify(
      {
        tool: TOOL,
        recipe: m.recipe,
        source: m.source,
        params: m.params,
        variation: m.variation,
        files: state.vars.map((v) => ({ name: v.name, seed: v.seed, ms: Math.round(v.buf.duration * 1000) })),
        format: "WAV 16-bit 44.1 kHz mono, peak -1 dBFS",
      },
      null,
      2,
    ),
  );
  try {
    download(await zip.generateAsync({ type: "blob" }), `${byId[m.recipe].file}_pack.zip`);
    showNote(note, `Saved ${state.vars.length} sounds.`, true);
  } catch (e) {
    showNote(note, "Couldn't build the pack. " + (e instanceof Error ? e.message : ""));
  }
}
