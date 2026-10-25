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

export function writeTable(headers, matrix) {
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
    const table = sheet.tables.add(target, true);
    table.name = TABLE;
    await context.sync();
  });
}

export function updateCell(row, col, text) {
  return enqueue(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const table = sheet.tables.getItem(TABLE);
    const body = table.getDataBodyRange();
    body.load("rowIndex, columnIndex");
    await context.sync();
    const cell = sheet.getRange(address(body.rowIndex + row, body.columnIndex + col));
    cell.values = [[text]];
    await context.sync();
  });
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
