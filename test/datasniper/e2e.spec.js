import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layout = JSON.parse(readFileSync(path.join(root, "datasniper/samples/layout.json"), "utf8"));
const shots = "/opt/cursor/artifacts/datasniper";
mkdirSync(shots, { recursive: true });

async function expectLabelsOffTheText(overlay) {
  const report = await overlay.evaluate((root) => [...root.querySelectorAll(".snip-box")].map((box) => {
    const label = box.querySelector("span");
    const boxBounds = box.getBoundingClientRect();
    const labelBounds = label.getBoundingClientRect();
    const hits = (target) => labelBounds.left < target.right - 1
      && labelBounds.right > target.left + 1
      && labelBounds.top < target.bottom - 1
      && labelBounds.bottom > target.top + 1;
    const others = [...root.querySelectorAll(".snip-box")].filter((other) => other !== box);
    return {
      text: label.textContent,
      place: label.className,
      hitsOwn: hits(boxBounds),
      hitsOther: others.some((other) => hits(other.getBoundingClientRect())),
    };
  }));
  expect(report.length).toBeGreaterThan(0);
  for (const item of report) {
    expect(item.hitsOwn, JSON.stringify(item)).toBe(false);
    expect(item.hitsOther, JSON.stringify(item)).toBe(false);
  }
}

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
  await expectLabelsOffTheText(page.locator("#overlay"));
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
  await expect(page.locator("#doc-list li")).toHaveCount(7);
  await expect(page.locator("#doc-list")).toContainText("capital-call-07.pdf");
  await expect(page.locator("#page-canvas")).toBeVisible();

  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples/capital-call-image.png"));
  await expect(page.locator("#doc-list li")).toHaveCount(8);
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

test("a label-matched preview uses the saved region and will not adopt another field", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await page.locator("#file-input").setInputFiles([
    path.join(root, "datasniper/samples/capital-call-01.pdf"),
    path.join(root, "datasniper/samples", layout.shiftedDocument),
  ]);
  await draw(page, layout.snips.fund);
  await draw(page, layout.snips.investorNarrow);
  await draw(page, layout.snips.amount);
  await page.locator(".snip-name").nth(0).fill("Fund");
  await page.locator(".snip-name").nth(1).fill("Investor");
  await page.locator(".snip-name").nth(2).fill("Amount called");
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 2");
  expect(await page.evaluate(() => window.__datasniper.settings()["Office.AutoShowTaskpaneWithDocument"])).toBe(true);
  expect(await page.evaluate(() => window.__datasniper.startupBehavior)).toBe("Load");

  const values = await page.evaluate(() => window.__datasniper.values());
  const rowIndex = values.findIndex((line) => line[0] === layout.shiftedDocument);
  const investorCol = values[0].indexOf("Investor");
  expect(values[rowIndex][investorCol]).toBe(layout.shifted.investor);
  const marks = await page.evaluate(() => window.__datasniper.marks());
  const noted = marks.comments.filter((comment) => comment.content === "DataSniper: matched by label");
  expect(noted.length).toBeGreaterThan(0);
  for (const comment of noted) {
    expect(marks.fills[`${comment.row},${comment.col}`]).toBe("#FDE7C7");
  }

  await page.evaluate((hit) => window.__datasniper.select(hit.row, hit.col), { row: rowIndex, col: investorCol });
  const preview = page.frameLocator("#ds-harness-dialog");
  await expect(preview.locator("#confidence-note")).toBeVisible();
  await expect(preview.locator("#confidence-note")).toHaveText("Low confidence: matched by label");
  const notePad = await preview.locator("#confidence-note").evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingTop));
  expect(notePad).toBeGreaterThanOrEqual(8);
  await expect(preview.locator("#live-text")).toHaveText(layout.shifted.investor);
  const top = await preview.locator(".snip-box").evaluate((box) => Number.parseFloat(box.style.top));
  expect(top).toBeGreaterThan((layout.snips.investorNarrow.y + 0.02) * 100);

  const overlay = preview.locator("#overlay");
  const box = await overlay.boundingBox();
  const snip = await preview.locator(".snip-box").boundingBox();
  const deltaY = await page.evaluate(({ file, investorRaw, fundRaw }) => {
    const meta = JSON.parse(window.__datasniper.settings()["datasniper.v1"]);
    const links = Object.values(meta.links).filter((link) => link.name === file);
    const investor = links.find((link) => link.raw === investorRaw);
    const fund = links.find((link) => link.raw === fundRaw);
    return fund.rect.y - investor.rect.y;
  }, {
    file: layout.shiftedDocument,
    investorRaw: layout.shifted.investor,
    fundRaw: layout.shifted.fund,
  });
  const startX = snip.x + snip.width / 2;
  const startY = snip.y + snip.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY * box.height, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("#status")).toContainText("another field");
  await expect.poll(async () => page.evaluate(({ row, col }) => window.__datasniper.values()[row][col], {
    row: rowIndex,
    col: investorCol,
  })).toBe(layout.shifted.investor);
  await expect(preview.locator("#live-text")).toHaveText(layout.shifted.investor);
  await expect(preview.locator("#apply-all")).toBeHidden();
  await page.evaluate(() => window.__datasniper.dialog.close());

  await page.locator("#mark-low").uncheck();
  await expect.poll(async () => page.evaluate(() => window.__datasniper.marks().comments.length)).toBe(0);
  const cleared = await page.evaluate(() => window.__datasniper.marks());
  expect(Object.values(cleared.fills).filter(Boolean)).toEqual([]);
  const kept = await page.evaluate(() => window.__datasniper.values());
  expect(kept[rowIndex][investorCol]).toBe(layout.shifted.investor);
});

