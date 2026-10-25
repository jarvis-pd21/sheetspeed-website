import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layout = JSON.parse(readFileSync(path.join(root, "datasniper/samples/layout.json"), "utf8"));

async function draw(page, overlay, rect) {
  await expect.poll(async () => overlay.boundingBox().then((box) => box?.height || 0)).toBeGreaterThan(80);
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + rect.x * box.width, box.y + rect.y * box.height);
  await page.mouse.down();
  await page.mouse.move(
    box.x + (rect.x + rect.w) * box.width,
    box.y + (rect.y + rect.h) * box.height,
    { steps: 8 },
  );
  await page.mouse.up();
}

test("a 240px task pane keeps a compact list and snips in the large viewer", async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 800 });
  await page.goto("/datasniper/taskpane.html?harness=1");
  await expect(page.locator("#mac-tip")).toContainText("Excel for Mac");
  await expect(page.locator("#starter-link")).toHaveAttribute("href", "DataSniper-Starter.xlsx");
  await expect(page.locator("#empty-state")).toContainText("in the order of the snip list");
  await expect(page.locator("#empty-state")).not.toContainText("at the right");
  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples", layout.documents[0].file));
  await expect(page.locator("#doc-list li")).toHaveCount(1);
  await expect.poll(async () => page.locator("#doc-list").evaluate((el) => getComputedStyle(el).display)).toBe("flex");
  await expect(page.locator("#open-viewer")).toBeVisible();
  await expect(page.locator("#open-viewer")).toHaveText("Open large viewer");

  await page.locator("#open-viewer").click();
  const dialog = page.locator("#ds-harness-dialog");
  await expect(dialog).toHaveAttribute("data-dialog-width", "80");
  await expect(dialog).toHaveAttribute("data-dialog-height", "80");
  const frame = page.frameLocator("#ds-harness-dialog");
  await expect(frame.locator("#viewer-hint")).toBeVisible();
  await expect(frame.locator("#preview-hint")).toBeHidden();

  const overlay = frame.locator("#overlay");
  await draw(page, overlay, { x: 0.2, y: 0.45, w: 0.25, h: 0.012 });
  await expect(page.locator(".snip-row")).toHaveCount(1);
  await expect(frame.locator(".snip-box")).toHaveCount(1);
  const placement = await frame.locator(".snip-box").evaluate((box) => {
    const label = box.querySelector("span");
    const boxBounds = box.getBoundingClientRect();
    const labelBounds = label.getBoundingClientRect();
    const coversText = labelBounds.left < boxBounds.right - 2
      && labelBounds.right > boxBounds.left + 2
      && labelBounds.top < boxBounds.bottom - 2
      && labelBounds.bottom > boxBounds.top + 2;
    return { below: label.classList.contains("below"), coversText };
  });
  expect(placement.below).toBe(false);
  expect(placement.coversText).toBe(false);
});

test("the ready tip stays dismissed", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await expect(page.locator("#mac-tip")).toBeVisible();
  await expect(page.locator("#mac-tip")).toContainText("DataSniper is ready");
  await page.locator("#mac-tip-dismiss").click();
  await expect(page.locator("#mac-tip")).toBeHidden();
  await page.reload();
  await expect(page.locator("#mac-tip")).toBeHidden();
});

test("the public pages link DataSniper and the install note is one line", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header a.x-link[href='/datasniper/']")).toHaveText("DataSniper");
  await expect(page.locator("section[aria-label='DataSniper for Excel'] h2")).toHaveText("DataSniper for Excel");
  await expect(page.locator("section[aria-label='DataSniper for Excel']")).toContainText("DataSniper runs in Excel on Mac, Windows, and the web.");
  await page.goto("/datasniper/");
  await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /index/);
  await expect(page.locator("#install")).toContainText("Network blocks sheetspeed.agi-jarvis.com? Use this alternate manifest and its starter workbook.");
  await expect(page.locator("#install a[href='/datasniper/manifest-alt.xml']")).toHaveText("alternate manifest");
  await expect(page.locator("#install a[href='/datasniper/DataSniper-Starter.xlsx']")).toHaveText("Download the starter workbook");
  await expect(page.locator("#install a[href='/datasniper/DataSniper-Starter-alt.xlsx']")).toHaveText("its starter workbook");
  await expect(page.locator("body")).toContainText("DataSniper runs in Excel on Mac, Windows, and the web. DataSnipper’s desktop add-in runs in Excel on Windows, and DataSnipper also offers a separate Excel Online add-in.");
});
