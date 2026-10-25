import { clampRect, highlightRectForValue, normalizeDrag, textRectsForItems } from "./extract.js";
import { finishLabels } from "./labels.js";
import { extractFromDocument, loadDocument, pageGeometry, renderImage, renderPdfPage } from "./pdf-engine.js";
import { getDocument, loadSession } from "./store.js";

const COLORS = ["#0f6e6b", "#b45309", "#9f1239", "#1d4ed8", "#6d28d9", "#3f6212"];
const params = new URLSearchParams(window.location.search);
const viewerMode = params.get("mode") === "viewer";

const title = document.querySelector("#doc-title");
const snipTitle = document.querySelector("#snip-title");
const liveText = document.querySelector("#live-text");
const sourceLabel = document.querySelector("#source-label");
const canvas = document.querySelector("#page-canvas");
const overlay = document.querySelector("#overlay");
const viewer = document.querySelector("#viewer");
const emptyState = document.querySelector("#empty-state");
const viewerBar = document.querySelector("#viewer-bar");
const viewerHint = document.querySelector("#viewer-hint");
const previewHint = document.querySelector("#preview-hint");
const applyAll = document.querySelector("#apply-all");
const confidenceNote = document.querySelector("#confidence-note");
const readout = document.querySelector("#dialog-readout");
const pageLabel = document.querySelector("#page-label");
const prevPage = document.querySelector("#prev-page");
const nextPage = document.querySelector("#next-page");

let session = { snips: [], overrides: {} };
let opened = null;
let docId = params.get("doc");
let snipId = params.get("snip");
let viewerPage = Number(params.get("page")) || 1;
if (!Number.isFinite(viewerPage) || viewerPage < 1) viewerPage = 1;
let activeRect = null;
let resolved = null;
let drag = null;
let drawing = null;
let extractTimer = 0;
let revision = 0;
let displayTicket = 0;
let geometry = null;

function colorFor(index) {
  return COLORS[index % COLORS.length];
}

function rgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function currentSnip() {
  if (!snipId) return null;
  return session.snips.find((snip) => snip.id === snipId) || null;
}

function currentPage() {
  if (viewerMode) return viewerPage;
  return activeRect?.page || currentSnip()?.page || 1;
}

function rectFor(id) {
  const snip = session.snips.find((item) => item.id === id);
  if (!snip) return null;
  if (session.overrides?.[docId]?.[id]) return session.overrides[docId][id];
  if (!viewerMode && id === snipId && resolved?.rect) {
    return { ...resolved.rect, page: resolved.rect.page || snip.page || 1 };
  }
  return snip;
}

function showConfidence() {
  if (!confidenceNote) return;
  const matched = !viewerMode && resolved && resolved.confidence === "low" && resolved.reason === "shifted";
  confidenceNote.hidden = !matched;
  if (matched) confidenceNote.textContent = "Low confidence: matched by label";
}

function post(message) {
  Office.context.ui.messageParent(JSON.stringify(message));
}

function visibleSnips() {
  const page = currentPage();
  if (!viewerMode && snipId) {
    const snip = currentSnip();
    return snip ? [snip] : [];
  }
  return session.snips.filter((snip) => (snip.page || 1) === page);
}

function updatePager() {
  if (!viewerMode) return;
  const count = opened?.pageCount || 1;
  if (viewerPage > count) viewerPage = count;
  if (viewerPage < 1) viewerPage = 1;
  pageLabel.textContent = opened ? `Page ${viewerPage} of ${count}` : "No document";
  prevPage.disabled = !opened || viewerPage <= 1;
  nextPage.disabled = !opened || viewerPage >= count;
}