test("snip labels stay outside the text in the pane, the large viewer, and the preview", async ({ page }) => {
  const dir = "/opt/cursor/artifacts/datasniper-labels";
  mkdirSync(dir, { recursive: true });
  await page.goto("/datasniper/taskpane.html?harness=1");
  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples/capital-call-01.pdf"));
  await draw(page, layout.snips.fund);
  await draw(page, layout.snips.investorNarrow);
  await draw(page, layout.snips.amount);
  await page.locator(".snip-name").nth(0).fill("Fund");
  await page.locator(".snip-name").nth(1).fill("Investor");
  await page.locator(".snip-name").nth(2).fill("Amount called");
  await expectLabelsOffTheText(page.locator("#overlay"));
  const chips = await page.locator("#overlay .snip-box span").evaluateAll((nodes) => nodes.map((node) => ({
    text: node.textContent,
    title: node.title,
    chip: node.classList.contains("chip"),
  })));
  expect(chips.map((chip) => chip.text)).toEqual(["1", "2", "3"]);
  expect(chips.map((chip) => chip.title)).toEqual(["Fund", "Investor", "Amount called"]);
  expect(chips.every((chip) => chip.chip)).toBe(true);
  await page.locator("#viewer").screenshot({ path: path.join(dir, "pane-thumbnail.png") });

  await page.locator("#open-viewer").click();
  const viewer = page.frameLocator("#ds-harness-dialog");
  await expect(viewer.locator(".snip-box")).toHaveCount(3);
  await expectLabelsOffTheText(viewer.locator("#overlay"));
  await page.locator("#ds-harness-dialog").screenshot({ path: path.join(dir, "large-viewer.png") });
  await page.evaluate(() => window.__datasniper.dialog.close());
  await expect(page.locator("#ds-harness-dialog")).toHaveCount(0);

  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 1");
  await page.evaluate(() => window.__datasniper.select(1, 2));
  const preview = page.frameLocator("#ds-harness-dialog");
  await expect(preview.locator("#live-text")).toHaveText("Harborview Pension Trust");
  await expectLabelsOffTheText(preview.locator("#overlay"));
  await page.locator("#ds-harness-dialog").screenshot({ path: path.join(dir, "preview.png") });
});

