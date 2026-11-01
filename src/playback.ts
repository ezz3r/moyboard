import type { Playing } from "./types";

/** Voices still sounding for one sound, per output. */
export type Counts = { main: number; preview: number };

/** Counts the playing voices of `fileName`, split by output. */
export function countsOf(playing: Playing[], fileName: string): Counts {
  let main = 0;
  let preview = 0;
  for (const p of playing) {
    if (p.fileName !== fileName) continue;
    if (p.previewing) preview++;
    else main++;
  }
  return { main, preview };
}
