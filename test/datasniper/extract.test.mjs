import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractTextFromItems, itemsFromTextContent, pageHasTextLayer } from "../../datasniper/js/extract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layout = JSON.parse(readFileSync(path.join(root, "datasniper/samples/layout.json"), "utf8"));

async function readPdf(file) {
  const data = new Uint8Array(readFileSync(path.join(root, "datasniper/samples", file)));
  const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const text = await page.getTextContent();
  return itemsFromTextContent(text, viewport);
}

test("text-layer snips match the shared capital-call template", async () => {
  for (const doc of layout.documents) {
    const page = await readPdf(doc.file);
    assert.equal(pageHasTextLayer(page.items), true);
    const fund = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.fund);
    const investor = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.investorNarrow);
    const amount = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.amount);
    const full = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.investorFull);
    assert.equal(fund, doc.fund, doc.file);
    assert.equal(amount, doc.amount, doc.file);
    assert.equal(full, doc.investor, doc.file);
    const expected = doc.file === layout.longDocument ? layout.truncatedInvestor : doc.investor;
    assert.equal(investor, expected, doc.file);
  }
  assert.notEqual(layout.truncatedInvestor, layout.fullInvestor);
  assert.ok(layout.fullInvestor.startsWith(layout.truncatedInvestor));
});

test("a page with no text items asks for OCR instead of the text layer", () => {
  assert.equal(pageHasTextLayer([]), false);
  assert.equal(pageHasTextLayer([{ str: "   ", width: 10 }]), false);
  assert.equal(pageHasTextLayer([{ str: "Northwind", width: 40 }]), true);
});
