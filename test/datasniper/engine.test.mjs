import assert from "node:assert/strict";
import test from "node:test";
import { fieldRectForDocument, parseAmount } from "../../datasniper/js/extract.js";
import { buildWorkbookRecord, replaceWorkbookRecord } from "../../datasniper/js/workbook.js";

test("five unambiguous amount formats become numbers and the rest stay text", () => {
  assert.deepEqual(parseAmount("$1,250,000.00"), { value: 1250000, raw: "$1,250,000.00" });
  assert.deepEqual(parseAmount("1,250,000.00"), { value: 1250000, raw: "1,250,000.00" });
  assert.deepEqual(parseAmount("(1,250.50)"), { value: -1250.5, raw: "(1,250.50)" });
  assert.deepEqual(parseAmount("USD 1,250,000.00"), { value: 1250000, raw: "USD 1,250,000.00" });
  assert.deepEqual(parseAmount("$1.25M"), { value: 1250000, raw: "$1.25M" });
  assert.equal(parseAmount("Harborview Pension Trust"), null);
  assert.equal(parseAmount("12.50%"), null);
  assert.equal(parseAmount("2026"), null);
});

function item(str, x, baseline, width) {
  return { str, x, baseline, fontSize: 11, width };
}

test("a label that moves with an extra line shifts the box and lowers confidence", () => {
  const width = 612;
  const height = 792;
  const baseline = (1 - 0.263) * height;
  const rect = { x: 0.25, y: 0.25, w: 0.3, h: 0.03, page: 1 };
  const template = [
    item("Investor", 40, baseline, 55),
    item("Harborview Pension Trust", 170, baseline, 180),
  ];
  const shiftedBaseline = baseline - 36;
  const target = [
    item("Please remit", 40, baseline, 80),
    item("Investor", 40, shiftedBaseline, 55),
    item("Northline Municipal Pension Plan", 170, shiftedBaseline, 220),
  ];
  const size = { width, height };
  const moved = fieldRectForDocument(template, size, target, size, rect);
  assert.equal(moved.confidence, "low");
  assert.equal(moved.reason, "shifted");
  assert.equal(moved.label, "Investor");
  assert.ok(Math.abs(moved.rect.y - (rect.y + 36 / height)) < 0.002);

  const aligned = fieldRectForDocument(template, size, template, size, rect);
  assert.equal(aligned.confidence, "high");
  assert.equal(aligned.reason, "aligned");
  assert.equal(aligned.rect.y, rect.y);

  const missing = fieldRectForDocument(template, size, [item("Fund name", 40, shiftedBaseline, 70)], size, rect);
  assert.equal(missing.confidence, "low");
  assert.equal(missing.reason, "label-missing");
  assert.equal(missing.label, "Investor");
});

test("replacing the workbook record drops links from a smaller or larger grid", () => {
  const snip = { id: "amount", name: "Amount called", page: 1, x: 0.2, y: 0.3, w: 0.2, h: 0.03 };
  const cell = (raw, number) => ({
    page: 1,
    rect: snip,
    confidence: "high",
    reason: "aligned",
    label: "Amount called",
    raw,
    number,
  });
  const previous = buildWorkbookRecord({
    columns: ["__source__", "amount"],
    docs: [{ id: "a", name: "capital-call-01.pdf" }, { id: "b", name: "capital-call-02.pdf" }],
    snips: [snip],
    headers: ["Source document", "Amount called"],
    matrix: [["capital-call-01.pdf", 1250000], ["capital-call-02.pdf", 875400.5]],
    cells: [[cell("$1,250,000.00", 1250000)], [cell("$875,400.50", 875400.5)]],
  });
  previous.links["9:9"] = { name: "stale.pdf" };
  const next = buildWorkbookRecord({
    columns: ["__source__", "amount"],
    docs: [{ id: "a", name: "capital-call-01.pdf" }],
    snips: [snip],
    headers: ["Source document", "Amount called"],
    matrix: [["capital-call-01.pdf", 1250000]],
    cells: [[cell("$1,250,000.00", 1250000)]],
  });
  const replaced = replaceWorkbookRecord(previous, next);
  assert.equal(replaced, next);
  assert.equal(replaced.links["1:0"], undefined);
  assert.equal(replaced.links["9:9"], undefined);
  assert.equal(JSON.stringify(replaced.links).includes("capital-call-02.pdf"), false);
  assert.equal(previous.links["1:0"].name, "capital-call-02.pdf");

  const larger = buildWorkbookRecord({
    columns: ["__source__", "amount"],
    docs: [{ id: "a", name: "capital-call-01.pdf" }, { id: "c", name: "capital-call-03.pdf" }],
    snips: [snip],
    headers: ["Source document", "Amount called"],
    matrix: [["capital-call-01.pdf", 1250000], ["capital-call-03.pdf", 2100000]],
    cells: [[cell("$1,250,000.00", 1250000)], [cell("$2,100,000.00", 2100000)]],
  });
  const grown = replaceWorkbookRecord(replaced, larger);
  assert.deepEqual(grown.names, ["capital-call-01.pdf", "capital-call-03.pdf"]);
  assert.equal(grown.links["0:0"].name, "capital-call-01.pdf");
  assert.equal(grown.links["1:0"].name, "capital-call-03.pdf");
  assert.equal(grown.links["2:0"], undefined);
});
