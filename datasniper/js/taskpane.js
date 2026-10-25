import { clampRect, fieldRectForDocument, highlightRectForValue, normalizeDrag, pageHasTextLayer, parseAmount, textRectsForItems } from "./extract.js";
import { finishLabels } from "./labels.js";
import { extractFromDocument, loadDocument, pageGeometry, renderImage, renderPdfPage } from "./pdf-engine.js";
import { applyLowConfidenceMarks, clearTable, tableExists, updateCell, watchSelection, writeTable } from "./excel-bridge.js";
import { buildWorkbookRecord, clashesWithAnotherField, replaceWorkbookRecord } from "./workbook.js";
import { clearStoredFiles, createId, getDocument, loadSession, saveDocument, saveSession } from "./store.js";

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
let dialogMode = null;
let dialogToken = 0;
let watching = false;
const latestUpdate = new Map();
let updateChain = Promise.resolve();
let excelReady = false;
let drawing = null;
let pageTextGeometry = null;

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
const openViewerButton = document.querySelector("#open-viewer");
const reattachBanner = document.querySelector("#reattach");
const reattachName = document.querySelector("#reattach-name");
let reattachQueue = [];

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

function showReattach() {
  const current = reattachQueue[0];
  if (!reattachBanner || !reattachName) return;
  if (!current) {
    reattachBanner.hidden = true;
    reattachName.textContent = "";
    return;
  }
  reattachName.textContent = current.name;
  reattachBanner.hidden = false;
}

