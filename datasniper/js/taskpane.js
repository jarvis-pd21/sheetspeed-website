import { clampRect, normalizeDrag } from "./extract.js";
import { extractFromDocument, loadDocument, renderImage, renderPdfPage } from "./pdf-engine.js";
import { updateCell, watchSelection, writeTable } from "./excel-bridge.js";
import { createId, getDocument, loadSession, saveDocument, saveSession } from "./store.js";

const SETTINGS_KEY = "datasniper.v1";
const COLORS = ["#0f6e6b", "#b45309", "#9f1239", "#1d4ed8", "#6d28d9", "#3f6212"];

const model = {
  docs: [],
  activeId: null,
  page: 1,
  snips: [],
  overrides: {},
};

let meta = null;
let dialog = null;
let watching = false;
const latestUpdate = new Map();
let updateChain = Promise.resolve();
let excelReady = false;
let drawing = null;

const fileInput = document.querySelector("#file-input");
const uploadButton = document.querySelector("#upload-btn");
const samplesButton = document.querySelector("#load-samples");
const exportButton = document.querySelector("#export-btn");
const docList = document.querySelector("#doc-list");
const docSelect = document.querySelector("#doc-select");
const snipList = document.querySelector("#snip-list");
const overlay = document.querySelector("#overlay");
const canvas = document.querySelector("#page-canvas");
const viewer = document.querySelector("#viewer");
const emptyState = document.querySelector("#empty-state");
const pageLabel = document.querySelector("#page-label");
const prevPage = document.querySelector("#prev-page");
const nextPage = document.querySelector("#next-page");
const statusLine = document.querySelector("#status");
const previewWrap = document.querySelector("#preview-wrap");
const preview = document.querySelector("#preview");
const hostBanner = document.querySelector("#host-banner");

function setStatus(message) {
  statusLine.textContent = message || "";
}

function colorFor(index) {
  return COLORS[index % COLORS.length];
}

function rgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function activeDoc() {
  return model.docs.find((doc) => doc.id === model.activeId) || null;
}

function persist() {
  return saveSession({
    docIds: model.docs.map((doc) => doc.id),
    activeId: model.activeId,
    page: model.page,
    snips: model.snips,
    overrides: model.overrides,
  }).catch((error) => setStatus(error.message || "Could not store the session."));
}

function rectFor(docId, snip) {
  return model.overrides[docId]?.[snip.id] || snip;
}

async function hydrateRecord(record) {
  const opened = await loadDocument(record.bytes, record.mime);
  const doc = {
    id: record.id,
    name: record.name,
    mime: record.mime,
    bytes: record.bytes,
    kind: opened.kind,
    pdf: opened.pdf,
    image: opened.image,
    pageCount: opened.pageCount,
  };
  model.docs.push(doc);
  return doc;
}

async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  setStatus(`Reading ${files.length} document${files.length === 1 ? "" : "s"}…`);
  let added = 0;
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      const id = createId();
      await saveDocument({ id, name: file.name, mime, bytes });
      await hydrateRecord({ id, name: file.name, mime, bytes });
      added += 1;
    } catch (error) {
      setStatus(`${file.name}: ${error.message || "Could not open that file."}`);
    }
  }
  if (!model.activeId && model.docs.length) {
    model.activeId = model.docs[0].id;
    model.page = 1;
  }
  await persist();
  await renderAll();
  if (added) {
    setStatus(`Loaded ${model.docs.length} document${model.docs.length === 1 ? "" : "s"}. Draw a box on the page to create a snip.`);
  }
}

async function loadSamples() {
  samplesButton.disabled = true;
  try {
    const response = await fetch("samples/layout.json");
    if (!response.ok) throw new Error("Sample list was not found.");
    const layout = await response.json();
    const files = [];
    for (const entry of layout.documents) {
      const fileResponse = await fetch(`samples/${entry.file}`);
      if (!fileResponse.ok) throw new Error(`Missing ${entry.file}`);
      const bytes = new Uint8Array(await fileResponse.arrayBuffer());
      files.push({ name: entry.file, type: "application/pdf", arrayBuffer: async () => bytes.buffer.slice(0) });
    }
    await addFiles(files);
  } catch (error) {
    setStatus(error.message || "Could not load the samples.");
  } finally {
    samplesButton.disabled = false;
  }
}

