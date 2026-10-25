import { clampRect } from "./extract.js";
import { extractFromDocument, loadDocument, renderImage, renderPdfPage } from "./pdf-engine.js";
import { getDocument, loadSession } from "./store.js";

const COLORS = ["#0f6e6b", "#b45309", "#9f1239", "#1d4ed8", "#6d28d9", "#3f6212"];
const params = new URLSearchParams(window.location.search);

const title = document.querySelector("#doc-title");
const snipTitle = document.querySelector("#snip-title");
const liveText = document.querySelector("#live-text");
const sourceLabel = document.querySelector("#source-label");
const canvas = document.querySelector("#page-canvas");
const overlay = document.querySelector("#overlay");
const viewer = document.querySelector("#viewer");
const emptyState = document.querySelector("#empty-state");

let session = { snips: [], overrides: {} };
let opened = null;
let docId = params.get("doc");
let snipId = params.get("snip");
let activeRect = null;
let drag = null;
let extractTimer = 0;
let revision = 0;

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

function rectFor(id) {
  const snip = session.snips.find((item) => item.id === id);
  if (!snip) return null;
  return session.overrides?.[docId]?.[id] || snip;
}

function post(message) {
  Office.context.ui.messageParent(JSON.stringify(message));
}

function visibleSnips() {
  const page = activeRect?.page || currentSnip()?.page || 1;
  if (snipId) {
    const snip = currentSnip();
    return snip ? [snip] : [];
  }
  return session.snips.filter((snip) => (snip.page || 1) === page);
}

function paint() {
  overlay.replaceChildren();
  const page = activeRect?.page || 1;
  visibleSnips().forEach((snip) => {
    const index = session.snips.findIndex((item) => item.id === snip.id);
    const rect = snip.id === snipId && activeRect ? activeRect : rectFor(snip.id);
    if (!rect || (rect.page || 1) !== page) return;
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
    label.style.background = color;
    box.append(label);
    if (!snipId || snip.id === snipId) {
      for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
        const node = document.createElement("i");
        node.className = `handle handle-${handle}`;
        node.dataset.handle = handle;
        box.append(node);
      }
    }
    overlay.append(box);
  });
}

async function render() {
  if (!opened) return;
  const page = activeRect?.page || currentSnip()?.page || 1;
  if (opened.kind === "pdf") {
    if (page <= opened.pageCount) await renderPdfPage(opened.pdf, page, canvas);
  } else {
    renderImage(opened.image, canvas);
  }
  viewer.hidden = false;
  emptyState.hidden = true;
  paint();
}

async function showText() {
  if (!opened || !activeRect) return;
  const result = await extractFromDocument(opened, activeRect);
  liveText.textContent = result.text || "(empty)";
  sourceLabel.textContent = result.source === "ocr" ? "OCR" : "Text layer";
  const snip = currentSnip();
  if (snip) snipTitle.textContent = snip.name || "Snip";
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

overlay.addEventListener("pointerdown", (event) => {
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
  if (!drag) return;
  activeRect = resized(drag.origin, drag.start, pointerNorm(event), drag.mode);
  activeRect.page = drag.origin.page || 1;
  paint();
  scheduleExtract(false);
});

overlay.addEventListener("pointerup", () => {
  if (!drag) return;
  drag = null;
  scheduleExtract(true);
});

async function openRecord(record, nextSession) {
  if (nextSession) session = nextSession;
  opened = await loadDocument(record.bytes, record.mime);
  opened.id = record.id;
  docId = record.id;
  title.textContent = record.name;
  const snip = currentSnip();
  const rect = snip ? rectFor(snip.id) : null;
  activeRect = rect ? { ...rect, page: rect.page || snip.page || 1 } : null;
  snipTitle.textContent = snip ? snip.name : "All snips";
  await render();
  if (snip) await showText();
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
  if (message.type === "show") {
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
    session = { snips: incoming.meta.snips || [], overrides: incoming.meta.overrides || {} };
    openRecord(record, session).catch((error) => {
      liveText.textContent = error.message || "Could not open that document.";
    });
  }
}

async function start() {
  await Office.onReady();
  if (Office.context.ui.addHandlerAsync && Office.EventType.DialogParentMessageReceived) {
    Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg) => {
      onParentMessage(arg.message);
    });
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
    await openRecord(record, session);
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = error.message || "Could not open that document.";
  }
}

start();
