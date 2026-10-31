# moyboard UI design plan

Input: `docs/ui-audit.md` (baseline). Scope: visuals only. No behaviour, IPC, or markup-semantics changes.

Decisions already made by the user: system font stack (drop Bricolage Grotesque), Apple blue accent (replaces amber), light and dark following the system.

## 1. Design tokens

Defined on `:root` in `src/styles.css`. Light is the default; dark overrides apply under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`.

| Token | Light | Dark | Contrast (on the surface it sits on) |
| --- | --- | --- | --- |
| `--ground` (window) | `#f5f5f7` | `#1c1c1e` | base |
| `--surface` (panels, pads) | `#ffffff` | `#2c2c2e` | base |
| `--raised` (hover, inputs) | `#e8e8ed` | `#3a3a3c` | base |
| `--ink` (primary text) | `#1d1d1f` | `#f5f5f7` | 15.5 / 15.6 on ground |
| `--ink-2` (secondary) | `#5e5e63` | `#b0b0b6` | 5.9 / 7.9 on ground; 5.3 / 5.3 on raised |
| `--accent` (focus, selection, play) | `#0066cc` | `#4da3ff` | 5.1 / 6.5 as text on ground |
| `--accent-ink` (text on accent) | `#ffffff` | `#001a33` | 5.6 / 6.7 |
| `--control-line` (input, button borders) | `#7a7a80` | `#8e8e93` | 3.9 / 5.2 on ground (non-text 3:1) |
| `--line` (dividers only) | `#d2d2d7` | `#3a3a3c` | decorative |
| `--alarm` (destructive, missing) | `#c9372c` | `#ff6961` | 4.7 / 6.0 on ground |

Semantic rules:
- `--accent`: focus, selection, primary action (Play, Save).
- `--alarm`: Delete, File missing, Forget. Not Stop (see §5).
- `--ink-2`: hints, counts, secondary labels. Never below 4.5:1.

Other tokens:
- **Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`. Windows resolves to Segoe UI Variable.
- **Type scale (px):** 11 (labels, minimum), 13 (body/UI, default), 15 (section heads), 17 (window title). Weights 400 body, 600 emphasis. Nothing below 11 px (C1).
- **Spacing:** 4-px base: 4, 8, 12, 16, 24.
- **Radii:** 6 px (controls), 10 px (pads, panels), 14 px (dialogs). Replaces 4 px.
- **Shadows:** one soft shadow for floating surfaces only (popovers, dialogs, context menus): `0 8px 24px rgb(0 0 0 / 0.18)`. None on pads or the nav bar.
- **Hit targets:** 28 px minimum for icon buttons, 34 px for primary header controls (C-level fix M1).

## 2. Layout

Main window (1100 px):
```
+--------------------------------------------------------------+
| [All v]  [pencil]   [output v]        Others ---o  You ---o  |  top bar (material)
| [Search.............]         [rescan] [gear] [stop]           |
+--------------------------------------------------+-----------+
| > Alerts 1                                        | Selected  |
|   [pad] [pad]                                     | item      |
| > Animals 1                                       | (sidebar, |
|   [pad]                                           |  material)|
| > Memes 3                                         |           |
|   [pad] [pad] [pad]                               |           |
+--------------------------------------------------+-----------+
```
- Top bar: category menu, output and monitor controls, search, icon buttons. Two rows at ≤ 720 px, one row above.
- Pad grid: unchanged structure (v5). Pad = rounded tile, name centred, buttons on hover or focus (plus always-visible on coarse pointers, H3).
- Sidebar: unchanged resize handle. Sections: Name, Appearance (icon, colour), Playback (volume, hotkey), Category, Trim, Danger zone (delete).

At 420 px: top bar in two rows; the sidebar sits below the grid; the output select gets its own full-width row (H2).

Quick Panel:
```
+--------------------------------------------------+
| [grip] [search..........] [stop] [All v]    [x]  |  header (material)
| Left click: play - Right click: preview          |  hint, 11 px
| > Alerts                                     1   |
|   [tile] [tile]                                  |
| > Animals                                    1   |
+--------------------------------------------------+
```
- Solid surface on `--surface` if the platform lacks `backdrop-filter`; translucent otherwise.
- Compact tiles (existing tile-size setting still applies).

## 3. Signature element

Amber's job was "live". Apple blue does not carry that meaning, so the identity must come from a new element. Proposal: **Live ring**. A playing pad gets a thin ring in its category colour that draws around the tile edge over the clip's length (trimmed length if set). Untimed or unknown length: a steady ring that fades out when playback ends.
- Reduced motion: the ring shows as a static full outline, no draw animation.
- Needs a playback signal from the existing `subscribePlayback`. Verify it gives start and duration. If not, use a steady ring only and say so.

This needs your approval (see Open decisions).

## 4. Materials

- **Used on:** top bar, sidebar, Quick Panel header. Never on pads, tiles, or lists.
- `backdrop-filter: saturate(180%) blur(20px)` with a 80%-opacity surface behind it.
- **Fallbacks:** `@supports not (backdrop-filter: blur(1px))` → solid `--surface`. `@media (prefers-reduced-transparency: reduce)` → solid `--surface`.
- Performance: blur is applied to a few static elements. Check frame cost on the Windows build (WebView2); if it lags, drop the blur and keep the solid fallback.

## 5. Stop button

Stop is a normal action, not an error. Currently red. New: a neutral filled button (`--ink` on `--raised`), with a square glyph. Red stays for Delete, File missing, Forget.

## 6. Motion

- Default durations: 150 ms, ease-out. Hover and focus only; no entrance animation on panels.
- Sidebar open/close: 200 ms slide if it exists today; otherwise none.
- `prefers-reduced-motion: reduce`: all transitions and the Live ring draw go to 0 (the existing block already removes transitions; extend it to the ring).
- **Quick Panel: zero show/hide animation** (v4 requirement). No transitions on the window or its root.

## 7. Ordered fix list

1. **Accessibility**
   - C1: nothing below 11 px.
   - C2: `--control-line` on all input, select, and button borders.
   - H3: pad buttons visible on coarse pointers.
   - M1: group toggle to 28 px.
2. **Layout**
   - H2: 420 px top bar and output select wrap.
   - Empty and edge states (no sounds, empty search, long names, many categories).
3. **Visual**
   - H1: light and dark tokens, system font, radii, shadows.
   - H4 and §5: semantic colour (Stop neutral).
   - §3: Live ring.
   - §4: materials on the navigation layer.
   - M2, M3: Quick Panel empty-state line and hint size.

## Open decisions

1. **Signature element:** Live ring (this plan), or another idea?
2. **Shadow:** one soft shadow for floating surfaces, or none at all (strict "no shadows" from CLAUDE.md)? This plan proposes one; CLAUDE.md must change to match.
3. **Stop colour:** neutral (proposed) or keep red?

## Verification (per milestone)

- `npm run build`, `cargo test` for `moyboard-core`, `cargo xwin check ... --tests`, `npm run test:e2e`.
- Screenshots to `docs/screens/after/`, same matrix as baseline (sizes 420 / 1100 / 1600, dark and light).
- Contrast spot-check: recompute the table above from the final CSS.
- Windows-only items (blur cost, Live ring timing, Quick Panel instant show/hide, tray, hotkeys) go to `docs/MANUAL-TESTS.md`. Not run in WSL; say so when reporting.
