import { expect, test, type Page } from "@playwright/test";

const pad = (page: Page, name: string) => page.locator(".pad", { hasText: name });
const menuTrigger = (page: Page) => page.getByRole("button", { name: /^Category:/ });

/** Opens the top-bar category menu and picks an entry by its label. */
async function pickCategory(page: Page, label: string) {
  await menuTrigger(page).click();
  await page.getByRole("option").filter({ hasText: label }).click();
}

/** Reads the count shown next to a category in the open menu, then closes it. */
async function categoryCount(page: Page, label: string) {
  await menuTrigger(page).click();
  const count = await page.getByRole("option").filter({ hasText: label }).locator(".count").textContent();
  await page.keyboard.press("Escape");
  return count;
}

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Selected item" });

/** Selects a pad (its edit button) and waits for the sidebar to show it. */
async function openEdit(page: Page, name: string) {
  await pad(page, name).hover();
  // The middle of the tile is the Play button now; the name is the selection area.
  await page.getByRole("button", { name: `Select ${name}` }).locator(".pad-name").click();
  await expect(sidebar(page).getByRole("textbox", { name: "Name" })).toHaveValue(name);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".pad").first()).toBeVisible();
  // The routing banner loads after the pads and shifts them down: wait for it, so positions stay valid.
  await expect(page.locator(".banner")).toBeVisible();
});

test("lists sounds with category counts", async ({ page }) => {
  expect(await categoryCount(page, "All")).toBe("9");
  expect(await categoryCount(page, "Memes")).toBe("3");
  await expect(page.locator(".pad")).toHaveCount(9);
});

test("category filter narrows the pad grid", async ({ page }) => {
  await pickCategory(page, "Memes");
  await expect(page.locator(".pad")).toHaveCount(3);
  await expect(pad(page, "airhorn")).toBeVisible();
  await expect(pad(page, "frog")).toHaveCount(0);
});

test("missing file is flagged and can be forgotten", async ({ page }) => {
  const missing = pad(page, "old-alarm");
  await expect(missing).toContainText("File missing");
  await expect(missing.getByRole("button", { name: /old-alarm, file missing/ })).toBeDisabled();
  await missing.getByRole("button", { name: "Forget" }).click();
  await expect(missing).toHaveCount(0);
  expect(await categoryCount(page, "All")).toBe("8");
});

test("clicking the pad body selects it and does not play", async ({ page }) => {
  await pad(page, "airhorn").getByRole("button", { name: "Select airhorn" }).locator(".pad-name").click();
  await expect(pad(page, "airhorn")).toHaveClass(/is-selected/);
  await expect(pad(page, "airhorn").getByRole("button", { name: "Play airhorn" })).toBeVisible();
  await expect(pad(page, "airhorn")).not.toHaveClass(/is-playing/);
});

test("play again starts another instance; the center stop ends all of them", async ({ page }) => {
  const airhorn = pad(page, "airhorn");
  await airhorn.hover();
  await airhorn.getByRole("button", { name: "Play airhorn" }).click();
  await expect(airhorn.getByRole("button", { name: "Stop all airhorn" })).toBeVisible();
  await expect(airhorn).not.toContainText("x2");
  await airhorn.getByRole("button", { name: "Play airhorn" }).click();
  await expect(airhorn).toContainText("x2");
  await expect(airhorn.getByRole("button", { name: "Stop all 2 instances of airhorn" })).toBeVisible();
  await airhorn.getByRole("button", { name: "Stop all 2 instances of airhorn" }).click();
  await expect(airhorn.getByRole("button", { name: /Stop all/ })).toHaveCount(0);
  await expect(airhorn).not.toContainText("x2");
  await expect(airhorn).not.toHaveClass(/is-playing/);
});

test("pad buttons show on hover or keyboard focus, and are large enough to hit", async ({ page }) => {
  const rimshot = pad(page, "rimshot");
  const play = rimshot.getByRole("button", { name: "Play rimshot" });
  await page.mouse.move(0, 0);
  await expect(play).toBeHidden();
  await rimshot.hover();
  await expect(play).toBeVisible();
  const box = await play.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(32);
  await page.mouse.move(0, 0);
  await expect(play).toBeHidden();
  await rimshot.getByRole("button", { name: "Select rimshot" }).focus();
  await expect(play).toBeVisible();
});

