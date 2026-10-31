import { expect, test, type Page } from "@playwright/test";

const pad = (page: Page, name: string) => page.locator(".pad", { hasText: name });
const railCount = (page: Page, label: string) =>
  page.locator(".rail-item", { hasText: label }).locator(".count");

async function openEdit(page: Page, name: string) {
  await pad(page, name).hover();
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await expect(page.getByRole("dialog", { name: "Edit sound" })).toBeVisible();
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
  await page.getByRole("button", { name: /^Memes/ }).click();
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

test("clicking a pad plays it without error", async ({ page }) => {
  await pad(page, "airhorn").getByRole("button", { name: "Play airhorn" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("rename changes the file name shown on the pad", async ({ page }) => {
  await openEdit(page, "airhorn");
  const input = page.getByRole("dialog").getByRole("textbox").first();
  await input.fill("horn");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(pad(page, "horn")).toBeVisible();
  await expect(pad(page, "airhorn")).toHaveCount(0);
});

test("empty name is rejected", async ({ page }) => {
  await openEdit(page, "airhorn");
  await page.getByRole("dialog").getByRole("textbox").first().fill("   ");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText("Name cannot be empty.");
});

test("emoji and category are saved from the edit sheet", async ({ page }) => {
  await openEdit(page, "frog");
  await page.getByRole("button", { name: "🎺", exact: true }).click();
  await page.getByRole("dialog").getByPlaceholder("None").fill("Reactions");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(railCount(page, "Reactions")).toHaveText("3");
  await expect(pad(page, "frog").locator(".pad-glyph")).toHaveText("🎺");
});

test("Escape closes the edit sheet", async ({ page }) => {
  await openEdit(page, "airhorn");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("hotkey is recorded, and Escape cancels recording", async ({ page }) => {
  await openEdit(page, "airhorn");
  const hk = page.locator("button.hotkey");
  await hk.click();
  await page.keyboard.press("Control+Shift+Digit1");
  await expect(hk).toHaveText("Ctrl+Shift+Digit1");
  await hk.click();
  await page.keyboard.press("Escape");
  await expect(hk).toHaveText("Ctrl+Shift+Digit1");
});

test("trim: drag start marker, save as new file", async ({ page }) => {
  await openEdit(page, "airhorn");
  await page.getByRole("button", { name: "Trim" }).click();
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
  await expect(page.getByRole("status")).toHaveText("Saved as airhorn (trimmed).wav");
  await expect(pad(page, "airhorn (trimmed)")).toBeVisible();
});

test("trim: end cannot cross start", async ({ page }) => {
  await openEdit(page, "airhorn");
  await page.getByRole("button", { name: "Trim" }).click();
  await expect(page.locator(".wave canvas")).toBeVisible();
  await page.getByLabel("Start, s").fill("3");
  await page.getByLabel("Start, s").blur();
  await page.getByLabel("End, s").fill("1");
  await page.getByLabel("End, s").blur();
  const start = Number(await page.getByLabel("Start, s").inputValue());
  const end = Number(await page.getByLabel("End, s").inputValue());
  expect(end).toBeGreaterThan(start);
});

test("trim saved on the sound shows in the edit sheet", async ({ page }) => {
  await openEdit(page, "airhorn");
  await page.getByRole("button", { name: "Trim" }).click();
  await expect(page.locator(".wave canvas")).toBeVisible();
  await page.getByLabel("Start, s").fill("0.5");
  await page.getByLabel("Start, s").blur();
  await page.getByRole("button", { name: "Save trim" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openEdit(page, "airhorn");
  await expect(page.getByRole("button", { name: "Trimmed. Edit trim" })).toBeVisible();
});

test("settings: renaming a category updates every sound in it", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const field = page.getByRole("textbox", { name: /Category name, 3 sounds/ });
  await field.fill("Jokes");
  await field.blur();
  await expect(railCount(page, "Jokes")).toHaveText("3");
  await expect(page.locator(".rail-item", { hasText: "Memes" })).toHaveCount(0);
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
