import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractTextFromItems, fieldRectForDocument, itemsFromTextContent, pageHasTextLayer } from "../../datasniper/js/extract.js";

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

test("the long-name notice keeps Alexandra's full name and truncates the narrow box", async () => {
  const page = await readPdf(layout.longNameDocument);
  const narrow = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.investorNarrow);
  const full = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.investorFull);
  const fund = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.fund);
  const amount = extractTextFromItems(page.items, page.pageWidth, page.pageHeight, layout.snips.amount);
  assert.equal(full, layout.longNameInvestor);
  assert.equal(narrow, layout.longNameTruncated);
  assert.equal(fund, layout.longNameFund);
  assert.equal(amount, layout.longNameAmount);
  assert.equal(layout.longNameInvestor, "Alexandra Catherine Pemberton Worthington III");
  assert.ok(layout.longNameInvestor.startsWith(layout.longNameTruncated));
  assert.notEqual(narrow, full);
});

test("an extra line is followed by the label from the first notice", async () => {
  const template = await readPdf("capital-call-01.pdf");
  const shifted = await readPdf(layout.shiftedDocument);
  const templateSize = { width: template.pageWidth, height: template.pageHeight };
  const shiftedSize = { width: shifted.pageWidth, height: shifted.pageHeight };
  const rawInvestor = extractTextFromItems(shifted.items, shifted.pageWidth, shifted.pageHeight, layout.snips.investorNarrow);
  const rawAmount = extractTextFromItems(shifted.items, shifted.pageWidth, shifted.pageHeight, layout.snips.amount);
  assert.notEqual(rawInvestor, layout.shifted.investor);
  assert.notEqual(rawAmount, layout.shifted.amount);

  const investor = fieldRectForDocument(template.items, templateSize, shifted.items, shiftedSize, layout.snips.investorNarrow);
  const amount = fieldRectForDocument(template.items, templateSize, shifted.items, shiftedSize, layout.snips.amount);
  const fund = fieldRectForDocument(template.items, templateSize, shifted.items, shiftedSize, layout.snips.fund);
  assert.equal(investor.confidence, "low");
  assert.equal(investor.reason, "shifted");
  assert.equal(investor.label, "Investor");
  assert.equal(extractTextFromItems(shifted.items, shifted.pageWidth, shifted.pageHeight, investor.rect), layout.shifted.investor);
  assert.equal(amount.label, "Amount called");
  assert.equal(extractTextFromItems(shifted.items, shifted.pageWidth, shifted.pageHeight, amount.rect), layout.shifted.amount);
  assert.equal(fund.label, "Fund name");
  assert.equal(extractTextFromItems(shifted.items, shifted.pageWidth, shifted.pageHeight, fund.rect), layout.shifted.fund);

  const aligned = fieldRectForDocument(template.items, templateSize, template.items, templateSize, layout.snips.investorNarrow);
  assert.equal(aligned.confidence, "high");
  assert.equal(aligned.reason, "aligned");
});

test("a page with no text items asks for OCR instead of the text layer", () => {
  assert.equal(pageHasTextLayer([]), false);
  assert.equal(pageHasTextLayer([{ str: "   ", width: 10 }]), false);
  assert.equal(pageHasTextLayer([{ str: "Northwind", width: 40 }]), true);
});