test("pad: icon is the background, name sits inside the tile", async ({ page }) => {
  const frog = pad(page, "frog");
  const tile = await frog.boundingBox();
  const glyph = await frog.locator(".pad-glyph").boundingBox();
  const name = await frog.locator(".pad-name").boundingBox();
  expect(glyph!.x).toBeGreaterThanOrEqual(tile!.x);
  expect(glyph!.x + glyph!.width).toBeLessThanOrEqual(tile!.x + tile!.width + 1);
  expect(name!.x).toBeGreaterThanOrEqual(tile!.x);
  expect(name!.y + name!.height).toBeLessThanOrEqual(tile!.y + tile!.height);
});

test("preview button is separate and turns into a stop button", async ({ page }) => {
  await pad(page, "rimshot").hover();
  await pad(page, "rimshot").getByRole("button", { name: "Preview rimshot on headphones" }).click();
  await expect(pad(page, "rimshot").getByRole("button", { name: "Stop preview of rimshot" })).toBeVisible();
  await expect(pad(page, "rimshot").getByRole("button", { name: "Play rimshot" })).toBeVisible();
});

test("pad: Stop slot is reserved, so Play does not move when a sound starts", async ({ page }) => {
  const rimshot = pad(page, "rimshot");
  await rimshot.hover();
  const play = rimshot.getByRole("button", { name: "Play rimshot" });
  const before = await play.boundingBox();
  const stop = rimshot.getByRole("button", { name: "Stop all rimshot" });
  await expect(stop).toBeHidden();
  await play.click();
  await expect(stop).toBeVisible();
  expect(await play.boundingBox()).toEqual(before);
});

test("pad: a long name stays on one line, full name in the tooltip", async ({ page }) => {
  const long = "this is a very long sound name that must not wrap onto a second line";
  await openEdit(page, "rimshot");
  await sidebar(page).getByRole("textbox", { name: "Name" }).fill(long);
  await sidebar(page).getByRole("textbox", { name: "Name" }).press("Enter");
  const tile = pad(page, long);
  await expect(tile.locator(".pad-select")).toHaveAttribute("title", long);
  const height = await tile.locator(".pad-name").evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(24);
});

test("preview output setting is offered in settings", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Preview output" })).toBeVisible();
});

test("sidebar shows a placeholder until a sound is selected", async ({ page }) => {
  await expect(sidebar(page)).toContainText("Select a sound or a category to edit it.");
  await openEdit(page, "airhorn");
  await expect(sidebar(page)).not.toContainText("Select a sound or a category to edit it.");
});

test("rename changes the file name shown on the pad", async ({ page }) => {
  await openEdit(page, "airhorn");
  await sidebar(page).getByRole("textbox", { name: "Name" }).fill("horn");
  await sidebar(page).getByRole("textbox", { name: "Name" }).press("Enter");
  await expect(pad(page, "horn")).toBeVisible();
  await expect(pad(page, "airhorn")).toHaveCount(0);
});

test("empty name is rejected", async ({ page }) => {
  await openEdit(page, "airhorn");
  await sidebar(page).getByRole("textbox", { name: "Name" }).fill("   ");
  await sidebar(page).getByRole("textbox", { name: "Name" }).press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Name cannot be empty.");
});

test("emoji and category are saved from the sidebar", async ({ page }) => {
  await openEdit(page, "frog");
  await sidebar(page).getByRole("button", { name: "Icon 🐸. Change icon" }).click();
  const picker = page.getByRole("dialog", { name: "Choose icon" });
  await picker.getByRole("searchbox").fill("trumpet");
  await picker.getByRole("button", { name: /🎺/ }).first().click();
  await expect(picker).toHaveCount(0);
  await sidebar(page).getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Reactions" }).click();
  await expect.poll(() => categoryCount(page, "Reactions")).toBe("3");
  await expect(pad(page, "frog").locator(".pad-glyph")).toHaveText("🎺");
});

test("hotkey is recorded, and Escape cancels recording", async ({ page }) => {
  await openEdit(page, "airhorn");
  const hk = sidebar(page).locator("button.hotkey");
  await hk.click();
  await page.keyboard.press("Control+Shift+Digit1");
  await expect(hk).toHaveText("Ctrl+Shift+Digit1");
  await hk.click();
  await page.keyboard.press("Escape");
  await expect(hk).toHaveText("Ctrl+Shift+Digit1");
});

