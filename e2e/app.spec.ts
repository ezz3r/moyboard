import { expect, test, type Page } from "@playwright/test";

const pad = (page: Page, name: string) => page.locator(".pad", { hasText: name });
const railCount = (page: Page, label: string) =>
  page.locator(".rail-item", { hasText: label }).locator(".count");

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
  await expect(railCount(page, "All")).toHaveText("9");
  await expect(railCount(page, "Memes")).toHaveText("3");
  await expect(page.locator(".pad")).toHaveCount(9);
});

test("category filter narrows the pad grid", async ({ page }) => {
  await page.locator(".rail-item", { hasText: "Memes" }).click();
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
  await expect(railCount(page, "All")).toHaveText("8");
});

test("clicking the pad body selects it and does not play", async ({ page }) => {
  await pad(page, "airhorn").getByRole("button", { name: "Select airhorn" }).click();
  await expect(pad(page, "airhorn")).toHaveClass(/is-selected/);
  await expect(pad(page, "airhorn").getByRole("button", { name: "Play airhorn" })).toBeVisible();
  await expect(pad(page, "airhorn")).not.toHaveClass(/is-playing/);
});

test("play button turns into stop while the sound plays", async ({ page }) => {
  await pad(page, "airhorn").getByRole("button", { name: "Play airhorn" }).click();
  await expect(pad(page, "airhorn").getByRole("button", { name: "Stop airhorn" })).toBeVisible();
  // The mock ends the sound after 3 s; the button flips back on its own.
  await expect(pad(page, "airhorn").getByRole("button", { name: "Play airhorn" })).toBeVisible({ timeout: 6000 });
});

test("preview button is separate and turns into a stop button", async ({ page }) => {
  await pad(page, "rimshot").getByRole("button", { name: "Preview rimshot on headphones" }).click();
  await expect(pad(page, "rimshot").getByRole("button", { name: "Stop preview of rimshot" })).toBeVisible();
  await expect(pad(page, "rimshot").getByRole("button", { name: "Play rimshot" })).toBeVisible();
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
  await expect(railCount(page, "Reactions")).toHaveText("3");
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
  await page.locator(".rail-item", { hasText: "Memes" }).click();
  const name = sidebar(page).getByRole("textbox", { name: "Category name" });
  await expect(name).toHaveValue("Memes");
  await name.fill("Jokes");
  await name.press("Enter");
  await expect(railCount(page, "Jokes")).toHaveText("3");
  await expect(page.locator(".rail-item", { hasText: "Memes" })).toHaveCount(0);
  await expect(pad(page, "airhorn")).toBeVisible();
});

test("category: new category is created and selected", async ({ page }) => {
  await page.getByRole("button", { name: "New category" }).click();
  await expect(sidebar(page).getByRole("textbox", { name: "Category name" })).toHaveValue("New category");
  await expect(page.locator(".rail-item", { hasText: "New category" })).toBeVisible();
});

test("category colour is applied to its sounds", async ({ page }) => {
  await page.locator(".rail-item", { hasText: "Memes" }).click();
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
  await expect(railCount(page, "All")).toHaveText("8");
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

