import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layout = JSON.parse(readFileSync(path.join(root, "datasniper/samples/layout.json"), "utf8"));
const shots = "/opt/cursor/artifacts/datasniper";
mkdirSync(shots, { recursive: true });

async function draw(page, rect) {
  const overlay = page.locator("#overlay");
  await expect.poll(async () => overlay.boundingBox().then((box) => box?.height || 0)).toBeGreaterThan(200);
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

test("snips three fields, reorders columns, extracts five notices, and widens a clipped name", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await expect(page.locator("h1")).toHaveText("DataSniper");
  await page.locator("#file-input").setInputFiles(layout.documents.map((doc) => path.join(root, "datasniper/samples", doc.file)));
  await expect(page.locator("#doc-list li")).toHaveCount(5);
  await expect(page.locator("#page-canvas")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "01-documents-loaded.png") });

  await draw(page, layout.snips.fund);
  await draw(page, layout.snips.investorNarrow);
  await draw(page, layout.snips.amount);
  await expect(page.locator(".snip-row")).toHaveCount(3);
  await page.locator(".snip-name").nth(0).fill("Fund");
  await page.locator(".snip-name").nth(1).fill("Investor");
  await page.locator(".snip-name").nth(2).fill("Amount called");
  await expect(page.locator(".snip-box")).toHaveCount(3);
  await page.screenshot({ path: path.join(shots, "02-snips-named.png") });

  const handle = page.locator(".snip-row").nth(2).locator(".drag-handle");
  const target = page.locator(".snip-row").nth(1);
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => page.locator(".snip-name").evaluateAll((nodes) => nodes.map((node) => node.value))).toEqual([
    "Fund",
    "Amount called",
    "Investor",
  ]);
  await page.screenshot({ path: path.join(shots, "03-snips-reordered.png") });

  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 5 documents");
  const values = await page.evaluate(() => window.__datasniper.values());
  expect(values[0]).toEqual(["Source document", "Fund", "Amount called", "Investor"]);
  expect(values).toHaveLength(6);
  for (const doc of layout.documents) {
    const row = values.find((line) => line[0] === doc.file);
    expect(row, doc.file).toBeTruthy();
    expect(row[1]).toBe(doc.fund);
    expect(row[2]).toBe(doc.amount);
    const investor = doc.file === layout.longDocument ? layout.truncatedInvestor : doc.investor;
    expect(row[3]).toBe(investor);
  }
  await page.screenshot({ path: path.join(shots, "04-exported.png") });

  const rowIndex = values.findIndex((line) => line[0] === layout.longDocument);
  await page.evaluate((hit) => window.__datasniper.select(hit.row, hit.col), { row: rowIndex, col: 3 });
  const preview = page.frameLocator("#ds-harness-dialog");
  await expect(preview.locator("#doc-title")).toHaveText(layout.longDocument);
  await expect(preview.locator(".snip-box")).toBeVisible();
  await expect(preview.locator("#live-text")).toHaveText(layout.truncatedInvestor);
  await page.screenshot({ path: path.join(shots, "05-preview-truncated.png") });

  const overlay = preview.locator("#overlay");
  const box = await overlay.boundingBox();
  const handleBox = await preview.locator(".handle-e").boundingBox();
  const full = layout.snips.investorFull;
  const targetX = box.x + (full.x + full.w) * box.width + 10;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, handleBox.y + handleBox.height / 2, { steps: 16 });
  await page.mouse.up();

  await expect(preview.locator("#live-text")).toHaveText(layout.fullInvestor);
  await expect.poll(async () => page.evaluate(({ row, col }) => window.__datasniper.values()[row][col], {
    row: rowIndex,
    col: 3,
  })).toBe(layout.fullInvestor);

  const updated = await page.evaluate(() => window.__datasniper.values());
  for (const doc of layout.documents) {
    if (doc.file === layout.longDocument) continue;
    const row = updated.find((line) => line[0] === doc.file);
    expect(row[3]).toBe(doc.investor);
  }
  await page.screenshot({ path: path.join(shots, "06-preview-widened.png") });
});

test("OCR fallback reads text painted on a canvas", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  const text = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 90;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111111";
    context.font = "bold 36px sans-serif";
    context.fillText("Harborview Pension Trust", 16, 58);
    const { recognizeCanvas } = await import("./js/ocr.js");
    return recognizeCanvas(canvas);
  });
  expect(text).toContain("Harborview");
});

test("sample button and an image upload both open in the viewer", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await page.locator("#load-samples").click();
  await expect(page.locator("#doc-list li")).toHaveCount(5);
  await expect(page.locator("#page-canvas")).toBeVisible();

  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples/capital-call-image.png"));
  await expect(page.locator("#doc-list li")).toHaveCount(6);
  await expect(page.locator("#doc-list")).toContainText("capital-call-image.png");
  await page.locator(".doc-button", { hasText: "capital-call-image.png" }).click();
  await expect.poll(async () => page.locator("#page-canvas").evaluate((canvas) => canvas.width)).toBeGreaterThan(0);
});