function paint() {
  overlay.replaceChildren();
  const page = currentPage();
  visibleSnips().forEach((snip) => {
    const index = session.snips.findIndex((item) => item.id === snip.id);
    const raw = !viewerMode && snip.id === snipId && activeRect ? activeRect : rectFor(snip.id);
    if (!raw || (raw.page || 1) !== page) return;
    const rect = drag || !geometry
      ? raw
      : highlightRectForValue(geometry.items, geometry.pageWidth, geometry.pageHeight, raw);
    const color = colorFor(Math.max(0, index));
    const box = document.createElement("div");
    box.className = "snip-box";
    box.dataset.snipId = snip.id;
    box.style.left = `${rect.x * 100}%`;
    box.style.top = `${rect.y * 100}%`;
    box.style.width = `${rect.w * 100}%`;
    box.style.height = `${rect.h * 100}%`;
    box.style.borderColor = color;
    box.style.background = rgba(color, 0.2);
    const label = document.createElement("span");
    label.textContent = snip.name || "Snip";
    label.style.background = rgba(color, 0.55);
    box.append(label);
    if (!viewerMode && (!snipId || snip.id === snipId)) {
      for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
        const node = document.createElement("i");
        node.className = `handle handle-${handle}`;
        node.dataset.handle = handle;
        box.append(node);
      }
    }
    overlay.append(box);
  });
  finishLabels(overlay, {
    textRects: geometry ? textRectsForItems(geometry.items, geometry.pageWidth, geometry.pageHeight) : [],
  });
  if (drawing) {
    const rect = normalizeDrag(drawing.start, drawing.current);
    const box = document.createElement("div");
    box.className = "draw-rect";
    box.style.left = `${rect.x * 100}%`;
    box.style.top = `${rect.y * 100}%`;
    box.style.width = `${rect.w * 100}%`;
    box.style.height = `${rect.h * 100}%`;
    overlay.append(box);
  }
}

async function render() {
  if (!opened) return;
  const page = currentPage();
  if (opened.kind === "pdf") {
    if (page <= opened.pageCount) await renderPdfPage(opened.pdf, page, canvas);
    geometry = await pageGeometry(opened, page);
  } else {
    renderImage(opened.image, canvas);
    geometry = null;
  }
  viewer.hidden = false;
  emptyState.hidden = true;
  updatePager();
  paint();
}

async function showText() {
  if (!opened || !activeRect) return;
  const ticket = ++displayTicket;
  const rect = { ...activeRect };
  const result = await extractFromDocument(opened, rect);
  if (ticket !== displayTicket) return;
  liveText.textContent = result.text || "(empty)";
  sourceLabel.textContent = result.source === "ocr" ? "OCR" : "Text layer";
  const snip = currentSnip();
  if (snip) snipTitle.textContent = snip.name || "Snip";
}

function applyResolved(payload) {
  resolved = payload || null;
  if (!opened || viewerMode) {
    showConfidence();
    return;
  }
  const snip = currentSnip();
  const rect = snip ? rectFor(snip.id) : null;
  if (rect) activeRect = { ...rect, page: rect.page || snip.page || 1 };
  paint();
  showText();
  showConfidence();
}

async function runExtract(ticket) {
  if (!opened || !snipId || !activeRect) return;
  const rect = { ...activeRect };
  try {
    const result = await extractFromDocument(opened, rect);
    if (ticket !== revision) return;
    liveText.textContent = result.text || "(empty)";
    sourceLabel.textContent = result.source === "ocr" ? "OCR" : "Text layer";
    const snip = currentSnip();
    if (snip) snipTitle.textContent = snip.name || "Snip";
    post({ type: "update", revision: ticket, docId, snipId, rect, text: result.text });
  } catch (error) {
    if (ticket !== revision) return;
    liveText.textContent = error.message || "Could not read that region.";
    sourceLabel.textContent = "Error";
  }
}

function scheduleExtract(flush) {
  const ticket = ++revision;
  clearTimeout(extractTimer);
  if (flush) {
    runExtract(ticket);
    return;
  }
  extractTimer = setTimeout(() => runExtract(ticket), 120);
}

function pointerNorm(event) {
  const bounds = overlay.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  };
}