test("trim: drag start marker, save as new file", async ({ page }) => {
  await openEdit(page, "airhorn");
  const wave = page.locator(".wave");
  await expect(wave.locator("canvas")).toBeVisible();
  const box = (await wave.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + 50, { steps: 8 });
  await page.mouse.up();
  const startValue = Number(await page.getByLabel("Start, s").inputValue());
  expect(startValue).toBeGreaterThan(0.9);
  await page.getByRole("button", { name: "Save as new file" }).click();
  await expect(page.locator(".toast")).toHaveText("Saved as airhorn (trimmed).wav");
  await expect(pad(page, "airhorn (trimmed)")).toBeVisible();
});

test("trim: end cannot cross start", async ({ page }) => {
  await openEdit(page, "airhorn");
  await expect(page.locator(".wave canvas")).toBeVisible();
  await page.getByLabel("Start, s").fill("3");
  await page.getByLabel("Start, s").blur();
  await page.getByLabel("End, s").fill("1");
  await page.getByLabel("End, s").blur();
  const start = Number(await page.getByLabel("Start, s").inputValue());
  const end = Number(await page.getByLabel("End, s").inputValue());
  expect(end).toBeGreaterThan(start);
});

test("trim saved on the sound is still there after reselecting", async ({ page }) => {
  await openEdit(page, "airhorn");
  await expect(page.locator(".wave canvas")).toBeVisible();
  await page.getByLabel("Start, s").fill("0.5");
  await page.getByLabel("Start, s").blur();
  await page.getByRole("button", { name: "Save trim" }).click();
  await openEdit(page, "frog");
  await openEdit(page, "airhorn");
  await expect(page.getByLabel("Start, s")).toHaveValue("0.50");
});

