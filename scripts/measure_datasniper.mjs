/**
 * Measure sample PDFs with PDF.js and write the snip rectangles the
 * task pane tests draw. Rectangles are page-relative (top-left, 0–1).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "../test/datasniper/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { extractTextFromItems, itemsFromTextContent } from "../datasniper/js/extract.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const samples = join(root, "datasniper", "samples");

const documents = [
  {
    file: "capital-call-01.pdf",
    fund: "Northwind Growth Fund III, L.P.",
    investor: "Harborview Pension Trust",
    amount: "$1,250,000.00",
  },
  {
    file: "capital-call-02.pdf",
    fund: "Northwind Growth Fund III, L.P.",
    investor: "Cedar & Pine Family Office LLC",
    amount: "$875,400.50",
  },
  {
    file: "capital-call-03.pdf",
    fund: "Blackpine Opportunistic Credit Fund II",
    investor: "Meridian University Endowment",
    amount: "$2,100,000.00",
  },
  {
    file: "capital-call-04.pdf",
    fund: "Blackpine Opportunistic Credit Fund II",
    investor: "The Johnathan Q. Abernathy Revocable Living Trust dated March 14, 1998",
    amount: "$640,250.75",
  },
  {
    file: "capital-call-05.pdf",
    fund: "Sable Ridge Venture Partners IV, L.P.",
    investor: "Oak Street Capital Advisors",
    amount: "$3,450,000.00",
  },
];

async function load(file) {
  const data = new Uint8Array(readFileSync(join(samples, file)));
  const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const text = await page.getTextContent();
  return itemsFromTextContent(text, viewport);
}

function findValueRun(items, baseline, valueX = 156) {
  const runs = items.filter((item) => Math.abs(item.baseline - baseline) < 1 && item.x >= valueX - 1 && item.str.trim());
  if (!runs.length) throw new Error(`No value run at baseline ${baseline}`);
  runs.sort((a, b) => a.x - b.x);
  const fontSize = runs[0].fontSize;
  const charWidth = runs[0].width / runs[0].str.length;
  return { x: runs[0].x, baseline, fontSize, charWidth, runs };
}

function rectFor(run, charCount, pageWidth, pageHeight, rightPadChars = 0) {
  const padX = 2;
  const padY = 4;
  const x0 = run.x - padX;
  const x1 = run.x + (charCount + rightPadChars) * run.charWidth;
  const yTop = run.baseline + run.fontSize * 0.92 + padY;
  const yBottom = run.baseline - run.fontSize * 0.28 - padY;
  return {
    page: 1,
    x: x0 / pageWidth,
    y: (pageHeight - yTop) / pageHeight,
    w: (x1 - x0) / pageWidth,
    h: (yTop - yBottom) / pageHeight,
  };
}

const first = await load(documents[0].file);
const long = await load(documents[3].file);
const fundRun = findValueRun(long.items, 612);
const investorRun = findValueRun(long.items, 584);
const amountRun = findValueRun(long.items, 472);
const longestFund = Math.max(...documents.map((doc) => doc.fund.length));
const longestShortInvestor = Math.max(
  ...documents.filter((doc) => doc.file !== "capital-call-04.pdf").map((doc) => doc.investor.length),
);
const longestAmount = Math.max(...documents.map((doc) => doc.amount.length));

const snips = {
  fund: rectFor(fundRun, longestFund, long.pageWidth, long.pageHeight, 0.25),
  investorNarrow: rectFor(investorRun, longestShortInvestor, long.pageWidth, long.pageHeight, 0.15),
  investorFull: rectFor(investorRun, documents[3].investor.length, long.pageWidth, long.pageHeight, 0.35),
  amount: rectFor(amountRun, longestAmount, long.pageWidth, long.pageHeight, 0.25),
};

const truncated = extractTextFromItems(long.items, long.pageWidth, long.pageHeight, snips.investorNarrow);
const full = extractTextFromItems(long.items, long.pageWidth, long.pageHeight, snips.investorFull);
if (full !== documents[3].investor) {
  throw new Error(`Full investor snip extracted ${JSON.stringify(full)}`);
}
if (truncated === full || !documents[3].investor.startsWith(truncated) || truncated.length < 8) {
  throw new Error(`Narrow investor snip extracted ${JSON.stringify(truncated)}`);
}

for (const doc of documents) {
  const loaded = doc.file === documents[3].file ? long : await load(doc.file);
  const fund = extractTextFromItems(loaded.items, loaded.pageWidth, loaded.pageHeight, snips.fund);
  const investor = extractTextFromItems(loaded.items, loaded.pageWidth, loaded.pageHeight, snips.investorNarrow);
  const amount = extractTextFromItems(loaded.items, loaded.pageWidth, loaded.pageHeight, snips.amount);
  const expectInvestor = doc.file === "capital-call-04.pdf" ? truncated : doc.investor;
  if (fund !== doc.fund || investor !== expectInvestor || amount !== doc.amount) {
    throw new Error(
      `${doc.file}\n fund ${JSON.stringify(fund)}\n investor ${JSON.stringify(investor)} expected ${JSON.stringify(expectInvestor)}\n amount ${JSON.stringify(amount)}`,
    );
  }
  console.log(`${doc.file}\n  fund: ${fund}\n  investor: ${investor}\n  amount: ${amount}`);
}

// The first document's text layer must agree with the long document's geometry.
const firstInvestor = extractTextFromItems(first.items, first.pageWidth, first.pageHeight, snips.investorNarrow);
if (firstInvestor !== documents[0].investor) {
  throw new Error(`Doc 1 investor ${JSON.stringify(firstInvestor)}`);
}

const layout = {
  page: { width: long.pageWidth, height: long.pageHeight },
  documents,
  snips,
  longDocument: "capital-call-04.pdf",
  truncatedInvestor: truncated,
  fullInvestor: documents[3].investor,
};
writeFileSync(join(samples, "layout.json"), `${JSON.stringify(layout, null, 2)}\n`);
console.log("truncated:", truncated);
console.log("wrote layout.json");