function resized(origin, start, point, mode) {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const next = { ...origin };
  if (mode === "move") {
    next.x = origin.x + dx;
    next.y = origin.y + dy;
  } else {
    if (mode.includes("e")) next.w = origin.w + dx;
    if (mode.includes("s")) next.h = origin.h + dy;
    if (mode.includes("w")) {
      next.x = origin.x + dx;
      next.w = origin.w - dx;
    }
    if (mode.includes("n")) {
      next.y = origin.y + dy;
      next.h = origin.h - dy;
    }
  }
  const rect = clampRect(next);
  rect.w = Math.max(rect.w, 0.008);
  rect.h = Math.max(rect.h, 0.008);
  return clampRect(rect);
}

function changeViewerPage(next) {
  if (!viewerMode || !opened) return;
  const count = opened.pageCount || 1;
  const page = Math.min(Math.max(1, next), count);
  if (page === viewerPage) return;
  viewerPage = page;
  render().then(() => post({ type: "viewer-page", docId, page: viewerPage }));
}

overlay.addEventListener("pointerdown", (event) => {
  if (viewerMode) {
    if (event.button !== 0 || !opened) return;
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    const point = pointerNorm(event);
    drawing = { start: point, current: point };
    paint();
    return;
  }
  const handle = event.target.closest(".handle");
  const box = event.target.closest(".snip-box");
  if (!box) return;
  event.preventDefault();
  const id = box.dataset.snipId;
  if (snipId && id !== snipId) return;
  snipId = id;
  const origin = { ...(activeRect && activeRect.id === id ? activeRect : rectFor(id)) };
  origin.page = origin.page || 1;
  const mode = handle ? handle.dataset.handle : "move";
  const start = pointerNorm(event);
  drag = { mode, start, origin };
  overlay.setPointerCapture(event.pointerId);
});

overlay.addEventListener("pointermove", (event) => {
  if (drawing) {
    drawing.current = pointerNorm(event);
    paint();
    return;
  }
  if (!drag) return;
  activeRect = resized(drag.origin, drag.start, pointerNorm(event), drag.mode);
  activeRect.page = drag.origin.page || 1;
  paint();
  scheduleExtract(false);
});

overlay.addEventListener("pointerup", (event) => {
  if (drawing) {
    const rect = normalizeDrag(drawing.start, pointerNorm(event));
    drawing = null;
    paint();
    if (rect.w < 0.008 || rect.h < 0.008) return;
    post({
      type: "create-snip",
      page: viewerPage,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
    });
    return;
  }
  if (!drag) return;
  drag = null;
  if (applyAll) applyAll.hidden = false;
  scheduleExtract(true);
});

overlay.addEventListener("pointercancel", () => {
  if (!drawing) return;
  drawing = null;
  paint();
});

applyAll?.addEventListener("click", () => {
  if (!activeRect || !snipId) return;
  post({ type: "apply-all", docId, snipId, rect: { ...activeRect } });
  applyAll.hidden = true;
});

prevPage?.addEventListener("click", () => changeViewerPage(viewerPage - 1));
nextPage?.addEventListener("click", () => changeViewerPage(viewerPage + 1));

