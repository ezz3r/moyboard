# moyboard UI audit (baseline)

Review of the current UI before the redesign. Method: Apple Design Skill review mode (`.claude/skills/apple-design`), accessibility first, then platform conventions, then craft.

Evidence: screenshots in `docs/screens/before/` (sizes 420, 1100, 1600 px; dark and light). Contrast values are computed from the hex tokens in `src/styles.css`, not sampled from images.

Limits of this pass:
- The app has no light tokens. "Light" screenshots are identical to dark. Not a finding yet; see H1.
- Emoji render as empty boxes in WSL (no emoji font). Environment limit, not a finding. Real rendering needs the Windows build.
- Windows-only behaviour (Quick Panel focus, hotkeys, tray, blur performance) is not reviewed here.

Overall rating: **Needs work**. The base is sound (focus rings, dialog defaults, reduced motion, labelled controls). Type sizes, control borders, and the narrow layout need fixing.

## Critical

### C1. Text below the minimum size
- **What:** `font-size: 9px` on Quick Panel "File missing" text (`src/styles.css` ~1606) and on the count badge (~1622). `font-size: 11px` on a label chip (~646). Desktop minimum is 10 pt; default is 13 pt. Body text is 14 px.
- **Why:** `typography.md` table: macOS default 13 pt, minimum 10 pt. SKILL.md Lens 1: "Avoid light and thin weights for small text". The 9 px labels are also `font-weight` 600–650, which is heavy for the size.
- **Fix:** Minimum 11 px for any text. Move badges and status words to 11 px. Keep 9 px only for decoration, and never for information.

### C2. Control boundaries fail non-text contrast
- **What:** Control border `--line: #2c3631` on `--ground: #121614` is **1.46:1**. Buttons, the select, and text fields are separated from the background by that border alone. WCAG non-text contrast needs 3:1.
- **Why:** SKILL.md Lens 1 (contrast, computed from real values). The 3:1 non-text threshold is WCAG 1.4.11, applied as my judgment; `accessibility.md` was not re-checked for this rule.
- **Fix:** Add a `--control-line` token of at least 3:1 against both `--ground` and `--surface`, used for input, select, and button borders. Keep `--line` for decorative dividers only.

## High