test("remove and clear all drop documents and their sheet rows", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await page.locator("#file-input").setInputFiles([
    path.join(root, "datasniper/samples/capital-call-01.pdf"),
    path.join(root, "datasniper/samples/capital-call-02.pdf"),
  ]);
  await draw(page, layout.snips.amount);
  await page.locator(".snip-name").fill("Amount called");
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 2");
  await page.locator(".remove-doc", { hasText: "Remove" }).nth(1).click();
  await expect(page.locator("#doc-list li")).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => window.__datasniper.values().length)).toBe(2);
  await expect.poll(async () => page.evaluate(() => window.__datasniper.values()[1][0])).toBe("capital-call-01.pdf");
  await page.locator("#clear-docs").click();
  await expect(page.locator("#clear-confirm")).toBeVisible();
  await page.locator("#clear-cancel").click();
  await expect(page.locator("#doc-list li")).toHaveCount(1);
  await page.locator("#clear-docs").click();
  await page.locator("#clear-keep").click();
  await expect(page.locator("#doc-list li")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("Excel table is still on the sheet");
  await expect.poll(async () => page.evaluate(() => window.__datasniper.values().length)).toBe(2);
  expect(await page.evaluate(() => window.__datasniper.settings()["Office.AutoShowTaskpaneWithDocument"])).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-datasniper-ready", "1");
  await expect(page.locator("#reattach")).toBeVisible();
  await expect(page.locator("#reattach-name")).toHaveText("capital-call-01.pdf");
  await expect(page.locator("#doc-list li")).toHaveCount(0);
  await page.locator("#file-input").setInputFiles(path.join(root, "datasniper/samples/capital-call-01.pdf"));
  await expect(page.locator("#reattach")).toBeHidden();
  await expect(page.locator("#doc-list li")).toHaveCount(1);
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 1");
  await page.locator("#clear-docs").click();
  await page.locator("#clear-delete").click();
  await expect(page.locator("#doc-list li")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("and the Excel table");
  await expect.poll(async () => page.evaluate(() => window.__datasniper.values())).toEqual([]);
  expect(await page.evaluate(() => window.__datasniper.settings()["Office.AutoShowTaskpaneWithDocument"])).toBe(false);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-datasniper-ready", "1");
  await expect(page.locator("#reattach")).toBeHidden();
  await expect(page.locator("#doc-list li")).toHaveCount(0);
});

test("comments.add rejects an options object", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  const rejected = await page.evaluate(async () => {
    try {
      await Excel.run(async (context) => {
        const sheet = context.workbook.worksheets.getActiveWorksheet();
        sheet.comments.add("A2", { content: "DataSniper: matched by label", contentType: "Plain" });
        await context.sync();
      });
      return false;
    } catch (error) {
      return /Excel\.ContentType\.plain/.test(error.message);
    }
  });
  expect(rejected).toBe(true);
});

test("older Excel falls back from comments to notes, then to the fill", async ({ page }) => {
  await page.goto("/datasniper/taskpane.html?harness=1");
  await page.locator("#file-input").setInputFiles([
    path.join(root, "datasniper/samples/capital-call-01.pdf"),
    path.join(root, "datasniper/samples", layout.shiftedDocument),
  ]);
  await draw(page, layout.snips.fund);
  await page.locator(".snip-name").fill("Fund");
  await page.locator("#export-btn").click();
  await expect(page.locator("#status")).toContainText("Exported 2");
  const commented = await page.evaluate(() => window.__datasniper.marks().comments.length);
  expect(commented).toBeGreaterThan(0);

  await page.evaluate(() => { window.__datasniper.allowComments = false; });
  await page.locator("#mark-low").uncheck();
  await page.locator("#mark-low").check();
  await expect(page.locator("#status")).toContainText("have a note instead");
  const noted = await page.evaluate(() => window.__datasniper.marks());
  expect(noted.comments).toEqual([]);
  expect(noted.notes.length).toBeGreaterThan(0);
  expect(noted.notes.every((note) => note.content === "DataSniper: matched by label")).toBe(true);

  await page.evaluate(() => { window.__datasniper.allowNotes = false; });
  await page.locator("#mark-low").uncheck();
  await page.locator("#mark-low").check();
  await expect(page.locator("#status")).toContainText("amber fill only");
  const filled = await page.evaluate(() => window.__datasniper.marks());
  expect(filled.notes).toEqual([]);
  expect(Object.values(filled.fills).filter(Boolean).length).toBeGreaterThan(0);
});
