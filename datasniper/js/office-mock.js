(function () {
  var grid = {};
  var fills = {};
  var comments = [];
  var notes = [];
  var tables = [];
  var selection = { row: 0, col: 0 };
  var selectionHandlers = [];
  var settings = {};
  var settingsSaves = 0;
  var writes = 0;
  var SHEET_KEY = "datasniper.harness.sheet";
  try {
    settings = JSON.parse(sessionStorage.getItem("datasniper.harness.settings") || "{}") || {};
    settingsSaves = Number(sessionStorage.getItem("datasniper.harness.settingsSaves") || "0") || 0;
  } catch (error) {
    settings = {};
    settingsSaves = 0;
  }

  function rememberSettings() {
    try {
      sessionStorage.setItem("datasniper.harness.settings", JSON.stringify(settings));
    } catch (error) {
      /* The harness still keeps settings in memory for this page. */
    }
  }
  var top = window.parent === window;

  function noteWrite() {
    writes += 1;
    if (!top) return;
    try {
      sessionStorage.setItem(SHEET_KEY, JSON.stringify({
        grid: grid,
        fills: fills,
        comments: comments.map(function (item) {
          return { row: item.row, col: item.col, content: item.content };
        }),
        notes: notes.map(function (item) {
          return { row: item.row, col: item.col, content: item.content };
        }),
        tables: tables.map(function (table) {
          return { name: table.name, address: table._address, hasHeaders: table._hasHeaders };
        }),
      }));
    } catch (error) {
      /* The next reload still has the in-memory sheet. */
    }
  }

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
      noteWrite();
      renderGrid();
    },
  });

  Range.prototype.clear = function () {
    for (var r = 0; r < this.rowCount; r += 1) {
      for (var c = 0; c < this.columnCount; c += 1) {
        var cellKey = key(this.rowIndex + r, this.columnIndex + c);
        delete grid[cellKey];
        delete fills[cellKey];
      }
    }
    comments = comments.filter(function (comment) {
      return comment.row < this.rowIndex || comment.row >= this.rowIndex + this.rowCount
        || comment.col < this.columnIndex || comment.col >= this.columnIndex + this.columnCount;
    }, this);
    notes = notes.filter(function (note) {
      return note.row < this.rowIndex || note.row >= this.rowIndex + this.rowCount
        || note.col < this.columnIndex || note.col >= this.columnIndex + this.columnCount;
    }, this);
    noteWrite();
    renderGrid();
  };

  Object.defineProperty(Range.prototype, "format", {
    get: function () {
      var range = this;
      return {
        fill: {
          get color() {
            if (range.rowCount !== 1 || range.columnCount !== 1) return "";
            return fills[key(range.rowIndex, range.columnIndex)] || "";
          },
          set color(value) {
            for (var r = 0; r < range.rowCount; r += 1) {
              for (var c = 0; c < range.columnCount; c += 1) {
                fills[key(range.rowIndex + r, range.columnIndex + c)] = value;
              }
            }
            noteWrite();
            renderGrid();
          },
          clear: function () {
            for (var r = 0; r < range.rowCount; r += 1) {
              for (var c = 0; c < range.columnCount; c += 1) {
                delete fills[key(range.rowIndex + r, range.columnIndex + c)];
              }
            }
            noteWrite();
            renderGrid();
          },
        },
      };
    },
  });

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
    noteWrite();
  };

  function pushComment(row, col, content) {
    var comment = {
      row: row,
      col: col,
      content: content,
      load: function () {},
      getLocation: function () {
        return new Range(columnName(col) + (row + 1));
      },
      delete: function () {
        comments = comments.filter(function (item) { return item !== comment; });
        noteWrite();
      },
    };
    comments.push(comment);
    return comment;
  }

  function pushNote(row, col, content) {
    var note = {
      row: row,
      col: col,
      content: content,
      load: function () {},
      getLocation: function () {
        return new Range(columnName(col) + (row + 1));
      },
      delete: function () {
        notes = notes.filter(function (item) { return item !== note; });
        noteWrite();
      },
    };
    notes.push(note);
    return note;
  }

  function loadSheet() {
    if (!top) return;
    var saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(SHEET_KEY) || "null");
    } catch (error) {
      saved = null;
    }
    if (!saved) return;
    grid = saved.grid || {};
    fills = saved.fills || {};
    comments = [];
    notes = [];
    tables = [];
    (saved.comments || []).forEach(function (item) {
      pushComment(item.row, item.col, item.content);
    });
    (saved.notes || []).forEach(function (item) {
      pushNote(item.row, item.col, item.content);
    });
    (saved.tables || []).forEach(function (item) {
      var table = new Table(item.address, item.hasHeaders);
      table.name = item.name;
      tables.push(table);
    });
  }

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
          Promise.resolve().then(noteWrite);
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
      comments: {
        add: function (cellAddress, content, contentType) {
          if (typeof cellAddress !== "string" || typeof content !== "string" || contentType !== Excel.ContentType.plain) {
            throw new Error("comments.add expects a cell address, the note text, and Excel.ContentType.plain.");
          }
          var parsed = parseAddress(cellAddress);
          var comment = pushComment(parsed.rowIndex, parsed.columnIndex, content);
          noteWrite();
          return comment;
        },
        load: function () {},
        get items() { return comments.slice(); },
      },
      notes: {
        add: function (cellAddress, content) {
          if (typeof cellAddress !== "string" || typeof content !== "string") {
            throw new Error("notes.add expects a cell address and the note text.");
          }
          var parsed = parseAddress(cellAddress);
          var note = pushNote(parsed.rowIndex, parsed.columnIndex, content);
          noteWrite();
          return note;
        },
        load: function () {},
        get items() { return notes.slice(); },
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
        var selected = selection.row === r && selection.col === c ? " selected" : "";
        var fill = fills[key(r, c)] ? " style='background:" + fills[key(r, c)] + "'" : "";
        html += "<" + tag + " class='" + selected.trim() + "'" + fill + ">" + escapeHtml(cell) + "</" + tag + ">";
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
    StartupBehavior: { load: "Load", none: "None" },
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
            rememberSettings();
          },
          saveAsync: function (callback) {
            rememberSettings();
            settingsSaves += 1;
            try {
              sessionStorage.setItem("datasniper.harness.settingsSaves", String(settingsSaves));
            } catch (error) {
              /* The count still advances in memory for this page. */
            }
            noteWrite();
            if (callback) callback({ status: "succeeded" });
          },
        },
      },
      requirements: {
        isSetSupported: function (setName, version) {
          if (setName !== "ExcelApi" || !top || !window.__datasniper) return true;
          if (String(version) === "1.10" && window.__datasniper.allowComments === false) return false;
          if (String(version) === "1.18" && window.__datasniper.allowNotes === false) return false;
          return true;
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
          var width = Math.max(1, Math.min(100, Number(options && options.width) || 55));
          var height = Math.max(1, Math.min(100, Number(options && options.height) || 72));
          iframe.style.left = ((100 - width) / 2) + "%";
          iframe.style.top = ((100 - height) / 2) + "%";
          iframe.style.right = "auto";
          iframe.style.width = width + "%";
          iframe.style.height = height + "%";
          iframe.dataset.dialogWidth = String(width);
          iframe.dataset.dialogHeight = String(height);
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

  Office.addin = {
    setStartupBehavior: function (value) {
      if (top) window.__datasniper.startupBehavior = value;
      return Promise.resolve();
    },
  };

  loadSheet();
  window.Office = Office;
  window.Excel = {
    ContentType: { plain: "Plain", mention: "Mention" },
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
      settingsSaves: function () { return settingsSaves; },
      writes: function () { return writes; },
      startupBehavior: null,
      marks: function () {
        return {
          fills: Object.assign({}, fills),
          comments: comments.map(function (comment) {
            return { row: comment.row, col: comment.col, content: comment.content };
          }),
          notes: notes.map(function (note) {
            return { row: note.row, col: note.col, content: note.content };
          }),
        };
      },
      dialog: null,
    };
    document.addEventListener("DOMContentLoaded", renderGrid);
  }
})();
