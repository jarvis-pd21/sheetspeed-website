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
  if (table.isNullObject) return { sheet, cells: [], addresses: [] };
  const body = table.getDataBodyRange();
  body.load("rowIndex, columnIndex");
  await context.sync();
  const addresses = entries.map((entry) => address(body.rowIndex + entry.row, body.columnIndex + entry.col));
  const cells = addresses.map((cellAddress) => sheet.getRange(cellAddress));
  return { sheet, cells, addresses };
}

function requirementSupported(version) {
  try {
    if (typeof Office === "undefined" || !Office.context?.requirements?.isSetSupported) return true;
    return Office.context.requirements.isSetSupported("ExcelApi", version);
  } catch (error) {
    return false;
  }
}

async function stripCollection(context, collection) {
  if (!collection || typeof collection.load !== "function") return;
  collection.load("items");
  await context.sync();
  const items = collection.items || [];
  items.forEach((item) => item.load && item.load("content"));
  await context.sync();
  items.forEach((item) => {
    if (item.content === LOW_CONFIDENCE_NOTE && typeof item.delete === "function") item.delete();
  });
  await context.sync();
}

async function writeCommentsOrNotes(entries, enabled) {
  try {
    await enqueue(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      try {
        await stripCollection(context, sheet.comments);
      } catch (error) {
        /* This Excel has no comment collection. */
      }
      try {
        await stripCollection(context, sheet.notes);
      } catch (error) {
        /* This Excel has no note collection. */
      }
    });
  } catch (error) {
    /* A host without comments or notes still keeps the fill. */
  }
  if (!enabled) return "";
  let commentProblem = "";
  if (!requirementSupported("1.10")) {
    commentProblem = "This Excel can't add comments.";
  } else {
    try {
      await enqueue(async (context) => {
        const sheet = context.workbook.worksheets.getActiveWorksheet();
        const { addresses } = await dataCells(context, entries);
        addresses.forEach((cellAddress) => {
          sheet.comments.add(cellAddress, LOW_CONFIDENCE_NOTE, Excel.ContentType.plain);
        });
        await context.sync();
      });
    } catch (error) {
      commentProblem = error.message || "Excel could not add the low-confidence comment.";
    }
  }
  if (!commentProblem) return "";
  if (!requirementSupported("1.18")) {
    return `${commentProblem} This Excel can't add notes either. Low-confidence cells keep the amber fill only.`;
  }
  try {
    await enqueue(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      if (!sheet.notes || typeof sheet.notes.add !== "function") {
        throw new Error("This Excel can't add notes.");
      }
      const { addresses } = await dataCells(context, entries);
      addresses.forEach((cellAddress) => {
        sheet.notes.add(cellAddress, LOW_CONFIDENCE_NOTE);
      });
      await context.sync();
    });
  } catch (error) {
    const noteProblem = error.message || "Excel could not add a note.";
    return `${commentProblem} ${noteProblem} Low-confidence cells keep the amber fill only.`;
  }
  return `${commentProblem} Low-confidence cells have a note instead.`;
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
  return paint.then(() => writeCommentsOrNotes(entries, enabled));
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