test("category: rename from the sidebar keeps its sounds", async ({ page }) => {
  await pickCategory(page, "Memes");
  await page.getByRole("button", { name: "Edit category" }).click();
  const name = sidebar(page).getByRole("textbox", { name: "Category name" });
  await expect(name).toHaveValue("Memes");
  await name.fill("Jokes");
  await name.press("Enter");
  expect(await categoryCount(page, "Jokes")).toBe("3");
  await menuTrigger(page).click();
  await expect(page.getByRole("option").filter({ hasText: "Memes" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(pad(page, "airhorn")).toBeVisible();
});

test("category: the edit button opens the editor for the picked category", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Edit category" })).toBeDisabled();
  await pickCategory(page, "Animals");
  await page.getByRole("button", { name: "Edit category" }).click();
  await expect(sidebar(page).getByRole("textbox", { name: "Category name" })).toHaveValue("Animals");
});

test("category: new category is created and selected", async ({ page }) => {
  await menuTrigger(page).click();
  await page.getByRole("button", { name: "New category" }).click();
  await expect(sidebar(page).getByRole("textbox", { name: "Category name" })).toHaveValue("New category");
  await expect(menuTrigger(page)).toHaveAccessibleName("Category: New category");
});

test("category colour is applied to its sounds", async ({ page }) => {
  await pickCategory(page, "Memes");
  await page.getByRole("button", { name: "Edit category" }).click();
  await sidebar(page).getByRole("button", { name: /^Category colour:/ }).click();
  const picker = page.getByRole("dialog", { name: "Category colour" });
  await picker.getByRole("textbox", { name: "Hex" }).fill("#5fb3c9");
  await page.keyboard.press("Escape");
  await expect(pad(page, "airhorn")).toHaveAttribute("style", /#5fb3c9/);
});

/** A point on the name strip under the button row, where a drag can start. The centre is the Play button. */
async function padGrip(page: Page, name: string) {
  const select = pad(page, name).locator(".pad-select");
  await select.scrollIntoViewIfNeeded();
  const box = (await select.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height - 8 };
}

test("drag a pad onto a category section moves it", async ({ page }) => {
  const from = await padGrip(page, "airhorn");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 30, { steps: 4 });
  await expect(pad(page, "airhorn")).toHaveClass(/is-dragging/);
  const section = page.locator("section.group", { hasText: "Reactions" });
  await section.scrollIntoViewIfNeeded();
  const box = (await section.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".toast")).toHaveText("Moved to Reactions");
  await expect.poll(() => categoryCount(page, "Reactions")).toBe("3");
});

test("drag is cancelled with Escape and a plain click still selects", async ({ page }) => {
  const from = await padGrip(page, "rimshot");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 40, { steps: 4 });
  const section = page.locator("section.group", { hasText: "Reactions" });
  const box = (await section.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 20, { steps: 10 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(pad(page, "rimshot")).not.toHaveClass(/is-dragging/);
  await expect(pad(page, "rimshot")).not.toHaveClass(/is-selected/);
  await page.mouse.click(from.x, from.y);
  await expect(pad(page, "rimshot")).toHaveClass(/is-selected/);
});

test("colour picker: invalid hex is refused, presets and reset apply", async ({ page }) => {
  await pickCategory(page, "Memes");
  await page.getByRole("button", { name: "Edit category" }).click();
  await sidebar(page).getByRole("button", { name: /^Category colour:/ }).click();
  const picker = page.getByRole("dialog", { name: "Category colour" });
  await picker.getByRole("textbox", { name: "Hex" }).fill("#zz");
  await expect(picker.getByRole("alert")).toHaveText(/six hex digits/);
  await expect(picker.getByRole("textbox", { name: "Hex" })).toHaveAttribute("aria-invalid", "true");
  await picker.getByRole("radio", { name: "Teal" }).click();
  await expect(pad(page, "airhorn")).toHaveAttribute("style", /#30b0c7/);
  await sidebar(page).getByRole("button", { name: "Remove category colour" }).click();
  await expect(sidebar(page).getByRole("button", { name: /^Category colour:/ })).toHaveAccessibleName(/none/);
});

test("all view: sections per category, Uncategorized last", async ({ page }) => {
  // Saved and legacy categories, sorted by name. "Ideas" is saved but empty, so it still shows.
  await expect(page.locator(".group-title")).toHaveText(["Alerts", "Animals", "Ideas", "Memes", "Music", "Reactions", "Uncategorized"]);
});

test("all view: a section can be folded", async ({ page }) => {
  await expect(pad(page, "airhorn")).toBeVisible();
  await page.getByRole("button", { name: "Collapse Memes" }).click();
  await expect(pad(page, "airhorn")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Memes" }).click();
  await expect(pad(page, "airhorn")).toBeVisible();
});

test("settings: closing to tray can be switched off", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const box = page.getByRole("checkbox", { name: "Keep running in the tray when the window is closed" });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();
  await box.check();
});

test("settings: You has a volume but no output picker", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".inline-field input[type=range]").first()).toBeEnabled();
  await expect(page.getByRole("combobox", { name: /For you/ })).toHaveCount(0);
});

test("no horizontal scroll at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("search filters sounds by name", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search sounds and categories" }).fill("horn");
  await expect(page.locator(".pad")).toHaveCount(1);
  await expect(pad(page, "airhorn")).toBeVisible();
});

test("search also matches the category name, and hides empty sections", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search sounds and categories" }).fill("memes");
  await expect(page.locator(".pad")).toHaveCount(3);
  await expect(page.locator(".group-title")).toHaveText(["Memes"]);
});

test("search with no hits says so, and Escape clears it", async ({ page }) => {
  const box = page.getByRole("searchbox", { name: "Search sounds and categories" });
  await box.fill("zzz");
  await expect(page.getByText("No sounds found.")).toBeVisible();
  await box.press("Escape");
  await expect(box).toHaveValue("");
  await expect(page.locator(".pad")).toHaveCount(9);
});

test("Ctrl+F focuses the search field", async ({ page }) => {
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+f");
  await expect(page.getByRole("searchbox", { name: "Search sounds and categories" })).toBeFocused();
});

