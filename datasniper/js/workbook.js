/**
 * The workbook keeps the template and one source link per exported cell.
 * A later export replaces that record. Merging would leave links for rows
 * or columns the new grid no longer has.
 */

export function buildWorkbookRecord({ columns, docs, snips, cells, headers, matrix }) {
  const links = {};
  docs.forEach((doc, row) => {
    (cells[row] || []).forEach((cell, col) => {
      links[`${row}:${col}`] = {
        docId: doc.id,
        name: doc.name,
        page: cell.page || 1,
        rect: cell.rect || null,
        confidence: cell.confidence || "high",
        reason: cell.reason || "",
        label: cell.label || "",
        raw: cell.raw ?? "",
        number: cell.number ?? null,
      };
    });
  });
  return {
    version: 2,
    columns: columns.slice(),
    rows: docs.map((doc) => doc.id),
    names: docs.map((doc) => doc.name),
    snips: snips.map((snip) => ({ ...snip })),
    headers: headers.slice(),
    matrix: matrix.map((row) => row.slice()),
    links,
  };
}

export function replaceWorkbookRecord(previous, next) {
  if (!next) return previous || null;
  return next;
}

function normalizeFieldText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function borrowsFieldText(next, previous) {
  if (!next || !previous || next === previous) return next === previous && Boolean(next);
  const short = next.length < previous.length ? next : previous;
  const long = next.length < previous.length ? previous : next;
  return short.length >= 12 && long.startsWith(short);
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  if ((a.page || 1) !== (b.page || 1)) return false;
  const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapW <= 0 || overlapH <= 0) return false;
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 && (overlapW * overlapH) / smaller >= 0.35;
}

export function clashesWithAnotherField(links, row, col, text, rect) {
  if (!links) return false;
  const normalized = normalizeFieldText(text);
  return Object.entries(links).some(([key, link]) => {
    const [linkRow, linkCol] = key.split(":").map(Number);
    if (linkRow !== row || linkCol === col || !link) return false;
    const other = normalizeFieldText(link.raw);
    if (normalized && borrowsFieldText(normalized, other)) return true;
    return rectsOverlap(rect, link.rect);
  });
}
