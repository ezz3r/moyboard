# moyboard UI structure (v7)

Scope: layout only. Colours and tokens stay as in `docs/ui-design-plan.md`. No function is added or removed. Quick Panel out of scope.

Reference image `docs/reference/structure-reference.png` is not in the repo. This layout follows the written target structure from the v7 plan.

## Wireframe

```text
┌──────────────────────────────────────────────────────────────┬───────────────────────┐
│ [Category ▾  ✎]                    [Search…]  [↻] [■] [⚙]    │ ┌───────────────────┐ │
│                                                              │ │ Name              │ │
│ All                                                          │ │ [Emoji] [Category]│ │
│ ● Uncategorized ▾ 4                                          │ │ Volume        80 %│ │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │ │ ───────●───────── │ │
│ │ ■▶◐    │ │        │ │        │ │        │  grid scrolls    │ │ Trim        0–2.3s│ │
│ │  😀    │ │        │ │        │ │        │                  │ │ [waveform]        │ │
│ │ name   │ │        │ │        │ │        │                  │ │ Color             │ │
│ └────────┘ └────────┘ └────────┘ └────────┘                  │ │ Hotkey            │ │
│                                                              │ │ ───────────────── │ │
├──────────────────────────────────────────────────────────────┤ │ Delete sound      │ │
│ Play to [Output ▾]   Others 🔊 ───●─── 100 %   You ───●─── 80 %│ └───────────────────┘ │
└──────────────────────────────────────────────────────────────┴───────────────────────┘
```

Bottom bar is part of the left column only.

## Trade-offs (review findings accepted)

- Bottom bar sits at the window bottom, against `layout.md` (macOS: avoid controls at the bottom). Accepted by the user for this layout. Output and Monitor also remain in Settings, so the bar is not the only path.
- Delete sits at the card bottom, against `sidebars.md` (avoid critical actions at the bottom). Delete is destructive, not core; it stays last and goes through the existing confirm dialog.
- The card is an opaque surface, not Liquid Glass (`materials.md`: no glass in content layer).

## Commands without a menu bar

Header actions are not in a menu bar in this Windows app. No new shortcuts are added in v7 (scope: layout only). Open item: decide later whether existing actions get a menu or shortcuts; tracked as a follow-up, not implemented.

## Sizes (8-pt grid)

| Item | Value |
| --- | --- |
| Window outer padding | 16 px all sides |
| Gap between regions (header, grid, bottom bar, card) | 16 px |
| Grid tile gap | 12 px |
| Grid tile min width | 128 px (`auto-fill`, `minmax(128px, 1fr)`) |
| Grid tile aspect | ~1:1 (`aspect-ratio: 1`) |
| Large title | 28 px, weight 600 |
| Header height | 48 px min |
| Bottom bar height | 56 px fixed, hairline on top |
| Control min height (buttons, inputs, selects, sliders hit area) | 32 px |
| Edit card | inset 16 px from window edge; radius 16 px; `--raised` surface (level 1); 1 px border `--line`; `--elevation` shadow |
| Edit card internal padding | 16 px; section spacing 16 px |
| Edit card width | resizable, saved; default 300 px; min 280; max via existing clamp |
| Sidebar resize handle | left edge of card, 8 px hit area |
| Minimum window | 640 × 480 (Tauri `minWidth` / `minHeight`) |
| Narrow breakpoint | ≤ 720 px: card stacks below grid, bottom bar wraps |
| Body and label text | 13 px min (macOS default 13 pt); 11 px only for hint text; no light weight below 13 px |
| Slider min width (bottom bar) | 96 px; labels sit beside controls |
| Gap around bezel controls | 12 px |
| Title max | 15 characters visible, ellipsis, full name as tooltip |

## Layout at 640 px (minimum window)

- Card 280 px (its min). Grid column 312 px: 640 − 2×16 outer − 16 gap − 280 card.
- Bottom bar: Output select on one row, Master and Monitor sliders wrap onto a second row if the bar is narrower than 480 px.
- Header: title truncates first, then search collapses to icon-only at < 520 px.

## Structure rules

- Header fixed; only the grid area (`.main` scroll container) scrolls.
- Category title is the category dropdown trigger; small edit icon next to it opens the category editor.
- Tile order: colour stripe on top edge → button row (Stop, Play, Preview) → emoji → single-line faded name.
- "All" view: sections per category with header (colour dot, name, count), collapsible, Uncategorized last.
- Edit card section order: Name, Emoji + Category, Volume, Trim, Colour, Hotkey, divider, Delete.
- Category selected: Name, Colour, Delete.
- Nothing selected: centred placeholder inside card.
- Preview device stays in Settings. Monitor ("You") slider moves to the bottom bar.

## Accessibility

- Icon-only buttons keep `aria-label` and tooltip.
- Focus-visible outline on every control.
- Text contrast 4.5:1, control borders 3:1.
- Respect `prefers-reduced-motion`.
- Hit targets ≥ 32 px.

## Apple HIG review (input for `/apple-design` review mode)

Questions for the review:
1. Clear hierarchy: large title → grid → controls?
2. Bottom bar: are output and volume labels grouped with their controls on one baseline?
3. Delete at card bottom: destructive style, separated by divider. Enough distance from Hotkey to avoid accidental taps?
4. Window minimum 640 × 480: does the card stay usable at minimum width?
5. Dark mode: card elevation visible without gradient?