function renderDocs() {
  docList.replaceChildren();
  docSelect.replaceChildren();
  model.docs.forEach((doc, index) => {
    const item = document.createElement("li");
    item.className = doc.id === model.activeId ? "active" : "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "doc-button";
    button.textContent = `${index + 1}. ${doc.name}`;
    button.addEventListener("click", () => {
      model.activeId = doc.id;
      model.page = 1;
      persist();
      renderAll();
    });
    item.append(button);
    docList.append(item);

    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.name;
    option.selected = doc.id === model.activeId;
    docSelect.append(option);
  });
  const doc = activeDoc();
  const pages = doc ? doc.pageCount : 1;
  if (model.page > pages) model.page = pages;
  if (model.page < 1) model.page = 1;
  pageLabel.textContent = doc ? `Page ${model.page} of ${pages}` : "No document";
  prevPage.disabled = !doc || model.page <= 1;
  nextPage.disabled = !doc || model.page >= pages;
  emptyState.hidden = Boolean(doc);
  viewer.hidden = !doc;
  exportButton.disabled = !model.docs.length || !model.snips.length;
}

async function renderPage() {
  const doc = activeDoc();
  overlay.replaceChildren();
  if (!doc) {
    canvas.width = 0;
    canvas.height = 0;
    return;
  }
  if (doc.kind === "pdf") await renderPdfPage(doc.pdf, model.page, canvas);
  else renderImage(doc.image, canvas);
  paintBoxes();
}

function paintBoxes() {
  overlay.querySelectorAll(".snip-box, .draw-rect").forEach((node) => node.remove());
  model.snips.forEach((snip, index) => {
    if ((snip.page || 1) !== model.page) return;
    const box = document.createElement("div");
    box.className = "snip-box";
    box.dataset.snipId = snip.id;
    const color = colorFor(index);
    box.style.left = `${snip.x * 100}%`;
    box.style.top = `${snip.y * 100}%`;
    box.style.width = `${snip.w * 100}%`;
    box.style.height = `${snip.h * 100}%`;
    box.style.borderColor = color;
    box.style.background = rgba(color, 0.18);
    const label = document.createElement("span");
    label.textContent = snip.name || "Snip";
    label.style.background = color;
    box.append(label);
    overlay.append(box);
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

function renderSnips() {
  snipList.replaceChildren();
  model.snips.forEach((snip, index) => {
    const row = document.createElement("li");
    row.className = "snip-row";
    row.dataset.snipId = snip.id;
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-label", `Drag to reorder ${snip.name || "snip"}`);
    handle.textContent = "⠿";
    const input = document.createElement("input");
    input.className = "snip-name";
    input.value = snip.name;
    input.setAttribute("aria-label", "Snip name");
    input.style.borderColor = colorFor(index);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary remove-snip";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${snip.name || "snip"}`);
    row.append(handle, input, remove);
    snipList.append(row);
  });
  exportButton.disabled = !model.docs.length || !model.snips.length;
}

function renderPreview(headers, matrix) {
  previewWrap.hidden = false;
  const table = document.createElement("table");
  const head = document.createElement("tr");
  headers.forEach((header) => {
    const cell = document.createElement("th");
    cell.textContent = header;
    head.append(cell);
  });
  table.append(head);
  matrix.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    row.forEach((value, colIndex) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      cell.dataset.previewRow = String(rowIndex);
      cell.dataset.previewCol = String(colIndex);
      tr.append(cell);
    });
    table.append(tr);
  });
  preview.replaceChildren(table);
}

async function renderAll() {
  renderDocs();
  renderSnips();
  await renderPage();
}

function pointerNorm(event) {
  const bounds = overlay.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  };
}

function addSnip(rect) {
  const snip = {
    id: createId(),
    name: `Field ${model.snips.length + 1}`,
    page: model.page,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
  };
  model.snips.push(snip);
  persist();
  renderSnips();
  paintBoxes();
  const input = snipList.querySelector(`[data-snip-id="${snip.id}"] .snip-name`);
  input?.focus();
  input?.select();
}

overlay.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !activeDoc()) return;
  overlay.setPointerCapture(event.pointerId);
  const point = pointerNorm(event);
  drawing = { start: point, current: point };
  paintBoxes();
});

overlay.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  drawing.current = pointerNorm(event);
  paintBoxes();
});

overlay.addEventListener("pointerup", (event) => {
  if (!drawing) return;
  const rect = normalizeDrag(drawing.start, pointerNorm(event));
  drawing = null;
  paintBoxes();
  if (rect.w < 0.008 || rect.h < 0.008) return;
  addSnip(rect);
});

overlay.addEventListener("pointercancel", () => {
  drawing = null;
  paintBoxes();
});

