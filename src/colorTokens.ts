import type { CategoryMeta, SoundMeta } from "./types";

/**
 * The colour a sound shows: its own colour, else its category's, else none.
 * `null` means neutral (no colour marking).
 */
export function resolveColor(meta: SoundMeta, categories: Record<string, CategoryMeta>): string | null {
  if (meta.color) return meta.color;
  if (meta.category) return categories[meta.category]?.color ?? null;
  return null;
}
