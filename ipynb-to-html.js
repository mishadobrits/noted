#!/usr/bin/env node
/**
 * Convert a Jupyter notebook (.ipynb) to an interactive annotated HTML file.
 * No npm dependencies. Markdown is rendered the way JupyterLab does it:
 * vendored removeMath, then the vendored marked build, then the sanitizer.
 * Generated pages inline those builds, plus CSS and client code from
 * notebook-styles.js, notebook-viewer.js, and notebook-diff-mode.js.
 *
 * Usage:
 *   node ipynb-to-html.js notebook.ipynb
 *   node ipynb-to-html.js notebook.ipynb -o out.html
 *   node ipynb-to-html.js notebook.ipynb --notes notes.json
 *   node ipynb-to-html.js notebook.ipynb --readonly-notes
 *   node ipynb-to-html.js notebook.ipynb --no-hide-tall-outputs
 *
 * Notes are not read from or written into the notebook. Pass --notes to
 * include a notes JSON file. --readonly-notes shows those notes but blocks
 * adding or editing them. The same lock is viewer.html?readonly-notes.
 * Tall outputs start collapsed; --no-hide-tall-outputs leaves them expanded.
 *
 * Module API (CommonJS / browser global IpynbToHtml):
 *   convertNotebookToHtml(notebookObj, {
 *     title, sourceName, notes, allowNotes, hideTallOutputs,
 *     exportNotebook, exportSourceName, noteStorageKey, diffInitialMode
 *   })
 *   parseNotesList(data, label)
 *   notesFromNotebook(nb)
 *   loadNotebookJson(text) / validateNotebook(nb)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.IpynbToHtml = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function loadSibling(file, globalName) {
    if (typeof require === "function") return require("./" + file);
    var value = globalThis[globalName];
    if (value == null) throw new Error("Load " + file + " before ipynb-to-html.js");
    return value;
  }

  var pageStyles = loadSibling("notebook-styles.js", "NotebookViewerStyles");
  var HtmlSanitize = loadSibling("html-sanitize.js", "HtmlSanitize");
  var MarkedBundle = loadSibling("marked-bundle.js", "MarkedBundle");
  var JupyterRemoveMath = loadSibling("jupyter-remove-math.js", "JupyterRemoveMath");
  var CSS = pageStyles.css;
  var CONTINUOUS_CELL_FLOW_CSS = pageStyles.flow;
  var DIFF_EXTRA_CSS = pageStyles.diff;
  var INTERACTIVE_JS_WITH_DIFF_SUPPORT = loadSibling("notebook-viewer.js", "NotebookViewerSource");
  var DIFF_INTERACTIVE_JS = loadSibling("notebook-diff-mode.js", "NotebookDiffModeSource");

  // Also inlined at the top of notebook-viewer.js for downloaded pages.
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("Could not read downloaded asset")); };
      reader.readAsDataURL(blob);
    });
  }

  async function inlineCssAssetUrls(cssText, stylesheetUrl) {
    var matches = Array.from(String(cssText).matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g));
    var replacements = Object.create(null);
    await Promise.all(matches.map(async function (match) {
      var raw = match[2].trim();
      if (!raw || /^(?:data:|blob:|#)/i.test(raw) || replacements[raw]) return;
      var absolute = new URL(raw, stylesheetUrl).href;
      var response = await fetch(absolute);
      if (!response.ok) throw new Error("Could not download " + absolute + " (" + response.status + ")");
      replacements[raw] = await blobToDataUrl(await response.blob());
    }));
    return String(cssText).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, function (whole, quote, raw) {
      return replacements[raw.trim()] ? 'url("' + replacements[raw.trim()] + '")' : whole;
    });
  }

  async function makeHtmlSelfContained(html) {
    var doc = new DOMParser().parseFromString(String(html), "text/html");
    var stylesheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));
    for (var i = 0; i < stylesheets.length; i++) {
      var link = stylesheets[i];
      var href = link.href || link.getAttribute("href");
      var cssResponse = await fetch(href);
      if (!cssResponse.ok) throw new Error("Could not download " + href + " (" + cssResponse.status + ")");
      var style = doc.createElement("style");
      style.textContent = await inlineCssAssetUrls(await cssResponse.text(), href);
      link.replaceWith(style);
    }
    var scripts = Array.from(doc.querySelectorAll("script[src]"));
    for (var j = 0; j < scripts.length; j++) {
      var oldScript = scripts[j];
      var src = oldScript.src || oldScript.getAttribute("src");
      var jsResponse = await fetch(src);
      if (!jsResponse.ok) throw new Error("Could not download " + src + " (" + jsResponse.status + ")");
      var script = doc.createElement("script");
      script.textContent = (await jsResponse.text()).replace(/<\/script/gi, "<\\/script");
      oldScript.replaceWith(script);
    }
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  }

  const NOTES_META_KEY = "ipynb_to_html";

  const MATH_RE =
    /(\$\$[\s\S]+?\$\$)|(\$[^\$\n]+?\$)|(\\\[[\s\S]+?\\\])|(\\\([\s\S]+?\\\))/g;

  const PY_KEYWORDS = {
    False: 1, None: 1, True: 1, and: 1, as: 1, assert: 1, async: 1, await: 1,
    break: 1, class: 1, continue: 1, def: 1, del: 1, elif: 1, else: 1, except: 1,
    finally: 1, for: 1, from: 1, global: 1, if: 1, import: 1, in: 1, is: 1,
    lambda: 1, nonlocal: 1, not: 1, or: 1, pass: 1, raise: 1, return: 1, try: 1,
    while: 1, with: 1, yield: 1,
  };

  const TOKEN_RE =
    /(#.*?$)|('''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)|([\s\S])/gm;

  const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;
  const HTML_TAG = /<[^>]+>/g;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  function unescapeHtml(text) {
    return String(text)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) {
        return String.fromCharCode(parseInt(n, 10));
      })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) {
        return String.fromCharCode(parseInt(h, 16));
      })
      .replace(/&amp;/g, "&");
  }

  function warn() {
    var args = Array.prototype.slice.call(arguments);
    if (typeof process !== "undefined" && process.stderr && process.stderr.write) {
      process.stderr.write("warning: " + args.join(" ") + "\n");
    } else if (typeof console !== "undefined" && console.warn) {
      console.warn.apply(console, ["warning:"].concat(args));
    }
  }

  var markedParseFn = null;
  function markedParse(src) {
    if (!markedParseFn) {
      var api = null;
      if (typeof require === "function") {
        try { api = require("./marked.umd.js"); } catch (e) { api = null; }
      }
      if (!api && typeof globalThis !== "undefined") api = globalThis.marked;
      if (!api || typeof api.parse !== "function")
        throw new Error("Load marked.umd.js before ipynb-to-html.js");
      markedParseFn = function (markdown) {
        return api.parse(markdown, { async: false, gfm: true, breaks: false });
      };
    }
    var html = markedParseFn(src);
    if (html && typeof html.then === "function")
      throw new Error("marked.parse returned a promise");
    return String(html || "");
  }

  // Same pipeline as JupyterLab: removeMath, parse GFM with marked, sanitize.
  function markdownToHtml(src) {
    var extracted = JupyterRemoveMath.removeMath(String(src || ""));
    var html = HtmlSanitize.sanitizeHtml(markedParse(extracted.text));
    return JupyterRemoveMath.restoreMathSpans(html, extracted.math, escapeHtml);
  }

  function tokenStyleMap(code) {
    var styles = new Array(code.length);
    for (var i = 0; i < styles.length; i++) styles[i] = null;
    TOKEN_RE.lastIndex = 0;
    var m;
    while ((m = TOKEN_RE.exec(code)) !== null) {
      var text = m[0];
      var css = null;
      if (m[4] != null && PY_KEYWORDS[text]) css = "tok-kw";
      else if (m[1] != null) css = "tok-comment";
      else if (m[2] != null) css = "tok-str";
      else if (m[3] != null) css = "tok-num";
      for (var k = m.index; k < m.index + text.length; k++) styles[k] = css;
      if (text.length === 0) TOKEN_RE.lastIndex++;
    }
    return styles;
  }

  function highlightPython(code) {
    return renderStyledPlain(code, tokenStyleMap(code), []);
  }

  function clampOpacity(value, label) {
    label = label || "opacity";
    var op = Number(value);
    if (!Number.isFinite(op)) throw new Error(label + " must be a number");
    if (op < 0 || op > 1)
      throw new Error(label + " must be between 0 and 1 inclusive");
    return op;
  }

  function colorWithOpacity(color, opacity) {
    opacity = Math.max(0, Math.min(1, Number(opacity)));
    if (!Number.isFinite(opacity)) opacity = 1;
    var c = HtmlSanitize.safeHexColor(color);
    var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(c);
    if (m) {
      var h = m[1];
      var r, g, b;
      if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
      } else if (h.length === 6) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
      } else {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
        var aHex = parseInt(h.slice(6, 8), 16) / 255;
        opacity = Math.max(0, Math.min(1, aHex * opacity));
      }
      if (Math.abs(opacity - 1) < 1e-9) {
        if (h.length === 3) return c;
        return (
          "#" +
          [r, g, b]
            .map(function (x) {
              return ("0" + x.toString(16)).slice(-2);
            })
            .join("")
        );
      }
      // match Python :g style roughly
      var opStr = String(opacity);
      return "rgba(" + r + ", " + g + ", " + b + ", " + opStr + ")";
    }
    return "#ffe566";
  }


  function generateCellId() {
    var s = "";
    var hex = "0123456789abcdef";
    for (var i = 0; i < 8; i++) s += hex.charAt((Math.random() * 16) | 0);
    return s;
  }

  function ensureNotebookCellIds(nb) {
    var cells = (nb && nb.cells) || [];
    var seen = Object.create(null);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var id = cell && typeof cell.id === "string" ? cell.id.trim() : "";
      if (!id || seen[id]) {
        do {
          id = generateCellId();
        } while (seen[id]);
        cell.id = id;
      }
      seen[id] = true;
    }
    return nb;
  }

  function cellIdAtIndex(nb, index) {
    var cells = (nb && nb.cells) || [];
    var cell = cells[index];
    return cell && cell.id ? String(cell.id) : null;
  }

  function cellIndexById(nb, cellId) {
    if (cellId == null || cellId === "") return -1;
    var cells = (nb && nb.cells) || [];
    var want = String(cellId);
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] && cells[i].id === want) return i;
    }
    return -1;
  }

  function resolveAnchorCellId(anchor, nb) {
    if (!anchor || anchor.target === "note") return anchor;
    if (anchor.cell_id != null && String(anchor.cell_id)) {
      anchor.cell_id = String(anchor.cell_id);
      delete anchor.cell;
      delete anchor.legacy_cell;
      return anchor;
    }
    var legacy =
      anchor.legacy_cell != null
        ? anchor.legacy_cell
        : anchor.cell != null
          ? anchor.cell
          : null;
    if (legacy != null && nb) {
      var idx = Number(legacy);
      if (Number.isFinite(idx) && Math.floor(idx) === idx && idx >= 0) {
        var cid = cellIdAtIndex(nb, idx);
        if (cid) {
          anchor.cell_id = cid;
          delete anchor.cell;
          delete anchor.legacy_cell;
          return anchor;
        }
      }
    }
    return anchor;
  }

  function resolveNotesCellIds(notes, nb) {
    ensureNotebookCellIds(nb);
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var anchors = n.anchors || [];
      for (var j = 0; j < anchors.length; j++) {
        resolveAnchorCellId(anchors[j], nb);
      }
    }
    return notes;
  }


  function makeAnchor(fields) {
    var cell_id = null;
    var legacy_cell = null;
    if (fields.cell_id != null && String(fields.cell_id) !== "") {
      cell_id = String(fields.cell_id);
    } else if (fields.legacy_cell != null) {
      legacy_cell = fields.legacy_cell;
    } else if (fields.cell != null && typeof fields.cell === "number") {
      legacy_cell = fields.cell;
    } else if (fields.cell != null && typeof fields.cell === "string" && fields.cell !== "") {
      // Treat non-empty string cell as cell_id (defensive)
      cell_id = String(fields.cell);
    }
    return {
      target: fields.target || "cell",
      substring: fields.substring || "",
      occurrence: fields.occurrence != null ? fields.occurrence : 0,
      cell_id: cell_id,
      legacy_cell: legacy_cell,
      output_index: fields.output_index != null ? fields.output_index : null,
      parent_note_id:
        fields.parent_note_id != null ? fields.parent_note_id : null,
      after_line: fields.after_line != null ? fields.after_line : null,
      side: fields.side != null ? fields.side : null,
      line: fields.line != null ? fields.line : null,
      range: fields.range || null,
      line_range: fields.line_range || null,
      start: fields.start != null ? fields.start : -1,
      end: fields.end != null ? fields.end : -1,
    };
  }


  function anchorToJsonObj(a) {
    var obj = {
      target: a.target,
    };
    if (a.target === "between_cells") {
      if (a.cell_id != null) obj.cell_id = a.cell_id;
      obj.side = a.side === "above" ? "above" : "below";
      if (a.line != null) obj.line = a.line | 0;
      return obj;
    }
    if (a.target === "between_lines") {
      if (a.cell_id != null) obj.cell_id = a.cell_id;
      if (a.line_range) obj.line_range = [a.line_range[0] | 0, a.line_range[1] | 0];
      else {
        var selectedLine = (a.after_line != null ? a.after_line | 0 : 0) +
          (a.side === "above" ? 1 : 0);
        obj.line_range = [Math.max(0, selectedLine), Math.max(0, selectedLine) + 1];
      }
      if (a.side === "above" || a.side === "below") obj.side = a.side;
      else if (a.position === "above" || a.position === "below") obj.side = a.position;
      if (a.substring) obj.substring = a.substring;
      return obj;
    }
    if (a.range) obj.range = [a.range[0] | 0, a.range[1] | 0];
    else if (a.start >= 0 && a.end >= a.start) obj.range = [a.start | 0, a.end | 0];
    else {
      obj.substring = a.substring;
      obj.occurrence = a.occurrence != null ? a.occurrence : 0;
    }
    if (a.target === "note") obj.parent_note_id = a.parent_note_id;
    else if (a.target === "output") {
      if (a.cell_id != null) obj.cell_id = a.cell_id;
      obj.output_index = a.output_index != null ? a.output_index | 0 : 0;
    } else if (a.cell_id != null) {
      obj.cell_id = a.cell_id;
    }
    return obj;
  }

  function makeNote(fields) {
    var n = {
      note_id: fields.note_id,
      color: fields.color,
      header: fields.header || "",
      comment: fields.comment || "",
      opacity: fields.opacity != null ? fields.opacity : 1,
      anchors: fields.anchors || [],
      start: fields.start != null ? fields.start : -1,
      end: fields.end != null ? fields.end : -1,
      anchor_index: fields.anchor_index != null ? fields.anchor_index : 0,
    };
    return n;
  }

  function notePrimary(n) {
    if (!n.anchors || !n.anchors.length)
      throw new Error("note " + n.note_id + " has no anchors");
    return n.anchors[0];
  }

  function noteHasComment(n) {
    return !!(n.comment && String(n.comment).trim());
  }

  /** Card + connector: empty header AND empty comment → highlight only. */
  function noteShowsCard(n) {
    var h = n.header && String(n.header).trim();
    var c = n.comment && String(n.comment).trim();
    return !!(h || c);
  }

  function noteTarget(n) {
    return n.anchors && n.anchors.length ? notePrimary(n).target : "cell";
  }


  function noteCell(n) {
    // Returns cell_id string (or null) for the primary anchor
    if (!(n.anchors && n.anchors.length)) return null;
    var p = notePrimary(n);
    return p.cell_id != null ? p.cell_id : null;
  }

  function noteOutputIndex(n) {
    return n.anchors && n.anchors.length ? notePrimary(n).output_index : null;
  }

  function noteParentId(n) {
    return n.anchors && n.anchors.length
      ? notePrimary(n).parent_note_id
      : null;
  }

  function noteIsNoteTarget(n) {
    return noteTarget(n) === "note";
  }

  function noteIsOutputTarget(n) {
    return noteTarget(n) === "output";
  }

  function noteHighlightCssBg(n) {
    return colorWithOpacity(n.color, n.opacity);
  }

  function noteSpanForAnchor(n, anchorIndex, start, end) {
    return makeNote({
      note_id: n.note_id,
      color: n.color,
      header: n.header,
      comment: n.comment,
      opacity: n.opacity,
      anchors: n.anchors,
      start: start,
      end: end,
      anchor_index: anchorIndex,
    });
  }


  function noteToJsonObj(n) {
    // Note-level fields only. Positioning / match fields live on anchors.
    // Legacy flat notes are still accepted by parseOneAnchor / parseNotesList.
    var obj = {
      color: n.color,
      opacity: n.opacity,
      anchors: (n.anchors || []).map(anchorToJsonObj),
    };
    if (n.header && String(n.header).trim()) obj.header = String(n.header);
    if (n.comment) obj.comment = n.comment;
    return obj;
  }


  function parseOneAnchor(item, label) {
    var target = item.target || "cell";
    if (
      target !== "cell" &&
      target !== "note" &&
      target !== "output" &&
      target !== "between_lines" &&
      target !== "between_cells"
    )
      throw new Error(
        label + ": target must be 'cell', 'note', 'output', 'between_lines', or 'between_cells'"
      );

    var substring = item.substring != null ? item.substring : "";
    if (typeof substring !== "string") substring = String(substring);
    var range = null;
    if (item.range != null) {
      if (!Array.isArray(item.range) || item.range.length !== 2)
        throw new Error(label + ": range must be [start, end]");
      var rangeStart = Number(item.range[0]);
      var rangeEnd = Number(item.range[1]);
      if (!Number.isFinite(rangeStart) || Math.floor(rangeStart) !== rangeStart ||
          !Number.isFinite(rangeEnd) || Math.floor(rangeEnd) !== rangeEnd ||
          rangeStart < 0 || rangeEnd <= rangeStart)
        throw new Error(label + ": range must contain integers with 0 <= start < end");
      range = [rangeStart | 0, rangeEnd | 0];
    }
    if (target !== "between_lines" && target !== "between_cells" && substring === "" && !range)
      throw new Error(label + ": requires range or a legacy non-empty substring");

    var occRaw = item.occurrence != null ? item.occurrence : 0;
    if (typeof occRaw === "boolean")
      throw new Error(label + ": occurrence must be an integer");
    var occurrence = Number(occRaw);
    if (!Number.isFinite(occurrence) || Math.floor(occurrence) !== occurrence)
      throw new Error(label + ": occurrence must be an integer");
    occurrence = occurrence | 0;
    if (occurrence < 0)
      throw new Error(label + ": occurrence must be >= 0");

    var cell_id = null;
    var legacy_cell = null;
    var output_index = null;
    var parent_note_id = null;
    var after_line = null;
    var line_range = null;
    var cell_line = null;

    function parseCellRef(obj, lbl) {
      if (obj.cell_id != null && String(obj.cell_id).trim() !== "") {
        return { cell_id: String(obj.cell_id), legacy_cell: null };
      }
      if (!("cell" in obj))
        throw new Error(lbl + " requires cell_id (or legacy numeric cell)");
      var cell = Number(obj.cell);
      if (!Number.isFinite(cell) || Math.floor(cell) !== cell)
        throw new Error(lbl + ": cell must be an integer when cell_id is absent");
      return { cell_id: null, legacy_cell: cell | 0 };
    }

    if (target === "note") {
      if (!("parent_note_id" in item))
        throw new Error(label + ": note target requires parent_note_id");
      parent_note_id = Number(item.parent_note_id);
      if (!Number.isFinite(parent_note_id) || Math.floor(parent_note_id) !== parent_note_id)
        throw new Error(label + ": parent_note_id must be an integer");
      parent_note_id = parent_note_id | 0;
    } else if (target === "output") {
      var cref = parseCellRef(item, label + ": output target");
      cell_id = cref.cell_id;
      legacy_cell = cref.legacy_cell;
      if (!("output_index" in item))
        throw new Error(label + ": output target requires output_index");
      output_index = Number(item.output_index);
      if (!Number.isFinite(output_index) || Math.floor(output_index) !== output_index)
        throw new Error(label + ": output_index must be an integer");
      output_index = output_index | 0;
      if (output_index < 0)
        throw new Error(label + ": output_index must be >= 0");
    } else if (target === "between_cells") {
      cref = parseCellRef(item, label + ": between_cells target");
      cell_id = cref.cell_id;
      legacy_cell = cref.legacy_cell;
      var cellSide = item.side != null ? item.side : item.position;
      if (cellSide !== "above" && cellSide !== "below")
        throw new Error(label + ': between_cells target requires side "above" or "below"');
      if (item.line != null) {
        var parsedLine = Number(item.line);
        if (!Number.isFinite(parsedLine) || Math.floor(parsedLine) !== parsedLine || parsedLine < 0)
          throw new Error(label + ": line must be an integer >= 0");
        cell_line = parsedLine | 0;
      }
    } else if (target === "between_lines") {
      cref = parseCellRef(item, label + ": between_lines target");
      cell_id = cref.cell_id;
      legacy_cell = cref.legacy_cell;
      if (item.line_range != null) {
        if (!Array.isArray(item.line_range) || item.line_range.length !== 2)
          throw new Error(label + ": line_range must be [start, end]");
        var lineStart = Number(item.line_range[0]);
        var lineEnd = Number(item.line_range[1]);
        if (!Number.isFinite(lineStart) || Math.floor(lineStart) !== lineStart ||
            !Number.isFinite(lineEnd) || Math.floor(lineEnd) !== lineEnd ||
            lineStart < 0 || lineEnd <= lineStart)
          throw new Error(label + ": line_range must contain integers with 0 <= start < end");
        line_range = [lineStart | 0, lineEnd | 0];
      } else {
        if (!("after_line" in item))
          throw new Error(label + ": between_lines target requires line_range (or legacy after_line)");
        after_line = Number(item.after_line);
        if (!Number.isFinite(after_line) || Math.floor(after_line) !== after_line)
          throw new Error(label + ": after_line must be an integer");
        after_line = after_line | 0;
        if (after_line < -1)
          throw new Error(label + ": after_line must be >= -1");
      }
    } else {
      cref = parseCellRef(item, label + ": cell target");
      cell_id = cref.cell_id;
      legacy_cell = cref.legacy_cell;
    }

    var side = null;
    if (target === "between_cells") {
      side = cellSide;
    } else if (target === "between_lines") {
      var sideRaw = item.side != null ? item.side : item.position;
      if (sideRaw === "above" || sideRaw === "below") side = sideRaw;
      if (line_range) after_line = side === "above" ? line_range[0] - 1 : line_range[1] - 1;
    }

    return makeAnchor({
      target: target,
      substring: substring,
      occurrence: occurrence,
      cell_id: cell_id,
      legacy_cell: legacy_cell,
      output_index: output_index,
      parent_note_id: parent_note_id,
      after_line: after_line,
      range: range,
      line_range: line_range,
      side: side,
      line: cell_line,
    });
  }

  function parseNotesList(data, label) {
    label = label || "notes";
    if (data == null) return [];
    if (!Array.isArray(data))
      throw new Error(label + " must be a JSON array");
    var notes = [];
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error(label + "[" + i + "] must be an object");
      if (!("color" in item))
        throw new Error(label + "[" + i + "] requires color");
      var color = item.color;
      if (typeof color !== "string" || !color.trim())
        throw new Error(label + "[" + i + "]: color must be a non-empty string");
      color = HtmlSanitize.safeHexColor(color);
      var comment = item.comment || "";
      if (typeof comment !== "string") comment = String(comment);
      var header = item.header || "";
      if (typeof header !== "string") header = String(header);
      var opacity;
      if ("opacity" in item && item.opacity != null)
        opacity = clampOpacity(item.opacity, label + "[" + i + "].opacity");
      else if ("alpha" in item && item.alpha != null)
        opacity = clampOpacity(item.alpha, label + "[" + i + "].alpha");
      else opacity = 1.0;

      var anchors = [];
      var anchorsRaw = item.anchors;
      if (anchorsRaw != null) {
        if (!Array.isArray(anchorsRaw) || !anchorsRaw.length)
          throw new Error(label + "[" + i + "]: anchors must be a non-empty array");
        for (var j = 0; j < anchorsRaw.length; j++) {
          var a = anchorsRaw[j];
          if (!a || typeof a !== "object" || Array.isArray(a))
            throw new Error(
              label + "[" + i + "].anchors[" + j + "] must be an object"
            );
          anchors.push(
            parseOneAnchor(a, label + "[" + i + "].anchors[" + j + "]")
          );
        }
      } else {
        if (
          item.target !== "between_lines" &&
          item.target !== "between_cells" &&
          !("substring" in item)
        )
          throw new Error(label + "[" + i + "] requires substring (or anchors)");
        anchors.push(parseOneAnchor(item, label + "[" + i + "]"));
      }
      notes.push(
        makeNote({
          note_id: i,
          color: color,
          header: header,
          comment: comment,
          opacity: opacity,
          anchors: anchors,
        })
      );
    }
    return notes;
  }

  function notesFromNotebook(nb) {
    var meta = (nb && nb.metadata) || {};
    var block = meta[NOTES_META_KEY] || {};
    if (!block || typeof block !== "object" || Array.isArray(block)) return [];
    return parseNotesList(
      block.notes,
      "metadata." + NOTES_META_KEY + ".notes"
    );
  }

  function stripStoredNotes(nb) {
    if (!nb || !nb.metadata || !nb.metadata[NOTES_META_KEY]) return nb;
    delete nb.metadata[NOTES_META_KEY].notes;
    return nb;
  }

  function findNthOccurrence(source, substring, occurrence) {
    var start = 0;
    var found = 0;
    while (true) {
      var idx = source.indexOf(substring, start);
      if (idx < 0) return -1;
      if (found === occurrence) return idx;
      found += 1;
      start = idx + substring.length;
    }
  }


  function matchNotesToSource(source, notes) {
    var spans = [];
    for (var ni = 0; ni < notes.length; ni++) {
      var note = notes[ni];
      for (var ai = 0; ai < note.anchors.length; ai++) {
        var anc = note.anchors[ai];
        if (anc.target !== "cell" && anc.target !== "output") continue;
        var idx = anc.range ? anc.range[0] : findNthOccurrence(source, anc.substring, anc.occurrence);
        var end = anc.range ? anc.range[1] : idx + anc.substring.length;
        if (anc.range && (idx < 0 || end > source.length || end <= idx)) idx = -1;
        if (idx < 0) {
          warn(
            "note " +
              note.note_id +
              " anchor[" +
              ai +
              "] substring not found (target=" +
              anc.target +
              ", cell_id=" +
              anc.cell_id +
              ", output_index=" +
              anc.output_index +
              ", occurrence=" +
              anc.occurrence +
              ")"
          );
          continue;
        }
        anc.start = idx;
        anc.end = end;
        anc.substring = source.slice(idx, end);
        spans.push(noteSpanForAnchor(note, ai, anc.start, anc.end));
      }
    }
    return spans;
  }


  function matchCellSourceAnchors(source, notes, cellId) {
    var spans = [];
    for (var ni = 0; ni < notes.length; ni++) {
      var note = notes[ni];
      for (var ai = 0; ai < note.anchors.length; ai++) {
        var anc = note.anchors[ai];
        if (anc.target !== "cell" || anc.cell_id !== cellId) continue;
        var idx = anc.range ? anc.range[0] : findNthOccurrence(source, anc.substring, anc.occurrence);
        var end = anc.range ? anc.range[1] : idx + anc.substring.length;
        if (anc.range && (idx < 0 || end > source.length || end <= idx)) idx = -1;
        if (idx < 0) {
          warn(
            "note " +
              note.note_id +
              " anchor[" +
              ai +
              "] not in cell_id " +
              cellId +
              " source (occurrence=" +
              anc.occurrence +
              ")"
          );
          continue;
        }
        anc.start = idx;
        anc.end = end;
        anc.substring = source.slice(idx, end);
        spans.push(noteSpanForAnchor(note, ai, anc.start, anc.end));
      }
    }
    return spans;
  }


  function matchOutputAnchors(source, notes, cellId, outputIndex) {
    var spans = [];
    for (var ni = 0; ni < notes.length; ni++) {
      var note = notes[ni];
      for (var ai = 0; ai < note.anchors.length; ai++) {
        var anc = note.anchors[ai];
        if (
          anc.target !== "output" ||
          anc.cell_id !== cellId ||
          anc.output_index !== outputIndex
        )
          continue;
        var idx = anc.range ? anc.range[0] : findNthOccurrence(source, anc.substring, anc.occurrence);
        var end = anc.range ? anc.range[1] : idx + anc.substring.length;
        if (anc.range && (idx < 0 || end > source.length || end <= idx)) idx = -1;
        if (idx < 0) {
          warn(
            "note " +
              note.note_id +
              " anchor[" +
              ai +
              "] not in cell_id " +
              cellId +
              " output " +
              outputIndex
          );
          continue;
        }
        anc.start = idx;
        anc.end = end;
        anc.substring = source.slice(idx, end);
        spans.push(noteSpanForAnchor(note, ai, anc.start, anc.end));
      }
    }
    return spans;
  }


  function resolveAllNoteMatches(notes) {
    var byId = {};
    for (var i = 0; i < notes.length; i++) byId[notes[i].note_id] = notes[i];
    for (var ni = 0; ni < notes.length; ni++) {
      var note = notes[ni];
      for (var ai = 0; ai < note.anchors.length; ai++) {
        var anc = note.anchors[ai];
        if (anc.target !== "note") continue;
        var parent =
          anc.parent_note_id != null ? byId[anc.parent_note_id] : null;
        if (!parent || !noteHasComment(parent)) {
          warn(
            "note " +
              note.note_id +
              " anchor[" +
              ai +
              "] parent_note_id=" +
              anc.parent_note_id +
              " missing"
          );
          anc.start = -1;
          anc.end = -1;
          continue;
        }
        var idx = anc.range ? anc.range[0] : findNthOccurrence(
          parent.comment,
          anc.substring,
          anc.occurrence
        );
        var end = anc.range ? anc.range[1] : idx + anc.substring.length;
        if (anc.range && (idx < 0 || end > parent.comment.length || end <= idx)) idx = -1;
        if (idx < 0) {
          warn(
            "note " +
              note.note_id +
              " anchor[" +
              ai +
              "] substring not found in parent comment"
          );
          anc.start = -1;
          anc.end = -1;
          continue;
        }
        anc.start = idx;
        anc.end = end;
        anc.substring = parent.comment.slice(idx, end);
        try {
          anc.cell_id = noteCell(parent);
        } catch (e) {
          /* ignore */
        }
      }
    }
    return notes;
  }

  function lineSegments(start, end, text) {
    var segments = [];
    var i = start;
    while (i < end) {
      var nl = text.indexOf("\n", i);
      if (nl === -1 || nl >= end) {
        if (i < end) segments.push([i, end]);
        break;
      }
      if (nl > i) segments.push([i, nl]);
      i = nl + 1;
    }
    return segments;
  }

  function noteIntervals(source, notes) {
    var intervals = [];
    for (var ni = 0; ni < notes.length; ni++) {
      var note = notes[ni];
      if (note.start < 0) continue;
      var segs = lineSegments(note.start, note.end, source);
      for (var si = 0; si < segs.length; si++) {
        var a = segs[si][0];
        var b = segs[si][1];
        if (a < b) intervals.push({ a: a, b: b, note: note });
      }
    }
    return intervals;
  }

  function nestOrder(notes) {
    return notes.slice().sort(function (a, b) {
      var la = a.end - a.start;
      var lb = b.end - b.start;
      if (a.start !== b.start) return a.start - b.start;
      if (la !== lb) return lb - la;
      if (a.note_id !== b.note_id) return a.note_id - b.note_id;
      return a.anchor_index - b.anchor_index;
    });
  }

  function renderStyledPlain(source, styles, notes) {
    var intervals = noteIntervals(source, notes);
    var bounds = { 0: true };
    bounds[source.length] = true;
    for (var ii = 0; ii < intervals.length; ii++) {
      bounds[intervals[ii].a] = true;
      bounds[intervals[ii].b] = true;
    }
    var points = Object.keys(bounds)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });

    function covering(pos, end) {
      var hit = [];
      var seen = {};
      for (var k = 0; k < intervals.length; k++) {
        var iv = intervals[k];
        var key = iv.note.note_id + ":" + iv.note.anchor_index;
        if (iv.a < end && iv.b > pos && !seen[key]) {
          hit.push(iv.note);
          seen[key] = true;
        }
      }
      return nestOrder(hit);
    }

    var segments = [];
    for (var pi = 0; pi < points.length - 1; pi++) {
      var a = points[pi];
      var b = points[pi + 1];
      if (a >= b) continue;
      segments.push({ a: a, b: b, cover: covering(a, b) });
    }

    var anchorSeg = {};
    for (var si = 0; si < segments.length; si++) {
      var cover = segments[si].cover;
      for (var ci = 0; ci < cover.length; ci++) {
        var note = cover[ci];
        if (noteShowsCard(note))
          anchorSeg[note.note_id + ":" + note.anchor_index] = si;
      }
    }

    var out = [];
    for (si = 0; si < segments.length; si++) {
      a = segments[si].a;
      b = segments[si].b;
      cover = segments[si].cover;
      var chunk = source.slice(a, b);
      var styledParts = [];
      var i = 0;
      while (i < chunk.length) {
        var absI = a + i;
        var st = absI < styles.length ? styles[absI] : null;
        var j = i + 1;
        while (j < chunk.length) {
          var absJ = a + j;
          var stJ = absJ < styles.length ? styles[absJ] : null;
          if (stJ !== st) break;
          j++;
        }
        var piece = escapeHtml(chunk.slice(i, j));
        if (st) piece = '<span class="' + st + '">' + piece + "</span>";
        styledParts.push(piece);
        i = j;
      }
      var inner = styledParts.join("");
      var opens = [];
      var closes = [];
      for (ci = 0; ci < cover.length; ci++) {
        note = cover[ci];
        var isAnchor =
          noteShowsCard(note) &&
          anchorSeg[note.note_id + ":" + note.anchor_index] === si;
        var anchor = isAnchor ? ' data-note-anchor="1"' : "";
        opens.push(
          '<mark class="note-hl" data-note="' +
            note.note_id +
            '" data-anchor="' +
            note.anchor_index +
            '"' +
            anchor +
            ' style="background-color:' +
            escapeHtml(noteHighlightCssBg(note)) +
            '">'
        );
        closes.push("</mark>");
      }
      out.push(opens.join("") + inner + closes.reverse().join(""));
    }
    return out.join("");
  }

  function highlightPythonWithNotes(source, notes) {
    return renderStyledPlain(source, tokenStyleMap(source), notes);
  }

  function renderPlainWithNotes(source, notes) {
    var styles = new Array(source.length);
    for (var i = 0; i < styles.length; i++) styles[i] = null;
    return renderStyledPlain(source, styles, notes);
  }

  function softVisibleNeedle(frag) {
    var linesOut = [];
    var lines = String(frag).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (var li = 0; li < lines.length; li++) {
      var s = lines[li].trim();
      s = s.replace(/^#{1,6}\s+/, "");
      s = s.replace(/^[-*+]\s+/, "");
      s = s.replace(/^\d+\.\s+/, "");
      s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
      s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      s = s.replace(/`([^`]+)`/g, "$1");
      s = s.replace(/\*\*/g, "").replace(/__/g, "");
      s = s.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1");
      s = s.replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1");
      if (s) linesOut.push(s);
    }
    return linesOut.join("\n");
  }

  function htmlTextChunks(htmlFrag) {
    var chunks = [];
    var i = 0;
    var n = htmlFrag.length;
    while (i < n) {
      if (htmlFrag[i] === "<") {
        var j = htmlFrag.indexOf(">", i);
        if (j < 0) {
          chunks.push(["text", htmlFrag.slice(i)]);
          break;
        }
        chunks.push(["tag", htmlFrag.slice(i, j + 1)]);
        i = j + 1;
      } else {
        j = htmlFrag.indexOf("<", i);
        if (j < 0) {
          chunks.push(["text", htmlFrag.slice(i)]);
          break;
        }
        chunks.push(["text", htmlFrag.slice(i, j)]);
        i = j;
      }
    }
    return chunks;
  }

  function findInText(haystack, needle, occurrence) {
    occurrence = occurrence || 0;
    if (!needle) return -1;
    var start = 0;
    var found = 0;
    while (true) {
      var idx = haystack.indexOf(needle, start);
      if (idx < 0) return -1;
      if (found === occurrence) return idx;
      found += 1;
      start = idx + needle.length;
    }
  }

  // CommonMark drops a backslash that escapes ASCII punctuation (\{ \} \_ ...).
  function markdownUnescapePunct(text) {
    return String(text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
  }

  function countNeedleBefore(haystack, needle, beforeIndex) {
    if (!needle) return 0;
    var start = 0;
    var found = 0;
    while (true) {
      var idx = haystack.indexOf(needle, start);
      if (idx < 0 || idx >= beforeIndex) return found;
      found += 1;
      start = idx + needle.length;
    }
  }

  // Source needle after Markdown eats escape backslashes. Occurrence is counted
  // in the unescaped source so a later copy (two \right\} in one formula) wins.
  function rangeForMarkdownEscapes(textContent, source, noteStart, frag) {
    var visibleFrag = markdownUnescapePunct(frag);
    if (!visibleFrag || visibleFrag === frag) return null;
    var needles = [visibleFrag];
    var soft = softVisibleNeedle(visibleFrag);
    if (soft && soft !== visibleFrag && soft !== frag) needles.push(soft);
    var visibleSource = markdownUnescapePunct(source);
    var visibleStart = markdownUnescapePunct(source.slice(0, Math.max(0, noteStart))).length;
    for (var n = 0; n < needles.length; n++) {
      var needle = needles[n];
      var occ = countNeedleBefore(visibleSource, needle, visibleStart);
      var at = findInText(textContent, needle, occ);
      if (at < 0) at = findInText(textContent, needle, 0);
      if (at >= 0) return [at, at + needle.length];
    }
    return null;
  }

  function renderedNeedleCandidates(text) {
    var unescaped = markdownUnescapePunct(text);
    var list = [text, unescaped, softVisibleNeedle(unescaped), softVisibleNeedle(text), String(text).trim()];
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var cand = list[i];
      if (!cand || seen[cand]) continue;
      seen[cand] = true;
      out.push(cand);
    }
    return out;
  }

  function findRenderedNeedle(textContent, source, noteStart, needle) {
    if (!needle) return -1;
    var srcAt = source.indexOf(needle, Math.max(0, noteStart));
    var at;
    if (srcAt >= 0) {
      at = findInText(textContent, needle, countNeedleBefore(source, needle, srcAt));
      if (at < 0) at = findInText(textContent, needle, 0);
      return at;
    }
    var visibleSource = markdownUnescapePunct(source);
    var visibleStart = markdownUnescapePunct(source.slice(0, Math.max(0, noteStart))).length;
    at = findInText(textContent, needle, countNeedleBefore(visibleSource, needle, visibleStart));
    if (at < 0) at = findInText(textContent, needle, 0);
    return at;
  }

  function noteTextRangesInRendered(textContent, source, note) {
    var frag = source.slice(note.start, note.end);
    var idx = findInText(textContent, frag, 0);
    if (idx >= 0) return [[idx, idx + frag.length]];
    var escaped = rangeForMarkdownEscapes(textContent, source, note.start, frag);
    if (escaped) return [escaped];
    var soft = softVisibleNeedle(frag);
    if (soft) {
      idx = findInText(textContent, soft, 0);
      if (idx >= 0) return [[idx, idx + soft.length]];
      var softFlat = soft.replace(/\s+/g, " ").trim();
      var flatText = textContent.replace(/\s+/g, " ");
      idx = findInText(flatText, softFlat, 0);
      if (idx >= 0 && soft.indexOf("\n") < 0) {
        var idx2 = findInText(textContent, softFlat, 0);
        if (idx2 >= 0) return [[idx2, idx2 + softFlat.length]];
      }
    }
    var ranges = [];
    var segs = lineSegments(note.start, note.end, source);
    for (var si = 0; si < segs.length; si++) {
      var lineFrag = source.slice(segs[si][0], segs[si][1]);
      var candidates = renderedNeedleCandidates(lineFrag);
      for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c];
        idx = findRenderedNeedle(textContent, source, segs[si][0], cand);
        if (idx >= 0) {
          ranges.push([idx, idx + cand.length]);
          break;
        }
      }
    }
    return ranges;
  }

  function injectNoteMarksIntoHtml(htmlFrag, source, notes) {
    var matched = notes.filter(function (n) {
      return n.start >= 0;
    });
    if (!matched.length) return htmlFrag;

    var chunks = htmlTextChunks(htmlFrag);
    var textParts = [];
    var inTex = 0;
    var includable = [];
    for (var ci = 0; ci < chunks.length; ci++) {
      var kind = chunks[ci][0];
      var val = chunks[ci][1];
      if (kind === "tag") {
        var low = val.toLowerCase();
        var normalized = low.replace(/'/g, '"');
        if (low.indexOf("<span") === 0 && normalized.indexOf('class="tex-math"') >= 0)
          inTex += 1;
        else if (low.indexOf("</span") === 0 && inTex)
          inTex = Math.max(0, inTex - 1);
        includable.push(false);
        continue;
      }
      if (inTex) {
        includable.push(false);
        continue;
      }
      includable.push(true);
      textParts.push(unescapeHtml(val));
    }
    var textContent = textParts.join("");
    if (!textContent) return htmlFrag;

    var cover = [];
    for (var i = 0; i < textContent.length; i++) cover[i] = [];
    for (var ni = 0; ni < matched.length; ni++) {
      var note = matched[ni];
      var ranges = noteTextRangesInRendered(textContent, source, note);
      for (var ri = 0; ri < ranges.length; ri++) {
        var a = Math.max(0, Math.min(ranges[ri][0], textContent.length));
        var b = Math.max(0, Math.min(ranges[ri][1], textContent.length));
        for (i = a; i < b; i++) cover[i].push(note);
      }
    }

    function nestKey(n) {
      return [n.start, -(n.end - n.start), n.note_id, n.anchor_index];
    }
    function cmpNest(a, b) {
      var ka = nestKey(a);
      var kb = nestKey(b);
      for (var k = 0; k < ka.length; k++) {
        if (ka[k] !== kb[k]) return ka[k] < kb[k] ? -1 : 1;
      }
      return 0;
    }

    for (i = 0; i < cover.length; i++) {
      var seen = {};
      var uniq = [];
      for (var ui = 0; ui < cover[i].length; ui++) {
        var n = cover[i][ui];
        var key = n.note_id + ":" + n.anchor_index;
        if (!seen[key]) {
          uniq.push(n);
          seen[key] = true;
        }
      }
      uniq.sort(cmpNest);
      cover[i] = uniq;
    }

    var pieces = [];
    var textPos = 0;
    for (ci = 0; ci < chunks.length; ci++) {
      kind = chunks[ci][0];
      val = chunks[ci][1];
      if (kind === "tag") {
        pieces.push({ html: val, notes: null });
        continue;
      }
      if (!includable[ci]) {
        pieces.push({ html: val, notes: null });
        continue;
      }
      var decoded = unescapeHtml(val);
      if (!decoded) continue;
      i = 0;
      while (i < decoded.length) {
        var absI = textPos + i;
        var sig =
          absI < cover.length
            ? cover[absI]
                .map(function (nn) {
                  return nn.note_id + ":" + nn.anchor_index;
                })
                .join(",")
            : "";
        var j = i + 1;
        while (j < decoded.length) {
          var absJ = textPos + j;
          var sigJ =
            absJ < cover.length
              ? cover[absJ]
                  .map(function (nn) {
                    return nn.note_id + ":" + nn.anchor_index;
                  })
                  .join(",")
              : "";
          if (sigJ !== sig) break;
          j++;
        }
        var notesHere =
          sig && absI < cover.length ? cover[absI] : [];
        pieces.push({
          html: escapeHtml(decoded.slice(i, j)),
          notes: notesHere.length ? notesHere : null,
        });
        i = j;
      }
      textPos += decoded.length;
    }

    var anchorPiece = {};
    for (var pi = 0; pi < pieces.length; pi++) {
      if (!pieces[pi].notes) continue;
      for (ni = 0; ni < pieces[pi].notes.length; ni++) {
        note = pieces[pi].notes[ni];
        if (noteShowsCard(note))
          anchorPiece[note.note_id + ":" + note.anchor_index] = pi;
      }
    }

    var out = [];
    for (pi = 0; pi < pieces.length; pi++) {
      var htmlPiece = pieces[pi].html;
      var notesHere2 = pieces[pi].notes;
      if (!notesHere2) {
        out.push(htmlPiece);
        continue;
      }
      var opens = [];
      var closes = [];
      for (ni = 0; ni < notesHere2.length; ni++) {
        note = notesHere2[ni];
        var isAnchor =
          noteShowsCard(note) &&
          anchorPiece[note.note_id + ":" + note.anchor_index] === pi;
        var anchor = isAnchor ? ' data-note-anchor="1"' : "";
        opens.push(
          '<mark class="note-hl" data-note="' +
            note.note_id +
            '" data-anchor="' +
            note.anchor_index +
            '"' +
            anchor +
            ' style="background-color:' +
            escapeHtml(noteHighlightCssBg(note)) +
            '">'
        );
        closes.push("</mark>");
      }
      out.push(opens.join("") + htmlPiece + closes.reverse().join(""));
    }
    return out.join("");
  }

  function renderMarkdownWithNotes(source, notes) {
    var rendered = markdownToHtml(source);
    if (notes && notes.length)
      rendered = injectNoteMarksIntoHtml(rendered, source, notes);
    return (
      '<div class="md-rendered annotatable" data-role="md-rendered">' +
      rendered +
      "</div>"
    );
  }


  function noteCardHtml(n, bodyHtml, depth) {
    depth = depth || 0;
    var body =
      bodyHtml != null
        ? bodyHtml
        : n.comment
          ? markdownToHtml(String(n.comment))
          : "";
    var nestCls = noteIsNoteTarget(n) ? " note-card-nested" : "";
    var cellId = noteCell(n);
    var cellAttr =
      cellId != null && cellId !== ""
        ? ' data-cell-id="' + escapeHtml(String(cellId)) + '"'
        : "";
    var parent = noteParentId(n);
    var hdr = n.header && String(n.header).trim() ? String(n.header).trim() : "";
    var headerHtml = hdr
      ? '<div class="note-card-header">' + escapeHtml(hdr) + "</div>"
      : "";
    var noteColor = HtmlSanitize.safeHexColor(n.color);
    return (
      '<div class="note-card' +
      nestCls +
      '" id="note-comment-' +
      n.note_id +
      '" data-note="' +
      n.note_id +
      '" data-parent-note="' +
      (parent != null ? parent : "") +
      '" data-depth="' +
      depth +
      '"' +
      cellAttr +
      ' style="border-left-color:' +
      escapeHtml(noteColor) +
      ";--note-color:" +
      escapeHtml(noteColor) +
      '">' +
      headerHtml +
      '<div class="note-card-body annotatable-note md-note" data-note-body="' +
      n.note_id +
      '">' +
      body +
      "</div></div>"
    );
  }


  function cellNotesRailHtml(cellId) {
    var safe = escapeHtml(String(cellId));
    return (
      '<div class="notes-cascade" data-cell-id="' +
      safe +
      '" id="notes-cascade-' +
      safe +
      '"></div>'
    );
  }

  function buildSourceProjection(source) {
    var maths = [];
    MATH_RE.lastIndex = 0;
    var m;
    while ((m = MATH_RE.exec(source)) !== null) {
      maths.push({ start: m.index, end: m.index + m[0].length, raw: m[0] });
      if (m[0].length === 0) MATH_RE.lastIndex++;
    }
    var v2s = [];
    var visibleChars = [];
    var i = 0;
    var mathI = 0;
    while (i < source.length) {
      if (mathI < maths.length && i === maths[mathI].start) {
        var a = maths[mathI].start;
        var b = maths[mathI].end;
        var raw = maths[mathI].raw;
        for (var k = 0; k < raw.length; k++) {
          visibleChars.push(raw[k]);
          v2s.push(a + k);
        }
        i = b;
        mathI += 1;
        continue;
      }
      visibleChars.push(source[i]);
      v2s.push(i);
      i += 1;
    }
    return { visible: visibleChars.join(""), v2s: v2s };
  }

  function sourceText(cell) {
    var src = cell.source;
    if (Array.isArray(src)) return src.join("");
    return src == null ? "" : String(src);
  }

  function joinText(value) {
    if (Array.isArray(value)) return value.join("");
    if (value == null) return "";
    return String(value);
  }

  function executionCount(cell) {
    var n = cell.execution_count;
    return n != null ? String(n) : " ";
  }

  var maxPromptChars = 0;
  function notePromptWidth(text) {
    var n = String(text == null ? "" : text).length;
    if (n > maxPromptChars) maxPromptChars = n;
  }

  function stripHtmlTags(text) {
    return String(text).replace(HTML_TAG, "");
  }

  function outputAnnotatableText(output) {
    var otype = output.output_type || "";
    if (otype === "stream") return joinText(output.text);
    if (otype === "error") {
      var ename = output.ename || "Error";
      var evalue = output.evalue || "";
      var traceback = output.traceback || [];
      var tbLines = traceback.map(function (line) {
        return String(line).replace(ANSI_ESCAPE, "");
      });
      if (!tbLines.length) return ename + ": " + evalue;
      return tbLines.join("\n");
    }
    if (otype === "execute_result" || otype === "display_data") {
      var data = output.data || {};
      if (data["text/html"] != null)
        return HtmlSanitize.visibleHtmlText(joinText(data["text/html"]));
      if (data["text/plain"] != null) return joinText(data["text/plain"]);
      return "";
    }
    return "";
  }

  function renderOutput(output, outputIndex, cellIndex, notes) {
    var otype = output.output_type || "";
    var matched = (notes || []).filter(function (n) {
      return n.start >= 0;
    });

    function annotAttrs(extraCls) {
      var cls = ("output-body " + (extraCls || "")).trim();
      return (
        'class="' +
        cls +
        ' annotatable-output" data-role="cell-output" data-cell-id="' +
        escapeHtml(String(cellIndex)) +
        '" data-output-index="' +
        outputIndex +
        '"'
      );
    }

    function row(promptHtml, bodyHtml) {
      return '<div class="output-row">' + promptHtml + bodyHtml + "</div>";
    }

    if (otype === "stream") {
      var raw = joinText(output.text);
      var name = output.name || "stdout";
      var cls = name === "stderr" ? "stderr" : "stdout";
      var prompt = name === "stderr" ? "err" : "out";
      notePromptWidth("[" + prompt + "]");
      var inner = matched.length
        ? renderPlainWithNotes(raw, matched)
        : escapeHtml(raw);
      var body = "<div " + annotAttrs(cls) + ">" + inner + "</div>";
      return row(
        '<div class="prompt ' + prompt + '">[' + prompt + "]</div>",
        body
      );
    }

    if (otype === "execute_result" || otype === "display_data") {
      var data = output.data || {};
      var promptN = output.execution_count;
      var label = promptN != null ? String(promptN) : String(outputIndex);
      notePromptWidth("Out[" + label + "]:");
      var promptHtml =
        '<div class="prompt out">Out[' + escapeHtml(label) + "]:</div>";
      if (data["text/html"] != null) {
        var rawHtml = HtmlSanitize.sanitizeHtml(joinText(data["text/html"]));
        if (matched.length) {
          rawHtml = injectNoteMarksIntoHtml(
            rawHtml,
            outputAnnotatableText(output),
            matched
          );
        }
        body = "<div " + annotAttrs("html-out") + ">" + rawHtml + "</div>";
        return row(promptHtml, body);
      }
      if (data["image/png"] != null) {
        body = HtmlSanitize.rasterImageHtml("image/png", joinText(data["image/png"]));
        return '<div class="output-row">' + promptHtml + body + "</div>";
      }
      if (data["image/jpeg"] != null || data["image/jpg"] != null) {
        var key = data["image/jpeg"] != null ? "image/jpeg" : "image/jpg";
        body = HtmlSanitize.rasterImageHtml(key, joinText(data[key]));
        return '<div class="output-row">' + promptHtml + body + "</div>";
      }
      if (data["image/svg+xml"] != null) {
        var svg = joinText(data["image/svg+xml"]);
        body = HtmlSanitize.svgImageHtml(svg);
        return row(promptHtml, body);
      }
      if (data["text/plain"] != null) {
        raw = joinText(data["text/plain"]);
        inner = matched.length
          ? renderPlainWithNotes(raw, matched)
          : escapeHtml(raw);
        body = "<div " + annotAttrs() + ">" + inner + "</div>";
        return row(promptHtml, body);
      }
      raw =
        "(unsupported output: " + Object.keys(data).join(", ") + ")";
      body = '<div class="output-body">' + escapeHtml(raw) + "</div>";
      return row(promptHtml, body);
    }

    if (otype === "error") {
      raw = outputAnnotatableText(output);
      inner = matched.length
        ? renderPlainWithNotes(raw, matched)
        : escapeHtml(raw);
      body = "<div " + annotAttrs("error") + ">" + inner + "</div>";
      notePromptWidth("err");
      return row('<div class="prompt err">err</div>', body);
    }

    raw = JSON.stringify(output, null, 2);
    body =
      '<div class="output-body">' + escapeHtml(raw.slice(0, 2000)) + "</div>";
    notePromptWidth("?");
    return row('<div class="prompt out">?</div>', body);
  }


  function cellDiffMeta(cell) {
    var block =
      cell &&
      cell.metadata &&
      cell.metadata[NOTES_META_KEY] &&
      cell.metadata[NOTES_META_KEY].diff;
    return block && typeof block === "object" ? block : null;
  }

  function cellSyntheticMeta(cell) {
    var block =
      cell && cell.metadata && cell.metadata[NOTES_META_KEY]
        ? cell.metadata[NOTES_META_KEY]
        : null;
    return block && block.synthetic ? block : null;
  }

  function diffStatusClass(diff) {
    if (!diff || !diff.status || diff.status === "equal") return "";
    // Wholly add/del → soft background. Change cells: line stripes + tint only
    // (class "diff-change" is a nav/marker hook, not a left bar).
    if (diff.status === "del") return " diff-del";
    if (diff.status === "add") return " diff-add";
    if (diff.status === "change") return " diff-change";
    return "";
  }

  /**
   * Run-based left stripe on the code content: one red (or green) bar spanning
   * consecutive deleted (or added) lines. No −/+ glyphs. Skipped for wholly
   * add/del cells (background suffices) and for compact inline/equal lines.
   */
  function stripeRailHtml(lineStatuses, wholeStatus) {
    if (!lineStatuses || !lineStatuses.length) return "";
    if (wholeStatus === "add" || wholeStatus === "del") return "";
    var hasMark = false;
    for (var i = 0; i < lineStatuses.length; i++) {
      if (lineStatuses[i] === "-" || lineStatuses[i] === "+") {
        hasMark = true;
        break;
      }
    }
    if (!hasMark) return "";
    function kindOf(s) {
      return s === "-" ? "del" : s === "+" ? "add" : "pad";
    }
    var runs = [];
    i = 0;
    while (i < lineStatuses.length) {
      var kind = kindOf(lineStatuses[i]);
      var j = i + 1;
      while (j < lineStatuses.length && kindOf(lineStatuses[j]) === kind) j++;
      runs.push({ kind: kind, count: j - i });
      i = j;
    }
    // flex-grow by line count: rail stretches to the <pre> height so stripes
    // stay aligned even when highlight metrics differ slightly from em math.
    var parts = runs.map(function (r) {
      return (
        '<span class="diff-stripe-run ' +
        r.kind +
        '" style="flex:' +
        r.count +
        ' 0 0"></span>'
      );
    });
    return (
      '<div class="diff-stripe-rail" aria-hidden="true">' +
      parts.join("") +
      "</div>"
    );
  }

  /**
   * Full-line red/green backgrounds from the same diff.lines array as the
   * stripe rail. Equal-height stops (1/N each) track flex stripe rows without
   * changing stripe layout. Uses --diff-*-bg so tint stays visible on white.
   */
  function diffLineBackgroundStyle(lineStatuses) {
    if (!lineStatuses || !lineStatuses.length) return "";
    var n = lineStatuses.length;
    var has = false;
    var stops = [];
    for (var i = 0; i < n; i++) {
      var s = lineStatuses[i];
      var color = "transparent";
      if (s === "-") {
        color = "var(--diff-del-bg)";
        has = true;
      } else if (s === "+") {
        color = "var(--diff-add-bg)";
        has = true;
      }
      var a = ((100 * i) / n).toFixed(4);
      var b = ((100 * (i + 1)) / n).toFixed(4);
      stops.push(color + " " + a + "%", color + " " + b + "%");
    }
    if (!has) return "";
    return (
      "background-image:linear-gradient(to bottom, " +
      stops.join(", ") +
      ");"
    );
  }

  function diffDecorationSpans(source, diff) {
    var spans = [];
    var rows = (diff && diff.inline_runs) || [];
    if (!rows.length) return spans;
    var lines = String(source).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var offset = 0;
    var serial = 0;
    for (var i = 0; i < lines.length; i++) {
      var runs = rows[i] || [];
      for (var j = 0; j < runs.length; j++) {
        var run = runs[j];
        if (!run || run.end <= run.start) continue;
        spans.push({
          note_id: "__diff_" + (run.status === "-" ? "del" : "add") + "_" + serial++,
          color: run.status === "-" ? "#ffcdd2" : "#c8e6c9",
          opacity: 1,
          comment: "",
          header: "",
          anchors: [],
          anchor_index: 0,
          start: offset + run.start,
          end: offset + run.end,
        });
      }
      offset += lines[i].length + 1;
    }
    return spans;
  }

  function inlineSideLine(line, runs, side) {
    var text = "";
    var mappedRuns = [];
    var cursor = 0;
    for (var i = 0; i < (runs || []).length; i++) {
      var run = runs[i];
      text += line.slice(cursor, run.start);
      if (run.status === side) {
        var start = text.length;
        text += line.slice(run.start, run.end);
        mappedRuns.push({ status: run.status, start: start, end: text.length });
      }
      cursor = run.end;
    }
    text += line.slice(cursor);
    return { text: text, runs: mappedRuns };
  }

  function additionsOnlyVariant(source, diff) {
    if (!diff || !diff.lines) return null;
    var sourceLines = String(source || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (sourceLines.length && sourceLines[sourceLines.length - 1] === "") sourceLines.pop();
    var lines = [];
    var statuses = [];
    var inlineRuns = [];
    for (var i = 0; i < sourceLines.length; i++) {
      var status = diff.lines[i] || " ";
      if (status === "-") continue;
      if (status === "~") {
        var side = inlineSideLine(sourceLines[i], (diff.inline_runs || [])[i], "+");
        lines.push(side.text);
        statuses.push(side.runs.length ? "~" : " ");
        inlineRuns.push(side.runs.length ? side.runs : null);
      } else {
        lines.push(sourceLines[i]);
        statuses.push(status);
        inlineRuns.push(null);
      }
    }
    return {
      source: lines.length ? lines.join("\n") + "\n" : "",
      diff: { status: diff.status, lines: statuses, inline_runs: inlineRuns },
    };
  }

  function namedDiffVariant(diff, name) {
    var variant = diff && diff.variants && diff.variants[name];
    if (!variant || variant.hidden) return null;
    return {
      source: String(variant.source || ""),
      diff: {
        status: variant.status,
        lines: variant.lines || [],
        inline_runs: variant.inline_runs || [],
      },
    };
  }

  function markDiffDecorationClasses(html) {
    return String(html)
      .replace(
        /<mark class="note-hl" data-note="__diff_del_/g,
        '<mark class="diff-inline diff-inline-del" data-note="__diff_del_'
      )
      .replace(
        /<mark class="note-hl" data-note="__diff_add_/g,
        '<mark class="diff-inline diff-inline-add" data-note="__diff_add_'
      );
  }

  function sourceDiffView(codeInnerHtml, diff, className) {
    var rail = stripeRailHtml(diff.lines, diff.status);
    var bg = diffLineBackgroundStyle(diff.lines);
    var lined = bg ? " diff-lined" : "";
    var style = bg ? ' style="' + bg + '"' : "";
    var pre =
      '<pre class="source annotatable' +
      lined +
      '" data-role="cell-source"' +
      style +
      "><code>" +
      codeInnerHtml +
      "</code></pre>";
    var content = rail
      ? '<div class="source-wrap">' + rail + pre + "</div>"
      : pre;
    return '<div class="diff-source-view ' + className + '">' + content + "</div>";
  }

  function wrapSourceWithOptionalGutter(codeInnerHtml, diff, rightInnerHtml, filteredView, additionsView) {
    if (!diff || !diff.lines || !diff.lines.length) {
      return (
        '<pre class="source annotatable" data-role="cell-source"><code>' +
        codeInnerHtml +
        "</code></pre>"
      );
    }
    var fullView = sourceDiffView(codeInnerHtml, diff, "diff-full-source");
    if (rightInnerHtml == null) return fullView;
    return (
      fullView +
      (filteredView
        ? sourceDiffView(filteredView.html, filteredView.diff, "diff-filtered-source")
        : "") +
      (additionsView
        ? sourceDiffView(additionsView.html, additionsView.diff, "diff-additions-source")
        : "") +
      '<pre class="source annotatable diff-right-source" data-role="cell-source"><code>' +
      rightInnerHtml +
      "</code></pre>"
    );
  }

  function wrapCell(cellId, cellClasses, bodyInner, notes, diff) {
    var matched = notes.filter(function (n) {
      return n.start >= 0;
    });
    var classes = "cell " + cellClasses;
    var hasComments =
      matched.some(function (n) {
        return noteShowsCard(n) && !noteIsNoteTarget(n);
      }) ||
      notes.some(function (n) {
        return noteShowsCard(n) && noteIsOutputTarget(n);
      });
    if (hasComments) classes += " cell-has-comments";
    var safe = escapeHtml(String(cellId));
    var diffAttr = "";
    if (diff && diff.status && diff.status !== "equal") {
      var diffAttrName =
        diff.nav_target === false
          ? "data-diff-decoration-status"
          : "data-diff-status";
      diffAttr =
        " " +
        diffAttrName +
        '="' +
        escapeHtml(String(diff.status)) +
        '"';
    }
    var rowClass =
      "cell-row" +
      (diff && diff.variants && diff.variants.filtered && diff.variants.filtered.hidden
        ? " diff-filtered-hidden"
        : "");
    return (
      '<div class="' + rowClass + '" data-cell-id="' +
      safe +
      '"><section class="' +
      classes +
      '" id="cell-' +
      safe +
      '" data-cell-id="' +
      safe +
      '"' +
      diffAttr +
      '><div class="cell-body">' +
      bodyInner +
      "</div></section>" +
      cellNotesRailHtml(cellId) +
      '<svg class="cell-connectors" data-cell-id="' +
      safe +
      '" aria-hidden="true"></svg></div>'
    );
  }

  function renderCell(cell, cellIndex, language, allNotes) {
    var ctype = cell.cell_type || "";
    var src = sourceText(cell);
    var cellId = cell.id != null ? String(cell.id) : String(cellIndex);
    var diff = cellDiffMeta(cell);
    var noteSource =
      diff && diff.right_source != null ? String(diff.right_source) : src;
    var matched = matchCellSourceAnchors(noteSource, allNotes, cellId);
    var outAnchorNotes = allNotes.filter(function (n) {
      return (n.anchors || []).some(function (a) {
        return a.target === "output" && a.cell_id === cellId;
      });
    });
    var synth = cellSyntheticMeta(cell);
    var diffCls = diffStatusClass(diff);

    if (synth && synth.synthetic === "output") {
      // Prefer the real output object so figures and HTML go through
      // renderOutput — no plain-text synthetic <pre> path.
      var outObj =
        synth.output && typeof synth.output === "object"
          ? synth.output
          : { output_type: "stream", name: "stdout", text: src };
      var outputMatched = synth.from_right
        ? matchOutputAnchors(
            outputAnnotatableText(outObj),
            allNotes,
            synth.from_cell_id || cellId,
            synth.output_index != null ? synth.output_index : 0
          )
        : [];
      var body = renderOutput(
        outObj,
        synth.output_index != null ? synth.output_index : 0,
        cellId,
        outputMatched
      );
      return wrapCell(
        cellId,
        "cell-raw cell-synthetic-output" + diffCls,
        body,
        outputMatched.concat(outAnchorNotes),
        diff
      );
    }

    if (ctype === "markdown") {
      var inner = renderMarkdownWithNotes(src, matched);
      // Markdown keeps rendered HTML; tint notes + optional whole-cell bg carry the diff.
      return wrapCell(
        cellId,
        "cell-md" + diffCls,
        inner,
        matched.concat(outAnchorNotes),
        diff
      );
    }
    if (ctype === "raw") {
      var rawDecorations = diffDecorationSpans(src, diff);
      var rawDisplayNotes =
        diff && diff.right_source != null
          ? rawDecorations
          : matched.concat(rawDecorations);
      var annotated = markDiffDecorationClasses(
        renderPlainWithNotes(src, rawDisplayNotes)
      );
      var rightAnnotated =
        diff && diff.right_source != null
          ? renderPlainWithNotes(noteSource, matched)
          : null;
      var rawFiltered = namedDiffVariant(diff, "filtered");
      var rawAdditions = additionsOnlyVariant(
        rawFiltered ? rawFiltered.source : src,
        rawFiltered ? rawFiltered.diff : diff
      );
      var rawFilteredNotes = rawFiltered
        ? matchCellSourceAnchors(rawFiltered.source, allNotes, cellId)
        : [];
      var rawAdditionsNotes = rawAdditions
        ? matchCellSourceAnchors(rawAdditions.source, allNotes, cellId)
        : [];
      inner = wrapSourceWithOptionalGutter(
        annotated,
        diff,
        rightAnnotated,
        rawFiltered
          ? {
              html: markDiffDecorationClasses(
                renderPlainWithNotes(
                  rawFiltered.source,
                  rawFilteredNotes.concat(
                    diffDecorationSpans(rawFiltered.source, rawFiltered.diff)
                  )
                )
              ),
              diff: rawFiltered.diff,
            }
          : null,
        rawAdditions
          ? {
              html: markDiffDecorationClasses(
                renderPlainWithNotes(
                  rawAdditions.source,
                  rawAdditionsNotes.concat(
                    diffDecorationSpans(rawAdditions.source, rawAdditions.diff)
                  )
                )
              ),
              diff: rawAdditions.diff,
            }
          : null
      );
      return wrapCell(
        cellId,
        "cell-raw" + diffCls,
        inner,
        matched.concat(outAnchorNotes),
        diff
      );
    }
    if (ctype === "code") {
      var codeDecorations = diffDecorationSpans(src, diff);
      var codeDisplayNotes =
        diff && diff.right_source != null
          ? codeDecorations
          : matched.concat(codeDecorations);
      var highlighted = markDiffDecorationClasses(
        highlightPythonWithNotes(src, codeDisplayNotes)
      );
      var rightHighlighted =
        diff && diff.right_source != null
          ? highlightPythonWithNotes(noteSource, matched)
          : null;
      var codeFiltered = namedDiffVariant(diff, "filtered");
      var codeAdditions = additionsOnlyVariant(
        codeFiltered ? codeFiltered.source : src,
        codeFiltered ? codeFiltered.diff : diff
      );
      var codeFilteredNotes = codeFiltered
        ? matchCellSourceAnchors(codeFiltered.source, allNotes, cellId)
        : [];
      var codeAdditionsNotes = codeAdditions
        ? matchCellSourceAnchors(codeAdditions.source, allNotes, cellId)
        : [];
      var ec = executionCount(cell);
      notePromptWidth("In[" + ec + "]:");
      var blocks = [
        '<div class="input-row">',
        '<div class="prompt in">In[' + escapeHtml(ec) + "]:</div>",
        wrapSourceWithOptionalGutter(
          highlighted,
          diff,
          rightHighlighted,
          codeFiltered
            ? {
                html: markDiffDecorationClasses(
                  highlightPythonWithNotes(
                    codeFiltered.source,
                    codeFilteredNotes.concat(
                      diffDecorationSpans(codeFiltered.source, codeFiltered.diff)
                    )
                  )
                ),
                diff: codeFiltered.diff,
              }
            : null,
          codeAdditions
            ? {
                html: markDiffDecorationClasses(
                  highlightPythonWithNotes(
                    codeAdditions.source,
                    codeAdditionsNotes.concat(
                      diffDecorationSpans(codeAdditions.source, codeAdditions.diff)
                    )
                  )
                ),
                diff: codeAdditions.diff,
              }
            : null
        ),
        "</div>",
      ];
      var outputs = cell.outputs || [];
      if (outputs.length) {
        blocks.push('<div class="outputs">');
        for (var i = 0; i < outputs.length; i++) {
          var oiSpans = matchOutputAnchors(
            outputAnnotatableText(outputs[i]),
            allNotes,
            cellId,
            i
          );
          blocks.push(renderOutput(outputs[i], i, cellId, oiSpans));
        }
        blocks.push("</div>");
      }
      return wrapCell(
        cellId,
        "cell-code" + diffCls,
        blocks.join("\n"),
        matched.concat(outAnchorNotes),
        diff
      );
    }
    return "";
  }

  function convertNotebookToHtml(nb, options) {
    maxPromptChars = 0;
    options = options || {};
    var title = options.title != null ? options.title : "notebook";
    var sourceName = options.sourceName != null ? options.sourceName : "notebook.ipynb";
    var allowNotes = options.allowNotes !== false;
    ensureNotebookCellIds(nb);
    var notes = options.notes;
    if (notes == null) {
      notes = [];
    } else if (!Array.isArray(notes)) {
      notes = parseNotesList(notes);
    } else if (
      notes.length &&
      notes[0] &&
      typeof notes[0].note_id === "number" &&
      Array.isArray(notes[0].anchors)
    ) {
      notes = notes.slice();
    } else {
      notes = parseNotesList(notes);
    }

    var meta = nb.metadata || {};
    var kernelspec = meta.kernelspec || {};
    var language =
      kernelspec.language ||
      ((meta.language_info || {}).name) ||
      "python";
    var cells = nb.cells || [];
    notes = notes.slice();
    resolveNotesCellIds(notes, nb);
    resolveAllNoteMatches(notes);

    var nbEmbed = JSON.parse(JSON.stringify(nb));
    stripStoredNotes(nbEmbed);
    var exportEmbed = JSON.parse(
      JSON.stringify(options.exportNotebook || nb)
    );
    ensureNotebookCellIds(exportEmbed);
    stripStoredNotes(exportEmbed);
    for (var embedIndex = 0; embedIndex < (nbEmbed.cells || []).length; embedIndex++) {
      var embedCell = nbEmbed.cells[embedIndex];
      var embedDiff = cellDiffMeta(embedCell);
      var embedFiltered = embedDiff && embedDiff.variants && embedDiff.variants.filtered;
      var embedAdditions = additionsOnlyVariant(
        embedFiltered && !embedFiltered.hidden
          ? String(embedFiltered.source || "")
          : sourceText(embedCell),
        embedFiltered && !embedFiltered.hidden ? embedFiltered : embedDiff
      );
      if (!embedDiff || !embedAdditions) continue;
      embedDiff.variants = embedDiff.variants || {};
      embedDiff.variants.additions = {
        source: embedAdditions.source,
        status: embedAdditions.diff.status,
        lines: embedAdditions.diff.lines,
        inline_runs: embedAdditions.diff.inline_runs,
      };
    }

    var parts = [];
    for (var i = 0; i < cells.length; i++)
      parts.push(renderCell(cells[i], i, language, notes));
    var body = parts.join("\n");

    var notesState = notes.map(function (n) {
      var o = noteToJsonObj(n);
      o.note_id = n.note_id;
      return o;
    });
    var cellMdHtml = {};
    var cellProjections = {};
    var hasFilteredDiffVariant = false;
    for (i = 0; i < cells.length; i++) {
      var cellId = cells[i].id != null ? String(cells[i].id) : String(i);
      var src = sourceText(cells[i]);
      cellProjections[cellId] = buildSourceProjection(src);
      if (cells[i].cell_type === "markdown")
        cellMdHtml[cellId] = markdownToHtml(src);
      var cellDiff = cellDiffMeta(cells[i]);
      if (cellDiff && cellDiff.variants && cellDiff.variants.filtered) {
        hasFilteredDiffVariant = true;
      }
    }

    var bootstrap = {
      notebook: nbEmbed,
      exportNotebook: exportEmbed,
      exportSourceName: options.exportSourceName || sourceName,
      noteStorageKey: options.noteStorageKey || sourceName,
      notes: notesState,
      allowNotes: allowNotes,
      sourceName: sourceName,
      cellMarkdownHtml: cellMdHtml,
      cellProjections: cellProjections,
      diffHasFilteredVariant: hasFilteredDiffVariant,
      diffInitialMode:
        options.diffInitialMode || (hasFilteredDiffVariant ? "filtered" : "full"),
      hideTallOutputs: options.hideTallOutputs !== false,
    };
    var bootstrapJson = JSON.stringify(bootstrap).replace(/<\//g, "<\\/");

    var katexCss =
      "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
    var katexJs =
      "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
    var katexAuto =
      "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js";
    var katexCssIntegrity =
      "sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+";
    var katexJsIntegrity =
      "sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg";
    var katexAutoIntegrity =
      "sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk";
    var sanitizeBoot =
      "window.HtmlSanitize = " +
      HtmlSanitize.factorySource.replace(/<\/script/gi, "<\\/script") +
      ";\n";
    var markedBoot = String(MarkedBundle.source || "").replace(/<\/script/gi, "<\\/script");
    var removeMathBoot = String(JupyterRemoveMath.source || "").replace(/<\/script/gi, "<\\/script");
    var notebookDiff =
      meta[NOTES_META_KEY] &&
      meta[NOTES_META_KEY].diff &&
      meta[NOTES_META_KEY].diff.generated;
    return (
      "<!DOCTYPE html>\n" +
      '<html lang="en">\n' +
      "<head>\n" +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      "<title>" +
      escapeHtml(title) +
      "</title>\n" +
      '<link rel="stylesheet" href="' +
      katexCss +
      '" integrity="' +
      katexCssIntegrity +
      '" crossorigin="anonymous">\n' +
      "<style>" +
      CSS +
      CONTINUOUS_CELL_FLOW_CSS +
      "\n::highlight(pending-note-selections){background:rgba(255,229,102,.72);color:inherit}" +
      (notebookDiff ? DIFF_EXTRA_CSS : "") +
      (maxPromptChars ? "\n:root{--prompt-chars:" + maxPromptChars + "}" : "") +
      "</style>\n" +
      "</head>\n" +
      "<body" + (allowNotes ? "" : ' data-allow-notes="false"') + ">\n" +
      '<div class="page">\n' +
      '<header class="doc-header">\n' +
      '<div class="toolbar">\n' +
      "  <h1>" +
      escapeHtml(sourceName) +
      "</h1>\n" +
      '  <div class="toolbar-actions">\n' +
      '    <button type="button" class="primary js-download-html" id="btn-download-html">Download as HTML</button>\n' +
      '    <button type="button" class="js-download-notes" id="btn-download-notes">Download notes JSON</button>\n' +
      (allowNotes
        ? '    <button type="button" id="btn-load-notes" title="Replace current notes with a notes JSON file">Load notes</button>\n' +
          '    <input type="file" id="notes-file-input" accept="application/json,.json" hidden>\n'
        : "") +
      "  </div>\n" +
      "</div>\n" +
      "</header>\n" +
      '<main class="cells-stack" id="cells-stack">\n' +
      body +
      "\n</main>\n" +
      '<div class="toolbar toolbar-bottom">\n' +
      '  <div class="toolbar-actions">\n' +
      '    <button type="button" class="primary js-download-html">Download as HTML</button>\n' +
      '    <button type="button" class="js-download-notes">Download notes JSON</button>\n' +
      "  </div>\n" +
      "</div>\n" +
      '<footer class="doc-footer">Generated by ipynb-to-html.js (stdlib) · interactive notes · KaTeX CDN</footer>\n' +
      "</div>\n\n" +
      '<div id="sel-bar" class="sel-bar" role="toolbar">\n' +
      '  <span id="sel-bar-count" class="sel-bar-count" hidden></span>\n' +
      '  <div id="sel-bar-actions" class="sel-bar-actions">\n' +
      '    <div class="sel-action">\n' +
      '      <button type="button" id="btn-make-note">Make a note</button>\n' +
      '      <button type="button" class="sel-more" id="btn-make-note-more" title="Other anchor types">...</button>\n' +
      '    </div>\n' +
      '    <div class="sel-action">\n' +
      '      <button type="button" id="btn-select-another">Select first anchor</button>\n' +
      '      <button type="button" class="sel-more" id="btn-select-another-more" title="Other anchor types">...</button>\n' +
      '    </div>\n' +
      '    <div class="sel-action">\n' +
      '      <button type="button" id="btn-attach-note">Attach to existing note</button>\n' +
      '      <button type="button" class="sel-more" id="btn-attach-note-more" title="Other anchor types">...</button>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '  <span id="sel-bar-multi-hint" class="sel-bar-multi-hint" hidden>Select other anchors and finish/cancel</span>\n' +
      "</div>\n\n" +
      '<div id="attach-pick-banner" class="attach-pick-banner" role="status" aria-live="polite" hidden>\n' +
      '  Click a note card to attach the selection · Esc to cancel\n' +
      "</div>\n\n" +
      '<div id="placement-modal" class="modal-backdrop placement-modal-backdrop" role="dialog" aria-modal="true">\n' +
      '  <div class="modal placement-modal">\n' +
      '    <h2 id="placement-modal-title">Other anchor types</h2>\n' +
      '    <p class="placement-attach-target" id="placement-attach-line" hidden>Attaching to: <strong id="placement-attach-label"></strong></p>\n' +
      '    <p class="placement-scope" id="placement-scope" hidden></p>\n' +
      '    <div class="note-placement-row placement-choice-grid" id="placement-only-row">\n' +
      '      <label class="placement-selected-text"><input type="radio" name="placement-only" id="place-only-selection" value="selection" checked> Substring</label>\n' +
      '      <label><input type="radio" name="placement-only" id="place-only-above" value="above"> Above this line</label>\n' +
      '      <label><input type="radio" name="placement-only" id="place-only-below" value="below"> Below this line</label>\n' +
      '      <label><input type="radio" name="placement-only" id="place-only-cell-above" value="cell-above"> Above this cell</label>\n' +
      '      <label><input type="radio" name="placement-only" id="place-only-cell-below" value="cell-below"> Below this cell</label>\n' +
      "    </div>\n" +
      '    <div class="preview" id="placement-preview" style="margin-top:0.55rem"></div>\n' +
      '    <div class="actions">\n' +
      '      <button type="button" id="placement-cancel">Cancel</button>\n' +
      '      <button type="button" class="primary" id="placement-confirm">Continue</button>\n' +
      "    </div>\n" +
      '    <div class="shortcut-hint">Esc cancels · Enter continues</div>\n' +
      "  </div>\n" +
      "</div>\n\n" +
      '<div id="viewport-nav" class="viewport-nav">\n' +
      '  <div id="diff-nav" class="diff-nav" role="navigation" aria-label="Cells with diffs off screen" hidden>\n' +
      '    <div class="diff-nav-label">Diff cells</div>\n' +
      (notebookDiff
        ? '    <div class="diff-mode-grid" aria-label="Diff display mode">\n' +
          '      <button type="button" data-diff-mode="full" aria-pressed="false" title="Show every addition and deletion">Full</button>\n' +
          '      <button type="button" data-diff-mode="filtered" aria-pressed="false" title="Filter matching deletions and additions; right-click to edit filters">Filtered ±</button>\n' +
          '      <button type="button" data-diff-mode="additions" aria-pressed="false" title="Hide deletions and filter matching additions">No deletions</button>\n' +
          '      <button type="button" data-diff-mode="off" aria-pressed="false" title="Show the new notebook without diff highlighting">No diff</button>\n' +
          '    </div>\n' +
          '    <div class="diff-nav-position" id="diff-nav-position">No diff selected</div>\n'
        : "") +
      '    <button type="button" id="diff-nav-prev" disabled title="Go to the previous diff">\n' +
      '      ← Previous diff\n' +
      "    </button>\n" +
      '    <button type="button" id="diff-nav-next" disabled title="Go to the next diff">\n' +
      '      Next diff →\n' +
      "    </button>\n" +
      "  </div>\n" +
      '  <div id="note-nav" class="note-nav" role="navigation" aria-label="Notes off screen">\n' +
      '    <button type="button" id="note-nav-above" disabled title="Jump to the nearest note above the viewport">\n' +
      '      ↑ <span class="note-nav-count" id="note-nav-above-count">0</span> above\n' +
      "    </button>\n" +
      '    <button type="button" id="note-nav-below" disabled title="Jump to the nearest note below the viewport">\n' +
      '      ↓ <span class="note-nav-count" id="note-nav-below-count">0</span> below\n' +
      "    </button>\n" +
      "  </div>\n" +
      "</div>\n\n" +
      '<div id="note-modal" class="modal-backdrop" role="dialog" aria-modal="true">\n' +
      '  <div class="modal">\n' +
      '    <h2 id="modal-title">Add note</h2>\n' +
      '    <div id="note-attach-picked" class="attach-picked-hint" hidden>\n' +
      '      Attaching to: <strong id="note-attach-picked-label"></strong>\n' +
      "    </div>\n" +
      '    <div id="note-placement-row" class="note-placement-row">\n' +
      '      <span class="note-placement-label">Placement</span>\n' +
      '      <label><input type="radio" name="note-placement" id="note-place-selection" value="selection" checked> Substring</label>\n' +
      '      <label><input type="radio" name="note-placement" id="note-place-above" value="above"> Above this line</label>\n' +
      '      <label><input type="radio" name="note-placement" id="note-place-below" value="below"> Below this line</label>\n' +
      "    </div>\n" +
      '    <label for="note-header">Header (optional)</label>\n' +
      '    <input type="text" id="note-header" placeholder="Short title shown on the card" autocomplete="off">\n' +
      '    <label for="note-comment">Your comment (markdown)</label>\n' +
      '    <textarea id="note-comment" placeholder="Markdown + KaTeX: `code`, **bold**, $...$ / $$...$$"></textarea>\n' +
      '    <label for="note-color">Color</label>\n' +
      '    <div class="row">\n' +
      '      <input type="color" id="note-color" value="#ffe566">\n' +
      "    </div>\n" +
      '    <label for="note-opacity">Highlight opacity (<span id="note-opacity-val">70.0%</span>)</label>\n' +
      '    <div class="row">\n' +
      '      <input type="range" id="note-opacity" min="0" max="1" step="0.001" value="0.7" style="flex:1">\n' +
      "    </div>\n" +
      '    <label for="note-occurrence">Occurrence (0 = first match)</label>\n' +
      '    <input type="number" id="note-occurrence" min="0" step="1" value="0">\n' +
      "    <label>Substring</label>\n" +
      '    <div class="preview" id="note-preview"></div>\n' +
      '    <div id="note-anchors-panel" class="note-anchors-panel" hidden>\n' +
      "      <label>Attached substrings</label>\n" +
      '      <ul id="note-anchors-list" class="note-anchors-list"></ul>\n' +
      '      <div class="hint" style="margin-top:0.35rem;font-size:0.75rem;color:var(--muted)">\n' +
      "        Unattach removes one highlight. Unattaching the last one deletes the note.\n" +
      "      </div>\n" +
      "    </div>\n" +
      '    <div class="actions">\n' +
      '      <button type="button" id="modal-delete" class="danger" style="display:none;margin-right:auto">Delete</button>\n' +
      '      <button type="button" id="modal-cancel">Cancel</button>\n' +
      '      <button type="button" class="primary" id="modal-save">Save</button>\n' +
      "    </div>\n" +
      '    <div class="shortcut-hint">Shortcuts: Ctrl/Cmd+Enter save · Esc cancel · Delete delete note (edit only). Enter saves outside the comment box; Enter in the comment inserts a newline.</div>\n' +
      "  </div>\n" +
      "</div>\n\n" +
      "<script>\n" +
      "window.__IPYNB_TO_HTML__ = " +
      bootstrapJson +
      ";\n" +
      "</script>\n" +
      '<script src="' +
      katexJs +
      '" integrity="' +
      katexJsIntegrity +
      '" crossorigin="anonymous"></script>\n' +
      '<script src="' +
      katexAuto +
      '" integrity="' +
      katexAutoIntegrity +
      '" crossorigin="anonymous"></script>\n' +
      "<script>\n" +
      sanitizeBoot +
      "</script>\n" +
      "<script>\n" +
      markedBoot +
      "\n</script>\n" +
      "<script>\n" +
      removeMathBoot +
      "\n</script>\n" +
      "<script>\n" +
      INTERACTIVE_JS_WITH_DIFF_SUPPORT +
      "\n</script>\n" +
      (notebookDiff
        ? "<script>\n" + DIFF_INTERACTIVE_JS + "\n</script>\n"
        : "") +
      "</body>\n" +
      "</html>\n"
    );
  }

  function loadNotebookJson(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON in notebook: " + e.message);
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || !("cells" in data))
      throw new Error(
        "File does not look like a Jupyter notebook (missing 'cells')"
      );
    return data;
  }

  function validateNotebook(nb) {
    if (!nb || typeof nb !== "object" || Array.isArray(nb) || !("cells" in nb))
      throw new Error(
        "File does not look like a Jupyter notebook (missing 'cells')"
      );
    return nb;
  }

  return {
    convertNotebookToHtml: convertNotebookToHtml,
    makeHtmlSelfContained: makeHtmlSelfContained,
    parseNotesList: parseNotesList,
    notesFromNotebook: notesFromNotebook,
    loadNotebookJson: loadNotebookJson,
    validateNotebook: validateNotebook,
    markdownToHtml: markdownToHtml,
    highlightPython: highlightPython,
    findNthOccurrence: findNthOccurrence,
    NOTES_META_KEY: NOTES_META_KEY,
    clampOpacity: clampOpacity,
    colorWithOpacity: colorWithOpacity,
    ensureNotebookCellIds: ensureNotebookCellIds,
    resolveNotesCellIds: resolveNotesCellIds,
    noteToJsonObj: noteToJsonObj,
    cellIdAtIndex: cellIdAtIndex,
    cellIndexById: cellIndexById,
    generateCellId: generateCellId,
    outputAnnotatableText: outputAnnotatableText,
  };

});

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  (function () {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var api = module.exports;

    function usage() {
      process.stderr.write(
        "Usage: node ipynb-to-html.js notebook.ipynb [-o out.html] [--title T] [--notes notes.json]\n" +
          "       [--readonly-notes] [--source-name NAME] [--export-notebook file.ipynb]\n" +
          "       [--export-source-name NAME] [--note-storage-key KEY]\n" +
          "       [--diff-initial-mode full|filtered|additions|off]\n" +
          "       [--hide-tall-outputs | --no-hide-tall-outputs]\n"
      );
    }

    function requireValue(flag, argv, i) {
      if (i + 1 >= argv.length) throw new Error(flag + " requires a value");
      return argv[i + 1];
    }

    function parseArgs(argv) {
      var args = {
        notebook: null,
        output: null,
        title: null,
        notes: null,
        readonlyNotes: false,
        sourceName: null,
        exportNotebook: null,
        exportSourceName: null,
        noteStorageKey: null,
        diffInitialMode: null,
        hideTallOutputs: true,
      };
      var i = 0;
      while (i < argv.length) {
        var a = argv[i];
        if (a === "-o" || a === "--output") {
          args.output = requireValue(a, argv, i);
          i++;
        } else if (a === "--title") {
          args.title = requireValue(a, argv, i);
          i++;
        } else if (a === "--notes") {
          args.notes = requireValue(a, argv, i);
          i++;
        } else if (a === "--readonly-notes") {
          args.readonlyNotes = true;
        } else if (a === "--source-name") {
          args.sourceName = requireValue(a, argv, i);
          i++;
        } else if (a === "--export-notebook") {
          args.exportNotebook = requireValue(a, argv, i);
          i++;
        } else if (a === "--export-source-name") {
          args.exportSourceName = requireValue(a, argv, i);
          i++;
        } else if (a === "--note-storage-key") {
          args.noteStorageKey = requireValue(a, argv, i);
          i++;
        } else if (a === "--diff-initial-mode") {
          var mode = requireValue(a, argv, i);
          if (!/^(full|filtered|additions|off)$/.test(mode)) {
            throw new Error("--diff-initial-mode must be full, filtered, additions, or off");
          }
          args.diffInitialMode = mode;
          i++;
        } else if (a === "--hide-tall-outputs") {
          args.hideTallOutputs = true;
        } else if (a === "--no-hide-tall-outputs") {
          args.hideTallOutputs = false;
        } else if (a === "-h" || a === "--help") {
          usage();
          process.exit(0);
        } else if (a.charAt(0) === "-") {
          throw new Error("unknown option: " + a);
        } else if (args.notebook == null) {
          args.notebook = a;
        } else {
          throw new Error("unexpected argument: " + a);
        }
        i++;
      }
      if (!args.notebook) throw new Error("notebook path required");
      return args;
    }

    function loadNotesFile(p) {
      if (!fs.existsSync(p)) throw new Error("Notes file not found: " + p);
      var st = fs.statSync(p);
      if (!st.isFile()) throw new Error("Notes path is not a file: " + p);
      var data;
      try {
        data = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (e) {
        throw new Error("Invalid notes JSON: " + e.message);
      }
      return api.parseNotesList(data, p);
    }

    function loadNotebook(p) {
      if (!fs.existsSync(p)) throw new Error("File not found: " + p);
      var st = fs.statSync(p);
      if (!st.isFile()) throw new Error("Not a file: " + p);
      if (path.extname(p).toLowerCase() !== ".ipynb")
        throw new Error(
          "Expected a .ipynb file, got: " + (path.extname(p) || "(no suffix)")
        );
      return api.loadNotebookJson(fs.readFileSync(p, "utf8"));
    }

    var exitCode = 0;
    try {
      var args = parseArgs(process.argv.slice(2));
      var nbPath = args.notebook;
      var nb = loadNotebook(nbPath);
      var notes = args.notes != null ? loadNotesFile(args.notes) : [];
      var outPath;
      if (args.output != null) {
        outPath = args.output;
      } else {
        var ext = path.extname(nbPath);
        outPath =
          ext.toLowerCase() === ".ipynb"
            ? nbPath.slice(0, -ext.length) + ".html"
            : nbPath + ".html";
      }
      var title =
        args.title != null
          ? args.title
          : path.basename(nbPath, path.extname(nbPath));
      var convertOptions = {
        title: title,
        sourceName: args.sourceName != null ? args.sourceName : path.basename(nbPath),
        notes: notes,
        allowNotes: !args.readonlyNotes,
        hideTallOutputs: args.hideTallOutputs,
      };
      if (args.exportNotebook != null) {
        convertOptions.exportNotebook = loadNotebook(args.exportNotebook);
      }
      if (args.exportSourceName != null) convertOptions.exportSourceName = args.exportSourceName;
      if (args.noteStorageKey != null) convertOptions.noteStorageKey = args.noteStorageKey;
      if (args.diffInitialMode != null) convertOptions.diffInitialMode = args.diffInitialMode;
      var html = api.convertNotebookToHtml(nb, convertOptions);
      var dir = path.dirname(outPath);
      if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outPath, html, "utf8");
      process.stdout.write(
        "Wrote " + outPath + " (" + notes.length + " notes)\n"
      );
    } catch (e) {
      process.stderr.write("error: " + e.message + "\n");
      exitCode = 1;
    }
    process.exit(exitCode);
  })();
}