async function openRecord(record, nextSession) {
  if (nextSession) session = nextSession;
  opened = await loadDocument(record.bytes, record.mime);
  opened.id = record.id;
  docId = record.id;
  title.textContent = record.name;
  const snip = currentSnip();
  const rect = snip ? rectFor(snip.id) : null;
  activeRect = rect ? { ...rect, page: rect.page || snip.page || 1 } : null;
  if (viewerMode) {
    snipTitle.textContent = "Drag a rectangle to add a snip";
    if (!params.get("page") && activeRect?.page) viewerPage = activeRect.page;
  } else {
    snipTitle.textContent = snip ? snip.name : "All snips";
  }
  await render();
  if (!viewerMode && snip) await showText();
  showConfidence();
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const incoming = { chunks: [] };

function onParentMessage(raw) {
  const message = JSON.parse(raw);
  if (message.type === "session") {
    session = { snips: message.snips || [], overrides: message.overrides || {} };
    if (message.page) viewerPage = message.page;
    if (message.docId && opened && message.docId !== opened.id) {
      docId = message.docId;
      post({ type: "need-document", docId, snipId: null, page: viewerPage });
      return;
    }
    if (opened) render();
    return;
  }
  if (message.type === "resolved") {
    if (message.docId && docId && message.docId !== docId) return;
    if (message.snipId && snipId && message.snipId !== snipId) return;
    applyResolved(message.resolved);
    return;
  }
  if (message.type === "restore-rect") {
    if (message.snipId && snipId && message.snipId !== snipId) return;
    if (message.rect) activeRect = { ...message.rect, page: message.rect.page || activeRect?.page || 1 };
    if (message.text != null) liveText.textContent = message.text || "(empty)";
    if (applyAll) applyAll.hidden = true;
    paint();
    showConfidence();
    return;
  }
  if (message.type === "show") {
    if (applyAll) applyAll.hidden = true;
    resolved = message.resolved || null;
    showConfidence();
    docId = message.docId;
    snipId = message.snipId || null;
    getDocument(docId).then((record) => {
      if (!record) {
        post({ type: "need-document", docId, snipId });
        return null;
      }
      return loadSession().then((saved) => openRecord(record, saved || session));
    }).catch((error) => {
      liveText.textContent = error.message || "Could not open that document.";
    });
    return;
  }
  if (message.type === "doc-begin") {
    incoming.meta = message;
    incoming.chunks = [];
    return;
  }
  if (message.type === "doc-chunk") {
    incoming.chunks[message.index] = message.data;
    return;
  }
  if (message.type === "doc-end" && incoming.meta) {
    const record = {
      id: incoming.meta.id,
      name: incoming.meta.name,
      mime: incoming.meta.mime,
      bytes: base64ToBytes(incoming.chunks.join("")),
    };
    docId = record.id;
    snipId = incoming.meta.snipId || null;
    resolved = incoming.meta.resolved || null;
    if (incoming.meta.page) viewerPage = incoming.meta.page;
    session = { snips: incoming.meta.snips || [], overrides: incoming.meta.overrides || {} };
    openRecord(record, session).catch((error) => {
      liveText.textContent = error.message || "Could not open that document.";
    });
  }
}

function showViewerChrome() {
  document.body.classList.add("viewer-mode");
  viewerBar.hidden = false;
  viewerHint.hidden = false;
  readout.hidden = true;
  previewHint.hidden = true;
  if (applyAll) applyAll.hidden = true;
  title.textContent = "Large viewer";
  snipTitle.textContent = "Drag a rectangle to add a snip";
  updatePager();
}

async function start() {
  await Office.onReady();
  if (Office.context.ui.addHandlerAsync && Office.EventType.DialogParentMessageReceived) {
    Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg) => {
      onParentMessage(arg.message);
    });
  }
  if (viewerMode) {
    showViewerChrome();
    if (!docId) {
      emptyState.hidden = false;
      emptyState.textContent = "Upload a document in the task pane, then open the large viewer.";
      return;
    }
    emptyState.hidden = false;
    emptyState.textContent = "Opening the document…";
    post({ type: "need-document", docId, snipId: null, page: viewerPage });
    return;
  }
  if (!docId) {
    emptyState.hidden = false;
    emptyState.textContent = "Choose an exported cell in Excel to preview its document.";
    return;
  }
  try {
    const saved = await loadSession();
    if (saved) session = saved;
    const record = await getDocument(docId);
    if (!record) {
      emptyState.hidden = false;
      emptyState.textContent = "Asking Excel for the document…";
      post({ type: "need-document", docId, snipId });
      return;
    }
    // The dialog can already have the PDF. The saved region still lives in the
    // workbook, so ask for it before reading the box.
    post({ type: "need-resolved", docId, snipId });
    await openRecord(record, session);
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = error.message || "Could not open that document.";
  }
}

start();