snipList.addEventListener("input", (event) => {
  const row = event.target.closest(".snip-row");
  if (!row || !event.target.classList.contains("snip-name")) return;
  const snip = model.snips.find((item) => item.id === row.dataset.snipId);
  if (!snip) return;
  snip.name = event.target.value;
  const handle = row.querySelector(".drag-handle");
  const remove = row.querySelector(".remove-snip");
  if (handle) handle.setAttribute("aria-label", `Drag to reorder ${snip.name || "snip"}`);
  if (remove) remove.setAttribute("aria-label", `Remove ${snip.name || "snip"}`);
  persist();
  paintBoxes();
});

snipList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-snip");
  if (!button) return;
  const row = button.closest(".snip-row");
  model.snips = model.snips.filter((item) => item.id !== row.dataset.snipId);
  persist();
  renderSnips();
  paintBoxes();
});

snipList.addEventListener("mousedown", (event) => {
  const handle = event.target.closest(".drag-handle");
  if (!handle || event.button !== 0) return;
  event.preventDefault();
  const row = handle.closest(".snip-row");
  const move = (moveEvent) => {
    const rows = [...snipList.querySelectorAll(".snip-row")].filter((item) => item !== row);
    let before = null;
    for (const candidate of rows) {
      const bounds = candidate.getBoundingClientRect();
      if (moveEvent.clientY < bounds.top + bounds.height / 2) {
        before = candidate;
        break;
      }
    }
    if (before) snipList.insertBefore(row, before);
    else snipList.append(row);
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    const order = [...snipList.querySelectorAll(".snip-row")].map((item) => item.dataset.snipId);
    model.snips.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    persist();
    renderSnips();
    paintBoxes();
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});

async function exportAll() {
  if (!model.docs.length || !model.snips.length) return;
  exportButton.disabled = true;
  const headers = ["Source document", ...model.snips.map((snip) => snip.name.trim() || "Snip")];
  const matrix = [];
  const notes = [];
  try {
    for (let index = 0; index < model.docs.length; index += 1) {
      const doc = model.docs[index];
      setStatus(`Extracting ${index + 1} of ${model.docs.length}: ${doc.name}`);
      const row = [doc.name];
      for (const snip of model.snips) {
        try {
          const result = await extractFromDocument(doc, rectFor(doc.id, snip));
          row.push(result.text);
          if (result.source === "ocr" && !result.text) notes.push(`${doc.name}: OCR returned no text for ${snip.name}.`);
        } catch (error) {
          row.push("");
          notes.push(`${doc.name} / ${snip.name}: ${error.message || "Extraction failed."}`);
        }
      }
      matrix.push(row);
    }
    meta = {
      columns: ["__source__", ...model.snips.map((snip) => snip.id)],
      rows: model.docs.map((doc) => doc.id),
    };
    await persist();
    if (excelReady) {
      await writeTable(headers, matrix);
      Office.context.document.settings.set(SETTINGS_KEY, JSON.stringify(meta));
      await new Promise((resolve) => Office.context.document.settings.saveAsync(resolve));
      await ensureSelection();
    }
    renderPreview(headers, matrix);
    const excelNote = excelReady
      ? `Exported ${matrix.length} documents to the DataSniperExport table on the active sheet.`
      : `Prepared ${matrix.length} rows. Excel is not connected, so nothing was written to a workbook.`;
    setStatus([excelNote, ...notes].join(" "));
  } catch (error) {
    setStatus(error.message || "Export failed.");
  } finally {
    exportButton.disabled = !model.docs.length || !model.snips.length;
  }
}

async function ensureSelection() {
  if (watching || !excelReady) return;
  watching = true;
  await watchSelection(async (hit) => {
    if (!hit || !meta) return;
    const docId = meta.rows[hit.row];
    const column = meta.columns[hit.col];
    if (!docId || !column) return;
    await openPreview(docId, column === "__source__" ? null : column);
  });
}

function dialogUrl(docId, snipId) {
  const url = new URL("dialog.html", window.location.href);
  if (document.documentElement.dataset.harness === "1") url.searchParams.set("harness", "1");
  url.searchParams.set("doc", docId);
  if (snipId) url.searchParams.set("snip", snipId);
  return url.href;
}

async function openPreview(docId, snipId) {
  if (dialog) {
    try {
      dialog.messageChild(JSON.stringify({ type: "show", docId, snipId }));
      return;
    } catch (error) {
      dialog = null;
    }
  }
  const url = dialogUrl(docId, snipId);
  await new Promise((resolve) => {
    Office.context.ui.displayDialogAsync(url, { height: 72, width: 55, displayInIframe: true }, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        setStatus(result.error?.message || "Excel could not open the preview.");
        resolve();
        return;
      }
      dialog = result.value;
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        Promise.resolve(onDialogMessage(arg)).catch((error) => setStatus(error.message || "Could not update the cell."));
      });
      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
        dialog = null;
      });
      resolve();
    });
  });
}