### H1. No light appearance; system setting ignored
- **What:** Only dark tokens exist (`color-scheme: dark` on `:root`). Light mode is not offered, and the app ignores the system setting.
- **Why:** `dark-mode.md` (Best practices, Desktop) and the redesign requirement to follow the system appearance. Cited section names are from the file's headings; the text was not re-read.
- **Fix:** Define tokens on `:root` for light, redefine under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`, as CLAUDE.md requires.

### H2. Narrow layout (420 px) truncates and crowds
- **What:** At 420 px the output select truncates to "System default c", the header takes three rows, and the sidebar sits below the pads with a large empty area.
- **Why:** SKILL.md Lens 1: layouts must survive the narrowest size with hierarchy intact. `typography.md` › "Keep text truncation to a minimum as font size increases."
- **Fix:** Let the output select wrap onto its own row at narrow widths, group the volume sliders, and set a clear priority order for the top bar.

### H3. Pad controls appear only on hover or keyboard focus
- **What:** Play, Preview, and Headphones buttons on each pad show only on hover or focus (`.pad-btn`). Touch and pen users on Windows have no hover, so these controls are not discoverable.
- **Why:** Judgment, not a cited rule. A hover-only reveal gives touch and pen users no way to find the controls. No reference page was checked for this point; verify against `pointing-devices.md` before the design plan.
- **Fix:** Keep the hover-reveal for mouse, but show the controls at a reduced opacity on coarse pointers (`@media (pointer: coarse)`) and on the selected pad. Do not change behaviour; this is visibility only.

### H4. Semantic colour is overloaded
- **What:** Amber is the accent for focus, selection, play, and the "live" identity. Red (`--alarm`) is used for Stop, Delete, "File missing", and "Forget". Red text on the Quick Panel tile reads as an error, while Stop is a normal action.
- **Why:** Judgment from SKILL.md Lens 3 (craft: a single accent with a clear job). `color.md` was not re-checked for this point.
- **Fix:** Keep red for destructive and error states only. Give Stop a neutral or accent treatment. This matters more once the accent changes (see Craft notes).

## Medium

### M1. Group toggle below default hit size
- **What:** `.group-toggle` (section fold button) is 26 × 26 px. Other icon buttons are 34 px.
- **Why:** SKILL.md Lens 1: desktop default is 28 × 28 pt, minimum 20 × 20 pt. 26 px is below the default. Spacing between controls matters as much as size.
- **Fix:** 28 × 28 px minimum; keep the visual glyph at the current size.

### M2. Quick Panel empty state has no next action
- **What:** "No sounds yet." appears with no hint about where to add sounds.
- **Why:** SKILL.md Lens 5: "Empty screens invite the next action."
- **Fix:** Add one line: "Add sounds in the main window."

### M3. Quick Panel hint text is low emphasis
- **What:** "Left click: play · Right click: preview" is small, faint text at the top of the panel. This is the only on-screen description of the controls.
- **Why:** Same type-size rule as C1 (SKILL.md Lens 1).
- **Fix:** Raise to 11 px and the secondary-text token. Keep it one line.

## Craft notes

- **Point of view:** Amber as the single "live" signal on graphite is distinctive. It is the strongest part of the current design.
- **Restraint:** No shadows, no gradients, small radii. Consistent with the Apple direction.
- **Risk for the redesign:** Milestone 4 switches the accent to Apple blue as requested. That removes the amber "live" identity. The design plan (`docs/ui-design-plan.md`) must replace it with a new signature element, or the app loses its identity.

## What works

- **Focus rings:** 2 px `--signal` outline, contrast 9.14:1 on `--ground`. Keep the pattern.
- **Destructive dialog:** Delete confirmation names the sound, explains what is removed ("Recycle Bin"), and puts focus on Cancel by default.
- **Danger button:** `.btn-danger-solid` text (`--signal-ink` on `--alarm`) is 5.46:1. Passes.
- **Secondary text:** `--ink-2` on the three surfaces is 7.16, 6.50, and 5.70:1. Passes 4.5:1.
- **Selection:** the selected pad has a 2 px amber outline, so selection is not carried by colour alone.
- **Missing files:** flagged on the pad with "Forget" as the fix. Clear wording.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables transitions and animations.
- **Labels:** icon-only header buttons have names and tooltips (covered by e2e).

## Platform notes

- Desktop (Windows via Tauri). Desktop conventions apply: keyboard access, visible focus, menus and tooltips, and fixed windows that resize.
- The sidebar resize handle and the Quick Panel move/resize header depend on pointer input. Keyboard alternatives exist (e2e covers keyboard resize).
- Blur and translucency are not used yet. Any new materials need a solid fallback and `prefers-reduced-transparency` handling.

## Contrast reference

| Pair | Ratio | Result |
| --- | --- | --- |
| ink `#e9e4d6` on ground `#121614` | 14.37 | pass |
| ink on surface `#1a201d` | 13.04 | pass |
| ink on raised `#232b27` | 11.43 | pass |
| ink-2 `#9aa59d` on ground | 7.16 | pass |
| ink-2 on surface | 6.50 | pass |
| ink-2 on raised | 5.70 | pass |
| signal `#f2a93b` on ground (focus) | 9.14 | pass |
| signal-ink `#1a1206` on signal | 9.28 | pass |
| signal-ink on alarm `#e0664f` | 5.46 | pass |
| alarm on ground | 5.37 | pass (text) |
| alarm on surface | 4.88 | pass (text) |
| line `#2c3631` on ground | 1.46 | **fail** (non-text, C2) |
