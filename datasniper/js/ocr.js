/**
 * Client-side OCR for scanned pages and images.
 * Tesseract.js and its English traineddata are fetched from a CDN the first
 * time a page has no text layer. The cropped image is recognized in WASM
 * on this machine; it is not uploaded.
 */

const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

let workerPromise = null;
let chain = Promise.resolve();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (globalThis.Tesseract) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not download Tesseract.js for OCR."));
    document.head.appendChild(script);
  });
}

async function worker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(TESSERACT_SRC);
      if (!globalThis.Tesseract) throw new Error("Tesseract.js did not load.");
      return globalThis.Tesseract.createWorker("eng");
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function recognize(canvas) {
  const engine = await worker();
  const result = await engine.recognize(canvas);
  return (result?.data?.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

export function recognizeCanvas(canvas) {
  const job = chain.then(() => recognize(canvas));
  chain = job.catch(() => {});
  return job;
}
