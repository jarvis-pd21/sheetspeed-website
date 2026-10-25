const TABLE = "DataSniperExport";

let queue = Promise.resolve();

function enqueue(batch) {
  const job = queue.then(() => Excel.run(batch));
  queue = job.catch(() => {});
  return job;
}

export function columnName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function address(row, col, rowCount = 1, colCount = 1) {
  const start = `${columnName(col)}${row + 1}`;
  const end = `${columnName(col + colCount - 1)}${row + rowCount}`;
  return start === end ? start : `${start}:${end}`;
}

export function writeTable(headers, matrix, formats) {
  const values = [headers, ...matrix];
  const target = address(0, 0, values.length, headers.length);
  return enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const existing = sheet.tables.getItemOrNullObject(TABLE);
    existing.load("isNullObject");
    await context.sync();
    if (!existing.isNullObject) {
      const range = existing.getRange();
      range.load("rowIndex, columnIndex, rowCount, columnCount");
      await context.sync();
      const oldAddress = address(range.rowIndex, range.columnIndex, range.rowCount, range.columnCount);
      existing.delete();
      sheet.getRange(oldAddress).clear();
      await context.sync();
    }
    const range = sheet.getRange(target);
    range.values = values;
    if (formats) range.numberFormat = [headers.map(() => "General"), ...formats];
    const table = sheet.tables.add(target, true);
    table.name = TABLE;
    await context.sync();
  });
}

export function updateCell(row, col, value, format) {
  return enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const table = sheet.tables.getItem(TABLE);
    const body = table.getDataBodyRange();
    body.load("rowIndex, columnIndex");
    await context.sync();
    const cell = sheet.getRange(address(body.rowIndex + row, body.columnIndex + col));
    cell.values = [[value]];
    if (format) cell.numberFormat = [[format]];
    await context.sync();
  });
}

export function tableExists() {
  return enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const existing = sheet.tables.getItemOrNullObject(TABLE);
    existing.load("isNullObject");
    await context.sync();
    return !existing.isNullObject;
  });
}

export function clearTable() {
  return enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const existing = sheet.tables.getItemOrNullObject(TABLE);
    existing.load("isNullObject");
    await context.sync();
    if (existing.isNullObject) return;
    const range = existing.getRange();
    range.load("rowIndex, columnIndex, rowCount, columnCount");
    await context.sync();
    const oldAddress = address(range.rowIndex, range.columnIndex, range.rowCount, range.columnCount);
    existing.delete();
    sheet.getRange(oldAddress).clear();
    await context.sync();
  });
}

export const LOW_CONFIDENCE_NOTE = "DataSniper: matched by label";
const LOW_CONFIDENCE_FILL = "#FDE7C7";

async function dataCells(context, entries) {
  const sheet = context.workbook.worksheets.getActiveWorksheet();
  const table = sheet.tables.getItemOrNullObject(TABLE);
  table.load("isNullObject");
  await context.sync();
  if (table.isNullObject) return { sheet, cells: [] };
  const body = table.getDataBodyRange();
  body.load("rowIndex, columnIndex");
  await context.sync();
  const cells = entries.map((entry) => sheet.getRange(address(body.rowIndex + entry.row, body.columnIndex + entry.col)));
  return { sheet, cells };
}

async function stripLowNotes(context, sheet) {
  if (!sheet.comments || typeof sheet.comments.load !== "function") return;
  const comments = sheet.comments;
  comments.load("items");
  await context.sync();
  const items = comments.items || [];
  items.forEach((item) => item.load && item.load("content"));
  await context.sync();
  items.forEach((item) => {
    if (item.content === LOW_CONFIDENCE_NOTE && typeof item.delete === "function") item.delete();
  });
  await context.sync();
}

export function applyLowConfidenceMarks(entries, enabled) {
  const paint = enqueue(async (context) => {
    const { cells } = await dataCells(context, entries);
    cells.forEach((cell) => {
      if (enabled) cell.format.fill.color = LOW_CONFIDENCE_FILL;
      else cell.format.fill.clear();
    });
    await context.sync();
  });
  return paint.then(() => enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    await stripLowNotes(context, sheet);
    if (!enabled || !sheet.comments || typeof sheet.comments.add !== "function") return;
    const { cells } = await dataCells(context, entries);
    cells.forEach((cell) => {
      sheet.comments.add(cell, { content: LOW_CONFIDENCE_NOTE, contentType: "Plain" });
    });
    await context.sync();
  }).catch(() => {}));
}

export function watchSelection(handler) {
  return enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    sheet.onSelectionChanged.add(async () => {
      try {
        const hit = await locateSelection();
        await handler(hit);
      } catch (error) {
        console.error(error);
      }
    });
    await context.sync();
  });
}

function locateSelection() {
  return enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const table = sheet.tables.getItemOrNullObject(TABLE);
    table.load("isNullObject");
    await context.sync();
    if (table.isNullObject) return null;
    const body = table.getDataBodyRange();
    body.load("rowIndex, columnIndex, rowCount, columnCount");
    const selected = context.workbook.getSelectedRange();
    selected.load("rowIndex, columnIndex");
    await context.sync();
    const row = selected.rowIndex - body.rowIndex;
    const col = selected.columnIndex - body.columnIndex;
    if (row < 0 || col < 0 || row >= body.rowCount || col >= body.columnCount) return null;
    return { row, col };
  });
}
