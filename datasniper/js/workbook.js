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
