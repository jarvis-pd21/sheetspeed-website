(function () {
  var grid = {};
  var tables = [];
  var selection = { row: 0, col: 0 };
  var selectionHandlers = [];
  var settings = {};
  var top = window.parent === window;

  function key(row, col) {
    return row + "," + col;
  }

  function parseCell(cell) {
    var match = /^([A-Z]+)(\d+)$/.exec(cell);
    var col = 0;
    for (var i = 0; i < match[1].length; i += 1) {
      col = col * 26 + (match[1].charCodeAt(i) - 64);
    }
    return { col: col - 1, row: Number(match[2]) - 1 };
  }

  function parseAddress(address) {
    var parts = String(address).split(":");
    var start = parseCell(parts[0]);
    var end = parseCell(parts[1] || parts[0]);
    return {
      rowIndex: start.row,
      columnIndex: start.col,
      rowCount: end.row - start.row + 1,
      columnCount: end.col - start.col + 1,
    };
  }

  function Range(address) {
    var parsed = parseAddress(address);
    this.rowIndex = parsed.rowIndex;
    this.columnIndex = parsed.columnIndex;
    this.rowCount = parsed.rowCount;
    this.columnCount = parsed.columnCount;
  }

  Range.prototype.load = function () {};

  Object.defineProperty(Range.prototype, "values", {
    get: function () {
      var rows = [];
      for (var r = 0; r < this.rowCount; r += 1) {
        var row = [];
        for (var c = 0; c < this.columnCount; c += 1) {
          var value = grid[key(this.rowIndex + r, this.columnIndex + c)];
          row.push(value == null ? "" : value);
        }
        rows.push(row);
      }
      return rows;
    },
    set: function (values) {
      for (var r = 0; r < values.length; r += 1) {
        for (var c = 0; c < values[r].length; c += 1) {
          grid[key(this.rowIndex + r, this.columnIndex + c)] = values[r][c];
        }
      }
      renderGrid();
    },
  });

  Range.prototype.clear = function () {
    for (var r = 0; r < this.rowCount; r += 1) {
      for (var c = 0; c < this.columnCount; c += 1) {
        delete grid[key(this.rowIndex + r, this.columnIndex + c)];
      }
    }
    renderGrid();
  };

  function Table(address, hasHeaders) {
    this.name = "Table1";
    this.isNullObject = false;
    this._address = address;
    this._hasHeaders = hasHeaders !== false;
  }

  Table.prototype.load = function () {};
  Table.prototype.getRange = function () {
    return new Range(this._address);
  };
  Table.prototype.getDataBodyRange = function () {
    var full = parseAddress(this._address);
    var row = full.rowIndex + (this._hasHeaders ? 1 : 0);
    var rowCount = full.rowCount - (this._hasHeaders ? 1 : 0);
    var start = columnName(full.columnIndex) + (row + 1);
    var end = columnName(full.columnIndex + full.columnCount - 1) + (row + rowCount);
    return new Range(start + ":" + end);
  };
  Table.prototype.delete = function () {
    tables = tables.filter(function (table) {
      return table !== this;
    }, this);
  };

  function columnName(index) {
    var n = index + 1;
    var name = "";
    while (n > 0) {
      var rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function sheet() {
    return {
      tables: {
        getItemOrNullObject: function (name) {
          var found = tables.filter(function (table) { return table.name === name; })[0];
          if (!found) return { isNullObject: true, load: function () {}, name: "" };
          found.isNullObject = false;
          return found;
        },
        getItem: function (name) {
          var found = tables.filter(function (table) { return table.name === name; })[0];
          if (!found) throw new Error("Missing table " + name);
          return found;
        },
        add: function (address, hasHeaders) {
          var table = new Table(address, hasHeaders);
          tables.push(table);
          return table;
        },
      },
      getRange: function (address) {
        return new Range(address);
      },
      onSelectionChanged: {
        add: function (handler) {
          selectionHandlers.push(handler);
        },
      },
    };
  }

  function context() {
    return {
      workbook: {
        worksheets: {
          getActiveWorksheet: sheet,
        },
        getSelectedRange: function () {
          return new Range(columnName(selection.col) + (selection.row + 1));
        },
      },
      sync: function () {
        return Promise.resolve();
      },
    };
  }

  function values() {
    var maxRow = -1;
    var maxCol = -1;
    Object.keys(grid).forEach(function (entry) {
      var parts = entry.split(",");
      var row = Number(parts[0]);
      var col = Number(parts[1]);
      if (grid[entry] !== "" && grid[entry] != null) {
        maxRow = Math.max(maxRow, row);
        maxCol = Math.max(maxCol, col);
      }
    });
    if (maxRow < 0) return [];
    var rows = [];
    for (var r = 0; r <= maxRow; r += 1) {
      var row = [];
      for (var c = 0; c <= maxCol; c += 1) {
        var value = grid[key(r, c)];
        row.push(value == null ? "" : value);
      }
      rows.push(row);
    }
    return rows;
  }

  function renderGrid() {
    if (!top) return;
    var host = document.getElementById("mock-workbook");
    var mount = document.getElementById("mock-grid");
    if (!host || !mount) return;
    host.hidden = false;
    var rows = values();
    if (!rows.length) {
      mount.innerHTML = "<p class='mock-empty'>The sheet is empty.</p>";
      return;
    }
    var html = "<table><tbody>";
    rows.forEach(function (row, r) {
      html += "<tr>";
      row.forEach(function (cell, c) {
        var tag = r === 0 ? "th" : "td";
        var selected = selection.row === r && selection.col === c ? " class='selected'" : "";
        html += "<" + tag + selected + ">" + escapeHtml(cell) + "</" + tag + ">";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    mount.innerHTML = html;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch];
    });
  }

  var parentMessageHandlers = [];

  var Office = {
    HostType: { Excel: "Excel" },
    PlatformType: { OfficeOnline: "OfficeOnline", PC: "PC", Mac: "Mac" },
    AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
    EventType: {
      DialogMessageReceived: "dialogMessageReceived",
      DialogEventReceived: "dialogEventReceived",
      DialogParentMessageReceived: "dialogParentMessageReceived",
    },
    onReady: function (callback) {
      var info = { host: Office.HostType.Excel, platform: Office.PlatformType.OfficeOnline };
      if (typeof callback === "function") callback(info);
      return Promise.resolve(info);
    },
    context: {
      document: {
        settings: {
          get: function (name) {
            return settings[name];
          },
          set: function (name, value) {
            settings[name] = value;
          },
          saveAsync: function (callback) {
            if (callback) callback({ status: "succeeded" });
          },
        },
      },
      ui: {
        displayDialogAsync: function (url, options, callback) {
          if (!top) {
            callback({ status: "failed", error: { message: "Nested dialogs are not available." } });
            return;
          }
          var iframe = document.getElementById("ds-harness-dialog");
          if (!iframe) {
            iframe = document.createElement("iframe");
            iframe.id = "ds-harness-dialog";
            iframe.title = "DataSniper preview";
            document.body.appendChild(iframe);
          }
          var dialog = {
            _handlers: {},
            messageChild: function (message) {
              iframe.contentWindow.postMessage(
                { source: "datasniper-parent", message: String(message) },
                window.location.origin,
              );
            },
            addEventHandler: function (type, handler) {
              dialog._handlers[type] = handler;
            },
            close: function () {
              iframe.remove();
              window.__datasniper.dialog = null;
            },
          };
          window.__datasniper.dialog = dialog;
          iframe.src = url;
          callback({ status: Office.AsyncResultStatus.Succeeded, value: dialog });
        },
        messageParent: function (message) {
          var parentWindow = window.parent;
          var dialog = parentWindow && parentWindow.__datasniper && parentWindow.__datasniper.dialog;
          var handler = dialog && dialog._handlers.dialogMessageReceived;
          if (handler) handler({ message: String(message), origin: window.location.origin });
        },
        addHandlerAsync: function (type, handler) {
          if (type === Office.EventType.DialogParentMessageReceived) parentMessageHandlers.push(handler);
        },
      },
    },
  };

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.source !== "datasniper-parent") return;
    parentMessageHandlers.forEach(function (handler) {
      handler({ message: event.data.message, origin: event.origin });
    });
  });

  window.Office = Office;
  window.Excel = {
    run: function (batch) {
      return Promise.resolve(batch(context()));
    },
  };

  if (top) {
    window.__datasniper = {
      values: values,
      select: function (row, col) {
        selection = { row: row, col: col };
        renderGrid();
        var handlers = selectionHandlers.slice();
        return handlers.reduce(function (promise, handler) {
          return promise.then(function () { return handler({ address: columnName(col) + (row + 1) }); });
        }, Promise.resolve());
      },
      settings: function () { return settings; },
      dialog: null,
    };
    document.addEventListener("DOMContentLoaded", renderGrid);
  }
})();