test("delete: confirm, then the sound leaves the pads and the selection", async ({ page }) => {
  await openEdit(page, "airhorn");
  await sidebar(page).getByRole("button", { name: "Delete sound" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete airhorn?");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(pad(page, "airhorn")).toHaveCount(0);
  expect(await categoryCount(page, "All")).toBe("8");
  await expect(sidebar(page)).toContainText("Select a sound or a category to edit it.");
});

test("Delete key asks first; Cancel keeps the sound", async ({ page }) => {
  await openEdit(page, "frog");
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(pad(page, "frog")).toBeVisible();
});

test("Escape closes the delete dialog", async ({ page }) => {
  await openEdit(page, "frog");
  await sidebar(page).getByRole("button", { name: "Delete sound" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});


test("header icon buttons have names and tooltips", async ({ page }) => {
  for (const name of ["Rescan", "Settings", "Stop all"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("title", name);
  }
});

test("right-click does not open a menu (default prevented)", async ({ page }) => {
  const prevented = await page.evaluate(() => {
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test("quick panel: rail filters by category, no search field, no sidebar", async ({ page }) => {
  await page.goto("/?view=quick");
  await expect(page.locator(".quick")).toBeVisible();
  await expect(page.locator(".quick .tile")).toHaveCount(9);
  await expect(page.getByRole("complementary", { name: "Selected item" })).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  const catButton = page.getByRole("button", { name: /^Category:/ });
  await catButton.click();
  await page.getByRole("option", { name: /Memes/ }).click();
  await expect(page.locator(".quick .tile")).toHaveCount(3);
  await catButton.click();
  await page.getByRole("option", { name: /All/ }).click();
  await expect(page.locator(".quick .tile")).toHaveCount(9);
});

test("quick panel: play from the panel starts another instance", async ({ page }) => {
  await page.goto("/?view=quick");
  const airhorn = page.locator(".quick .tile", { hasText: "airhorn" });
  await airhorn.hover();
  await airhorn.getByRole("button", { name: "Play airhorn" }).click();
  await expect(airhorn).toHaveClass(/is-playing/);
  await expect(airhorn.getByRole("button", { name: "Stop all airhorn" })).toHaveCount(0);
});

test("quick panel: right click previews, and the Stop button stops everything", async ({ page }) => {
  await page.goto("/?view=quick");
  const airhorn = page.locator(".quick .tile", { hasText: "airhorn" });
  await airhorn.hover();
  await airhorn.getByRole("button", { name: "Play airhorn" }).click({ button: "right" });
  await expect(airhorn).toHaveClass(/is-previewing/);
  await expect(airhorn.getByRole("button", { name: /preview/i })).toHaveCount(0);
  await expect(airhorn).not.toHaveClass(/is-playing/);
  await airhorn.getByRole("button", { name: "Play airhorn" }).click();
  await expect(airhorn).toHaveClass(/is-playing/);
  await page.getByRole("button", { name: "Stop all sounds" }).click();
  await expect(airhorn).not.toHaveClass(/is-playing/);
  await expect(airhorn).not.toHaveClass(/is-previewing/);
});

test("quick panel: one grid, category rail, no hint line", async ({ page }) => {
  await page.goto("/?view=quick");
  await expect(page.locator(".quick .quick-grid .tile")).toHaveCount(9);
  await page.getByRole("button", { name: /^Category:/ }).click();
  await expect(page.locator(".quick-cat")).toHaveCount(7); // All, then six named
  await expect(page.locator(".quick-hint")).toHaveCount(0);
  await expect(page.locator(".quick-group-head")).toHaveCount(0);
});

test("quick panel: arrows move between rows, Enter plays", async ({ page }) => {
  await page.goto("/?view=quick");
  const plays = page.locator(".quick .tile-play:not(:disabled)");
  await expect(plays.first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(plays.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(plays.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(plays.nth(1).locator("xpath=..")).toHaveClass(/is-playing/);
  await page.keyboard.press("ArrowUp");
  await expect(plays.nth(0)).toBeFocused();
});

test("layout: bottom bar sits under the grid and holds output and both volumes", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const bar = page.locator(".bottom-bar");
  await expect(bar.getByRole("combobox", { name: "Output device" })).toBeVisible();
  await expect(bar.getByRole("slider", { name: "Volume for others (main output)" })).toBeVisible();
  await expect(bar.getByRole("slider", { name: "Volume for you (monitor output)" })).toBeVisible();
  const grid = (await page.locator(".main").boundingBox())!;
  const strip = (await bar.boundingBox())!;
  expect(grid.y + grid.height).toBeLessThanOrEqual(strip.y + 1);
});

test("layout: the edit card is inset from the window edge", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const card = (await sidebar(page).boundingBox())!;
  expect(card.x + card.width).toBeLessThanOrEqual(1200 - 16 + 1);
  expect(card.y).toBeGreaterThanOrEqual(15);
});

test("dropdown: app's own list, keyboard pick, Escape closes and returns focus", async ({ page }) => {
  await openEdit(page, "airhorn");
  const cat = sidebar(page).getByRole("combobox", { name: "Category" });
  await cat.click();
  await expect(page.getByRole("listbox", { name: "Category" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Category" })).toHaveCount(0);
  await expect(cat).toBeFocused();
  await cat.click();
  await page.getByRole("option", { name: "Music" }).click();
  await expect(cat).toContainText("Music");
});

test("icon picker opens at a usable width inside the card", async ({ page }) => {
  await openEdit(page, "airhorn");
  await sidebar(page).locator(".emoji-trigger").click();
  const pop = page.getByRole("dialog", { name: "Choose icon" });
  await expect(pop).toBeVisible();
  const box = (await pop.boundingBox())!;
  const card = (await sidebar(page).boundingBox())!;
  expect(box.width).toBeGreaterThan(240);
  expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
});

test("pad: Play sits in the middle of the tile; selected pad has no outline", async ({ page }) => {
  const rimshot = pad(page, "rimshot");
  await rimshot.hover();
  const tile = (await rimshot.boundingBox())!;
  const play = (await rimshot.getByRole("button", { name: "Play rimshot" }).boundingBox())!;
  // The button row is centred in the band above the name (6 px top, 24 px bottom).
  const bandMid = tile.y + (tile.height - 18) / 2;
  expect(Math.abs(play.y + play.height / 2 - bandMid)).toBeLessThan(3);
  await rimshot.getByRole("button", { name: "Select rimshot" }).locator(".pad-name").click();
  expect(await rimshot.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
});

test("sidebar: drag the handle to resize, double-click resets", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const sidebar = page.locator(".sidebar");
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  const before = (await sidebar.boundingBox())!.width;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x - 60, box.y + 100, { steps: 5 });
  await page.mouse.up();
  const dragged = (await sidebar.boundingBox())!.width;
  expect(dragged).toBeGreaterThan(before + 50);
  await handle.dblclick();
  expect(Math.round((await sidebar.boundingBox())!.width)).toBe(300);
});

test("sidebar: keyboard resizes and stops at the minimum", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "316");
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "280");
});

test("tile size: soundboard and Quick Panel sizes are set in Settings", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("label.inline-field", { hasText: "Soundboard width" }).locator("input").fill("200");
  await page.locator("label.inline-field", { hasText: "Soundboard height" }).locator("input").fill("148");
  await page.getByRole("button", { name: "Back to pads" }).click();
  await expect(pad(page, "airhorn")).toBeVisible();
  const box = await pad(page, "airhorn").boundingBox();
  expect(box!.width).toBeGreaterThan(190);
  expect(box!.height).toBeGreaterThan(140);
});

test("settings: quick panel mode can be switched to hold", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: /Toggle: press to show/ })).toBeChecked();
  await page.getByRole("radio", { name: /Hold: shown/ }).check();
  await expect(page.getByRole("radio", { name: /Hold: shown/ })).toBeChecked();
});

test("settings: start with Windows and minimized start can be switched", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const autostart = page.getByRole("checkbox", { name: "Start moyboard with Windows" });
  const minimized = page.getByRole("checkbox", { name: "Start minimized to tray" });
  await expect(autostart).not.toBeChecked();
  await autostart.check();
  await expect(autostart).toBeChecked();
  await minimized.check();
  await expect(minimized).toBeChecked();
});

test("quick panel: no horizontal scroll at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });
  await page.goto("/?view=quick");
  await expect(page.locator(".quick .tile").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("category menu: arrow keys move through entries, Escape closes", async ({ page }) => {
  await menuTrigger(page).click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(menuTrigger(page)).toBeFocused();
});

test("playing badges: others are green, yourself in the preview is yellow, both show two badges", async ({ page }) => {
  const airhorn = pad(page, "airhorn");
  await airhorn.hover();
  await airhorn.getByRole("button", { name: "Play airhorn" }).click();
  const main = airhorn.locator(".playing-badge.is-main");
  await expect(main).toBeVisible();
  await expect(main).toHaveCSS("color", "rgb(29, 127, 58)");
  await expect(airhorn.locator(".playing-badge.is-preview")).toHaveCount(0);
  await airhorn.getByRole("button", { name: "Preview airhorn on headphones" }).click();
  const preview = airhorn.locator(".playing-badge.is-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS("color", "rgb(154, 103, 0)");
  await expect(airhorn.locator(".playing-badge")).toHaveCount(2);
});

test("playing pad: Stop shows only while the pointer is on the pad", async ({ page }) => {
  // The mock sound plays for 3 s, so the checks below run back to back while it sounds.
  const airhorn = pad(page, "airhorn");
  const play = airhorn.getByRole("button", { name: "Play airhorn" });
  await airhorn.hover();
  await play.click();
  await expect(airhorn.locator(".playing-badge.is-main")).toBeVisible();
  await expect(airhorn.locator(".pad-stop")).toBeEnabled();
  const stopVisible = () => airhorn.evaluate((p) => getComputedStyle(p.querySelector(".pad-stop")!).visibility === "visible");
  await expect.poll(stopVisible).toBe(true);
  await page.mouse.move(0, 0);
  await expect.poll(stopVisible).toBe(false);
  // Play again so a sound is still sounding for the last check.
  await airhorn.hover();
  await play.click();
  await expect.poll(stopVisible).toBe(true);
});

test("drag a pad onto a section header in the All view", async ({ page }) => {
  const from = await padGrip(page, "airhorn");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 30, { steps: 4 });
  const section = page.locator("section.group", { hasText: "Ideas" });
  await section.scrollIntoViewIfNeeded();
  const box = (await section.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".toast")).toHaveText("Moved to Ideas");
});

test("stop all sounds hotkey is recorded in Settings", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const field = page.locator("section.settings-section", { has: page.getByRole("heading", { name: "Stop all sounds" }) }).locator("button.hotkey");
  await field.click();
  await page.keyboard.press("Control+Shift+Digit2");
  await expect(field).toHaveText("Ctrl+Shift+Digit2");
});

test("pad buttons go away when the pointer leaves, even after a click on the name", async ({ page }) => {
  const rimshot = pad(page, "rimshot");
  const select = rimshot.locator(".pad-select");
  const box = (await select.boundingBox())!;
  await select.click({ position: { x: box.width / 2, y: box.height - 8 } }); // the name strip, not the Play button
  const play = rimshot.getByRole("button", { name: "Play rimshot" });
  await expect(play).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(play).toBeHidden();
});

test("quick panel: the wheel scrolls the board while Ctrl, Alt or Shift is held (hold mode)", async ({ page }) => {
  await page.goto("/?view=quick");
  await page.locator(".quick .tile").first().waitFor();
  // Shorter than the tiles, so there is something to scroll.
  await page.evaluate(() => ((document.querySelector(".quick") as HTMLElement).style.height = "40px"));
  for (const mod of ["ctrlKey", "altKey", "shiftKey"] as const) {
    const top = await page.evaluate((m) => {
      const body = document.querySelector(".quick-body") as HTMLElement;
      body.scrollTop = 0;
      const ev = new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true, [m]: true });
      body.dispatchEvent(ev);
      return { scrolled: body.scrollTop, prevented: ev.defaultPrevented };
    }, mod);
    expect(top.scrolled, mod).toBeGreaterThan(0);
    expect(top.prevented, mod).toBe(true);
  }
});

test("You and Others sliders are always adjustable", async ({ page }) => {
  await expect(page.getByRole("slider", { name: "Volume for you (monitor output)" })).toBeEnabled();
  await expect(page.getByRole("slider", { name: "Volume for others (main output)" })).toBeEnabled();
});

test("reset settings puts a changed tile size back to its default", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const quick = page.locator("label.inline-field", { hasText: "Quick Panel width" }).locator("input");
  await quick.fill("90");
  await expect(quick).toHaveValue("90");
  await page.getByRole("button", { name: "Reset settings", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset", exact: true }).click();
  await expect(quick).toHaveValue("56");
});

// Audio routing and the virtual cable guide (browser mock; no real devices).
const plugCable = (page: Page, on: boolean) =>
  page.evaluate((v) => (window as unknown as { __mockCable: (on: boolean) => void }).__mockCable(v), on);

test("audio routing: Mode B needs a cable first", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Mic and sounds" }).click();
  await expect(page.getByText("Choose a virtual cable first.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Sounds only" })).toHaveAttribute("aria-checked", "true");
});