function onDialogMessage(arg) {
  const message = JSON.parse(arg.message);
  if (message.type === "need-document") return sendDocument(message.docId, message.snipId);
  if (message.type !== "update") return null;
  const token = `${message.docId}:${message.snipId}`;
  const revision = message.revision || 0;
  if (revision < (latestUpdate.get(token) || 0)) return null;
  latestUpdate.set(token, revision);
  const job = updateChain.then(() => applySnipUpdate(message, token, revision));
  updateChain = job.catch(() => {});
  return job;
}

async function applySnipUpdate(message, token, revision) {
  if ((latestUpdate.get(token) || 0) !== revision) return;
  const snip = model.snips.find((item) => item.id === message.snipId);
  if (!snip) return;
  if (!model.overrides[message.docId]) model.overrides[message.docId] = {};
  model.overrides[message.docId][message.snipId] = clampRect({ ...message.rect, page: message.rect.page || snip.page || 1 });
  await persist();
  if ((latestUpdate.get(token) || 0) !== revision) return;
  if (!meta) return;
  const row = meta.rows.indexOf(message.docId);
  const col = meta.columns.indexOf(message.snipId);
  if (row < 0 || col < 0) return;
  if (excelReady) await updateCell(row, col, message.text);
  const cell = preview.querySelector(`[data-preview-row="${row}"][data-preview-col="${col}"]`);
  if (cell) cell.textContent = message.text;
  const doc = model.docs.find((item) => item.id === message.docId);
  setStatus(`Updated ${snip.name || "snip"} on ${doc ? doc.name : "that document"}.`);
}

function bytesToBase64(bytes) {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

async function sendDocument(docId, snipId) {
  const doc = model.docs.find((item) => item.id === docId) || null;
  const record = doc || await getDocument(docId);
  if (!record || !dialog) return;
  const payload = {
    type: "doc-begin",
    id: record.id,
    name: record.name,
    mime: record.mime,
    snipId: snipId || null,
    snips: model.snips,
    overrides: model.overrides,
  };
  dialog.messageChild(JSON.stringify(payload));
  const encoded = bytesToBase64(record.bytes);
  const size = 20000;
  const total = Math.ceil(encoded.length / size) || 1;
  for (let index = 0; index < total; index += 1) {
    dialog.messageChild(JSON.stringify({
      type: "doc-chunk",
      index,
      total,
      data: encoded.slice(index * size, (index + 1) * size),
    }));
  }
  dialog.messageChild(JSON.stringify({ type: "doc-end" }));
}

uploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  addFiles(files);
});
samplesButton.addEventListener("click", () => loadSamples());
exportButton.addEventListener("click", () => exportAll());
docSelect.addEventListener("change", () => {
  model.activeId = docSelect.value;
  model.page = 1;
  persist();
  renderAll();
});
prevPage.addEventListener("click", () => {
  if (model.page > 1) {
    model.page -= 1;
    persist();
    renderAll();
  }
});
nextPage.addEventListener("click", () => {
  const doc = activeDoc();
  if (doc && model.page < doc.pageCount) {
    model.page += 1;
    persist();
    renderAll();
  }
});

document.querySelector("#app").addEventListener("dragover", (event) => {
  event.preventDefault();
});
document.querySelector("#app").addEventListener("drop", (event) => {
  event.preventDefault();
  if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
});

async function start() {
  const info = await Office.onReady();
  excelReady = info.host === Office.HostType.Excel;
  hostBanner.hidden = excelReady;
  try {
    const saved = Office.context.document.settings.get(SETTINGS_KEY);
    if (saved) meta = JSON.parse(saved);
  } catch (error) {
    meta = null;
  }
  try {
    const session = await loadSession();
    if (session) {
      model.snips = session.snips || [];
      model.overrides = session.overrides || {};
      model.page = session.page || 1;
      for (const id of session.docIds || []) {
        const record = await getDocument(id);
        if (record) await hydrateRecord(record);
      }
      model.activeId = model.docs.some((doc) => doc.id === session.activeId) ? session.activeId : model.docs[0]?.id || null;
    }
  } catch (error) {
    setStatus(error.message || "Could not restore saved documents.");
  }
  if (excelReady) {
    try {
      await ensureSelection();
    } catch (error) {
      setStatus(error.message || "Could not watch the sheet selection.");
    }
  }
  await renderAll();
}

start().catch((error) => setStatus(error.message || "DataSniper failed to start."));
