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
  const labelsInside = await page.locator(".snip-box").evaluateAll((boxes) => boxes.map((box) => {
    const label = box.querySelector("span");
    const boxBounds = box.getBoundingClientRect();
    const labelBounds = label.getBoundingClientRect();
    const fontSize = Number.parseFloat(getComputedStyle(label).fontSize);
    return labelBounds.top >= boxBounds.top - 1 && fontSize <= 10;
  }));
  expect(labelsInside).toEqual([true, true, true]);
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
    expect(row[2]).toBe(doc.amountNumber);
    const investor = doc.file === layout.longDocument ? layout.truncatedInvestor : doc.investor;
    expect(row[3]).toBe(investor);
  }
  await expect(page.locator("#preview tr").nth(1).locator("td").nth(2)).toHaveAttribute("title", layout.documents[0].amount);
  await page.screenshot({ path: path.join(shots, "04-exported.png") });

  const rowIndex = values.findIndex((line) => line[0] === layout.longDocument);
  await page.evaluate((hit) => window.__datasniper.select(hit.row, hit.col), { row: rowIndex, col: 3 });
  const preview = page.frameLocator("#ds-harness-dialog");
  await expect(page.locator("#ds-harness-dialog")).toHaveAttribute("data-dialog-width", "70");
  await expect(page.locator("#ds-harness-dialog")).toHaveAttribute("data-dialog-height", "80");
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

  await expect(preview.locator("#apply-all")).toBeVisible();
  await preview.locator("#apply-all").click();
  await expect(page.locator("#status")).toContainText("Applied this box to all 5 documents");
  const applied = await page.evaluate(() => window.__datasniper.model());
  const investorSnip = applied.snips.find((snip) => snip.name === "Investor");
  expect(investorSnip.w).toBeGreaterThan(layout.snips.investorNarrow.w);
  expect(JSON.stringify(applied.overrides)).not.toContain(investorSnip.id);
  const afterApply = await page.evaluate(() => window.__datasniper.values());
  for (const doc of layout.documents) {
    const row = afterApply.find((line) => line[0] === doc.file);
    const investor = doc.file === layout.longDocument ? layout.fullInvestor : doc.investor;
    expect(row[3], doc.file).toBe(investor);
    expect(row[2], doc.file).toBe(doc.amountNumber);
  }
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

async function readRecord(page) {
  return page.evaluate(() => JSON.parse(window.__datasniper.settings()["datasniper.v1"]));
}

test("a shifted notice is read from its label and flagged", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await page.locator("#file-input").setInputFiles([
    path.join(root, "datasniper/samples/capital-call-01.pdf"),
    path.join(root, "datasniper/samples", layout.shiftedDocument),
  ]);
  await expect(page.locator("#doc-list li")).toHaveCount(2);
  await draw(page, layout.snips.fund);
  await draw(page, layout.snips.investorNarrow);
  await draw(page, layout.snips.amount);
  await page.locator(".snip-name").nth(0).fill("Fund");
  await page.locator(".snip-name").nth(1).fill("Investor");
  await page.locator(".snip-name").nth(2).fill("Amount called");
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText(`Low confidence on ${layout.shiftedDocument}`);
  const values = await page.evaluate(() => window.__datasniper.values());
  const shifted = values.find((line) => line[0] === layout.shiftedDocument);
  const template = values.find((line) => line[0] === "capital-call-01.pdf");
  expect(template[1]).toBe("Northwind Growth Fund III, L.P.");
  expect(template[2]).toBe("Harborview Pension Trust");
  expect(template[3]).toBe(1250000);
  expect(shifted[1]).toBe(layout.shifted.fund);
  expect(shifted[2]).toBe(layout.shifted.investor);
  expect(shifted[3]).toBe(layout.shifted.amountNumber);
  await expect(page.locator("#preview tr.low")).toHaveCount(1);
  const record = await readRecord(page);
  const amountLink = Object.values(record.links).find((link) => link.name === layout.shiftedDocument && link.label === "Amount called");
  expect(amountLink.confidence).toBe("low");
  expect(amountLink.reason).toBe("shifted");
  expect(amountLink.raw).toBe(layout.shifted.amount);
  expect(amountLink.number).toBe(layout.shifted.amountNumber);
});

test("re-export into a smaller or larger grid drops stale source links", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  const first = path.join(root, "datasniper/samples/capital-call-01.pdf");
  const second = path.join(root, "datasniper/samples/capital-call-02.pdf");
  await page.locator("#file-input").setInputFiles([first]);
  await draw(page, layout.snips.amount);
  await page.locator(".snip-name").fill("Amount called");
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 1");
  let record = await readRecord(page);
  expect(record.rows).toHaveLength(1);
  expect(record.links["0:1"].number).toBe(1250000);
  expect(record.links["0:1"].raw).toBe("$1,250,000.00");

  await page.locator("#file-input").setInputFiles([second]);
  await expect(page.locator("#doc-list li")).toHaveCount(2);
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 2");
  record = await readRecord(page);
  expect(record.names).toEqual(["capital-call-01.pdf", "capital-call-02.pdf"]);
  expect(record.links["2:0"]).toBeUndefined();
  let values = await page.evaluate(() => window.__datasniper.values());
  expect(values).toHaveLength(3);
  expect(values[2][1]).toBe(875400.5);

  await page.evaluate(() => window.__datasniper.dropDocument("capital-call-02.pdf"));
  await expect(page.locator("#doc-list li")).toHaveCount(1);
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 1");
  record = await readRecord(page);
  expect(record.rows).toHaveLength(1);
  expect(record.names).toEqual(["capital-call-01.pdf"]);
  expect(record.links["1:0"]).toBeUndefined();
  expect(JSON.stringify(record.links)).not.toContain("capital-call-02.pdf");
  values = await page.evaluate(() => window.__datasniper.values());
  expect(values).toHaveLength(2);
  expect(values[1][0]).toBe("capital-call-01.pdf");
  expect(values[1][1]).toBe(1250000);
});

test("a reopened workbook asks for a missing file by filename", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples/capital-call-01.pdf"));
  await draw(page, layout.snips.amount);
  await page.locator(".snip-name").fill("Amount called");
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 1");
  await page.evaluate(() => window.__datasniper.clearStoredFiles());
  await page.reload();
  await expect(page.locator("#reattach")).toBeVisible();
  await expect(page.locator("#reattach-name")).toHaveText("capital-call-01.pdf");
  await expect.poll(async () => page.evaluate(() => window.__datasniper.values())).toEqual([
    ["Source document", "Amount called"],
    ["capital-call-01.pdf", 1250000],
  ]);
  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples/capital-call-02.pdf"));
  await expect(page.locator("#status")).toContainText("Choose capital-call-01.pdf");
  await expect(page.locator("#reattach")).toBeVisible();
  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples/capital-call-01.pdf"));
  await expect(page.locator("#reattach")).toBeHidden();
  await expect(page.locator("#doc-list")).toContainText("capital-call-01.pdf");
  await page.evaluate(() => window.__datasniper.select(1, 1));
  const preview = page.frameLocator("#ds-harness-dialog");
  await expect(preview.locator("#doc-title")).toHaveText("capital-call-01.pdf");
  await expect(preview.locator("#live-text")).toHaveText("$1,250,000.00");
});
