import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Layout editing tools" })).toBeVisible();
  (page as typeof page & { __consoleFailures?: string[] }).__consoleFailures = failures;
});

test.afterEach(async ({ page }) => {
  expect((page as typeof page & { __consoleFailures?: string[] }).__consoleFailures).toEqual([]);
});

test("keeps the renderer constrained to a stable viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Grow room" }).click();
  await page.getByRole("slider", { name: "Zoom" }).fill("2");
  const samples = [];
  for (let index = 0; index < 5; index += 1) {
    await page.waitForTimeout(100);
    samples.push(await page.evaluate(() => {
      const canvas = document.querySelector(".iso-stage canvas")?.getBoundingClientRect();
      return {
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        canvasTop: canvas?.top,
        canvasHeight: canvas?.height,
      };
    }));
  }
  expect(new Set(samples.map((sample) => sample.scrollHeight)).size).toBe(1);
  expect(new Set(samples.map((sample) => sample.canvasTop)).size).toBe(1);
  expect(new Set(samples.map((sample) => sample.canvasHeight)).size).toBe(1);
  expect(samples.at(-1)?.scrollHeight).toBeLessThanOrEqual(samples.at(-1)?.viewportHeight ?? 0);
});

test("supports the complete keyboard-accessible editing and round-trip workflow", async ({ page }) => {
  await page.getByRole("button", { name: "Place crate" }).click();
  await page.getByRole("button", { name: "Place crate" }).click();
  const crates = page.getByRole("button", { name: /^Crate \(/ });
  await expect(crates).toHaveCount(2);
  await crates.first().click();
  await crates.nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Move selection down" }).click();
  await page.getByRole("button", { name: "Rotate selection" }).click();
  await page.getByRole("button", { name: "Move to decor layer" }).click();
  await page.getByRole("button", { name: "Duplicate selection" }).click();
  await expect(page.getByRole("button", { name: /Crate copy/ })).toHaveCount(2);

  await crates.first().click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("r");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "Rotate selection" })).toBeDisabled();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: /^Crate \(0, 2\)$/ })).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByRole("button", { name: /^Crate \(0, 2\)$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();

  await page.getByRole("button", { name: "Erase floor tile" }).click();
  await page.getByRole("button", { name: "Paint floor tile" }).click();
  await page.getByRole("button", { name: "Grow room" }).click();
  await expect(page.getByText("13 × 13 tiles · build mode")).toBeVisible();

  await page.getByRole("button", { name: "Place wall" }).click();
  await page.getByRole("button", { name: "Insert door" }).click();
  await page.getByRole("button", { name: "Insert window" }).click();
  await expect(page.getByText(/edge · door/)).toBeVisible();
  await expect(page.getByText(/edge · window/)).toBeVisible();
  await page.getByText(/edge · door/).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(/edge · door/)).toHaveCount(0);

  await page.getByRole("slider", { name: "Zoom" }).fill("1.5");
  await page.getByText("Pan:").getByRole("button", { name: "Left" }).click();
  await page.getByText("Pan:").getByRole("button", { name: "Right" }).click();

  await page.getByRole("button", { name: "Validate layout" }).click();
  await expect(page.getByText("No reported issues")).toBeVisible();
  await page.getByRole("button", { name: "Start play test" }).click();
  await expect(page.getByText(/play mode/)).toBeVisible();
  await page.getByRole("button", { name: "Navigate avatar" }).click();
  await page.getByRole("button", { name: "Return to build" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).not.toBeNull();
  const exported = await readFile(exportedPath!, "utf8");
  const exportedLayout = JSON.parse(exported) as { metadata: { title: string }; entities: unknown[]; openings: unknown[] };
  await page.getByRole("textbox", { name: "Import JSON" }).fill(exported);
  await page.getByRole("button", { name: "Load imported layout" }).click();
  await expect(page.getByRole("heading", { name: exportedLayout.metadata.title })).toBeVisible();
  await expect(page.getByRole("img", { name: `${exportedLayout.metadata.title}, ${exportedLayout.entities.length} objects` })).toBeVisible();

  await page.getByRole("textbox", { name: "Import JSON" }).fill("{");
  await page.getByRole("button", { name: "Load imported layout" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: /Unexpected|Expected property|expected/i })).toBeVisible();
  const invalidLayout = JSON.parse(exported) as { entities: Array<{ assetId: string }> };
  invalidLayout.entities[0]!.assetId = "missing.asset";
  await page.getByRole("textbox", { name: "Import JSON" }).fill(JSON.stringify(invalidLayout));
  await page.getByRole("button", { name: "Load imported layout" }).click();
  await expect(page.getByText("Unknown asset 'missing.asset'")).toBeVisible();
});

test("matches the deterministic full-editor baseline", async ({ page }) => {
  await page.getByRole("button", { name: "Place crate" }).click();
  await page.getByRole("button", { name: "Validate layout" }).click();
  await page.getByRole("button", { name: "Start play test" }).click();
  await page.getByRole("button", { name: "Navigate avatar" }).click();
  await expect(page).toHaveScreenshot("pixi-editor.png", { animations: "disabled" });
});