async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (reattachQueue.length) {
    const wanted = reattachQueue[0];
    const file = files.find((item) => item.name === wanted.name);
    if (!file) {
      setStatus(`Choose ${wanted.name} to open that row again.`);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      await saveDocument({ id: wanted.docId, name: file.name, mime, bytes });
      await hydrateRecord({ id: wanted.docId, name: file.name, mime, bytes });
      reattachQueue = reattachQueue.filter((item) => item.docId !== wanted.docId);
      if (!model.activeId) {
        model.activeId = wanted.docId;
        model.page = 1;
      }
      await persist();
      showReattach();
      await renderAll();
      const rest = reattachQueue.map((item) => item.name).join(", ");
      setStatus(rest ? `Re-attached ${file.name}. Still missing ${rest}.` : `Re-attached ${file.name}.`);
    } catch (error) {
      setStatus(`${file.name}: ${error.message || "Could not open that file."}`);
    }
    return;
  }
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
    const names = layout.sampleFiles || layout.documents.map((entry) => entry.file);
    for (const name of names) {
      const fileResponse = await fetch(`samples/${name}`);
      if (!fileResponse.ok) throw new Error(`Missing ${name}`);
      const bytes = new Uint8Array(await fileResponse.arrayBuffer());
      files.push({ name, type: "application/pdf", arrayBuffer: async () => bytes.buffer.slice(0) });
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
    button.title = doc.name;
    button.textContent = `${index + 1}. ${doc.name}`;
    button.addEventListener("click", () => {
      model.activeId = doc.id;
      model.page = 1;
      persist();
      renderAll();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary remove-doc";
    remove.dataset.docId = doc.id;
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${doc.name}`);
    item.append(button, remove);
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
  openViewerButton.disabled = !doc;
  emptyState.hidden = Boolean(doc);
  viewer.hidden = !doc;
  exportButton.disabled = !model.docs.length || !model.snips.length;
  const clearDocs = document.querySelector("#clear-docs");
  if (clearDocs) clearDocs.hidden = model.docs.length === 0;
}

async function renderPage() {
  const doc = activeDoc();
  overlay.replaceChildren();
  if (!doc) {
    canvas.width = 0;
    canvas.height = 0;
    return;
  }
  if (doc.kind === "pdf") {
    await renderPdfPage(doc.pdf, model.page, canvas);
    pageTextGeometry = await pageGeometry(doc, model.page);
  } else {
    renderImage(doc.image, canvas);
    pageTextGeometry = null;
  }
  paintBoxes();
}

function paintBoxes() {
  overlay.querySelectorAll(".snip-box, .draw-rect").forEach((node) => node.remove());
  const geometry = pageTextGeometry;
  model.snips.forEach((snip, index) => {
    if ((snip.page || 1) !== model.page) return;
    const shown = geometry
      ? highlightRectForValue(geometry.items, geometry.pageWidth, geometry.pageHeight, snip)
      : snip;
    const box = document.createElement("div");
    box.className = "snip-box";
    box.dataset.snipId = snip.id;
    const color = colorFor(index);
    box.style.left = `${shown.x * 100}%`;
    box.style.top = `${shown.y * 100}%`;
    box.style.width = `${shown.w * 100}%`;
    box.style.height = `${shown.h * 100}%`;
    box.style.borderColor = color;
    box.style.background = rgba(color, 0.18);
    const label = document.createElement("span");
    label.textContent = snip.name || "Snip";
    label.style.background = rgba(color, 0.55);
    box.append(label);
    overlay.append(box);
  });
  finishLabels(overlay, {
    chipsOnly: true,
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

function renderPreview(headers, matrix, cells) {
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
    const low = (cells?.[rowIndex] || []).some((detail) => detail?.confidence === "low");
    if (low) tr.className = "low";
    row.forEach((value, colIndex) => {
      const cell = document.createElement("td");
      cell.textContent = value == null ? "" : String(value);
      cell.dataset.previewRow = String(rowIndex);
      cell.dataset.previewCol = String(colIndex);
      const detail = cells?.[rowIndex]?.[colIndex];
      if (detail?.raw != null && detail.raw !== "" && String(detail.raw) !== String(value)) cell.title = detail.raw;
      if (detail?.confidence === "low") cell.dataset.confidence = "low";
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
  pushViewerState();
}

function pointerNorm(event) {
  const bounds = overlay.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  };
}

function addSnip(rect, options = {}) {
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
  pushViewerState();
  if (options.silent) return snip;
  const input = snipList.querySelector(`[data-snip-id="${snip.id}"] .snip-name`);
  input?.focus();
  input?.select();
  return snip;
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
  pushViewerState();
});

snipList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-snip");
  if (!button) return;
  const row = button.closest(".snip-row");
  model.snips = model.snips.filter((item) => item.id !== row.dataset.snipId);
  persist();
  renderSnips();
  paintBoxes();
  pushViewerState();
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
    pushViewerState();
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
});

function amountFormat(raw) {
  return /[$€£]|\b(USD|EUR|GBP|CAD|AUD)\b/i.test(raw || "") ? "$#,##0.00" : "#,##0.00";
}

async function saveWorkbookSettings() {
  if (!excelReady || !meta) return;
  const hasLinks = Boolean(meta.links && Object.keys(meta.links).length);
  Office.context.document.settings.set(SETTINGS_KEY, JSON.stringify(meta));
  Office.context.document.settings.set("Office.AutoShowTaskpaneWithDocument", hasLinks);
  await new Promise((resolve) => Office.context.document.settings.saveAsync(resolve));
  if (hasLinks && Office.addin && Office.StartupBehavior && typeof Office.addin.setStartupBehavior === "function") {
    try {
      await Office.addin.setStartupBehavior(Office.StartupBehavior.load);
    } catch (error) {
      /* The document setting still reopens the pane on hosts without startup behavior. */
    }
  }
}

function linkFor(docId, snipId) {
  if (!meta?.links || !meta.columns || !meta.rows || !snipId) return null;
  const row = meta.rows.indexOf(docId);
  const col = meta.columns.indexOf(snipId);
  if (row < 0 || col < 0) return null;
  return meta.links[`${row}:${col}`] || null;
}

function resolvedPayload(docId, snipId) {
  const link = linkFor(docId, snipId);
  if (!link?.rect) return null;
  return {
    rect: link.rect,
    confidence: link.confidence || "high",
    reason: link.reason || "",
    label: link.label || "",
    raw: link.raw || "",
  };
}

async function syncLowMarks() {
  const enabled = document.querySelector("#mark-low")?.checked !== false;
  if (meta) meta.markLowConfidence = enabled;
  if (!excelReady || !meta?.links) return "";
  const entries = Object.entries(meta.links).flatMap(([key, link]) => {
    if (!link || link.confidence !== "low") return [];
    const [row, col] = key.split(":").map(Number);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return [];
    return [{ row, col }];
  });
  const warning = await applyLowConfidenceMarks(entries, enabled);
  await saveWorkbookSettings();
  return warning || "";
}

async function readCell(doc, snip, template) {
  const override = model.overrides[doc.id]?.[snip.id];
  const base = override || snip;
  let placed = {
    rect: { x: base.x, y: base.y, w: base.w, h: base.h, page: base.page || snip.page || 1 },
    confidence: "high",
    reason: override ? "override" : "template",
    label: "",
  };
  const page = placed.rect.page;
  if (!override && template && doc.id !== template.id && doc.kind === "pdf" && template.kind === "pdf") {
    const templateGeometry = await pageGeometry(template, page);
    const targetGeometry = await pageGeometry(doc, page);
    if (templateGeometry && targetGeometry && pageHasTextLayer(templateGeometry.items) && pageHasTextLayer(targetGeometry.items)) {
      placed = fieldRectForDocument(
        templateGeometry.items,
        { width: templateGeometry.pageWidth, height: templateGeometry.pageHeight },
        targetGeometry.items,
        { width: targetGeometry.pageWidth, height: targetGeometry.pageHeight },
        placed.rect,
      );
    }
  }
  try {
    const result = await extractFromDocument(doc, placed.rect);
    const text = result.text || "";
    const amount = parseAmount(text);
    return {
      value: amount ? amount.value : text,
      raw: text,
      number: amount ? amount.value : null,
      page: placed.rect.page || page,
      rect: placed.rect,
      confidence: placed.confidence,
      reason: placed.reason,
      label: placed.label || "",
      source: result.source,
      format: amount ? amountFormat(text) : "General",
      error: "",
    };
  } catch (error) {
    return {
      value: "",
      raw: "",
      number: null,
      page,
      rect: placed.rect,
      confidence: "low",
      reason: "error",
      label: placed.label || "",
      source: "error",
      format: "General",
      error: error.message || "Extraction failed.",
    };
  }
}

async function exportAll() {
  if (!model.docs.length || !model.snips.length) return null;
  exportButton.disabled = true;
  const headers = ["Source document", ...model.snips.map((snip) => snip.name.trim() || "Snip")];
  const matrix = [];
  const bodyCells = [];
  const formats = [];
  const notes = [];
  const lowNames = [];
  const template = model.docs[0];
  try {
    for (let index = 0; index < model.docs.length; index += 1) {
      const doc = model.docs[index];
      setStatus(`Extracting ${index + 1} of ${model.docs.length}: ${doc.name}`);
      const row = [doc.name];
      const cells = [{
        raw: doc.name,
        number: null,
        page: 1,
        rect: null,
        confidence: "high",
        reason: "filename",
        label: "",
      }];
      const rowFormats = ["General"];
      for (const snip of model.snips) {
        const cell = await readCell(doc, snip, template);
        row.push(cell.value);
        cells.push(cell);
        rowFormats.push(cell.format);
        if (cell.error) notes.push(`${doc.name} / ${snip.name}: ${cell.error}`);
        if (cell.source === "ocr" && !cell.raw) notes.push(`${doc.name}: OCR returned no text for ${snip.name}.`);
        if (cell.confidence === "low" && !lowNames.includes(doc.name)) lowNames.push(doc.name);
      }
      matrix.push(row);
      bodyCells.push(cells);
      formats.push(rowFormats);
    }
    meta = replaceWorkbookRecord(meta, buildWorkbookRecord({
      columns: ["__source__", ...model.snips.map((snip) => snip.id)],
      docs: model.docs,
      snips: model.snips,
      cells: bodyCells,
      headers,
      matrix,
    }));
    await persist();
    if (excelReady) {
      await writeTable(headers, matrix, formats);
      await saveWorkbookSettings();
      await ensureSelection();
    }
    renderPreview(headers, matrix, bodyCells);
    try {
      const markWarning = await syncLowMarks();
      if (markWarning) notes.push(markWarning);
    } catch (error) {
      notes.push(error.message || "Could not mark the low-confidence cells.");
    }
    const excelNote = excelReady
      ? `Exported ${matrix.length} documents to the DataSniperExport table on the active sheet.`
      : `Prepared ${matrix.length} rows. Excel is not connected, so nothing was written to a workbook.`;
    const lowNote = lowNames.length ? ` Low confidence on ${lowNames.join(", ")}.` : "";
    setStatus([`${excelNote}${lowNote}`, ...notes].filter(Boolean).join(" "));
    return { count: matrix.length, lowNames };
  } catch (error) {
    setStatus(error.message || "Export failed.");
    return null;
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

function viewerUrl(docId) {
  const url = new URL("dialog.html", window.location.href);
  if (document.documentElement.dataset.harness === "1") url.searchParams.set("harness", "1");
  url.searchParams.set("mode", "viewer");
  url.searchParams.set("doc", docId);
  url.searchParams.set("page", String(model.page));
  return url.href;
}

function bindDialog(value, mode) {
  const token = ++dialogToken;
  dialog = value;
  dialogMode = mode;
  value.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
    Promise.resolve(onDialogMessage(arg)).catch((error) => setStatus(error.message || "Could not update the cell."));
  });
  value.addEventHandler(Office.EventType.DialogEventReceived, () => {
    if (token === dialogToken && dialog === value) {
      dialog = null;
      dialogMode = null;
    }
  });
}

async function closeDialog() {
  if (!dialog) return;
  const closing = dialog;
  dialogToken += 1;
  dialog = null;
  dialogMode = null;
  await new Promise((resolve) => {
    try {
      closing.close();
    } catch (error) {
      /* The host may already have closed it. */
    }
    const delay = document.documentElement.dataset.harness === "1" ? 0 : 250;
    setTimeout(resolve, delay);
  });
}

function openOfficeDialog(url, options, mode) {
  return new Promise((resolve) => {
    Office.context.ui.displayDialogAsync(url, options, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        setStatus(result.error?.message || "Excel could not open the dialog.");
        resolve();
        return;
      }
      bindDialog(result.value, mode);
      resolve();
    });
  });
}

function pushViewerState() {
  if (!dialog || dialogMode !== "viewer") return;
  const doc = activeDoc();
  try {
    dialog.messageChild(JSON.stringify({
      type: "session",
      docId: doc ? doc.id : null,
      page: model.page,
      snips: model.snips,
      overrides: model.overrides,
    }));
  } catch (error) {
    dialog = null;
    dialogMode = null;
  }
}

async function openPreview(docId, snipId) {
  if (dialog && dialogMode === "preview") {
    try {
      dialog.messageChild(JSON.stringify({
        type: "show",
        docId,
        snipId,
        resolved: resolvedPayload(docId, snipId),
      }));
      return;
    } catch (error) {
      dialog = null;
      dialogMode = null;
    }
  }
  await closeDialog();
  await openOfficeDialog(dialogUrl(docId, snipId), { height: 80, width: 70, displayInIframe: true }, "preview");
}

async function openLargeViewer() {
  const doc = activeDoc();
  if (!doc) {
    setStatus("Upload a document before opening the large viewer.");
    return;
  }
  if (dialog && dialogMode === "viewer") {
    pushViewerState();
    return;
  }
  await closeDialog();
  await openOfficeDialog(viewerUrl(doc.id), { height: 80, width: 80, displayInIframe: true }, "viewer");
}

function onDialogMessage(arg) {
  const message = JSON.parse(arg.message);
  if (message.type === "need-document" || message.type === "viewer-ready") {
    return sendDocument(message.docId || model.activeId, message.snipId || null);
  }
  if (message.type === "need-resolved") {
    if (!dialog) return null;
    const targetDoc = message.docId || null;
    const targetSnip = message.snipId || null;
    try {
      dialog.messageChild(JSON.stringify({
        type: "resolved",
        docId: targetDoc,
        snipId: targetSnip,
        resolved: resolvedPayload(targetDoc, targetSnip),
      }));
    } catch (error) {
      dialog = null;
      dialogMode = null;
    }
    return null;
  }
  if (message.type === "create-snip") {
    const doc = activeDoc();
    if (!doc) return null;
    model.page = Math.min(Math.max(1, message.page || model.page), doc.pageCount || 1);
    const rect = clampRect({
      x: message.x,
      y: message.y,
      w: message.w,
      h: message.h,
      page: model.page,
    });
    if (rect.w < 0.008 || rect.h < 0.008) return null;
    addSnip(rect, { silent: true });
    renderDocs();
    return renderPage();
  }
  if (message.type === "viewer-page") {
    const doc = activeDoc();
    if (!doc) return null;
    model.page = Math.min(Math.max(1, message.page || 1), doc.pageCount || 1);
    persist();
    return renderAll();
  }
  if (message.type === "apply-all") return applyBoxToAll(message);
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
  if (!meta) return;
  const row = meta.rows.indexOf(message.docId);
  const col = meta.columns.indexOf(message.snipId);
  if (row < 0 || col < 0) return;
  const previous = meta.links?.[`${row}:${col}`];
  const labelMatched = previous && previous.confidence === "low" && previous.reason === "shifted";
  if (labelMatched && clashesWithAnotherField(meta.links, row, col, message.text, message.rect)) {
    setStatus(`That box landed on another field. ${snip.name || "The snip"} stayed on the label match.`);
    try {
      dialog?.messageChild(JSON.stringify({
        type: "restore-rect",
        docId: message.docId,
        snipId: message.snipId,
        rect: previous.rect,
        text: previous.raw || "",
      }));
    } catch (error) {
      dialog = null;
      dialogMode = null;
    }
    return;
  }
  if (!model.overrides[message.docId]) model.overrides[message.docId] = {};
  model.overrides[message.docId][message.snipId] = clampRect({ ...message.rect, page: message.rect.page || snip.page || 1 });
  await persist();
  if ((latestUpdate.get(token) || 0) !== revision) return;
  const amount = parseAmount(message.text || "");
  const value = amount ? amount.value : (message.text || "");
  const format = amount ? amountFormat(message.text) : "General";
  if (excelReady) await updateCell(row, col, value, format);
  const cell = preview.querySelector(`[data-preview-row="${row}"][data-preview-col="${col}"]`);
  if (cell) {
    cell.textContent = value == null ? "" : String(value);
    if (amount) cell.title = message.text;
    else cell.removeAttribute("title");
  }
  const doc = model.docs.find((item) => item.id === message.docId);
  if (meta.links) {
    meta.links[`${row}:${col}`] = {
      docId: message.docId,
      name: doc ? doc.name : (meta.links[`${row}:${col}`]?.name || ""),
      page: message.rect?.page || snip.page || 1,
      rect: message.rect || null,
      confidence: "high",
      reason: "override",
      label: meta.links[`${row}:${col}`]?.label || "",
      raw: message.text || "",
      number: amount ? amount.value : null,
    };
    if (meta.matrix?.[row]) meta.matrix[row][col] = value;
    await saveWorkbookSettings();
  }
  setStatus(`Updated ${snip.name || "snip"} on ${doc ? doc.name : "that document"}.`);
}

async function applyBoxToAll(message) {
  const snip = model.snips.find((item) => item.id === message.snipId);
  if (!snip || !message.rect) return;
  const rect = clampRect({ ...message.rect, page: message.rect.page || snip.page || 1 });
  snip.x = rect.x;
  snip.y = rect.y;
  snip.w = rect.w;
  snip.h = rect.h;
  snip.page = rect.page;
  for (const docId of Object.keys(model.overrides)) {
    if (model.overrides[docId]) delete model.overrides[docId][snip.id];
  }
  await persist();
  renderSnips();
  paintBoxes();
  const loaded = new Set(model.docs.map((doc) => doc.name));
  const missing = (meta?.names || []).filter((name) => name && !loaded.has(name));
  const result = await exportAll();
  if (!result) return;
  const missingNote = missing.length
    ? ` These files were not loaded, so this export does not include them: ${missing.join(", ")}.`
    : "";
  setStatus(`Applied this box to all ${result.count} documents.${missingNote}`);
}

async function restoreWorkbook() {
  if (!meta || meta.version !== 2) return;
  if (!model.snips.length && Array.isArray(meta.snips)) {
    model.snips = meta.snips.map((snip) => ({ ...snip }));
  }
  const missing = [];
  const rows = meta.rows || [];
  for (let index = 0; index < rows.length; index += 1) {
    const id = rows[index];
    if (model.docs.some((doc) => doc.id === id)) continue;
    let record = null;
    try {
      record = await getDocument(id);
    } catch (error) {
      record = null;
    }
    if (record) await hydrateRecord(record);
    else missing.push({ docId: id, name: meta.names?.[index] || "document" });
  }
  reattachQueue = missing;
  showReattach();
  if (!model.activeId && model.docs.length) model.activeId = model.docs[0].id;
  if (excelReady && Array.isArray(meta.headers) && Array.isArray(meta.matrix) && meta.headers.length) {
    const exists = await tableExists();
    if (!exists) await writeTable(meta.headers, meta.matrix);
  }
  const markBox = document.querySelector("#mark-low");
  if (markBox) markBox.checked = meta.markLowConfidence !== false;
  try {
    const markWarning = await syncLowMarks();
    if (markWarning) setStatus(markWarning);
  } catch (error) {
    setStatus(error.message || "Could not restore the low-confidence marks.");
  }
}

async function removeDocument(id) {
  const doc = model.docs.find((item) => item.id === id);
  model.docs = model.docs.filter((item) => item.id !== id);
  delete model.overrides[id];
  if (model.activeId === id) {
    model.activeId = model.docs[0]?.id || null;
    model.page = 1;
  }
  await persist();
  await renderAll();
  if (meta?.rows?.includes(id)) {
    if (model.docs.length && model.snips.length) await exportAll();
    else await clearSheetExport();
  }
  setStatus(doc ? `Removed ${doc.name}.` : "Removed that document.");
}

async function clearAllDocuments(deleteTable) {
  model.docs = [];
  model.overrides = {};
  model.activeId = null;
  model.page = 1;
  pageTextGeometry = null;
  reattachQueue = [];
  showReattach();
  await clearStoredFiles();
  await persist();
  await renderAll();
  if (deleteTable && meta) {
    await clearSheetExport();
    setStatus("Cleared every document and the Excel table.");
    return;
  }
  const kept = !deleteTable && excelReady && meta && await tableExists();
  setStatus(kept
    ? "Cleared every document. The Excel table is still on the sheet."
    : "Cleared every document.");
}

async function requestClearAll() {
  const hasTable = Boolean(excelReady && meta && await tableExists());
  const confirm = document.querySelector("#clear-confirm");
  if (!hasTable || !confirm) {
    await clearAllDocuments(false);
    return;
  }
  confirm.hidden = false;
}

async function clearSheetExport() {
  meta = {
    version: 2,
    columns: ["__source__", ...model.snips.map((snip) => snip.id)],
    rows: [],
    names: [],
    snips: model.snips.map((snip) => ({ ...snip })),
    headers: [],
    matrix: [],
    links: {},
    markLowConfidence: document.querySelector("#mark-low")?.checked !== false,
  };
  if (excelReady) {
    await clearTable();
    await saveWorkbookSettings();
  }
  previewWrap.hidden = true;
  preview.replaceChildren();
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
    resolved: resolvedPayload(record.id, snipId),
    page: model.page,
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
document.querySelector("#clear-docs").addEventListener("click", () => {
  requestClearAll().catch((error) => setStatus(error.message || "Could not clear the documents."));
});
document.querySelector("#clear-cancel").addEventListener("click", () => {
  document.querySelector("#clear-confirm").hidden = true;
});
document.querySelector("#clear-keep").addEventListener("click", () => {
  document.querySelector("#clear-confirm").hidden = true;
  clearAllDocuments(false).catch((error) => setStatus(error.message || "Could not clear the documents."));
});
document.querySelector("#clear-delete").addEventListener("click", () => {
  document.querySelector("#clear-confirm").hidden = true;
  clearAllDocuments(true).catch((error) => setStatus(error.message || "Could not clear the documents."));
});
document.querySelector("#mark-low").addEventListener("change", () => {
  syncLowMarks().then((warning) => {
    if (warning) setStatus(warning);
  }).catch((error) => setStatus(error.message || "Could not update the low-confidence marks."));
});
docList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-doc");
  if (!button) return;
  removeDocument(button.dataset.docId).catch((error) => setStatus(error.message || "Could not remove that document."));
});
exportButton.addEventListener("click", () => exportAll());
openViewerButton.addEventListener("click", () => openLargeViewer());
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
  try {
    await restoreWorkbook();
  } catch (error) {
    setStatus(error.message || "Could not restore the workbook.");
  }
  if (excelReady) {
    try {
      await ensureSelection();
    } catch (error) {
      setStatus(error.message || "Could not watch the sheet selection.");
    }
  }
  await renderAll();
  const starterLink = document.querySelector("#starter-link");
  if (starterLink && location.hostname.endsWith("github.io")) {
    starterLink.href = "DataSniper-Starter-alt.xlsx";
    starterLink.setAttribute("download", "DataSniper-Starter-alt.xlsx");
  }
  document.documentElement.dataset.datasniperReady = "1";
}

if (document.documentElement.dataset.harness === "1" && window.__datasniper) {
  window.__datasniper.dropDocument = (name) => {
    model.docs = model.docs.filter((doc) => doc.name !== name);
    if (!model.docs.some((doc) => doc.id === model.activeId)) {
      model.activeId = model.docs[0]?.id || null;
      model.page = 1;
    }
    return renderAll();
  };
  window.__datasniper.model = () => ({
    snips: model.snips.map((snip) => ({ ...snip })),
    overrides: JSON.parse(JSON.stringify(model.overrides)),
    docs: model.docs.map((doc) => ({ id: doc.id, name: doc.name })),
  });
  window.__datasniper.clearStoredFiles = () => clearStoredFiles();
}

start().catch((error) => setStatus(error.message || "DataSniper failed to start."));
