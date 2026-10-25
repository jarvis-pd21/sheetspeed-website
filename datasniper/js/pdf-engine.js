import { getDocument, GlobalWorkerOptions } from "../vendor/pdf.min.js";
import { extractTextFromItems, itemsFromTextContent, pageHasTextLayer } from "./extract.js";
import { recognizeCanvas } from "./ocr.js";

const assetBase = import.meta.url;
GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.js", assetBase).href;

const textCache = new WeakMap();

function documentOptions(data) {
  return {
    data,
    cMapUrl: new URL("../vendor/cmaps/", assetBase).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("../vendor/standard_fonts/", assetBase).href,
  };
}

export async function openPdf(bytes) {
  const data = bytes instanceof Uint8Array ? bytes.slice(0) : new Uint8Array(bytes).slice(0);
  const task = getDocument(documentOptions(data));
  return task.promise;
}

export function decodeImage(bytes, mime) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mime || "image/png" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

export async function loadDocument(bytes, mime) {
  const type = (mime || "").toLowerCase();
  const looksImage = type.startsWith("image/");
  if (!looksImage) {
    try {
      const pdf = await openPdf(bytes);
      return { kind: "pdf", pdf, image: null, pageCount: pdf.numPages };
    } catch (error) {
      if (type.includes("pdf") || !type) {
        throw new Error("Could not open that PDF.");
      }
    }
  }
  const image = await decodeImage(bytes, type || "image/png");
  return { kind: "image", pdf: null, image, pageCount: 1 };
}

async function pageText(pdf, pageNumber) {
  let pages = textCache.get(pdf);
  if (!pages) {
    pages = new Map();
    textCache.set(pdf, pages);
  }
  if (!pages.has(pageNumber)) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    pages.set(pageNumber, itemsFromTextContent(text, viewport));
  }
  return pages.get(pageNumber);
}

export async function pageGeometry(doc, pageNumber) {
  if (!doc || doc.kind !== "pdf" || !doc.pdf) return null;
  const page = pageNumber || 1;
  if (page < 1 || page > doc.pageCount) return null;
  return pageText(doc.pdf, page);
}

export async function renderPdfPage(pdf, pageNumber, canvas) {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const host = canvas.parentElement?.parentElement || canvas.parentElement;
  const target = Math.max(320, host?.clientWidth || 640);
  const viewport = page.getViewport({ scale: target / base.width });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { pageWidth: base.width, pageHeight: base.height };
}

export function renderImage(image, canvas) {
  const host = canvas.parentElement?.parentElement || canvas.parentElement;
  const target = Math.max(320, host?.clientWidth || 640);
  const scale = target / image.naturalWidth;
  canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
}

function cropCanvas(source, rect) {
  const canvas = document.createElement("canvas");
  const sx = Math.max(0, rect.x * source.width);
  const sy = Math.max(0, rect.y * source.height);
  const sw = Math.max(1, rect.w * source.width);
  const sh = Math.max(1, rect.h * source.height);
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  canvas.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function extractFromDocument(doc, rect) {
  const pageNumber = rect.page || 1;
  if (doc.kind === "image") {
    if (pageNumber !== 1) return { text: "", source: "missing-page" };
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = Math.max(1, Math.round(rect.w * doc.image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(rect.h * doc.image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(
      doc.image,
      rect.x * doc.image.naturalWidth,
      rect.y * doc.image.naturalHeight,
      rect.w * doc.image.naturalWidth,
      rect.h * doc.image.naturalHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return { text: await recognizeCanvas(canvas), source: "ocr" };
  }
  if (pageNumber < 1 || pageNumber > doc.pageCount) return { text: "", source: "missing-page" };
  const geometry = await pageText(doc.pdf, pageNumber);
  if (pageHasTextLayer(geometry.items)) {
    return {
      text: extractTextFromItems(geometry.items, geometry.pageWidth, geometry.pageHeight, rect),
      source: "text-layer",
    };
  }
  const page = await doc.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return { text: await recognizeCanvas(cropCanvas(canvas, rect)), source: "ocr" };
}