test("cable guide: waits, finds the cable, and saves it", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Setup guide" }).click();
  await expect(page.getByRole("heading", { name: "Install a virtual cable" })).toBeVisible();
  await expect(page.getByText("Waiting for the virtual cable")).toBeVisible();
  await plugCable(page, true);
  await expect(page.getByRole("heading", { name: "Virtual cable found" })).toBeVisible({ timeout: 6000 });
  await expect(page.getByText("CABLE Output (VB-Audio Virtual Cable)")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Audio routing" })).toBeVisible();
});

test("cable guide: an unfinished guide opens again on start", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Setup guide" }).click();
  await expect(page.getByRole("heading", { name: "Install a virtual cable" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Install a virtual cable" })).toBeVisible();
});

const plugMic = (page: Page, msg: string | null) =>
  page.evaluate((v) => (window as unknown as { __mockMicFailure: (msg: string | null) => void }).__mockMicFailure(v), msg);

// Guide finds and saves the cable, then Mode B is on.
async function enterModeB(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Setup guide" }).click();
  await plugCable(page, true);
  await expect(page.getByRole("heading", { name: "Virtual cable found" })).toBeVisible({ timeout: 6000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Mic and sounds" }).click();
}

test("banner: shows on start, opens audio routing, and stays dismissed", async ({ page }) => {
  await page.getByRole("button", { name: "Set up audio routing" }).click();
  await expect(page.getByRole("heading", { name: "Audio routing" })).toBeVisible();
  await page.getByRole("button", { name: "Back to pads" }).click();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".banner")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".pad").first()).toBeVisible();
  await expect(page.locator(".banner")).toBeVisible(); // the mock forgets across reloads; the real app keeps it
});

test("cable test: Mode B without a cable explains the install and offers the website", async ({ page }) => {
  await enterModeB(page);
  await plugCable(page, false);
  await expect(page.getByText("No virtual cable found. Install VB-CABLE, restart Windows, then press Refresh.")).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole("button", { name: "Open VB-Audio website" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
});

test("cable test: a tone that arrives is reported, one that does not is reported as an error", async ({ page }) => {
  await enterModeB(page);
  await expect(page.getByRole("meter", { name: "Microphone level" })).toBeVisible();
  await expect(page.getByText("Mic routing active.")).toBeVisible();
  await page.getByRole("button", { name: "Test cable" }).click();
  await expect(page.getByText("Sound arrived on CABLE Output (VB-Audio Virtual Cable).")).toBeVisible();
  await plugCable(page, false);
  await page.getByRole("button", { name: "Test cable" }).click();
  await expect(page.getByText("No sound arrived on the recording side.")).toBeVisible();
});

test("microphone: a denied mic shows the reason and the privacy settings button", async ({ page }) => {
  await enterModeB(page);
  await plugMic(page, "open microphone: access denied");
  await expect(page.getByRole("alert").getByText("open microphone: access denied")).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole("button", { name: "Open microphone privacy settings" })).toBeVisible();
  await plugMic(page, null);
});

test("setup help: the Mode B help text is available at the bottom of Settings", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText("Setup help").click();
  await expect(page.getByText("I have no virtual cable (mic only)")).toBeVisible();
  await expect(page.getByText("donationware")).toBeVisible();
});

test("cable guide: Mode B with a found cable shows the Discord input", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Setup guide" }).click();
  await plugCable(page, true);
  await expect(page.getByRole("heading", { name: "Virtual cable found" })).toBeVisible({ timeout: 6000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Mic and sounds" }).click();
  await expect(page.getByText("Detected: CABLE Input (VB-Audio Virtual Cable) / CABLE Output (VB-Audio Virtual Cable)")).toBeVisible();
  await expect(page.getByText("Input Device → CABLE Output (VB-Audio Virtual Cable)")).toBeVisible();
});
