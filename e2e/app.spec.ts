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
  await page.getByRole("button", { name: `Select ${name}` }).click();
  await expect(sidebar(page).getByRole("textbox", { name: "Name" })).toHaveValue(name);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".pad").first()).toBeVisible();
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
  await pad(page, "airhorn").getByRole("button", { name: "Select airhorn" }).click();
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

test("pad buttons are always visible and large enough to hit", async ({ page }) => {
  const rimshot = pad(page, "rimshot");
  await page.mouse.move(0, 0);
  for (const name of ["Play rimshot", "Preview rimshot on headphones"]) {
    const button = rimshot.getByRole("button", { name });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(32);
  }
});

test("pad: icon and name sit side by side on one row", async ({ page }) => {
  const frog = pad(page, "frog");
  const glyph = await frog.locator(".pad-glyph").boundingBox();
  const name = await frog.locator(".pad-name").boundingBox();
  expect(glyph!.x + glyph!.width).toBeLessThanOrEqual(name!.x);
  expect(Math.abs(glyph!.y + glyph!.height / 2 - (name!.y + name!.height / 2))).toBeLessThan(10);
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
  await sidebar(page).getByLabel("Category", { exact: true }).selectOption({ label: "Reactions" });
  expect(await categoryCount(page, "Reactions")).toBe("3");
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
  await sidebar(page).getByRole("radio", { name: "Colour #5fb3c9" }).click();
  await expect(pad(page, "airhorn")).toHaveAttribute("style", /#5fb3c9/);
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

test("settings: monitor volume is disabled while monitor is off", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".inline-field input[type=range]").first()).toBeDisabled();
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

test("quick panel: sounds with search, and no sidebar or editing", async ({ page }) => {
  await page.goto("/?view=quick");
  await expect(page.locator(".quick")).toBeVisible();
  await expect(page.locator(".quick .tile")).toHaveCount(9);
  await expect(page.getByRole("complementary", { name: "Selected item" })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search sounds" }).fill("airhorn");
  await expect(page.locator(".quick .tile")).toHaveCount(1);
  await expect(page.locator(".quick .tile")).toContainText("airhorn");
});

test("quick panel: play from the panel starts another instance", async ({ page }) => {
  await page.goto("/?view=quick");
  const airhorn = page.locator(".quick .tile", { hasText: "airhorn" });
  await airhorn.hover();
  await airhorn.getByRole("button", { name: "Play airhorn" }).click();
  await expect(airhorn.locator(".tile-eq")).toBeVisible();
  await expect(airhorn.getByRole("button", { name: "Stop all airhorn" })).toHaveCount(0);
});

test("quick panel: right click previews, and the Stop button stops everything", async ({ page }) => {
  await page.goto("/?view=quick");
  const airhorn = page.locator(".quick .tile", { hasText: "airhorn" });
  await airhorn.hover();
  await airhorn.getByRole("button", { name: "Play airhorn" }).click({ button: "right" });
  await expect(airhorn.getByRole("button", { name: "Stop preview of airhorn" })).toBeVisible();
  await expect(airhorn.locator(".tile-eq")).toHaveCount(0);
  await airhorn.getByRole("button", { name: "Play airhorn" }).click();
  await expect(airhorn.locator(".tile-eq")).toBeVisible();
  await page.getByRole("button", { name: "Stop all sounds" }).click();
  await expect(airhorn.locator(".tile-eq")).toHaveCount(0);
  await expect(airhorn.getByRole("button", { name: "Stop preview of airhorn" })).toHaveCount(0);
});

test("quick panel: rows are grouped and folding hides them", async ({ page }) => {
  await page.goto("/?view=quick");
  await expect(page.locator(".quick-group-head", { hasText: "Memes" })).toBeVisible();
  await page.locator(".quick-group-head", { hasText: "Memes" }).click();
  await expect(page.locator(".quick .tile", { hasText: "airhorn" })).toHaveCount(0);
  await expect(page.locator(".quick-group-head", { hasText: "Memes" })).toHaveAttribute("aria-expanded", "false");
});

test("quick panel: arrows move between rows, Enter plays", async ({ page }) => {
  await page.goto("/?view=quick");
  const plays = page.locator(".quick .tile-play:not(:disabled)");
  await expect(plays.first()).toBeVisible();
  await page.getByRole("searchbox", { name: "Search sounds" }).press("ArrowDown");
  await expect(plays.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(plays.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(plays.nth(1).locator("xpath=..")).toHaveClass(/is-playing/);
  await page.keyboard.press("ArrowUp");
  await expect(plays.nth(0)).toBeFocused();
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
  await page.locator("label.inline-field", { hasText: "Soundboard" }).locator("input").fill("200");
  await page.getByRole("button", { name: "Back to pads" }).click();
  await expect(pad(page, "airhorn")).toBeVisible();
  const width = (await pad(page, "airhorn").boundingBox())!.width;
  expect(width).toBeGreaterThan(190);
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
