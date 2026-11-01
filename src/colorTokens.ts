import type { CSSProperties } from "react";
import type { CategoryMeta, SoundMeta } from "./types";

/** Relative luminance (WCAG) of a `#rrggbb` colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colour a sound shows: its own colour, else its category's, else none.
 * `null` means neutral (no colour marking).
 */
export function resolveColor(meta: SoundMeta, categories: Record<string, CategoryMeta>): string | null {
  if (meta.color) return meta.color;
  if (meta.category) return categories[meta.category]?.color ?? null;
  return null;
}

/**
 * CSS variables for one colour marking: `--cat` (the colour) and `--plate` (the disc behind the
 * icon). The plate is an opaque mix with the surface. Its strength comes from `--plate-pct`
 * (set per theme in styles.css). Very light and very dark colours get a stronger disc, so it
 * still shows on the surface. The pad and tile surface stay neutral. Null gives no variables.
 */
export function colorStyle(color: string | null): CSSProperties {
  if (!color) return {};
  const lum = luminance(color);
  // shortcut: fixed plate boosts for extreme luminance, not a contrast solver; upgrade if a colour looks faint.
  const boost = lum > 0.7 ? "2.2" : lum < 0.06 ? "1.6" : "1";
  return {
    "--cat": color,
    "--plate": `color-mix(in srgb, ${color} calc(var(--plate-pct) * ${boost}), var(--surface))`,
  } as CSSProperties;
}
