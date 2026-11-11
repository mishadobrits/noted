/**
 * Notes and highlighting UI inlined into generated notebook HTML.
 * Edit this as normal JavaScript. The wrapper publishes the script text
 * and does not run it.
 *
 * blobToDataUrl, inlineCssAssetUrls, and makeHtmlSelfContained are duplicated
 * in ipynb-to-html.js so the landing page can inline KaTeX the same way a
 * downloaded notebook page does.
 */
(function (root, factory) {
  var source = "(" + factory.toString() + ")();" + "\n";
  if (typeof module === "object" && module.exports) module.exports = source;
  else root.NotebookViewerSource = source;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  const state = window.__IPYNB_TO_HTML__;
  if (!state) return;
  const notesLocked = state.allowNotes === false;
  if (notesLocked) document.body.setAttribute("data-allow-notes", "false");

  const PY_KEYWORDS = {
    False:1, None:1, True:1, and:1, as:1, assert:1, async:1, await:1, break:1,
    class:1, continue:1, def:1, del:1, elif:1, else:1, except:1, finally:1,
    for:1, from:1, global:1, if:1, import:1, in:1, is:1, lambda:1, nonlocal:1,
    not:1, or:1, pass:1, raise:1, return:1, try:1, while:1, with:1, yield:1
  };

  function notes() { return state.notes; }


  function generateCellId() {
    var s = "";
    var hex = "0123456789abcdef";
    for (var i = 0; i < 8; i++) s += hex.charAt((Math.random() * 16) | 0);
    return s;
  }

  function ensureNotebookCellIds() {
    const cells = (state.notebook && state.notebook.cells) || [];
    const seen = Object.create(null);
    for (let i = 0; i < cells.length; i++) {
      let id = cells[i] && typeof cells[i].id === "string" ? cells[i].id.trim() : "";
      if (!id || seen[id]) {
        do { id = generateCellId(); } while (seen[id]);
        cells[i].id = id;
      }
      seen[id] = true;
    }
  }

  function cellIndexById(cellId) {
    if (cellId == null || cellId === "") return -1;
    const cells = (state.notebook && state.notebook.cells) || [];
    const want = String(cellId);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] && cells[i].id === want) return i;
    }
    return -1;
  }

  function cellIdAtIndex(index) {
    const cells = (state.notebook && state.notebook.cells) || [];
    const cell = cells[index];
    return cell && cell.id != null ? String(cell.id) : null;
  }

  function resolveLegacyCellOnAnchor(a) {
    if (!a || a.target === "note") return a;
    if (a.cell_id != null && String(a.cell_id) !== "") {
      a.cell_id = String(a.cell_id);
      delete a.cell;
      delete a.legacy_cell;
      return a;
    }
    const legacy = a.legacy_cell != null ? a.legacy_cell : a.cell;
    if (legacy != null) {
      const idx = Number(legacy);
      if (Number.isFinite(idx) && Math.floor(idx) === idx && idx >= 0) {
        const cid = cellIdAtIndex(idx);
        if (cid) {
          a.cell_id = cid;
          delete a.cell;
          delete a.legacy_cell;
        }
      }
    }
    return a;
  }

  function resolveNotesCellIds(noteList) {
    ensureNotebookCellIds();
    (noteList || notes()).forEach(function (n) {
      const anchors = n.anchors || [];
      anchors.forEach(function (anchor) {
        resolveLegacyCellOnAnchor(anchor);
        normalizeAnchorToNewNotebook(anchor);
      });
      if (n.cell_id == null && n.cell != null) {
        resolveLegacyCellOnAnchor(n);
      }
    });
  }

  function pickCellId(obj) {
    if (!obj) return null;
    if (obj.cell_id != null && String(obj.cell_id) !== "") return String(obj.cell_id);
    if (obj.cell != null && typeof obj.cell === "string" && obj.cell !== "" && !/^\d+$/.test(obj.cell)) {
      return String(obj.cell);
    }
    if (obj.cell != null && Number.isFinite(Number(obj.cell))) {
      return cellIdAtIndex(Number(obj.cell));
    }
    if (obj.legacy_cell != null) return cellIdAtIndex(Number(obj.legacy_cell));
    return null;
  }

  function normalizeNote(item, noteId) {
    const opacity = noteOpacity(item);
    let anchors = item.anchors;
    if (!Array.isArray(anchors) || !anchors.length) {
      const target = item.target || "cell";
      const a = {
        target: target,
        substring: item.substring || "",
        occurrence: item.occurrence || 0,
        range: Array.isArray(item.range) ? item.range.slice(0, 2) : null,
        line_range: Array.isArray(item.line_range) ? item.line_range.slice(0, 2) : null
      };
      if (target === "note") a.parent_note_id = item.parent_note_id;
      else if (target === "output") {
        a.cell_id = pickCellId(item);
        if (a.cell_id == null && item.cell != null && typeof item.cell === "number") a.legacy_cell = item.cell;
        a.output_index = item.output_index != null ? item.output_index : 0;
      } else if (target === "between_lines") {
        a.cell_id = pickCellId(item);
        if (a.cell_id == null && item.cell != null && typeof item.cell === "number") a.legacy_cell = item.cell;
        if (item.side === "above" || item.side === "below") a.side = item.side;
        else if (item.position === "above" || item.position === "below") a.side = item.position;
        if (Array.isArray(a.line_range)) a.after_line = a.side === "above" ? a.line_range[0] - 1 : a.line_range[1] - 1;
        else a.after_line = item.after_line != null ? item.after_line : 0;
      } else if (target === "between_cells") {
        a.cell_id = pickCellId(item);
        if (a.cell_id == null && item.cell != null && typeof item.cell === "number") a.legacy_cell = item.cell;
        if (item.side === "above" || item.side === "below") a.side = item.side;
        else if (item.position === "above" || item.position === "below") a.side = item.position;
        else a.side = "below";
        if (item.line != null && item.line !== "") {
          const keptLine = Number(item.line);
          if (Number.isFinite(keptLine)) a.line = Math.max(0, keptLine | 0);
        }
      } else {
        a.cell_id = pickCellId(item);
        if (a.cell_id == null && item.cell != null && typeof item.cell === "number") a.legacy_cell = item.cell;
      }
      anchors = [a];
    } else {
      anchors = anchors.map(function (a) {
        const o = {
          target: a.target || "cell",
          substring: a.substring || "",
          occurrence: a.occurrence || 0,
          range: Array.isArray(a.range) ? a.range.slice(0, 2) : null,
          line_range: Array.isArray(a.line_range) ? a.line_range.slice(0, 2) : null
        };
        if (o.target === "note") o.parent_note_id = a.parent_note_id;
        else if (o.target === "output") {
          o.cell_id = pickCellId(a);
          if (o.cell_id == null && a.cell != null && typeof a.cell === "number") o.legacy_cell = a.cell;
          o.output_index = a.output_index != null ? a.output_index : 0;
        } else if (o.target === "between_lines") {
          o.cell_id = pickCellId(a);
          if (o.cell_id == null && a.cell != null && typeof a.cell === "number") o.legacy_cell = a.cell;
          if (a.side === "above" || a.side === "below") o.side = a.side;
          else if (a.position === "above" || a.position === "below") o.side = a.position;
          if (Array.isArray(o.line_range)) o.after_line = o.side === "above" ? o.line_range[0] - 1 : o.line_range[1] - 1;
          else o.after_line = a.after_line != null ? a.after_line : 0;
        } else if (o.target === "between_cells") {
          o.cell_id = pickCellId(a);
          if (o.cell_id == null && a.cell != null && typeof a.cell === "number") o.legacy_cell = a.cell;
          if (a.side === "above" || a.side === "below") o.side = a.side;
          else if (a.position === "above" || a.position === "below") o.side = a.position;
          else o.side = "below";
          if (a.line != null && a.line !== "") {
            const keptLine = Number(a.line);
            if (Number.isFinite(keptLine)) o.line = Math.max(0, keptLine | 0);
          }
        } else {
          o.cell_id = pickCellId(a);
          if (o.cell_id == null && a.cell != null && typeof a.cell === "number") o.legacy_cell = a.cell;
        }
        return o;
      });
    }
    anchors.forEach(resolveLegacyCellOnAnchor);
    const primary = anchors[0] || {};
    let header = item.header;
    if (header == null) header = "";
    else if (typeof header !== "string") header = String(header);
    return {
      note_id: noteId != null ? noteId : item.note_id,
      color: item.color,
      opacity: opacity,
      header: header,
      comment: item.comment || "",
      anchors: anchors,
      substring: primary.substring || "",
      occurrence: primary.occurrence || 0,
      target: primary.target || "cell",
      cell_id: primary.cell_id != null ? primary.cell_id : null,
      output_index: primary.output_index,
      parent_note_id: primary.parent_note_id,
      after_line: primary.after_line,
      side: primary.side
    };
  }

  function primaryAnchor(n) {
    if (n.anchors && n.anchors.length) return n.anchors[0];
    return {
      target: n.target || "cell",
      substring: n.substring,
      occurrence: n.occurrence || 0,
      cell_id: n.cell_id != null ? n.cell_id : pickCellId(n),
      output_index: n.output_index,
      parent_note_id: n.parent_note_id,
      after_line: n.after_line,
      side: n.side
    };
  }

  function noteLabel(n) {
    const hdr = (n.header && String(n.header).trim()) || "";
    const c = (n.comment && String(n.comment).trim()) || "";
    const sub = primaryAnchor(n).substring || "";
    const labelSrc = hdr || c;
    const head = labelSrc
      ? labelSrc.replace(/\s+/g, " ").slice(0, 48)
      : ("“" + sub.replace(/\s+/g, " ").slice(0, 40) + "”");
    const long = labelSrc.length > 48 || (!labelSrc && sub.length > 40);
    return "#" + n.note_id + " · " + head + (long ? "…" : "");
  }

  let focusAnchorIndex = 0;

  function anchorKindLabel(a) {
    if (!a) return "cell";
    if (a.target === "note") return "nested under #" + (a.parent_note_id != null ? a.parent_note_id : "?");
    if (a.target === "output") {
      return "output cell_id " + (a.cell_id || "?") + "[" + (a.output_index || 0) + "]";
    }
    if (a.target === "between_lines") {
      const side = a.side === "above" ? "above" : (a.side === "below" ? "below" : "gap");
      return (side === "above" ? "above this line" : side === "below" ? "below this line" : "between lines " + side) + " · after L" + (a.after_line != null ? a.after_line : "?") +
        " (cell_id " + (a.cell_id || "?") + ")";
    }
    if (a.target === "between_cells") {
      const side = a.side === "above" ? "above this cell" : "below this cell";
      return "between cells " + side + " (cell_id " + (a.cell_id || "?") + ")";
    }
    return "cell_id " + (a.cell_id || "?");
  }

  function truncatePreview(s, n) {
    const t = String(s || "").replace(/\s+/g, " ");
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function findNth(source, substring, occurrence) {
    let start = 0, found = 0;
    while (true) {
      const idx = source.indexOf(substring, start);
      if (idx < 0) return -1;
      if (found === occurrence) return idx;
      found++;
      start = idx + substring.length;
    }
  }

  function cellSource(cellId) {
    const idx = cellIndexById(cellId);
    if (idx < 0) return "";
    const cell = state.notebook.cells[idx];
    if (!cell) return "";
    const s = cell.source;
    return Array.isArray(s) ? s.join("") : String(s || "");
  }

  function cellType(cellId) {
    const idx = cellIndexById(cellId);
    if (idx < 0) return "";
    const cell = state.notebook.cells[idx];
    return (cell && cell.cell_type) || "";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeHexColor(color) {
    if (typeof HtmlSanitize !== "undefined" && HtmlSanitize && typeof HtmlSanitize.safeHexColor === "function")
      return HtmlSanitize.safeHexColor(color);
    var c = String(color || "").replace(/^\s+|\s+$/g, "");
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c) ? c : "#ffe566";
  }

  function sanitizeNotebookHtml(html) {
    if (typeof HtmlSanitize !== "undefined" && HtmlSanitize && typeof HtmlSanitize.sanitizeHtml === "function")
      return HtmlSanitize.sanitizeHtml(html);
    return "";
  }

  function noteOpacity(n) {
    const v = (n && n.opacity != null) ? Number(n.opacity)
      : ((n && n.alpha != null) ? Number(n.alpha) : 1);
    if (!(v >= 0 && v <= 1)) return 1;
    return v;
  }

  function highlightBg(note) {
    const opacity = noteOpacity(note);
    const c = safeHexColor(note && note.color);
    const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(c);
    if (m) {
      let h = m[1];
      let r, g, b, op = opacity;
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
        op = Math.max(0, Math.min(1, (parseInt(h.slice(6, 8), 16) / 255) * opacity));
      }
      if (Math.abs(op - 1) < 1e-9) {
        return "#" + [r, g, b].map(function (x) {
          return ("0" + x.toString(16)).slice(-2);
        }).join("");
      }
      return "rgba(" + r + ", " + g + ", " + b + ", " + op + ")";
    }
    return "#ffe566";
  }


  function scrubLegacyCellKeys(value) {
    if (Array.isArray(value)) {
      value.forEach(scrubLegacyCellKeys);
      return value;
    }
    if (!value || typeof value !== "object") return value;
    if (Object.prototype.hasOwnProperty.call(value, "cell") && typeof value.cell === "number") {
      delete value.cell;
    }
    if (Object.prototype.hasOwnProperty.call(value, "legacy_cell")) {
      delete value.legacy_cell;
    }
    Object.keys(value).forEach(function (k) {
      scrubLegacyCellKeys(value[k]);
    });
    return value;
  }

  function replaceNoteInPlace(n, next) {
    if (!n || !next) return next;
    Object.keys(n).forEach(function (k) { delete n[k]; });
    Object.keys(next).forEach(function (k) { n[k] = next[k]; });
    delete n.cell;
    delete n.legacy_cell;
    return n;
  }

  function anchorTextForRange(a) {
    if (a.target === "note") { const p = notes().find(function (n) { return n.note_id === a.parent_note_id; }); return p ? String(p.comment || "") : ""; }
    if (a.target === "output") return outputText(a.cell_id, a.output_index || 0);
    return cellSource(a.cell_id);
  }

  function anchorToExportObj(a) {
    resolveLegacyCellOnAnchor(a);
    const x = { target: a.target || "cell" };
    if (a.cell_id != null && String(a.cell_id) !== "") x.cell_id = String(a.cell_id);
    if (x.target === "between_cells") {
      x.side = a.side === "above" ? "above" : "below";
      if (a.line != null && a.line !== "") x.line = Math.max(0, Number(a.line) | 0);
      return scrubLegacyCellKeys(x);
    }
    if (x.target === "between_lines") {
      const selected = Array.isArray(a.line_range) ? a.line_range[0] : ((Number(a.after_line) || 0) + (a.side === "above" ? 1 : 0));
      x.line_range = [Math.max(0, selected), Math.max(0, selected) + 1];
      if (a.side === "above" || a.side === "below") x.side = a.side;
      return scrubLegacyCellKeys(x);
    }
    const text = anchorTextForRange(a);
    let range = Array.isArray(a.range) ? a.range.slice(0, 2) : null;
    if (!range && a.substring) { const start = findNth(text, a.substring, a.occurrence || 0); if (start >= 0) range = [start, start + a.substring.length]; }
    if (range) x.range = [range[0] | 0, range[1] | 0];
    else { x.substring = a.substring || ""; x.occurrence = a.occurrence || 0; }
    if (x.target === "note") x.parent_note_id = a.parent_note_id;
    if (x.target === "output") x.output_index = a.output_index != null ? a.output_index : 0;
    return scrubLegacyCellKeys(x);
  }

  function noteToExportObj(n) {
    const norm = normalizeNote(n, n.note_id);
    resolveNotesCellIds([norm]);
    // Note-level only: color/opacity/header/comment (+ anchors).
    // No top-level mirrors of primary-anchor position fields.
    const o = {
      color: norm.color,
      opacity: noteOpacity(norm),
      anchors: (norm.anchors || []).map(anchorToExportObj)
    };
    if (norm.header && String(norm.header).trim()) o.header = String(norm.header);
    if (norm.comment) o.comment = norm.comment;
    return scrubLegacyCellKeys(o);
  }

  function notesForExport() {
    resolveNotesCellIds(notes());
    // Replace in-memory notes so stale numeric `cell` cannot linger after Object.assign upgrades
    state.notes = notes().map(function (n, i) {
      const next = normalizeNote(n, n.note_id != null ? n.note_id : i);
      resolveNotesCellIds([next]);
      delete next.cell;
      delete next.legacy_cell;
      (next.anchors || []).forEach(function (a) {
        delete a.cell;
        delete a.legacy_cell;
      });
      return next;
    });
    return scrubLegacyCellKeys(notes().map(noteToExportObj));
  }

  function downloadBlob(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  function downloadNotesJson() {
    const exported = notesForExport();
    const MIRROR = {
      cell: 1, cell_id: 1, legacy_cell: 1, substring: 1, occurrence: 1,
      target: 1, after_line: 1, side: 1, output_index: 1, parent_note_id: 1,
      position: 1
    };
    exported.forEach(function (note) {
      scrubLegacyCellKeys(note);
      Object.keys(MIRROR).forEach(function (k) { delete note[k]; });
    });
    downloadBlob("notes.json", JSON.stringify(exported, null, 2), "application/json");
  }

  function joinText(v) {
    if (Array.isArray(v)) return v.join("");
    return v == null ? "" : String(v);
  }

  function stripAnsi(s) {
    return String(s).replace(/\u001b\[[0-9;]*m/g, "");
  }

  function stripHtmlTags(s) {
    return String(s).replace(/<[^>]+>/g, "");
  }

  function htmlVisibleText(html) {
    if (typeof HtmlSanitize !== "undefined" && HtmlSanitize && typeof HtmlSanitize.visibleHtmlText === "function")
      return HtmlSanitize.visibleHtmlText(html);
    return stripHtmlTags(html);
  }

  function outputText(cellId, outputIndex) {
    const idx = cellIndexById(cellId);
    if (idx < 0) return "";
    const cell = state.notebook.cells[idx];
    if (!cell || !cell.outputs || !cell.outputs[outputIndex]) return "";
    const output = cell.outputs[outputIndex];
    const otype = output.output_type || "";
    if (otype === "stream") return joinText(output.text);
    if (otype === "error") {
      const tb = output.traceback || [];
      if (tb.length) return tb.map(stripAnsi).join("\n");
      return (output.ename || "Error") + ": " + (output.evalue || "");
    }
    if (otype === "execute_result" || otype === "display_data") {
      const data = output.data || {};
      if (data["text/html"] != null) return htmlVisibleText(joinText(data["text/html"]));
      if (data["text/plain"] != null) return joinText(data["text/plain"]);
      return "";
    }
    return "";
  }

  function outputRawHtml(cellId, outputIndex) {
    const idx = cellIndexById(cellId);
    if (idx < 0) return "";
    const cell = state.notebook.cells[idx];
    if (!cell || !cell.outputs || !cell.outputs[outputIndex]) return "";
    const data = (cell.outputs[outputIndex].data || {});
    return data["text/html"] != null ? joinText(data["text/html"]) : "";
  }

  function stripStoredNotes(nb) {
    if (!nb || !nb.metadata || !nb.metadata.ipynb_to_html) return nb;
    delete nb.metadata.ipynb_to_html.notes;
    return nb;
  }

  function downloadIpynb() {
    const nb = JSON.parse(JSON.stringify(notebookForExport()));
    stripStoredNotes(nb);
    const exportName = state.exportSourceName || state.sourceName || "notebook.ipynb";
    const name = /\.ipynb$/i.test(exportName) ? exportName : exportName.replace(/\.html$/i, "") + ".ipynb";
    downloadBlob(name, JSON.stringify(nb, null, 1), "application/x-ipynb+json");
  }

  function buildBootstrapPayload() {
    notesForExport();
    const nb = JSON.parse(JSON.stringify(state.notebook));
    stripStoredNotes(nb);
    const exportNotebook = JSON.parse(JSON.stringify(notebookForExport()));
    stripStoredNotes(exportNotebook);
    const notesState = notes().map(function (n, i) {
      const id = n.note_id != null ? n.note_id : i;
      return Object.assign({}, normalizeNote(n, id), { note_id: id });
    });
    return {
      notebook: nb,
      exportNotebook: exportNotebook,
      exportSourceName: state.exportSourceName,
      noteStorageKey: state.noteStorageKey,
      notes: notesState,
      allowNotes: !notesLocked,
      sourceName: state.sourceName,
      diffHasFilteredVariant: state.diffHasFilteredVariant,
      diffInitialMode: document.body.getAttribute("data-diff-mode") || state.diffInitialMode || "filtered",
      hideTallOutputs: state.hideTallOutputs !== false,
      cellMarkdownHtml: state.cellMarkdownHtml || {},
      cellProjections: state.cellProjections || {}
    };
  }

  function escapeBootstrapJson(obj) {
    return JSON.stringify(obj).replace(/<\//g, "<\\/");
  }

  function replaceEmbeddedBootstrap(html, bootstrapJson) {
    const marker = "window.__IPYNB_TO_HTML__ = ";
    const idx = html.indexOf(marker);
    if (idx < 0) throw new Error("Could not find embedded notebook state in page");
    const start = idx + marker.length;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let p = start; p < html.length; p++) {
      const c = html[p];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { end = p + 1; break; }
      }
    }
    if (end < 0) throw new Error("Could not parse embedded notebook state");
    let after = end;
    if (html.charAt(after) === ";") after++;
    return html.slice(0, idx) + marker + bootstrapJson + ";" + html.slice(after);
  }

  async function downloadAsHtml() {
    try {
      // Persist current notes into state before snapshot
      state.notes = notes().map(function (n, i) {
        return normalizeNote(n, n.note_id != null ? n.note_id : i);
      });
      const bootstrapJson = escapeBootstrapJson(buildBootstrapPayload());
      // Close transient UI in the snapshot
      const backdrop = document.getElementById("note-modal");
      const sel = document.getElementById("sel-bar");
      const hadModal = backdrop && backdrop.classList.contains("open");
      const hadSel = sel && sel.classList.contains("open");
      if (backdrop) backdrop.classList.remove("open");
      if (sel) sel.classList.remove("open");
      let html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
      if (hadModal && backdrop) backdrop.classList.add("open");
      if (hadSel && sel) sel.classList.add("open");
      html = replaceEmbeddedBootstrap(html, bootstrapJson);
      html = await makeHtmlSelfContained(html);
      const name = (state.sourceName || "notebook").replace(/\.ipynb$/i, "") + ".html";
      downloadBlob(name, html, "text/html;charset=utf-8");
    } catch (e) {
      alert("Could not download HTML: " + (e && e.message ? e.message : e));
    }
  }

  function coerceNotesArray(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && Array.isArray(data.notes)) return data.notes;
    throw new Error("Expected a notes JSON array, or { notes: [...] }");
  }

  function parseLoadedNotes(data) {
    const list = coerceNotesArray(data);
    return list.map(function (item, i) {
      if (!item || typeof item !== "object") {
        throw new Error("notes[" + i + "] must be an object");
      }
      if (!item.color || !String(item.color).trim()) {
        throw new Error("notes[" + i + "] requires color");
      }
      const hasAnchors = Array.isArray(item.anchors) && item.anchors.length;
      const isBetween =
        item.target === "between_lines" ||
        item.target === "between_cells" ||
        (hasAnchors && item.anchors.some(function (a) {
          return a && (a.target === "between_lines" || a.target === "between_cells");
        }));
      if (!hasAnchors && !isBetween && !(item.substring && String(item.substring))) {
        throw new Error("notes[" + i + "] requires substring or anchors");
      }
      if (!hasAnchors && item.target === "between_lines" && item.after_line == null && item.line_range == null) {
        throw new Error("notes[" + i + "] between_lines requires after_line");
      }
      if (!hasAnchors && item.target === "between_cells" && item.side !== "above" && item.side !== "below" && item.position !== "above" && item.position !== "below") {
        throw new Error("notes[" + i + "] between_cells requires side");
      }
      return normalizeNote(item, i);
    });
  }

  function loadNotesFromText(text, label) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON" + (label ? " in " + label : "") + ": " + e.message);
    }
    const parsed = parseLoadedNotes(data);
    resolveNotesCellIds(parsed);
    return parsed;
  }

  function applyLoadedNotes(parsed) {
    if (notesLocked) return false;
    const nCur = notes().length;
    const nNew = parsed.length;
    const msg =
      "Replace all current notes (" + nCur + ") with " + nNew +
      " from the file? This cannot be undone from the page.";
    if (!confirm(msg)) return false;
    resolveNotesCellIds(parsed);
    state.notes = parsed;
    applyClientHighlights();
    return true;
  }

  function wireLoadNotesButton() {
    const btn = document.getElementById("btn-load-notes");
    let input = document.getElementById("notes-file-input");
    if (!btn) return;
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "notes-file-input";
      input.accept = "application/json,.json";
      input.hidden = true;
      document.body.appendChild(input);
    }
    btn.addEventListener("click", function () {
      input.value = "";
      input.click();
    });
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = function () {
        alert("Could not read file.");
      };
      reader.onload = function () {
        try {
          const parsed = loadNotesFromText(String(reader.result || ""), file.name);
          applyLoadedNotes(parsed);
        } catch (e) {
          alert("Could not load notes: " + (e && e.message ? e.message : e));
        }
      };
      reader.readAsText(file);
    });
  }

  function tokenStyleMap(code) {
    const styles = new Array(code.length);
    for (let i = 0; i < styles.length; i++) styles[i] = null;
    const TQ = String.fromCharCode(39,39,39);
    const DQ3 = String.fromCharCode(34,34,34);
    const stringRe = new RegExp(
      TQ + "[\\s\\S]*?" + TQ + "|" + DQ3 + "[\\s\\S]*?" + DQ3 +
      "|'((?:\\\\.|[^'\\\\])*)'|\"((?:\\\\.|[^\"\\\\])*)\"",
      "g"
    );
    const commentRe = /#.*?$/gm;
    const numberRe = /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
    const nameRe = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    function paint(re, cssOrFn) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        const css = typeof cssOrFn === "function" ? cssOrFn(m[0]) : cssOrFn;
        for (let i = m.index; i < m.index + m[0].length; i++) {
          if (styles[i] == null) styles[i] = css;
        }
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    function force(re, css) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        for (let i = m.index; i < m.index + m[0].length; i++) styles[i] = css;
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    paint(nameRe, function (t) { return PY_KEYWORDS[t] ? "tok-kw" : null; });
    paint(numberRe, "tok-num");
    force(stringRe, "tok-str");
    force(commentRe, "tok-comment");
    return styles;
  }

  function lineSegments(start, end, text) {
    const segs = [];
    let i = start;
    while (i < end) {
      const nl = text.indexOf("\n", i);
      if (nl < 0 || nl >= end) {
        if (i < end) segs.push([i, end]);
        break;
      }
      if (nl > i) segs.push([i, nl]);
      i = nl + 1;
    }
    return segs;
  }

  function matchNotesOnText(text, noteList) {
    // Legacy: match each note's primary substring against text
    const matched = [];
    noteList.forEach(function (n) {
      const norm = normalizeNote(n, n.note_id);
      norm.anchors.forEach(function (a, ai) {
        const idx = Array.isArray(a.range) ? a.range[0] : findNth(text, a.substring, a.occurrence || 0);
        const end = Array.isArray(a.range) ? a.range[1] : idx + a.substring.length;
        if (idx < 0 || end <= idx || end > text.length) return;
        matched.push(Object.assign({}, norm, {
          start: idx,
          end: end,
          anchor_index: ai,
          substring: a.substring,
          occurrence: a.occurrence || 0,
          target: a.target,
          cell_id: a.cell_id,
          output_index: a.output_index,
          parent_note_id: a.parent_note_id,
          has_comment: !!((norm.header && String(norm.header).trim()) || (norm.comment && String(norm.comment).trim()))
        }));
      });
    });
    return matched;
  }

  function matchAnchorsOnText(text, noteList, predicate) {
    const matched = [];
    noteList.forEach(function (n) {
      const norm = normalizeNote(n, n.note_id);
      norm.anchors.forEach(function (a, ai) {
        if (predicate && !predicate(a, norm)) return;
        const idx = Array.isArray(a.range) ? a.range[0] : findNth(text, a.substring, a.occurrence || 0);
        const end = Array.isArray(a.range) ? a.range[1] : idx + a.substring.length;
        if (idx < 0 || end <= idx || end > text.length) return;
        matched.push(Object.assign({}, norm, {
          start: idx,
          end: end,
          anchor_index: ai,
          substring: a.substring,
          occurrence: a.occurrence || 0,
          target: a.target,
          cell_id: a.cell_id,
          output_index: a.output_index,
          parent_note_id: a.parent_note_id,
          has_comment: !!((norm.header && String(norm.header).trim()) || (norm.comment && String(norm.comment).trim()))
        }));
      });
    });
    return matched;
  }

  function renderStyledPlain(source, styles, matched) {
    const intervals = [];
    matched.forEach(function (n) {
      lineSegments(n.start, n.end, source).forEach(function (pair) {
        intervals.push({ a: pair[0], b: pair[1], note: n });
      });
    });
    const boundSet = { 0: true };
    boundSet[source.length] = true;
    intervals.forEach(function (iv) {
      boundSet[iv.a] = true;
      boundSet[iv.b] = true;
    });
    const points = Object.keys(boundSet).map(Number).sort(function (a, b) { return a - b; });

    function covering(pos, end) {
      const hit = [];
      const seen = {};
      intervals.forEach(function (iv) {
        const key = iv.note.note_id + ":" + (iv.note.anchor_index != null ? iv.note.anchor_index : 0);
        if (iv.a < end && iv.b > pos && !seen[key]) {
          hit.push(iv.note);
          seen[key] = true;
        }
      });
      hit.sort(function (a, b) {
        const la = a.end - a.start, lb = b.end - b.start;
        if (a.start !== b.start) return a.start - b.start;
        if (la !== lb) return lb - la;
        if (a.note_id !== b.note_id) return a.note_id - b.note_id;
        return (a.anchor_index || 0) - (b.anchor_index || 0);
      });
      return hit;
    }

    const segments = [];
    for (let pi = 0; pi < points.length - 1; pi++) {
      const a = points[pi], b = points[pi + 1];
      if (a >= b) continue;
      segments.push({ a: a, b: b, cover: covering(a, b) });
    }
    // Connector anchor = last segment per (note_id, anchor_index)
    const anchorSeg = {};
    segments.forEach(function (seg, si) {
      seg.cover.forEach(function (note) {
        if (note.has_comment) {
          const key = note.note_id + ":" + (note.anchor_index != null ? note.anchor_index : 0);
          anchorSeg[key] = si;
        }
      });
    });
    let html = "";
    segments.forEach(function (seg, si) {
      const a = seg.a, b = seg.b, cover = seg.cover;
      let styled = "";
      let i = a;
      while (i < b) {
        const st = styles[i];
        let j = i + 1;
        while (j < b && styles[j] === st) j++;
        let piece = escapeHtml(source.slice(i, j));
        if (st) piece = '<span class="' + st + '">' + piece + "</span>";
        styled += piece;
        i = j;
      }
      const opens = [];
      const closes = [];
      cover.forEach(function (note) {
        const ai = note.anchor_index != null ? note.anchor_index : 0;
        const key = note.note_id + ":" + ai;
        const isAnchor = !!(note.has_comment && anchorSeg[key] === si);
        opens.push(
          '<mark class="' + diffDecorationClass(note.note_id) + '" data-note="' + note.note_id + '" data-anchor="' + ai + '"' +
          (isAnchor ? ' data-note-anchor="1"' : "") +
          ' style="background-color:' + escapeHtml(highlightBg(note)) + '">'
        );
        closes.push("</mark>");
      });
      html += opens.join("") + styled + closes.reverse().join("");
    });
    return html;
  }

  function softVisibleNeedle(frag) {
    return String(frag).split(/\r\n|\r|\n/).map(function (line) {
      let s = line.trim();
      s = s.replace(/^#{1,6}\s+/, "");
      s = s.replace(/^[-*+]\s+/, "");
      s = s.replace(/^\d+\.\s+/, "");
      s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
      s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      s = s.replace(/`([^`]+)`/g, "$1");
      s = s.replace(/\*\*/g, "").replace(/__/g, "");
      s = s.replace(/(^|[^\w])\*([^*]+)\*(?!\w)/g, "$1$2");
      s = s.replace(/(^|[^\w])_([^_]+)_(?!\w)/g, "$1$2");
      return s;
    }).filter(Boolean).join("\n");
  }

  function splitFragByMath(frag) {
    const re = /(\$\$[\s\S]+?\$\$)|(\$[^\$\n]+?\$)|(\\\[[\s\S]+?\\\])|(\\\([\s\S]+?\\\))/g;
    const parts = [];
    let last = 0, m;
    while ((m = re.exec(frag)) !== null) {
      if (m.index > last) parts.push({ kind: "text", text: frag.slice(last, m.index) });
      parts.push({ kind: "tex", text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < frag.length) parts.push({ kind: "text", text: frag.slice(last) });
    if (!parts.length) parts.push({ kind: "text", text: frag });
    return parts;
  }

  function findNthInHaystack(haystack, needle, occurrence) {
    if (!needle) return -1;
    let start = 0, found = 0;
    while (true) {
      const idx = haystack.indexOf(needle, start);
      if (idx < 0) return -1;
      if (found === occurrence) return idx;
      found++;
      start = idx + needle.length;
    }
  }

  function countNonOverlappingBefore(haystack, needle, beforeIndex) {
    if (!needle) return 0;
    let start = 0, found = 0;
    while (true) {
      const idx = haystack.indexOf(needle, start);
      if (idx < 0 || idx >= beforeIndex) return found;
      found++;
      start = idx + needle.length;
    }
  }

  // CommonMark drops a backslash that escapes ASCII punctuation (\{ \} \_ ...).
  function markdownUnescapePunct(text) {
    return String(text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
  }

  // Source needle after Markdown eats escape backslashes. Occurrence is counted
  // in the unescaped source so a later copy (two \right\} in one formula) wins.
  function rangeForMarkdownEscapes(textContent, source, noteStart, frag) {
    const visibleFrag = markdownUnescapePunct(frag);
    if (!visibleFrag || visibleFrag === frag) return null;
    const needles = [visibleFrag];
    const soft = softVisibleNeedle(visibleFrag);
    if (soft && soft !== visibleFrag && soft !== frag) needles.push(soft);
    const visibleSource = markdownUnescapePunct(source);
    const visibleStart = markdownUnescapePunct(source.slice(0, Math.max(0, noteStart))).length;
    for (let n = 0; n < needles.length; n++) {
      const needle = needles[n];
      const occ = countNonOverlappingBefore(visibleSource, needle, visibleStart);
      let at = findNthInHaystack(textContent, needle, occ);
      if (at < 0) at = textContent.indexOf(needle);
      if (at >= 0) return [at, at + needle.length];
    }
    return null;
  }

  function renderedNeedleCandidates(text) {
    const unescaped = markdownUnescapePunct(text);
    const list = [text, unescaped, softVisibleNeedle(unescaped), softVisibleNeedle(text), String(text).trim()];
    const out = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const cand = list[i];
      if (!cand || seen[cand]) continue;
      seen[cand] = true;
      out.push(cand);
    }
    return out;
  }

  function findRenderedNeedle(textContent, source, noteStart, needle) {
    if (!needle) return -1;
    const srcAt = source.indexOf(needle, Math.max(0, noteStart));
    if (srcAt >= 0) {
      const occ = countNonOverlappingBefore(source, needle, srcAt);
      let at = findNthInHaystack(textContent, needle, occ);
      if (at < 0) at = textContent.indexOf(needle);
      return at;
    }
    const visibleSource = markdownUnescapePunct(source);
    const visibleStart = markdownUnescapePunct(source.slice(0, Math.max(0, noteStart))).length;
    const occ = countNonOverlappingBefore(visibleSource, needle, visibleStart);
    let at = findNthInHaystack(textContent, needle, occ);
    if (at < 0) at = textContent.indexOf(needle);
    return at;
  }

  function noteTextRangesInRendered(textContent, source, note) {
    const frag = source.slice(note.start, note.end);
    const fragOcc = countNonOverlappingBefore(source, frag, note.start);
    let idx = findNthInHaystack(textContent, frag, fragOcc);
    if (idx < 0) idx = textContent.indexOf(frag);
    if (idx >= 0) return [[idx, idx + frag.length]];

    const escaped = rangeForMarkdownEscapes(textContent, source, note.start, frag);
    if (escaped) return [escaped];

    // Math-inclusive: map prose segments only (tex highlighted via .tex-math separately)
    const pieces = splitFragByMath(frag);
    if (pieces.some(function (p) { return p.kind === "tex"; })) {
      const ranges = [];
      pieces.forEach(function (p) {
        if (p.kind !== "text") return;
        const t = p.text;
        if (!t || !t.trim()) return;
        const candidates = renderedNeedleCandidates(t);
        for (let c = 0; c < candidates.length; c++) {
          const cand = candidates[c];
          const at = findRenderedNeedle(textContent, source, note.start, cand);
          if (at >= 0) {
            ranges.push([at, at + cand.length]);
            break;
          }
        }
      });
      if (ranges.length) return ranges;
    }

    const soft = softVisibleNeedle(frag);
    if (soft) {
      idx = textContent.indexOf(soft);
      if (idx >= 0) return [[idx, idx + soft.length]];
      const softFlat = soft.replace(/\s+/g, " ").trim();
      idx = textContent.indexOf(softFlat);
      if (idx >= 0) return [[idx, idx + softFlat.length]];
    }
    const ranges = [];
    lineSegments(note.start, note.end, source).forEach(function (pair) {
      const lineFrag = source.slice(pair[0], pair[1]);
      const candidates = renderedNeedleCandidates(lineFrag);
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c];
        const at = findRenderedNeedle(textContent, source, pair[0], cand);
        if (at >= 0) {
          ranges.push([at, at + cand.length]);
          break;
        }
      }
    });
    return ranges;
  }

  function applyMarksToRenderedRoot(root, source, matched) {
    // KaTeX replaces its target's children. Render first so it cannot erase
    // the note highlights and connector anchors installed below.
    if (matched.length) typesetMath(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        let p = n.parentElement;
        while (p && p !== root) {
          if (p.classList && (p.classList.contains("tex-math") || p.classList.contains("katex"))) {
            return NodeFilter.FILTER_REJECT;
          }
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.length) nodes.push(node);
    }
    // Also treat data-tex spans as atomic text for matching by temporarily using attribute
    // Matching uses soft needles against concatenated non-math text + we also try data-tex separately
    const textContent = nodes.map(function (n) { return n.nodeValue; }).join("");
    if (!matched.length) return;

    const cover = [];
    for (let i = 0; i < textContent.length; i++) cover[i] = [];
    matched.forEach(function (note) {
      noteTextRangesInRendered(textContent, source, note).forEach(function (pair) {
        const a = Math.max(0, Math.min(pair[0], textContent.length));
        const b = Math.max(0, Math.min(pair[1], textContent.length));
        for (let i = a; i < b; i++) cover[i].push(note);
      });
    });
    // Highlight .tex-math only when that instance's SOURCE range overlaps the note.
    // Walk DOM formulas in order; bind each to the next non-overlapping source match
    // of its data-tex (same sequencing as findNth) â never paint every identical formula.
    const texEls = Array.prototype.slice.call(root.querySelectorAll(".tex-math[data-tex]"));
    const texBindings = [];
    let texSearchFrom = 0;
    texEls.forEach(function (el) {
      const tex = el.getAttribute("data-tex") || "";
      if (!tex) return;
      let idx = source.indexOf(tex, texSearchFrom);
      if (idx < 0) {
        idx = source.indexOf(tex);
        while (idx >= 0 && texBindings.some(function (b) { return b.start === idx; })) {
          idx = source.indexOf(tex, idx + tex.length);
        }
      }
      if (idx < 0) return;
      texBindings.push({ el: el, start: idx, end: idx + tex.length, tex: tex });
      texSearchFrom = idx + tex.length;
    });
    matched.forEach(function (note) {
      texBindings.forEach(function (b) {
        if (!(b.start < note.end && b.end > note.start)) return;
        if (b.el.querySelector("mark.note-hl")) return;
        const mark = document.createElement("mark");
        mark.className = "note-hl";
        mark.setAttribute("data-note", String(note.note_id));
        mark.setAttribute("data-anchor", String(note.anchor_index != null ? note.anchor_index : 0));
        mark.style.backgroundColor = highlightBg(note);
        // Keep the display-math wrapper outside the inline highlight so the
        // formula retains its layout and the connector measures its contents.
        const content = b.el.querySelector(".katex") || b.el;
        while (content.firstChild) mark.appendChild(content.firstChild);
        content.appendChild(mark);
      });
    });

    for (let i = 0; i < cover.length; i++) {
      const seen = {};
      const uniq = [];
      cover[i].forEach(function (n) {
        const key = n.note_id + ":" + (n.anchor_index != null ? n.anchor_index : 0);
        if (!seen[key]) { uniq.push(n); seen[key] = true; }
      });
      uniq.sort(function (a, b) {
        const la = a.end - a.start, lb = b.end - b.start;
        if (a.start !== b.start) return a.start - b.start;
        if (la !== lb) return lb - la;
        if (a.note_id !== b.note_id) return a.note_id - b.note_id;
        return (a.anchor_index || 0) - (b.anchor_index || 0);
      });
      cover[i] = uniq;
    }

    if (!textContent) {
      finalizeNoteAnchors(root, matched);
      return;
    }
    let globalOffset = textContent.length;
    for (let ni = nodes.length - 1; ni >= 0; ni--) {
      const tn = nodes[ni];
      const val = tn.nodeValue;
      const start = globalOffset - val.length;
      globalOffset = start;
      const parts = [];
      let i = 0;
      while (i < val.length) {
        const abs = start + i;
        const sig = (cover[abs] || []).map(function (n) {
          return n.note_id + ":" + (n.anchor_index != null ? n.anchor_index : 0);
        }).join(",");
        let j = i + 1;
        while (j < val.length) {
          const sigj = (cover[start + j] || []).map(function (n) {
            return n.note_id + ":" + (n.anchor_index != null ? n.anchor_index : 0);
          }).join(",");
          if (sigj !== sig) break;
          j++;
        }
        parts.push({ i: i, j: j, notes: cover[abs] || [] });
        i = j;
      }
      if (parts.length === 1 && parts[0].notes.length === 0) continue;
      const frag = document.createDocumentFragment();
      parts.forEach(function (p) {
        let nodeOut = document.createTextNode(val.slice(p.i, p.j));
        for (let k = p.notes.length - 1; k >= 0; k--) {
          const note = p.notes[k];
          const mark = document.createElement("mark");
          mark.className = "note-hl";
          mark.setAttribute("data-note", String(note.note_id));
          mark.setAttribute("data-anchor", String(note.anchor_index != null ? note.anchor_index : 0));
          mark.style.backgroundColor = highlightBg(note);
          mark.appendChild(nodeOut);
          nodeOut = mark;
        }
        frag.appendChild(nodeOut);
      });
      tn.parentNode.replaceChild(frag, tn);
    }
    // After all marks exist: anchor = last mark in document order for each note
    finalizeNoteAnchors(root, matched);
  }

  function finalizeNoteAnchors(root, matched) {
    const want = {};
    (matched || []).forEach(function (n) {
      if (n.has_comment) {
        const ai = n.anchor_index != null ? n.anchor_index : 0;
        want[n.note_id + ":" + ai] = true;
      }
    });
    const byKey = {};
    Array.prototype.forEach.call(root.querySelectorAll("mark.note-hl[data-note]"), function (mark) {
      const id = mark.getAttribute("data-note");
      const ai = mark.getAttribute("data-anchor") || "0";
      const key = id + ":" + ai;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(mark);
    });
    Object.keys(byKey).forEach(function (key) {
      if (!want[key]) return;
      const marks = byKey[key];
      marks.forEach(function (m) { m.removeAttribute("data-note-anchor"); });
      marks[marks.length - 1].setAttribute("data-note-anchor", "1");
    });
  }

  function applyMarksToPlainTextContainer(el, text, matched) {
    // For note comment bodies: render escaped text with nested marks
    const styles = new Array(text.length).fill(null);
    el.innerHTML = renderStyledPlain(text, styles, matched);
  }

  function typesetMath(root) {
    if (typeof katex === "undefined" || !katex || typeof katex.render !== "function") return;
    (root || document).querySelectorAll(".md-rendered .tex-math, .note-card-body .tex-math").forEach(function (el) {
      if (el.querySelector(".katex")) return;
      const raw = el.getAttribute("data-tex") || "";
      if (!raw) return;
      let tex = raw;
      let display = false;
      if (raw.slice(0, 2) === "$$" && raw.slice(-2) === "$$" && raw.length >= 4) {
        tex = raw.slice(2, -2);
        display = true;
      } else if (raw.slice(0, 3) === "\\\\[" && raw.slice(-3) === "\\\\]") {
        tex = raw.slice(3, -3);
        display = true;
      } else if (raw.slice(0, 3) === "\\\\(" && raw.slice(-3) === "\\\\)") {
        tex = raw.slice(3, -3);
      } else if (raw.slice(0, 2) === "\\[" && raw.slice(-2) === "\\]") {
        tex = raw.slice(2, -2);
        display = true;
      } else if (raw.slice(0, 2) === "\\(" && raw.slice(-2) === "\\)") {
        tex = raw.slice(2, -2);
      } else if (raw.charAt(0) === "$" && raw.charAt(raw.length - 1) === "$" && raw.length >= 3) {
        tex = raw.slice(1, -1);
      } else if (raw.slice(0, 6) === "\\begin") {
        display = true;
      }
      try { katex.render(tex, el, { throwOnError: false, displayMode: display }); } catch (e) {}
    });
  }

  // Wrap raw $...$ / $$...$$ in note bodies so data-tex is available (like markdown cells).
  function wrapTexMathSpans(html) {
    const re = /(\$\$[\s\S]+?\$\$)|(\$[^\$\n]+?\$)|(\\\[[\s\S]+?\\\])|(\\\([\s\S]+?\\\))/g;
    return html.replace(re, function (raw) {
      // Skip if already inside an attribute or tag we accidentally matched
      if (raw.indexOf("data-tex") >= 0) return raw;
      return '<span class="tex-math" data-tex="' + escapeHtml(raw) + '">' + raw + "</span>";
    });
  }

  // Notebook cells and note comments. JupyterLab parses GFM with marked, then sanitizes.
  // Prefer the shared converter when this page loaded IpynbToHtml; generated pages use marked directly.
  function commentMarkdownToHtml(src) {
    if (window.IpynbToHtml && typeof window.IpynbToHtml.markdownToHtml === "function") {
      return window.IpynbToHtml.markdownToHtml(String(src || ""));
    }
    return localCommentMarkdownToHtml(String(src || ""));
  }

  function localCommentMarkdownToHtml(src) {
    const api = globalThis.JupyterRemoveMath;
    const extracted = api && typeof api.removeMath === "function"
      ? api.removeMath(String(src || ""))
      : { text: String(src || ""), math: [] };
    const text = extracted.text;
    const maths = extracted.math;
    let html = "";
    if (typeof marked !== "undefined" && marked && typeof marked.parse === "function") {
      const parsed = marked.parse(text, { async: false, gfm: true, breaks: false });
      if (parsed && typeof parsed.then === "function") throw new Error("marked.parse returned a promise");
      html = sanitizeNotebookHtml(parsed);
    } else {
      html = "<p>" + escapeHtml(text) + "</p>";
    }
    if (api && typeof api.restoreMathSpans === "function") return api.restoreMathSpans(html, maths, escapeHtml);
    return html;
  }

  function cardHtml(n, bodyInner, depth) {
    const norm = normalizeNote(n, n.note_id);
    const pA = primaryAnchor(norm);
    const nest = (pA.target === "note") ? " note-card-nested" : "";
    const d = depth != null ? depth : 0;
    const cellAttr = (norm.cell_id != null && norm.cell_id !== "")
      ? (' data-cell-id="' + escapeHtml(String(norm.cell_id)) + '"') : "";
    const parentAttr = (pA.target === "note" && pA.parent_note_id != null) ? String(pA.parent_note_id) : "";
    const hdr = (norm.header && String(norm.header).trim()) || "";
    const headerHtml = hdr
      ? ('<div class="note-card-header">' + escapeHtml(hdr) + "</div>")
      : "";
    return (
      '<div class="note-card' + nest + '" id="note-comment-' + norm.note_id + '" data-note="' + norm.note_id +
      '" data-parent-note="' + parentAttr +
      '" data-depth="' + d + '"' + cellAttr +
      ' style="border-left-color:' + escapeHtml(safeHexColor(norm.color)) + ';--note-color:' + escapeHtml(safeHexColor(norm.color)) + '">' +
      headerHtml +
      '<div class="note-card-body annotatable-note md-note" data-note-body="' + norm.note_id + '">' +
      bodyInner + "</div>" +
      "</div>"
    );
  }

  function noteDepth(n, byId) {
    let d = 0;
    let cur = normalizeNote(n, n.note_id);
    const seen = {};
    while (true) {
      const pA = primaryAnchor(cur);
      if (pA.target !== "note" || pA.parent_note_id == null) break;
      if (seen[cur.note_id]) break;
      seen[cur.note_id] = true;
      d += 1;
      const p = byId[pA.parent_note_id];
      if (!p) break;
      cur = normalizeNote(p, p.note_id);
    }
    return d;
  }

  function rootCellForNote(n, byId) {
    let cur = normalizeNote(n, n.note_id);
    const seen = {};
    while (true) {
      const pA = primaryAnchor(cur);
      if (pA.target !== "note" || pA.parent_note_id == null) break;
      if (seen[cur.note_id]) break;
      seen[cur.note_id] = true;
      const p = byId[pA.parent_note_id];
      if (!p) break;
      cur = normalizeNote(p, p.note_id);
    }
    const anchors = cur.anchors || [primaryAnchor(cur)];
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].cell_id != null && anchors[i].cell_id !== "") return anchors[i].cell_id;
    }
    return n.cell_id != null ? n.cell_id : null;
  }

  function noteSourceStart(n, byId) {
    const a = primaryAnchor(normalizeNote(n, n.note_id));
    const t = a.target || "cell";
    if (t === "between_cells") return 0;
    if (t === "between_lines") {
      const src = cellSource(a.cell_id);
      let off = 0;
      const want = a.after_line != null ? a.after_line : 0;
      for (let i = 0; i < want; i++) {
        const nl = src.indexOf("\n", off);
        if (nl < 0) return Number.MAX_SAFE_INTEGER;
        off = nl + 1;
      }
      const nl = src.indexOf("\n", off);
      return nl < 0 ? off : nl;
    }
    if (t === "cell") {
      const src = cellSource(a.cell_id);
      if (Array.isArray(a.range)) return a.range[0];
      if (Array.isArray(a.range)) return a.range[0];
      const idx = findNth(src, a.substring, a.occurrence || 0);
      return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
    }
    if (t === "output") {
      const src = outputText(a.cell_id, a.output_index);
      const idx = findNth(src, a.substring, a.occurrence || 0);
      return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
    }
    const parent = byId[a.parent_note_id];
    if (!parent || !parent.comment) return Number.MAX_SAFE_INTEGER;
    const idx = findNth(parent.comment, a.substring, a.occurrence || 0);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
  }

  function noteDocOrderKey(n, byId) {
    const norm = normalizeNote(n, n.note_id);
    const a = primaryAnchor(norm);
    const t = a.target || "cell";
    const cellOrd = a.cell_id != null ? cellIndexById(a.cell_id) : 999999;
    const ord = cellOrd >= 0 ? cellOrd : 999999;
    if (t === "cell") {
      // A substring shares the between-lines axis. Line -1 put every
      // cell anchor above every gap marker in that cell.
      const start = noteSourceStart(norm, byId);
      const line = start === Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : selectionLineIndex(cellSource(a.cell_id), start);
      return [ord, 0, line, start, norm.note_id];
    }
    if (t === "output") {
      const oi = a.output_index != null ? a.output_index : 999999;
      return [ord, 1, oi, noteSourceStart(norm, byId), norm.note_id];
    }
    if (t === "between_lines") {
      return [ord, 0, a.after_line != null ? a.after_line : 0, noteSourceStart(norm, byId), norm.note_id];
    }
    if (t === "between_cells") {
      const linePos = Number(a.line);
      const vertical = Number.isFinite(linePos) ? linePos : 0;
      const signed = a.side === "below" ? vertical : -vertical;
      return [ord, a.side === "above" ? -1 : 2, signed, 0, norm.note_id];
    }
    const parent = byId[a.parent_note_id];
    if (!parent) {
      return [999999, 9, 999999, noteSourceStart(norm, byId), norm.note_id];
    }
    const parentKey = noteDocOrderKey(parent, byId);
    return [parentKey[0], parentKey[1], parentKey[2], noteSourceStart(norm, byId), norm.note_id];
  }

  function cmpDocOrder(a, b, byId) {
    const ka = noteDocOrderKey(a, byId);
    const kb = noteDocOrderKey(b, byId);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  }

  function rebuildCellNotesRails() {
    document.querySelectorAll(".notes-cascade").forEach(function (cascade) {
      cascade.innerHTML = "";
    });
    const byId = {};
    notes().forEach(function (n) { byId[n.note_id] = n; });

    const commentNotes = notes().filter(function (n) {
      const hdr = n.header && String(n.header).trim();
      const c = n.comment && String(n.comment).trim();
      return !!(hdr || c);
    });

    const byCell = {};
    commentNotes.forEach(function (n) {
      const cell = rootCellForNote(n, byId);
      if (cell == null || cell === "") return;
      if (!byCell[cell]) byCell[cell] = [];
      byCell[cell].push(n);
    });

    document.querySelectorAll(".notes-cascade").forEach(function (cascade) {
      const cellKey = cascade.getAttribute("data-cell-id") || cascade.getAttribute("data-cell");
      if (!byCell[cellKey]) byCell[cellKey] = [];
    });

    Object.keys(byCell).forEach(function (cellKey) {
      const cascade = document.getElementById("notes-cascade-" + cellKey);
      if (!cascade) return;
      const list = byCell[cellKey].slice().sort(function (a, b) {
        return cmpDocOrder(a, b, byId);
      });
      let maxDepth = 0;
      const depths = {};
      list.forEach(function (n) {
        const d = noteDepth(n, byId);
        depths[n.note_id] = d;
        if (d > maxDepth) maxDepth = d;
      });
      for (let d = 0; d <= maxDepth; d++) {
        const rail = document.createElement("aside");
        rail.className = "cell-notes-rail";
        rail.setAttribute("data-depth", String(d));
        rail.setAttribute("data-cell-id", cellKey);
        rail.id = "cell-notes-" + cellKey + "-d" + d;
        cascade.appendChild(rail);
      }
      list.forEach(function (n) {
        const d = depths[n.note_id];
        const rail = cascade.querySelector('.cell-notes-rail[data-depth="' + d + '"]');
        if (!rail) return;
        const matchedKids = matchAnchorsOnText(n.comment, notes(), function (a) {
          return a.target === "note" && a.parent_note_id === n.note_id;
        });
        const bodyInner = commentMarkdownToHtml(n.comment || "");
        rail.insertAdjacentHTML("beforeend", cardHtml(n, bodyInner, d));
        if (matchedKids.length) {
          const bodyEl = rail.querySelector('#note-comment-' + n.note_id + ' .note-card-body');
          if (bodyEl) applyMarksToRenderedRoot(bodyEl, n.comment || "", matchedKids);
        }
      });
    });
  }

  function medianSorted(values) {
    const s = values.slice().sort(function (a, b) { return a - b; });
    const n = s.length;
    if (!n) return 0;
    if (n % 2) return s[(n - 1) >> 1];
    return (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  /** Isotonic L1 (PAVA + medians): nondecreasing z minimizing Σ|z_i − t_i|. */
  function isotonicL1(targets) {
    const blocks = [];
    for (let i = 0; i < targets.length; i++) {
      blocks.push({ values: [targets[i]] });
      while (blocks.length >= 2) {
        const a = blocks[blocks.length - 2];
        const b = blocks[blocks.length - 1];
        if (medianSorted(a.values) <= medianSorted(b.values)) break;
        a.values = a.values.concat(b.values);
        blocks.pop();
      }
    }
    const out = [];
    blocks.forEach(function (b) {
      const m = medianSorted(b.values);
      for (let k = 0; k < b.values.length; k++) out.push(m);
    });
    return out;
  }

  /**
   * Place tops to minimize Σ|top_i − targetTop_i| subject to
   * top_{i+1} ≥ top_i + height_i + gap and top_i ≥ 0 (doc order preserved).
   * Via shift transform + isotonic L1.
   */
  function packTopsMinL1(targetTops, heights, gap) {
    const n = targetTops.length;
    if (!n) return [];
    const S = new Array(n);
    S[0] = 0;
    for (let i = 1; i < n; i++) {
      S[i] = S[i - 1] + heights[i - 1] + gap;
    }
    const shifted = targetTops.map(function (t, i) { return t - S[i]; });
    const z = isotonicL1(shifted);
    const tops = z.map(function (zi, i) { return zi + S[i]; });
    // Floor at 0, then re-enforce separations (keeps feasibility).
    if (tops[0] < 0) tops[0] = 0;
    for (let i = 1; i < n; i++) {
      const minTop = tops[i - 1] + heights[i - 1] + gap;
      if (tops[i] < minTop) tops[i] = minTop;
      if (tops[i] < 0) tops[i] = 0;
    }
    return tops;
  }

  function markAnchorMidY(mark, originTop) {
    const a = mark.getBoundingClientRect();
    const mcs = getComputedStyle(mark);
    const isBetween = mark.classList && mark.classList.contains("between-lines-mark");
    let band = a.height;
    if (!band || band < 1) {
      band = isBetween ? 3 : (parseFloat(mcs.lineHeight) || (parseFloat(mcs.fontSize) || 14) * 1.2);
    } else if (!isBetween) {
      const lineH = parseFloat(mcs.lineHeight) || (parseFloat(mcs.fontSize) || 14) * 1.2;
      band = Math.min(lineH, a.height);
    }
    return a.top + band / 2 - originTop;
  }

  function textAnchorMarks(anchor) {
    const noteId = anchor.getAttribute("data-note");
    const anchorIndex = anchor.getAttribute("data-anchor") || "0";
    let marks = [];
    if (noteId != null) {
      marks = Array.prototype.slice.call(
        document.querySelectorAll(
          'mark.note-hl[data-note="' + noteId + '"][data-anchor="' + anchorIndex + '"]'
        )
      ).filter(function (mark) {
        return !(mark.classList && (
          mark.classList.contains("between-lines-mark") ||
          mark.classList.contains("between-cells-mark")
        ));
      });
    }
    if (!marks.length) marks = [anchor];
    return marks;
  }

  function selectionLineBoxes(anchor) {
    const rects = [];
    textAnchorMarks(anchor).forEach(function (mark) {
      const list = mark.getClientRects();
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (r.width < 0.5 && r.height < 0.5) continue;
        rects.push(r);
      }
    });
    if (!rects.length) rects.push(anchor.getBoundingClientRect());
    const lines = [];
    rects.forEach(function (r) {
      let line = null;
      for (let i = 0; i < lines.length; i++) {
        const overlap = Math.min(lines[i].bottom, r.bottom) - Math.max(lines[i].top, r.top);
        if (overlap > Math.min(lines[i].bottom - lines[i].top, r.height) * 0.5) {
          line = lines[i];
          break;
        }
      }
      if (!line) {
        lines.push({ top: r.top, bottom: r.bottom, right: r.right });
      } else {
        line.top = Math.min(line.top, r.top);
        line.bottom = Math.max(line.bottom, r.bottom);
        line.right = Math.max(line.right, r.right);
      }
    });
    return lines;
  }

  // Right edge of the text line that contains lineBox, inside the anchor's block.
  function textLineEndX(anchor, lineBox) {
    const root = anchor.closest(
      "[data-role='cell-source'], .md-rendered, .output-body, .annotatable-output, pre.source"
    ) || anchor.parentElement;
    let maxRight = lineBox.right;
    if (!root) return maxRight;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeValue && node.nodeValue.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const list = range.getClientRects();
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          if (r.width < 0.5) continue;
          const overlap = Math.min(r.bottom, lineBox.bottom) - Math.max(r.top, lineBox.top);
          const band = Math.min(lineBox.bottom - lineBox.top, r.height);
          if (band > 0 && overlap > band * 0.5 && r.right > maxRight) maxRight = r.right;
        }
      }
      node = walker.nextNode();
    }
    return maxRight;
  }

  // When the note sits on the selection's line, leave from that line's upper-right
  // corner and run horizontally to the end of the text line. Otherwise return
  // null and the connector keeps the midpoint curve.
  function sameHeightConnectorRun(anchor, noteViewportY) {
    const lines = selectionLineBoxes(anchor);
    let line = null;
    const slack = 2;
    for (let i = 0; i < lines.length; i++) {
      const box = lines[i];
      if (noteViewportY >= box.top - slack && noteViewportY <= box.bottom + slack) {
        if (!line || Math.abs((box.top + box.bottom) / 2 - noteViewportY) <
            Math.abs((line.top + line.bottom) / 2 - noteViewportY)) {
          line = box;
        }
      }
    }
    if (!line) return null;
    return {
      x: line.right,
      y: line.top,
      xRun: textLineEndX(anchor, line)
    };
  }

  function collectAllAnchorMarks(noteId) {
    // Document-wide: anchors in other cells contribute to the mass center.
    let marks = Array.prototype.slice.call(
      document.querySelectorAll('mark.note-hl[data-note="' + noteId + '"][data-note-anchor="1"]')
    );
    if (!marks.length) {
      marks = Array.prototype.slice.call(
        document.querySelectorAll('mark.note-hl[data-note="' + noteId + '"]')
      );
    }
    return marks.filter(function (mark) {
      let node = mark;
      while (node && node.nodeType === 1) {
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        node = node.parentElement;
      }
      return true;
    });
  }


  function layoutNoteCards() {
    const rows = Array.prototype.slice.call(document.querySelectorAll(".cell-row"));
    const isNarrow = window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
    if (isNarrow) {
      rows.forEach(function (row) {
        row.querySelectorAll(".cell-notes-rail").forEach(function (rail) { rail.style.minHeight = "0px"; });
        row.querySelectorAll(".note-card").forEach(function (card) { card.style.top = ""; });
        const svg = row.querySelector("svg.cell-connectors");
        if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
      });
      if (typeof updateNoteNav === "function") updateNoteNav();
      return;
    }

    const stack = document.querySelector(".cells-stack") || document.body;
    const stackRect = stack.getBoundingClientRect();
    const GAP = 4;
    const byIdLayout = {};
    notes().forEach(function (n) { byIdLayout[n.note_id] = n; });
    const byDepth = {};

    rows.forEach(function (row) {
      row.querySelectorAll(".cell-notes-rail").forEach(function (rail) {
        rail.style.minHeight = "0px";
        const depth = rail.getAttribute("data-depth") || "0";
        if (!byDepth[depth]) byDepth[depth] = [];
        rail.querySelectorAll(":scope > .note-card").forEach(function (card) {
          byDepth[depth].push({ card: card, rail: rail, row: row });
        });
      });
    });

    Object.keys(byDepth).forEach(function (depth) {
      const group = byDepth[depth];
      group.sort(function (a, b) {
        const na = byIdLayout[parseInt(a.card.getAttribute("data-note"), 10)];
        const nb = byIdLayout[parseInt(b.card.getAttribute("data-note"), 10)];
        if (!na || !nb) return 0;
        return cmpDocOrder(na, nb, byIdLayout);
      });
      const items = group.map(function (entry) {
        const id = entry.card.getAttribute("data-note");
        const marks = collectAllAnchorMarks(id);
        const bodyEl = entry.card.querySelector(".note-card-body");
        const headerEl = entry.card.querySelector(".note-card-header");
        let firstLineH = 0;
        if (bodyEl) {
          const csb = getComputedStyle(bodyEl);
          firstLineH = parseFloat(csb.lineHeight) || (parseFloat(csb.fontSize) || 13) * 1.4;
        }
        if (!firstLineH) {
          const cs = getComputedStyle(entry.card);
          firstLineH = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 13) * 1.4;
        }
        let headerBand = 0;
        if (headerEl) {
          const hs = getComputedStyle(headerEl);
          headerBand = headerEl.offsetHeight + (parseFloat(hs.marginBottom) || 0);
        }
        let targetTop = Math.max(0, entry.row.getBoundingClientRect().top - stackRect.top);
        if (marks.length) {
          let sumMid = 0;
          marks.forEach(function (mark) { sumMid += markAnchorMidY(mark, stackRect.top); });
          const firstVisibleLineOffset = Math.min(entry.card.offsetHeight / 2, 14);
          targetTop = (sumMid / marks.length) - firstVisibleLineOffset;
        }
        return { entry: entry, targetTop: targetTop, height: Math.max(entry.card.offsetHeight, 40) };
      });
      const tops = packTopsMinL1(
        items.map(function (it) { return it.targetTop; }),
        items.map(function (it) { return it.height; }),
        GAP
      );
      items.forEach(function (it, i) {
        const rowTop = it.entry.row.getBoundingClientRect().top - stackRect.top;
        it.entry.card.style.top = (tops[i] - rowTop) + "px";
      });
    });

    rows.forEach(function (row) {
      const svg = row.querySelector("svg.cell-connectors");
      if (!svg) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      row.querySelectorAll(".cell-notes-rail").forEach(function (rail) {
        rail.style.minHeight = "0px";
      });
      const rowRect = row.getBoundingClientRect();
      const segments = [];
      let minY = 0;
      let maxY = Math.max(row.offsetHeight, 1);
      let maxX = Math.max(row.offsetWidth, 1);
      row.querySelectorAll(".note-card").forEach(function (card) {
        const id = card.getAttribute("data-note");
        let marks = collectAllAnchorMarks(id);
        if (!marks.length) {
          const fallback = document.querySelector('mark.note-hl[data-note="' + id + '"]');
          if (fallback) marks = [fallback];
        }
        marks.forEach(function (anchor) {
          if (!anchor) return;
          const a = anchor.getBoundingClientRect();
          const c = card.getBoundingClientRect();
          const isBetween = anchor.classList && anchor.classList.contains("between-lines-mark");
          const band = (a.height >= 1) ? a.height : (isBetween ? 3 : Math.max(a.height, 1));
          const x2 = c.left - rowRect.left;
          const y2 = c.top + Math.min(c.height / 2, 14) - rowRect.top;
          let x1 = a.right - rowRect.left;
          let y1 = a.top + Math.max(band, 1) / 2 - rowRect.top;
          let xRun = null;
          if (!isBetween) {
            const run = sameHeightConnectorRun(anchor, y2 + rowRect.top);
            if (run) {
              x1 = run.x - rowRect.left;
              y1 = run.y - rowRect.top;
              xRun = run.xRun - rowRect.left;
            }
          }
          minY = Math.min(minY, y1, y2);
          maxY = Math.max(maxY, y1, y2);
          maxX = Math.max(maxX, x1, x2);
          if (xRun != null) maxX = Math.max(maxX, xRun);
          segments.push({
            x1: x1, y1: y1, x2: x2, y2: y2, xRun: xRun, isBetween: isBetween, band: band,
            color: getComputedStyle(card).getPropertyValue("--note-color").trim() || "#888"
          });
        });
      });
      const top = minY;
      const height = Math.max(1, maxY - top);
      const width = Math.max(1, maxX);
      svg.removeAttribute("viewBox");
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.style.left = "0";
      svg.style.top = top + "px";
      svg.style.width = width + "px";
      svg.style.height = height + "px";
      svg.style.overflow = "visible";
      segments.forEach(function (seg) {
        const y1 = seg.y1 - top;
        const y2 = seg.y2 - top;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        let d;
        if (seg.xRun != null && seg.xRun > seg.x1 + 1) {
          const mid = (seg.xRun + seg.x2) / 2;
          d = "M " + seg.x1 + " " + y1 + " L " + seg.xRun + " " + y1 +
            " C " + mid + " " + y1 + ", " + mid + " " + y2 + ", " + seg.x2 + " " + y2;
        } else {
          const mid = (seg.x1 + seg.x2) / 2;
          d = "M " + seg.x1 + " " + y1 + " C " + mid + " " + y1 + ", " + mid + " " + y2 + ", " + seg.x2 + " " + y2;
        }
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", seg.color);
        path.setAttribute("stroke-width", seg.isBetween ? String(Math.max(seg.band, 1)) : "1.5");
        path.setAttribute("opacity", "0.85");
        svg.appendChild(path);
      });
    });
    if (typeof updateNoteNav === "function") updateNoteNav();
  }

  function betweenAnchorsForCell(cellId) {
    const out = [];
    notes().forEach(function (n) {
      const norm = normalizeNote(n, n.note_id);
      (norm.anchors || []).forEach(function (a, ai) {
        if (a.target !== "between_lines" || a.cell_id !== cellId) return;
        out.push({
          note_id: norm.note_id,
          anchor_index: ai,
          after_line: a.after_line != null ? a.after_line : 0,
          side: a.side,
          color: norm.color,
          opacity: noteOpacity(norm),
          has_comment: !!((norm.header && String(norm.header).trim()) || (norm.comment && String(norm.comment).trim())),
          note: Object.assign({}, norm, { side: a.side })
        });
      });
    });
    return out;
  }

  function sourceOffsetAfterLine(source, afterLine) {
    let off = 0;
    const want = afterLine != null ? afterLine : 0;
    if (want < 0) return 0;
    for (let i = 0; i < want; i++) {
      const nl = source.indexOf("\n", off);
      if (nl < 0) return source.length;
      off = nl + 1;
    }
    const nl = source.indexOf("\n", off);
    return nl < 0 ? source.length : nl;
  }

  function domPointForSourceOffset(root, sourceOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let remaining = Math.max(0, sourceOffset);
    let node = walker.nextNode();
    while (node) {
      const len = node.nodeValue ? node.nodeValue.length : 0;
      if (remaining <= len) {
        const range = document.createRange();
        try {
          range.setStart(node, Math.min(remaining, len));
          range.setEnd(node, Math.min(remaining, len));
          const rects = range.getClientRects();
          const r = rects.length ? rects[0] : range.getBoundingClientRect();
          if (r && (r.height || r.width || r.top)) return r;
        } catch (e) { /* fall through */ }
        break;
      }
      remaining -= len;
      node = walker.nextNode();
    }
    return null;
  }

  function gapTopRelativeToRoot(root, source, afterLine) {
    const cs = getComputedStyle(root);
    const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.45;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const lineCount = source.length ? source.split("\n").length : 1;
    let after = afterLine != null ? afterLine : 0;
    if (after < -1) after = -1;
    if (after > lineCount - 1) after = lineCount - 1;
    const rootRect = root.getBoundingClientRect();
    // before first line — pin to top of first line / padding
    if (after < 0) {
      const point0 = domPointForSourceOffset(root, 0);
      if (point0) return Math.max(0, point0.top - rootRect.top - 1.5);
      return Math.max(0, padTop - 1.5);
    }
    const off = sourceOffsetAfterLine(source, after);
    const point = domPointForSourceOffset(root, Math.min(off, Math.max(0, source.length - 1)));
    if (point) {
      // Place bar at the bottom of the line before the gap (top of the newline),
      // or at the bottom of the last line when after_line === lineCount - 1.
      return point.top + (point.height || 0) - rootRect.top - 1.5;
    }
    return padTop + (after + 1) * lineHeight - 1.5;
  }

  // Overlay markers — never inject into source HTML (avoids blank lines / spacing).
  function placeBetweenMarkersAbsolute(root, source, cellId) {
    if (!root) return;
    root.querySelectorAll(".between-lines-mark").forEach(function (el) { el.remove(); });
    const marks = betweenAnchorsForCell(cellId);
    if (!marks.length) return;
    const cs = getComputedStyle(root);
    if (cs.position === "static") root.style.position = "relative";
    marks.forEach(function (b) {
      const el = document.createElement("mark");
      el.className = "between-lines-mark note-hl";
      el.setAttribute("data-note", String(b.note_id));
      el.setAttribute("data-anchor", String(b.anchor_index));
      if (b.has_comment) el.setAttribute("data-note-anchor", "1");
      el.setAttribute("data-between", "1");
      if (b.note && (b.note.side === "above" || b.note.side === "below")) {
        el.setAttribute("data-side", b.note.side);
      }
      const bg = highlightBg(b);
      el.style.setProperty("--between-color", bg);
      el.style.backgroundColor = bg;
      el.style.left = "0";
      el.style.right = "auto";
      el.style.width = root.clientWidth + "px";
      var projectedAfter = b.after_line;
      if (typeof rightAfterLineToDisplay === "function") {
        var viewDiff = (typeof diffViewForRoot === "function") ? diffViewForRoot(cellId, root).diff : null;
        projectedAfter = rightAfterLineToDisplay(cellId, source, viewDiff, b.after_line);
      }
      el.style.top = gapTopRelativeToRoot(root, source, projectedAfter) + "px";
      root.appendChild(el);
    });
  }

  function betweenCellAnchors() {
    const out = [];
    notes().forEach(function (n) {
      const norm = normalizeNote(n, n.note_id);
      (norm.anchors || []).forEach(function (a, ai) {
        if (a.target !== "between_cells" || a.cell_id == null || a.cell_id === "") return;
        out.push({
          note_id: norm.note_id,
          anchor_index: ai,
          cell_id: String(a.cell_id),
          side: a.side === "above" ? "above" : "below",
          line: a.line != null && a.line !== "" && Number.isFinite(Number(a.line)) ? Math.max(0, Number(a.line) | 0) : 0,
          color: norm.color,
          opacity: noteOpacity(norm),
          has_comment: !!((norm.header && String(norm.header).trim()) || (norm.comment && String(norm.comment).trim()))
        });
      });
    });
    return out;
  }

  // Bar in the flex gap around a cell row. Same mark contract as between-lines
  // (mark.note-hl) so cards and connectors line up with it.
  function betweenCellLinePos(b) {
    const line = Number(b.line);
    return Number.isFinite(line) ? line : 0;
  }

  function compareBetweenCellAnchors(a, b) {
    // Lines above the gap come first, ordered by vertical position.
    // Lines below the gap follow, ordered by minus vertical position, so a
    // lower line ranks earlier in the list of anchors between the two cells.
    const groupA = a.side === "below" ? 0 : 1;
    const groupB = b.side === "below" ? 0 : 1;
    if (groupA !== groupB) return groupA - groupB;
    const lineA = betweenCellLinePos(a);
    const lineB = betweenCellLinePos(b);
    if (lineA !== lineB) return groupA === 0 ? lineA - lineB : lineB - lineA;
    if (a.note_id !== b.note_id) return a.note_id < b.note_id ? -1 : 1;
    return (a.anchor_index | 0) - (b.anchor_index | 0);
  }

  function placeBetweenCellMarkers() {
    document.querySelectorAll(".between-cells-mark").forEach(function (el) { el.remove(); });
    document.querySelectorAll(".cell-row").forEach(function (row) {
      row.style.marginTop = "";
      row.style.marginBottom = "";
    });
    const marks = betweenCellAnchors();
    if (!marks.length) return;
    const bar = 3;
    document.querySelectorAll(".cells-stack").forEach(function (stack) {
      const rows = Array.prototype.slice.call(stack.querySelectorAll(":scope > .cell-row"));
      if (!rows.length) return;
      const idToIndex = Object.create(null);
      rows.forEach(function (row, i) {
        const id = row.getAttribute("data-cell-id") || "";
        if (id && idToIndex[id] == null) idToIndex[id] = i;
      });
      const gaps = [];
      for (let g = 0; g <= rows.length; g++) gaps.push([]);
      marks.forEach(function (b) {
        const idx = idToIndex[b.cell_id];
        if (idx == null) return;
        if (b.side === "above") gaps[idx].push(b);
        else gaps[idx + 1].push(b);
      });
      const baseGap = parseFloat(getComputedStyle(stack).rowGap || getComputedStyle(stack).gap) || 0;
      gaps.forEach(function (group, gapIndex) {
        if (!group.length) return;
        group.sort(compareBetweenCellAnchors);
        const pitch = bar * 2;
        const extra = group.length * pitch;
        const lead = gapIndex > 0 && gapIndex < rows.length ? baseGap : 0;
        const marginRow = gapIndex === 0 ? rows[0] : rows[gapIndex - 1];
        if (gapIndex === 0) marginRow.style.marginTop = extra + "px";
        else marginRow.style.marginBottom = extra + "px";
        group.forEach(function (b, slot) {
          const owner = b.side === "above" ? rows[gapIndex] : rows[gapIndex - 1];
          if (!owner) return;
          if (getComputedStyle(owner).position === "static") owner.style.position = "relative";
          const section = owner.querySelector("section.cell") || owner;
          const el = document.createElement("mark");
          el.className = "between-cells-mark between-lines-mark note-hl";
          el.setAttribute("data-note", String(b.note_id));
          el.setAttribute("data-anchor", String(b.anchor_index));
          if (b.has_comment) el.setAttribute("data-note-anchor", "1");
          el.setAttribute("data-between-cells", "1");
          el.setAttribute("data-side", b.side);
          const bg = highlightBg(b);
          el.style.setProperty("--between-color", bg);
          el.style.backgroundColor = bg;
          el.style.position = "absolute";
          el.style.height = bar + "px";
          // The bar takes one thickness. The other thickness, and the
          // preexisting row gap, are split equally above and below it.
          const pad = (pitch - bar) / 2;
          const gapPad = lead / 2;
          const ownerHeight = owner.getBoundingClientRect().height;
          el.style.top = (b.side === "below"
            ? ownerHeight + gapPad + slot * pitch + pad
            : slot * pitch + pad + gapPad - extra - lead) + "px";
          el.style.left = section.offsetLeft + "px";
          el.style.right = "auto";
          el.style.width = Math.max(section.offsetWidth, 1) + "px";
          owner.appendChild(el);
        });
      });
    });
  }

  function diffMetadataForCell(cellId) {
    const idx = cellIndexById(cellId);
    if (idx < 0) return null;
    const cell = state.notebook.cells[idx];
    const root = cell && cell.metadata && cell.metadata.ipynb_to_html;
    return (root && root.diff) || null;
  }

  function diffViewForRoot(cellId, root) {
    const diff = diffMetadataForCell(cellId);
    if (!diff) return { source: cellSource(cellId), diff: null };
    const view = root && root.closest ? root.closest(".diff-source-view") : null;
    if (view && view.classList.contains("diff-filtered-source") && diff.variants && diff.variants.filtered) {
      return { source: String(diff.variants.filtered.source || ""), diff: diff.variants.filtered };
    }
    if (view && view.classList.contains("diff-additions-source") && diff.variants && diff.variants.additions) {
      return { source: String(diff.variants.additions.source || ""), diff: diff.variants.additions };
    }
    if (root && root.closest && root.closest(".diff-right-source")) {
      return { source: String(diff.right_source || ""), diff: null };
    }
    return { source: cellSource(cellId), diff: diff };
  }

  function activeDiffSourceForCell(cellId) {
    const diff = diffMetadataForCell(cellId);
    if (!diff) return cellSource(cellId);
    const mode = document.body.getAttribute("data-diff-mode") || "full";
    if (mode === "filtered" && diff.variants && diff.variants.filtered) return String(diff.variants.filtered.source || "");
    if (mode === "additions" && diff.variants && diff.variants.additions) return String(diff.variants.additions.source || "");
    if (mode === "off") return String(diff.right_source || "");
    return cellSource(cellId);
  }

  function diffProjectionToRight(displaySource, diff, rightSource) {
    displaySource = String(displaySource || "");
    rightSource = String(rightSource || "");
    if (!diff || !Array.isArray(diff.lines)) return null;
    const included = new Array(displaySource.length).fill(true);
    const lines = displaySource.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const status = diff.lines[i] || " ";
      if (status === "-") {
        for (let j = offset; j < offset + line.length; j++) included[j] = false;
      } else if (status === "~") {
        const runs = (diff.inline_runs && diff.inline_runs[i]) || [];
        for (let ri = 0; ri < runs.length; ri++) {
          const run = runs[ri];
          if (!run || run.status !== "-") continue;
          const a = Math.max(0, Math.min(line.length, Number(run.start) || 0));
          const b = Math.max(a, Math.min(line.length, Number(run.end) || 0));
          for (let j = offset + a; j < offset + b; j++) included[j] = false;
        }
      }
      const newline = offset + line.length;
      if (newline < displaySource.length && status === "-") included[newline] = false;
      offset = newline + 1;
    }
    let projected = "";
    const displayForRight = [];
    const rightForDisplay = new Array(displaySource.length).fill(-1);
    for (let i = 0; i < displaySource.length; i++) {
      if (!included[i]) continue;
      rightForDisplay[i] = projected.length;
      displayForRight.push(i);
      projected += displaySource[i];
    }
    if (projected === rightSource + "\n" && displayForRight.length) {
      const trailingDisplay = displayForRight.pop();
      rightForDisplay[trailingDisplay] = -1;
      projected = projected.slice(0, -1);
    }
    if (projected !== rightSource) return null;
    return {
      rightForDisplay: rightForDisplay,
      displayForRight: displayForRight,
      displayRangeToRight: function (start, end) {
        let first = -1, last = -1;
        for (let i = Math.max(0, start); i < Math.min(end, rightForDisplay.length); i++) {
          const ri = rightForDisplay[i];
          if (ri < 0) continue;
          if (first < 0) first = ri;
          last = ri;
        }
        return first < 0 ? null : { start: first, end: last + 1 };
      },
      rightRangeToDisplay: function (start, end) {
        if (!(end > start) || start < 0 || end > displayForRight.length) return null;
        return { start: displayForRight[start], end: displayForRight[end - 1] + 1 };
      }
    };
  }

  function occurrenceAtOffset(source, substring, offset) {
    if (!substring || source.slice(offset, offset + substring.length) !== substring) return 0;
    let count = 0, at = 0;
    while (true) {
      const found = source.indexOf(substring, at);
      if (found < 0 || found >= offset) return count;
      count++;
      at = found + substring.length;
    }
  }

  function projectDiffAnchorToRight(anchor, displaySource, diff, rightSource) {
    displaySource = String(displaySource || "");
    rightSource = String(rightSource || "");
    const substring = String(anchor && anchor.substring || "");
    const occurrence = Math.max(0, Number(anchor && anchor.occurrence) || 0);
    let start = -1;
    let end = -1;
    if (Array.isArray(anchor.range) && anchor.range.length >= 2) {
      start = anchor.range[0] | 0;
      end = anchor.range[1] | 0;
      if (start < 0 || end <= start || end > displaySource.length) { start = -1; end = -1; }
    }
    if (!(end > start)) {
      if (!substring) return false;
      start = findNth(displaySource, substring, occurrence);
      if (start < 0) return false;
      end = start + substring.length;
    }
    const projection = diffProjectionToRight(displaySource, diff, rightSource);
    if (!projection) return false;
    const range = projection.displayRangeToRight(start, end);
    if (!range || range.end <= range.start) return false;
    const projected = rightSource.slice(range.start, range.end);
    if (!projected) return false;
    anchor.substring = projected;
    anchor.range = [range.start, range.end];
    anchor.occurrence = occurrenceAtOffset(rightSource, projected, range.start);
    return true;
  }

  function anchorRangeText(source, anchor) {
    if (!anchor || !Array.isArray(anchor.range) || anchor.range.length < 2) return "";
    const start = anchor.range[0] | 0;
    const end = anchor.range[1] | 0;
    if (start < 0 || end <= start || end > source.length) return "";
    return source.slice(start, end);
  }

  function rightAfterLineToDisplay(cellId, displaySource, diff, afterLine) {
    const meta = diffMetadataForCell(cellId);
    const rightSource = meta && meta.right_source != null ? String(meta.right_source) : "";
    displaySource = String(displaySource || "");
    if (!rightSource || !diff || displaySource === rightSource) return afterLine;
    const projection = diffProjectionToRight(displaySource, diff, rightSource);
    if (!projection || !projection.displayForRight.length) return afterLine;
    const rightLines = rightSource.split("\n");
    let rightOffset = 0;
    if (afterLine >= 0) {
      const line = Math.min(afterLine | 0, Math.max(0, rightLines.length - 1));
      for (let i = 0; i < line; i++) rightOffset += rightLines[i].length + 1;
      rightOffset += rightLines[line].length;
      rightOffset = Math.max(0, Math.min(rightOffset, Math.max(0, rightSource.length - 1)));
    }
    const displayOffset = projection.displayForRight[Math.min(rightOffset, projection.displayForRight.length - 1)];
    if (displayOffset == null || displayOffset < 0) return afterLine;
    if (afterLine < 0) {
      const lineNo = displaySource.slice(0, displayOffset).split("\n").length - 1;
      return displayOffset === 0 || displaySource.charAt(displayOffset - 1) === "\n" ? lineNo - 1 : lineNo;
    }
    const displayLines = displaySource.split("\n");
    let acc = 0;
    for (let i = 0; i < displayLines.length; i++) {
      const lineEnd = acc + displayLines[i].length;
      if (displayOffset <= lineEnd) return i;
      acc = lineEnd + 1;
    }
    return Math.max(0, displayLines.length - 1);
  }

  function matchDiffAnchorsOnText(cellId, displaySource, diff, noteList, predicate) {
    const meta = diffMetadataForCell(cellId);
    const rightSource = meta ? String(meta.right_source || "") : displaySource;
    if (!diff || displaySource === rightSource) {
      return matchAnchorsOnText(displaySource, noteList, predicate);
    }
    const projection = diffProjectionToRight(displaySource, diff, rightSource);
    if (!projection) return matchAnchorsOnText(displaySource, noteList, predicate);
    return matchAnchorsOnText(rightSource, noteList, predicate).map(function (matched) {
      const range = projection.rightRangeToDisplay(matched.start, matched.end);
      return range ? Object.assign({}, matched, { start: range.start, end: range.end }) : matched;
    });
  }

  function diffRootIsVisible(root) {
    if (!root || typeof window.getComputedStyle !== "function") return true;
    const view = root.closest && root.closest(".diff-source-view");
    return window.getComputedStyle(view || root).display !== "none";
  }

  function diffDecorationsForCell(cellId, source, diffOverride) {
    const diff = diffOverride === undefined ? diffMetadataForCell(cellId) : diffOverride;
    const rows = (diff && diff.inline_runs) || [];
    if (!rows.length) return [];
    const lines = String(source).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const spans = [];
    let offset = 0;
    let serial = 0;
    for (let i = 0; i < lines.length; i++) {
      const runs = rows[i] || [];
      for (let j = 0; j < runs.length; j++) {
        const run = runs[j];
        if (!run || run.end <= run.start) continue;
        const deleted = run.status === "-";
        spans.push({
          note_id: "__diff_" + (deleted ? "del" : "add") + "_" + serial++,
          color: deleted ? "#ffcdd2" : "#c8e6c9",
          opacity: 1,
          comment: "",
          header: "",
          anchors: [],
          anchor_index: 0,
          start: offset + run.start,
          end: offset + run.end,
          has_comment: false
        });
      }
      offset += lines[i].length + 1;
    }
    return spans;
  }

  function diffDecorationClass(noteId) {
    const id = String(noteId || "");
    if (id.indexOf("__diff_del_") === 0) return "diff-inline diff-inline-del";
    if (id.indexOf("__diff_add_") === 0) return "diff-inline diff-inline-add";
    return "note-hl";
  }

  function notebookStorageIdentity() {
    return String(state.noteStorageKey || state.sourceName || "notebook");
  }

  function notebookStorageKey(kind) {
    return "ipynb_to_html_" + kind + "::" + notebookStorageIdentity();
  }

  function notebookForExport() {
    return state.exportNotebook || state.notebook;
  }

  function exportCellById(cellId) {
    const cells = (notebookForExport() && notebookForExport().cells) || [];
    const want = String(cellId == null ? "" : cellId);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] && String(cells[i].id) === want) return cells[i];
    }
    return null;
  }

  function syntheticOutputForCell(cellId) {
    const idx = cellIndexById(cellId);
    const cell = idx >= 0 ? state.notebook.cells[idx] : null;
    const root = cell && cell.metadata && cell.metadata.ipynb_to_html;
    return root && root.synthetic === 'output' && root.output ? root.output : null;
  }

  function syntheticOutputText(cellId) {
    const output = syntheticOutputForCell(cellId);
    if (!output) return '';
    if (output.output_type === 'stream') return joinText(output.text);
    if (output.output_type === 'error') return (output.traceback || []).map(stripAnsi).join('\n') || ((output.ename || 'Error') + ': ' + (output.evalue || ''));
    const data = output.data || {};
    if (data['text/html'] != null) return htmlVisibleText(joinText(data['text/html']));
    if (data['text/plain'] != null) return joinText(data['text/plain']);
    return '';
  }

  function syntheticOutputRawHtml(cellId) {
    const output = syntheticOutputForCell(cellId);
    const data = (output && output.data) || {};
    return data['text/html'] != null ? joinText(data['text/html']) : '';
  }

  function newNotebookTargetForCell(cellId) {
    if (exportCellById(cellId)) return { cellId: String(cellId), side: null };
    const diff = diffMetadataForCell(cellId);
    const targetId = diff && diff.note_target_cell_id;
    if (targetId != null && exportCellById(targetId)) {
      return { cellId: String(targetId), side: diff.note_target_side || "above" };
    }
    return null;
  }

  function normalizeAnchorToNewNotebook(anchor) {
    if (!anchor || anchor.target === "note") return anchor;
    const oldCellId = anchor.cell_id;
    const target = newNotebookTargetForCell(oldCellId);
    if (!target) return anchor;
    const targetCell = exportCellById(target.cellId);
    const targetSource = targetCell ? joinText(targetCell.source) : "";
    const substring = String(anchor.substring || "");
    const occurrence = Math.max(0, Number(anchor.occurrence) || 0);
    if (anchor.target === "output" && targetCell) {
      const outputIndex = Math.max(0, Number(anchor.output_index) || 0);
      const output = (targetCell.outputs || [])[outputIndex];
      let outputSource = "";
      if (output) {
        if (output.output_type === "stream") outputSource = joinText(output.text);
        else if (output.output_type === "error") outputSource = (output.traceback || []).map(stripAnsi).join("\n") || ((output.ename || "Error") + ": " + (output.evalue || ""));
        else if (output.data && output.data["text/html"] != null) outputSource = htmlVisibleText(joinText(output.data["text/html"]));
        else if (output.data && output.data["text/plain"] != null) outputSource = joinText(output.data["text/plain"]);
      }
      if (output && (!substring || findNth(outputSource, substring, occurrence) >= 0)) {
        anchor.cell_id = target.cellId;
        anchor.output_index = outputIndex;
        return anchor;
      }
    }
    if (anchor.target === "cell") {
      const rangeText = anchorRangeText(targetSource, anchor);
      const displaySource = cellSource(oldCellId);
      const displaySlice = anchorRangeText(displaySource, anchor);
      if (rangeText && (!substring || rangeText === substring) && (displaySource === targetSource || displaySlice !== substring || rangeText === substring)) {
        anchor.cell_id = target.cellId;
        anchor.substring = rangeText;
        anchor.occurrence = occurrenceAtOffset(targetSource, rangeText, anchor.range[0] | 0);
        return anchor;
      }
      if (substring && findNth(targetSource, substring, occurrence) >= 0 && !Array.isArray(anchor.range)) {
        const start = findNth(targetSource, substring, occurrence);
        anchor.cell_id = target.cellId;
        anchor.range = [start, start + substring.length];
        return anchor;
      }
      const diff = diffMetadataForCell(oldCellId);
      const candidates = [];
      if (diff) candidates.push({ source: displaySource, diff: diff });
      if (diff && diff.variants && diff.variants.filtered) {
        candidates.push({ source: String(diff.variants.filtered.source || ""), diff: diff.variants.filtered });
      }
      for (let i = 0; i < candidates.length; i++) {
        if (projectDiffAnchorToRight(anchor, candidates[i].source, candidates[i].diff, targetSource)) {
          anchor.cell_id = target.cellId;
          return anchor;
        }
      }
    }
    if (anchor.target === "between_cells") {
      anchor.cell_id = target.cellId;
      anchor.side = anchor.side === "above" ? "above" : "below";
      anchor.substring = "";
      anchor.occurrence = 0;
      delete anchor.output_index;
      delete anchor.range;
      delete anchor.line_range;
      if (anchor.line != null && anchor.line !== "") {
        var lineCountForCell = Math.max(1, targetSource.split("\n").length);
        var keptLine = Number(anchor.line);
        if (!Number.isFinite(keptLine) || keptLine < 0) keptLine = 0;
        if (keptLine > lineCountForCell - 1) keptLine = lineCountForCell - 1;
        anchor.line = keptLine | 0;
      }
      return anchor;
    }
    if (anchor.target === "between_lines" && String(oldCellId) === String(target.cellId)) {
      anchor.cell_id = target.cellId;
      const lineCount = Math.max(1, targetSource.split("\n").length);
      let after = Number(anchor.after_line);
      if (Array.isArray(anchor.line_range) && anchor.line_range.length >= 2) {
        after = anchor.side === "above" ? (anchor.line_range[0] | 0) - 1 : (anchor.line_range[1] | 0) - 1;
      }
      if (!Number.isFinite(after)) after = 0;
      if (after < -1) after = -1;
      if (after > lineCount - 1) after = lineCount - 1;
      anchor.after_line = after;
      return anchor;
    }
    let displayOffset = substring ? findNth(cellSource(oldCellId), substring, occurrence) : 0;
    if (displayOffset < 0) displayOffset = 0;
    const displayLine = cellSource(oldCellId).slice(0, displayOffset).split("\n").length - 1;
    const lineCount = Math.max(1, targetSource.split("\n").length);
    anchor.target = "between_lines";
    anchor.cell_id = target.cellId;
    anchor.substring = "";
    anchor.occurrence = 0;
    anchor.after_line = Math.max(0, Math.min(displayLine, lineCount - 1));
    anchor.side = target.side || "above";
    delete anchor.output_index;
    return anchor;
  }

  // A cell's outputs are tall when their combined height exceeds 80% of the
  // viewport. Line and character counts are not used; the page measures layout.
  const hideTallOutputs = state.hideTallOutputs !== false;

  function outputsAreTall(totalHeight, availableScreenHeight) {
    if (!(availableScreenHeight > 0) || !(totalHeight > 0)) return false;
    return totalHeight > availableScreenHeight * 0.8;
  }

  function availableScreenHeight() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function directChildWithClass(parent, className) {
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].classList.contains(className)) return parent.children[i];
    }
    return null;
  }

  function outputCollapseGroups() {
    var groups = [];
    document.querySelectorAll("section.cell > .cell-body > .outputs").forEach(function (el) {
      groups.push(el);
    });
    document.querySelectorAll("section.cell-synthetic-output > .cell-body").forEach(function (el) {
      if (directChildWithClass(el, "output-row") || directChildWithClass(el, "output-collapse")) {
        groups.push(el);
      }
    });
    return groups;
  }

  function bindOutputCollapseToggle(collapse) {
    var toggle = directChildWithClass(collapse, "output-collapse-toggle");
    if (!toggle || toggle._tallOutputBound) return;
    toggle._tallOutputBound = true;
    toggle.addEventListener("click", function () {
      collapse.classList.toggle("is-open");
      collapse.dataset.userToggled = "1";
      updateOutputCollapseToggle(collapse);
    });
  }

  function updateOutputCollapseToggle(collapse) {
    var toggle = directChildWithClass(collapse, "output-collapse-toggle");
    if (!toggle) return;
    var open = collapse.classList.contains("is-open");
    var tall = collapse.classList.contains("is-tall");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open && tall ? "Hide tall output" : "Show tall output";
  }

  function ensureOutputCollapse(group) {
    var collapse = directChildWithClass(group, "output-collapse");
    if (!collapse) {
      var rows = [];
      for (var i = 0; i < group.children.length; i++) {
        if (group.children[i].classList.contains("output-row")) rows.push(group.children[i]);
      }
      if (!rows.length) return null;
      collapse = document.createElement("div");
      collapse.className = "output-collapse is-tall";
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "output-collapse-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Show tall output";
      var body = document.createElement("div");
      body.className = "output-collapse-body";
      collapse.appendChild(toggle);
      collapse.appendChild(body);
      group.insertBefore(collapse, rows[0]);
      rows.forEach(function (row) { body.appendChild(row); });
    }
    bindOutputCollapseToggle(collapse);
    return collapse;
  }

  function totalOutputHeight(collapse) {
    var body = directChildWithClass(collapse, "output-collapse-body");
    if (!body) return 0;
    return body.scrollHeight;
  }

  function syncOutputCollapse(collapse) {
    if (!hideTallOutputs) {
      collapse.classList.remove("is-tall");
      collapse.classList.add("is-open");
      updateOutputCollapseToggle(collapse);
      return;
    }
    var available = availableScreenHeight();
    var total = totalOutputHeight(collapse);
    var tall = outputsAreTall(total, available);
    var userChose = collapse.dataset.userToggled === "1";
    // Stay collapsed until both the screen and the output have a real height.
    if (!userChose && (!(available > 0) || !(total > 0))) tall = true;
    collapse.classList.toggle("is-tall", tall);
    if (!userChose) {
      if (tall) collapse.classList.remove("is-open");
      else collapse.classList.add("is-open");
    }
    updateOutputCollapseToggle(collapse);
  }

  function bindOutputImageLoads() {
    document.querySelectorAll(".output-collapse-body img").forEach(function (img) {
      if (img._tallOutputLoad) return;
      img._tallOutputLoad = true;
      if (!img.complete) img.addEventListener("load", syncTallOutputs);
    });
  }

  function syncTallOutputs() {
    outputCollapseGroups().forEach(function (group) {
      var collapse = ensureOutputCollapse(group);
      if (collapse) syncOutputCollapse(collapse);
    });
    bindOutputImageLoads();
  }

  function applyClientHighlights() {

    document.querySelectorAll("section.cell").forEach(function (section) {
      const cellId = section.getAttribute("data-cell-id") || section.getAttribute("data-cell");
      const ctype = cellType(cellId);

      if (ctype === "markdown") {
        const root = section.querySelector(".md-rendered.annotatable");
        if (root) {
          const markdownSource = diffViewForRoot(cellId, root).source;
          const markdownMatched = matchAnchorsOnText(markdownSource, notes(), function (a) {
            return a.target === "cell" && a.cell_id === cellId;
          });
          let clean = (state.cellMarkdownHtml && state.cellMarkdownHtml[String(cellId)]) || "";
          // Prefer live markdown render so heading/body emphasis always matches source
          // (covers stale embeds / client fallbacks). Keep precomputed HTML as fallback.
          try {
            const live = commentMarkdownToHtml(markdownSource);
            if (live && live.trim()) clean = live;
          } catch (e) { /* keep clean */ }
          root.innerHTML = clean || root.innerHTML;
          applyMarksToRenderedRoot(root, markdownSource, markdownMatched);
          placeBetweenMarkersAbsolute(root, markdownSource, cellId);
        }
      }
      if (ctype !== "markdown" || section.querySelector("pre.source.annotatable")) {
        section.querySelectorAll("pre.source.annotatable").forEach(function (pre) {
          const view = diffViewForRoot(cellId, pre);
          const viewSource = view.source;
          const viewMatched = diffRootIsVisible(pre)
            ? matchDiffAnchorsOnText(cellId, viewSource, view.diff, notes(), function (a) {
                return a.target === "cell" && a.cell_id === cellId;
              })
            : [];
          const styles = (ctype === "code")
            ? tokenStyleMap(viewSource)
            : new Array(viewSource.length).fill(null);
          const displayMatched = viewMatched.concat(diffDecorationsForCell(cellId, viewSource, view.diff));
          const html = renderStyledPlain(viewSource, styles, displayMatched);
          const code = pre.querySelector("code") || pre;
          code.innerHTML = html;
          if (diffRootIsVisible(pre)) placeBetweenMarkersAbsolute(pre, viewSource, cellId);
        });
      }

      section.querySelectorAll(".annotatable-output").forEach(function (el) {
        const oi = parseInt(el.getAttribute("data-output-index"), 10);
        const text = outputText(cellId, oi) || syntheticOutputText(cellId);
        const matchedOut = matchAnchorsOnText(text, notes(), function (a) {
          return a.target === "output" && a.cell_id === cellId && a.output_index === oi;
        });
        if (el.classList.contains("html-out")) {
          const raw = outputRawHtml(cellId, oi) || syntheticOutputRawHtml(cellId);
          if (raw) el.innerHTML = sanitizeNotebookHtml(raw);
          if (matchedOut.length) applyMarksToRenderedRoot(el, text, matchedOut);
        } else {
          const styles = new Array(text.length).fill(null);
          el.innerHTML = renderStyledPlain(text, styles, matchedOut);
        }
      });
    });
    rebuildCellNotesRails();
    typesetMath();
    placeBetweenCellMarkers();
    syncTallOutputs();
    requestAnimationFrame(function () {
      placeBetweenCellMarkers();
      layoutNoteCards();
      syncTallOutputs();
      if (typeof updateNoteNav === "function") updateNoteNav();
    });
    const metaNotes = document.getElementById("meta-notes-count");
    if (metaNotes) metaNotes.textContent = String(notes().length);
    // updateNoteNav may not be hoisted yet on first parse of this function body
    // in some engines when called before wireNoteNav — safe no-op via typeof above / later call.
    setTimeout(function () {
      if (typeof updateNoteNav === "function") updateNoteNav();
    }, 0);
  }

  // ---- Selection â source mapping (never trust toString() across KaTeX) ----
  function closestTexMath(node, root) {
    let el = node && (node.nodeType === 1 ? node : node.parentElement);
    while (el && el !== root) {
      if (el.classList && el.classList.contains("tex-math") && el.getAttribute("data-tex")) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function collectDomProjection(root) {
    const parts = [];
    function walk(node) {
      if (node.nodeType === 3) {
        let p = node.parentElement;
        while (p && p !== root) {
          if (p.classList && (
            p.classList.contains("katex") ||
            p.classList.contains("katex-mathml") ||
            p.classList.contains("katex-html")
          )) return;
          p = p.parentElement;
        }
        parts.push({ text: node.nodeValue, node: node, kind: "text" });
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.classList && node.classList.contains("tex-math") && node.getAttribute("data-tex")) {
        parts.push({ text: node.getAttribute("data-tex"), node: node, kind: "tex" });
        return;
      }
      if (node.classList && (
        node.classList.contains("katex") ||
        node.classList.contains("katex-mathml") ||
        node.classList.contains("katex-html")
      )) return;
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
    walk(root);
    let visible = "";
    const ranges = [];
    parts.forEach(function (p, idx) {
      const start = visible.length;
      visible += p.text;
      ranges.push({ start: start, end: visible.length, partIndex: idx });
    });
    return { visible: visible, parts: parts, ranges: ranges };
  }

  function selectionIntersectsMath(root, range) {
    if (closestTexMath(range.startContainer, root) || closestTexMath(range.endContainer, root)) {
      return true;
    }
    try {
      const frag = range.cloneContents();
      if (frag.querySelector && frag.querySelector(".tex-math, .katex, .katex-mathml, .katex-html")) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function boundaryToProjOffset(proj, root, container, offset, asEnd) {
    const tex = closestTexMath(container, root);
    if (tex) {
      for (let i = 0; i < proj.parts.length; i++) {
        if (proj.parts[i].node === tex) {
          return asEnd ? proj.ranges[i].end : proj.ranges[i].start;
        }
      }
    }
    if (container.nodeType === 3) {
      let total = 0;
      for (let i = 0; i < proj.parts.length; i++) {
        const p = proj.parts[i];
        if (p.kind === "text" && p.node === container) {
          return total + Math.min(Math.max(0, offset), p.text.length);
        }
        total += p.text.length;
      }
    }
    // Element container: offset is child index â place relative to parts via Range compare
    try {
      const boundary = document.createRange();
      boundary.setStart(container, offset);
      boundary.collapse(true);
      let total = 0;
      for (let i = 0; i < proj.parts.length; i++) {
        const p = proj.parts[i];
        const r = document.createRange();
        if (p.kind === "tex") {
          r.selectNode(p.node);
        } else {
          r.setStart(p.node, 0);
          r.setEnd(p.node, p.node.nodeValue ? p.node.nodeValue.length : 0);
        }
        const cmpToStart = boundary.compareBoundaryPoints(Range.START_TO_START, r);
        if (cmpToStart <= 0) return total;
        const cmpToEnd = boundary.compareBoundaryPoints(Range.START_TO_END, r);
        if (cmpToEnd <= 0) {
          if (p.kind === "tex") return asEnd ? total + p.text.length : total;
          // Inside a text node via element addressing â snap
          return asEnd ? total + p.text.length : total;
        }
        total += p.text.length;
      }
      return total;
    } catch (e) {
      return asEnd ? proj.visible.length : 0;
    }
  }

  function selectionOffsetsInProjection(root, range, proj) {
    const a = boundaryToProjOffset(proj, root, range.startContainer, range.startOffset, false);
    const b = boundaryToProjOffset(proj, root, range.endContainer, range.endOffset, true);
    let start = Math.min(a, b);
    let end = Math.max(a, b);
    // Expand to whole tex atoms when the range overlaps them partially
    proj.parts.forEach(function (p, i) {
      if (p.kind !== "tex") return;
      const r = proj.ranges[i];
      const overlaps = start < r.end && end > r.start;
      if (overlaps) {
        start = Math.min(start, r.start);
        end = Math.max(end, r.end);
      }
    });
    return { start: start, end: end };
  }

  function occurrenceNear(source, needle, guess) {
    if (!needle) return null;
    let idx = source.indexOf(needle);
    let best = -1;
    let occ = 0;
    let bestOcc = 0;
    while (idx >= 0) {
      if (best < 0 || Math.abs(idx - guess) < Math.abs(best - guess)) {
        best = idx;
        bestOcc = occ;
      }
      occ++;
      idx = source.indexOf(needle, idx + needle.length);
    }
    if (best < 0) return null;
    return { substring: needle, occurrence: bestOcc, start: best };
  }

  function occurrenceAtSourceStart(source, substring, startIndex) {
    // occurrence = # of non-overlapping earlier matches (same as findNth / find_nth_occurrence)
    if (!substring || startIndex < 0) return null;
    if (source.slice(startIndex, startIndex + substring.length) !== substring) return null;
    return {
      substring: substring,
      occurrence: countNonOverlappingBefore(source, substring, startIndex),
      start: startIndex
    };
  }

  function assignDomTexSourceStarts(source, proj) {
    // Each DOM tex part â unique source start, document order, non-overlapping advance
    const starts = new Array(proj.parts.length);
    for (let i = 0; i < starts.length; i++) starts[i] = null;
    let searchFrom = 0;
    for (let i = 0; i < proj.parts.length; i++) {
      const p = proj.parts[i];
      if (p.kind !== "tex") continue;
      let idx = source.indexOf(p.text, searchFrom);
      if (idx < 0) {
        idx = source.indexOf(p.text);
        while (idx >= 0) {
          let taken = false;
          for (let j = 0; j < i; j++) {
            if (starts[j] === idx) { taken = true; break; }
          }
          if (!taken) break;
          idx = source.indexOf(p.text, idx + p.text.length);
        }
      }
      starts[i] = idx;
      if (idx >= 0) searchFrom = idx + p.text.length;
    }
    return starts;
  }

  function mapProjSliceToSource(source, cellProj, proj, offs) {
    const needle = proj.visible.slice(offs.start, offs.end);
    if (!needle) return null;

    const texStarts = assignDomTexSourceStarts(source, proj);
    let srcStart = null;
    let srcEnd = null;

    for (let i = 0; i < proj.parts.length; i++) {
      const p = proj.parts[i];
      const r = proj.ranges[i];
      if (r.end <= offs.start || r.start >= offs.end) continue;

      if (p.kind === "tex") {
        const at = texStarts[i];
        if (at == null || at < 0) continue;
        if (srcStart == null) srcStart = at;
        srcEnd = at + p.text.length;
        continue;
      }

      const localA = Math.max(0, offs.start - r.start);
      const localB = Math.min(p.text.length, offs.end - r.start);
      const piece = p.text.slice(localA, localB);
      if (!piece) continue;

      let regionFrom = 0;
      let regionTo = source.length;
      for (let j = i - 1; j >= 0; j--) {
        if (proj.parts[j].kind === "tex" && texStarts[j] != null && texStarts[j] >= 0) {
          regionFrom = texStarts[j] + proj.parts[j].text.length;
          break;
        }
      }
      for (let j = i + 1; j < proj.parts.length; j++) {
        if (proj.parts[j].kind === "tex" && texStarts[j] != null && texStarts[j] >= 0) {
          regionTo = texStarts[j];
          break;
        }
      }
      if (srcEnd != null) regionFrom = Math.max(regionFrom, srcEnd);

      const region = source.slice(regionFrom, regionTo);
      let atRel = -1;
      let matchedLen = piece.length;
      // Repeated plain text (broken math that never became a tex atom) must bind
      // the copy under the selection. indexOf would always take the first one.
      // Only when the rendered text and the source contain the same copies, so
      // markdown escapes have not inserted or dropped this string.
      const pieceVisibleStart = r.start + localA;
      if (proj.visible.slice(pieceVisibleStart, pieceVisibleStart + piece.length) === piece) {
        const visCount = countNonOverlappingBefore(proj.visible, piece, proj.visible.length);
        const srcCount = countNonOverlappingBefore(source, piece, source.length);
        if (visCount > 0 && visCount === srcCount) {
          const visibleOcc = countNonOverlappingBefore(proj.visible, piece, pieceVisibleStart);
          const abs = findNth(source, piece, visibleOcc);
          if (abs >= regionFrom && abs + piece.length <= regionTo) atRel = abs - regionFrom;
        }
      }
      if (atRel < 0) atRel = region.indexOf(piece);
      if (atRel < 0) {
        const soft = softVisibleNeedle(piece) || piece.trim();
        if (soft) {
          atRel = region.indexOf(soft);
          matchedLen = soft.length;
        }
      }
      if (atRel < 0 && cellProj && cellProj.visible && cellProj.v2s) {
        let vIdx = cellProj.visible.indexOf(piece);
        let bestV = -1;
        while (vIdx >= 0) {
          const s0 = cellProj.v2s[vIdx];
          if (s0 >= regionFrom && s0 < regionTo) {
            if (bestV < 0 || Math.abs(s0 - regionFrom) < Math.abs(cellProj.v2s[bestV] - regionFrom)) {
              bestV = vIdx;
            }
          }
          vIdx = cellProj.visible.indexOf(piece, vIdx + piece.length);
        }
        if (bestV >= 0) {
          const s0 = cellProj.v2s[bestV];
          const s1 = cellProj.v2s[Math.min(bestV + piece.length - 1, cellProj.v2s.length - 1)] + 1;
          if (srcStart == null) srcStart = s0;
          srcEnd = s1;
          continue;
        }
      }
      if (atRel < 0) continue;
      const abs = regionFrom + atRel;
      if (srcStart == null) srcStart = abs;
      srcEnd = abs + matchedLen;
    }

    if (srcStart != null && srcEnd != null && srcEnd > srcStart) {
      const sub = source.slice(srcStart, srcEnd);
      const hit = occurrenceAtSourceStart(source, sub, srcStart);
      if (hit) return hit;
    }

    let guess = 0;
    for (let i = 0; i < proj.parts.length; i++) {
      const p = proj.parts[i];
      const r = proj.ranges[i];
      if (p.kind === "tex" && r.start >= offs.start && r.end <= offs.end &&
          texStarts[i] != null && texStarts[i] >= 0) {
        guess = texStarts[i] - (r.start - offs.start);
        break;
      }
    }
    const exact = occurrenceNear(source, needle, guess);
    if (exact) {
      const fixed = occurrenceAtSourceStart(source, exact.substring, exact.start);
      return fixed || exact;
    }

    for (let i = 0; i < proj.parts.length; i++) {
      const p = proj.parts[i];
      const r = proj.ranges[i];
      if (p.kind === "tex" && offs.start < r.end && offs.end > r.start &&
          texStarts[i] != null && texStarts[i] >= 0) {
        const hit = occurrenceAtSourceStart(source, p.text, texStarts[i]);
        if (hit) return hit;
      }
    }
    return null;
  }

  function mapSelectionToSource(cellId, root, range) {
    const source = diffViewForRoot(cellId, root).source;
    const ctype = cellType(cellId);

    if (ctype === "code" || ctype === "raw" || root.matches("pre.source")) {
      // No KaTeX in code/raw â plain text selection is trustworthy
      const selected = range.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (!selected) return null;
      const pre = root;
      let preOffset = 0;
      try {
        const r = range.cloneRange();
        r.selectNodeContents(pre);
        r.setEnd(range.startContainer, range.startOffset);
        preOffset = r.toString().length;
      } catch (e) {}
      const hit = occurrenceNear(source, selected, preOffset);
      if (hit) {
        return { cell_id: cellId, substring: hit.substring, occurrence: hit.occurrence, range: [hit.start, hit.start + hit.substring.length], target: "cell" };
      }
      return { cell_id: cellId, substring: selected, occurrence: 0, target: "cell" };
    }

    // Markdown: always map via DOM projection + data-tex (never toString for substring)
    const proj = collectDomProjection(root);
    const offs = selectionOffsetsInProjection(root, range, proj);
    if (offs.end <= offs.start) return null;

    const cellProj = (state.cellProjections && state.cellProjections[String(cellId)]) || null;
    const mapped = mapProjSliceToSource(source, cellProj, proj, offs);
    if (mapped) {
      return {
        cell_id: cellId,
        substring: mapped.substring,
        occurrence: mapped.occurrence,
        range: [mapped.start, mapped.start + mapped.substring.length],
        target: "cell"
      };
    }

    // Last resort for non-math: soft wrappers (still not from toString of KaTeX)
    if (!selectionIntersectsMath(root, range)) {
      // Build prose-only needle from projection
      const needle = proj.visible.slice(offs.start, offs.end);
      const cands = [needle, "`" + needle + "`", "**" + needle + "**", "*" + needle + "*"];
      for (let i = 0; i < cands.length; i++) {
        const hit = occurrenceNear(source, cands[i], 0);
        if (hit) {
          return { cell_id: cellId, substring: hit.substring, occurrence: hit.occurrence, range: [hit.start, hit.start + hit.substring.length], target: "cell" };
        }
      }
    }
    return null;
  }

  function mapSelectionToOutput(cellId, outputIndex, root, range) {
    const source = outputText(cellId, outputIndex);
    if (!source) return null;

    if (root.classList.contains("html-out")) {
      const proj = collectDomProjection(root);
      const offs = selectionOffsetsInProjection(root, range, proj);
      if (offs.end <= offs.start) return null;
      const commentProj = {
        visible: source,
        v2s: source.split("").map(function (_, i) { return i; })
      };
      const mapped = mapProjSliceToSource(source, commentProj, proj, offs);
      if (mapped) {
        return {
          target: "output",
          cell_id: cellId,
          output_index: outputIndex,
          substring: mapped.substring,
          occurrence: mapped.occurrence
        };
      }
      const needle = proj.visible.slice(offs.start, offs.end);
      if (needle) {
        const hit = occurrenceNear(source, needle, offs.start);
        if (hit) {
          return {
            target: "output",
            cell_id: cellId,
            output_index: outputIndex,
            substring: hit.substring,
            occurrence: hit.occurrence
          };
        }
      }
      return null;
    }

    const selected = range.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!selected) return null;
    let preOffset = 0;
    try {
      const r = range.cloneRange();
      r.selectNodeContents(root);
      r.setEnd(range.startContainer, range.startOffset);
      preOffset = r.toString().length;
    } catch (e) {}
    const hit = occurrenceNear(source, selected, preOffset);
    if (hit) {
      return {
        target: "output",
        cell_id: cellId,
        output_index: outputIndex,
        substring: hit.substring,
        occurrence: hit.occurrence
      };
    }
    return {
      target: "output",
      cell_id: cellId,
      output_index: outputIndex,
      substring: selected,
      occurrence: 0
    };
  }

  function mapSelectionToNoteComment(parentNoteId, range) {
    const parent = notes().find(function (n) { return n.note_id === parentNoteId; });
    if (!parent || !parent.comment) return null;
    const body = document.querySelector('.annotatable-note[data-note-body="' + parentNoteId + '"]');
    if (!body) return null;

    const proj = collectDomProjection(body);
    const offs = selectionOffsetsInProjection(body, range, proj);
    if (offs.end <= offs.start) return null;

    const fakeSource = parent.comment;
    // Prefer identity projection for plain / TeX-only comments; fall back to soft markdown wrappers
    const commentProj = {
      visible: fakeSource,
      v2s: fakeSource.split("").map(function (_, i) { return i; })
    };
    const mapped = mapProjSliceToSource(fakeSource, commentProj, proj, offs);
    if (mapped) {
      return {
        target: "note",
        parent_note_id: parentNoteId,
        substring: mapped.substring,
        occurrence: mapped.occurrence,
        cell_id: parent.cell_id
      };
    }
    if (!selectionIntersectsMath(body, range)) {
      const needle = proj.visible.slice(offs.start, offs.end);
      const cands = [needle, "`" + needle + "`", "**" + needle + "**", "*" + needle + "*"];
      for (let i = 0; i < cands.length; i++) {
        const hit = occurrenceNear(fakeSource, cands[i], 0);
        if (hit) {
          return {
            target: "note",
            parent_note_id: parentNoteId,
            substring: hit.substring,
            occurrence: hit.occurrence,
            cell_id: parent.cell_id
          };
        }
      }
    }
    return null;
  }

  const DEFAULT_NOTE_COLOR = "#ffe566";
  const DEFAULT_NOTE_OPACITY = 0.7;

  const selBar = document.getElementById("sel-bar");
  let pending = null;
  let pendingSelections = [];
  let pendingSelectionRanges = [];
  let pendingQueueRange = null;

  function refreshPendingSelectionHighlights() {
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
    CSS.highlights.delete("pending-note-selections");
    if (pendingSelectionRanges.length) {
      CSS.highlights.set("pending-note-selections", new Highlight(...pendingSelectionRanges));
    }
  }

  function clearPendingSelectionHighlights() {
    pendingSelectionRanges = [];
    if (typeof CSS !== "undefined" && CSS.highlights) CSS.highlights.delete("pending-note-selections");
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const startEl = range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement;
    if (!startEl) return null;

    // Note-comment selection?
    const noteBody = startEl.closest(".annotatable-note[data-note-body]");
    if (noteBody) {
      const parentId = parseInt(noteBody.getAttribute("data-note-body"), 10);
      return mapSelectionToNoteComment(parentId, range);
    }

    // Cell output selection?
    const outEl = startEl.closest(".annotatable-output");
    if (outEl) {
      const cellId = outEl.getAttribute("data-cell-id") || outEl.getAttribute("data-cell");
      const outputIndex = parseInt(outEl.getAttribute("data-output-index"), 10) || 0;
      return mapSelectionToOutput(cellId, outputIndex, outEl, range);
    }

    const root = startEl.closest("pre.source.annotatable, .md-rendered.annotatable");
    if (!root) return null;
    const section = root.closest("section.cell");
    if (!section) return null;
    const cellId = section.getAttribute("data-cell-id") || section.getAttribute("data-cell");
    return mapSelectionToSource(cellId, root, range);
  }

  function showSelBar(ev) {
    if (notesLocked || !selBar) return;
    hideMultiAnchorHint();
    if (attachPickActive || modalIsOpen() || placementModalIsOpen()) {
      selBar.classList.remove("open");
      return;
    }
    const info = getSelectionInfo();
    if (!info) {
      selBar.classList.remove("open");
      pending = null;
      return;
    }
    pending = Object.assign({ color: DEFAULT_NOTE_COLOR, opacity: DEFAULT_NOTE_OPACITY, comment: "" }, info);
    updateSelBarLabels();
    selBar.classList.add("open");
    const barWidth = selBar.offsetWidth || 360;
    const barHeight = selBar.offsetHeight || 56;
    const x = Math.max(8, Math.min(ev.clientX || 40, window.innerWidth - barWidth - 8));
    const y = Math.max(8, Math.min((ev.clientY || 40) + 8, window.innerHeight - barHeight - 40));
    selBar.style.left = x + "px";
    selBar.style.top = y + "px";
  }

  document.addEventListener("mouseup", function (ev) {
    if (ev.target.closest && (ev.target.closest(".sel-bar") || ev.target.closest(".modal-backdrop"))) return;
    setTimeout(function () { showSelBar(ev); }, 10);
  });

  function updateSelBarLabels() {
    const collecting = pendingSelections.length > 0;
    const count = document.getElementById("sel-bar-count");
    if (count) {
      count.hidden = !collecting;
      count.textContent = !collecting ? "" : (pendingSelections.length === 1 ? "1 anchor kept" : pendingSelections.length + " anchors kept");
    }
    if (btnMake) {
      btnMake.textContent = collecting ? "Create the note" : "Make a note";
      btnMake.title = collecting ? "Use the selected text as the last anchor and create the note" : "Create a note from the selected text";
    }
    if (btnSelectAnother) {
      btnSelectAnother.textContent = collecting ? "Add another anchor" : "Select first anchor";
      btnSelectAnother.title = collecting ? "Keep the selected text as an anchor, then select another. This is not the last anchor." : "Keep the selected text as the first anchor, then select more";
    }
    if (btnAttachSel) {
      btnAttachSel.textContent = collecting ? "Attach to a note" : "Attach to existing note";
      btnAttachSel.title = collecting ? "Use the selected text as the last anchor and add them to an existing note" : "Add the selected text to an existing note";
    }
  }

  let multiAnchorHintTimer = null;

  function hideMultiAnchorHint() {
    if (multiAnchorHintTimer) {
      clearTimeout(multiAnchorHintTimer);
      multiAnchorHintTimer = null;
    }
    const hint = document.getElementById("sel-bar-multi-hint");
    const actions = document.getElementById("sel-bar-actions");
    if (hint) hint.hidden = true;
    if (actions) actions.hidden = false;
  }

  function showMultiAnchorHint() {
    const hint = document.getElementById("sel-bar-multi-hint");
    const actions = document.getElementById("sel-bar-actions");
    const count = document.getElementById("sel-bar-count");
    if (!selBar || !hint) return;
    if (actions) actions.hidden = true;
    if (count) count.hidden = true;
    hint.hidden = false;
    hint.textContent = "Select other anchors and finish/cancel";
    selBar.classList.add("open");
    if (multiAnchorHintTimer) clearTimeout(multiAnchorHintTimer);
    multiAnchorHintTimer = setTimeout(function () {
      multiAnchorHintTimer = null;
      hideMultiAnchorHint();
      selBar.classList.remove("open");
    }, 2000);
  }

  function rememberQueueRange() {
    const selection = window.getSelection && window.getSelection();
    pendingQueueRange = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  }

  function useSelectedText(intent) {
    if (!pending) return;
    if (intent === "attach-pick" && !notes().length) {
      alert("No existing notes to attach to. Make a note first.");
      return;
    }
    if (intent === "queue") rememberQueueRange();
    const startingSeveral = intent === "queue" && pendingSelections.length === 0;
    if (placeOnlySelection) placeOnlySelection.checked = true;
    if (placeOnlyAbove) placeOnlyAbove.checked = false;
    if (placeOnlyBelow) placeOnlyBelow.checked = false;
    if (placeOnlyCellAbove) placeOnlyCellAbove.checked = false;
    if (placeOnlyCellBelow) placeOnlyCellBelow.checked = false;
    placementPending = Object.assign({}, pending, { intent: intent });
    placementTargetId = null;
    attachTargetId = null;
    if (selBar && !startingSeveral) selBar.classList.remove("open");
    confirmPlacementAttach();
  }

  function openFromSelection() {
    useSelectedText("create");
  }

  function selectAnotherFromSelection() {
    useSelectedText("queue");
  }

  function attachExistingFromSelection() {
    useSelectedText("attach-pick");
  }

  function openFromSelectionMore() {
    if (!pending) return;
    openPlacementModal(Object.assign({}, pending, { intent: "create" }), null);
  }

  function selectAnotherFromSelectionMore() {
    if (!pending) return;
    rememberQueueRange();
    openPlacementModal(Object.assign({}, pending, { intent: "queue" }), null);
  }

  function attachExistingFromSelectionMore() {
    if (!pending) return;
    if (!notes().length) {
      alert("No existing notes to attach to. Make a note first.");
      return;
    }
    openPlacementModal(Object.assign({}, pending, { intent: "attach-pick" }), null);
  }

  function selectionLineIndex(source, offset) {
    let lineIdx = String(source.slice(0, Math.max(0, offset))).split("\n").length - 1;
    // Caret at start of a line → that line is the selection line
    if (offset > 0 && source.charAt(offset - 1) === "\n") {
      // already correct (split counts the new empty segment)
    }
    return Math.max(0, lineIdx);
  }

  function betweenLinesFromOffset(cellId, source, offset, side) {
    side = side === "above" ? "above" : "below";
    const lineCount = source.length ? source.split("\n").length : 1;
    const lineIdx = selectionLineIndex(source, offset);
    let afterLine;
    if (side === "above") {
      // above first line → after_line = -1 (marker at cell top)
      afterLine = lineIdx - 1;
    } else {
      // below last line → after_line = lineCount - 1 (marker at cell bottom)
      afterLine = lineIdx;
    }
    if (afterLine < -1) afterLine = -1;
    if (afterLine > lineCount - 1) afterLine = lineCount - 1;
    return {
      target: "between_lines",
      cell_id: cellId,
      after_line: afterLine,
      line_range: [lineIdx, lineIdx + 1],
      side: side,
      substring: "",
      occurrence: 0,
      color: DEFAULT_NOTE_COLOR,
      opacity: DEFAULT_NOTE_OPACITY,
      comment: "",
      header: ""
    };
  }

  function pendingAsBetweenLines(side) {
    if (!pending) return { error: "Select text in a notebook cell first." };
    if (pending.target === "note" || pending.target === "output") {
      return { error: "Between-lines notes attach to cell source lines. Select text in a code or markdown cell." };
    }
    const cellId = pending.cell_id != null ? pending.cell_id : pending.cell;
    if (cellId == null || cellId === "" || cellId < 0) {
      return { error: "Select text in a notebook cell first." };
    }
    const source = activeDiffSourceForCell(cellId);
    let offset = 0;
    if (pending.substring) {
      const idx = findNth(source, pending.substring, pending.occurrence || 0);
      offset = idx >= 0 ? idx : 0;
    }
    return betweenLinesFromOffset(cellId, source, offset, side);
  }

  const btnMake = document.getElementById("btn-make-note");
  const btnSelectAnother = document.getElementById("btn-select-another");
  const btnAttachSel = document.getElementById("btn-attach-note");
  // Legacy sel-bar between-lines buttons (removed from template; keep no-op wiring if present)
  const btnBetweenAbove = document.getElementById("btn-between-above");
  const btnBetweenBelow = document.getElementById("btn-between-below");
  const btnBetweenLegacy = document.getElementById("btn-between-lines");
  if (btnMake) {
    btnMake.addEventListener("click", openFromSelection);
    const btnMakeMore = document.getElementById("btn-make-note-more");
    if (btnMakeMore) btnMakeMore.addEventListener("click", openFromSelectionMore);
  }
  if (btnSelectAnother) {
    btnSelectAnother.addEventListener("click", selectAnotherFromSelection);
  }
  const btnSelectAnotherMore = document.getElementById("btn-select-another-more");
  if (btnSelectAnotherMore) btnSelectAnotherMore.addEventListener("click", selectAnotherFromSelectionMore);
  if (btnAttachSel) {
    btnAttachSel.addEventListener("click", attachExistingFromSelection);
  }
  const btnAttachMore = document.getElementById("btn-attach-note-more");
  if (btnAttachMore) btnAttachMore.addEventListener("click", attachExistingFromSelectionMore);
  updateSelBarLabels();
  if (btnBetweenAbove) btnBetweenAbove.style.display = "none";
  if (btnBetweenBelow) btnBetweenBelow.style.display = "none";
  if (btnBetweenLegacy) btnBetweenLegacy.style.display = "none";
  const btnAddLegacy = document.getElementById("btn-add-note");
  if (btnAddLegacy) {
    btnAddLegacy.addEventListener("click", function () { openFromSelection(false); });
  }

  const backdrop = document.getElementById("note-modal");
  const fieldColor = document.getElementById("note-color");
  const fieldOpacity = document.getElementById("note-opacity");
  const fieldOpacityVal = document.getElementById("note-opacity-val");
  const fieldHeader = document.getElementById("note-header");
  const fieldComment = document.getElementById("note-comment");
  const fieldPreview = document.getElementById("note-preview");
  const fieldOcc = document.getElementById("note-occurrence");
  let editId = null;
  let attachTargetId = null;
  let attachPickActive = false;
  let attachPickPending = null;
  let modalBaseData = null;

  function syncOpacityLabel() {
    if (fieldOpacityVal && fieldOpacity) {
      const pct = Number(fieldOpacity.value) * 100;
      fieldOpacityVal.textContent = (Number.isFinite(pct) ? pct : 100).toFixed(1) + "%";
    }
  }
  if (fieldOpacity) {
    fieldOpacity.addEventListener("input", syncOpacityLabel);
  }

  const modeNew = document.getElementById("note-mode-new");
  const modeAttach = document.getElementById("note-mode-attach");
  const modeRow = document.getElementById("note-mode-row");
  const attachPicked = document.getElementById("note-attach-picked");
  const attachPickedLabel = document.getElementById("note-attach-picked-label");
  const placementRow = document.getElementById("note-placement-row");
  const placeSelection = document.getElementById("note-place-selection");
  const placeAbove = document.getElementById("note-place-above");
  const placeBelow = document.getElementById("note-place-below");
  const attachPickBanner = document.getElementById("attach-pick-banner");

  function setAttachModeUI(isAttach, isEdit) {
    if (modeRow) modeRow.style.display = isEdit ? "none" : "flex";
    if (attachPicked) attachPicked.hidden = !(!isEdit && isAttach && attachTargetId != null);
    const lockMeta = !isEdit && isAttach;
    if (fieldColor) fieldColor.disabled = lockMeta;
    if (fieldOpacity) fieldOpacity.disabled = lockMeta;
    if (fieldHeader) fieldHeader.disabled = lockMeta;
    if (fieldComment) fieldComment.disabled = lockMeta;
  }

  function updateAttachPickedLabel() {
    if (!attachPicked || !attachPickedLabel) return;
    if (attachTargetId == null) {
      attachPicked.hidden = true;
      attachPickedLabel.textContent = "";
      return;
    }
    const n = notes().find(function (x) { return x.note_id === attachTargetId; });
    attachPickedLabel.textContent = n ? noteLabel(n) : ("#" + attachTargetId);
    attachPicked.hidden = false;
  }

  function fillMetaFromNote(n) {
    if (!n) return;
    fieldColor.value = n.color || DEFAULT_NOTE_COLOR;
    if (fieldOpacity) {
      fieldOpacity.value = String(noteOpacity(n));
      syncOpacityLabel();
    }
    if (fieldHeader) fieldHeader.value = n.header || "";
    fieldComment.value = n.comment || "";
  }

  function selectedPlacement() {
    if (placeAbove && placeAbove.checked) return "above";
    if (placeBelow && placeBelow.checked) return "below";
    return "selection";
  }

  function setPlacementUI(value, opts) {
    opts = opts || {};
    const v = value === "above" || value === "below" ? value : "selection";
    if (placeSelection) placeSelection.checked = v === "selection";
    if (placeAbove) placeAbove.checked = v === "above";
    if (placeBelow) placeBelow.checked = v === "below";
    if (placementRow) {
      placementRow.style.display = opts.hide ? "none" : "";
    }
  }

  function applyPlacementToModal(placement) {
    if (!modalBaseData) return false;
    if (placement === "cell-above" || placement === "cell-below") {
      const srcPending = pending || attachPickPending || modalBaseData;
      const built = buildAnchorFromPlacement(srcPending, placement);
      if (built.error) {
        alert(built.error);
        setPlacementUI("selection");
        return false;
      }
      fieldPreview.textContent = built.side === "above"
        ? "Between cells, in the gap above this cell"
        : "Between cells, in the gap below this cell";
      fieldOcc.value = "0";
      fieldOcc.disabled = true;
      backdrop.dataset.cellId = String(built.cell_id != null ? built.cell_id : "");
      backdrop.dataset.substring = "";
      backdrop.dataset.target = "between_cells";
      backdrop.dataset.parent = "";
      backdrop.dataset.outputIndex = "";
      backdrop.dataset.afterLine = "";
      backdrop.dataset.side = built.side === "above" ? "above" : "below";
      backdrop.dataset.line = built.line != null ? String(built.line) : "";
      return true;
    }
    if (placement === "above" || placement === "below") {
      // Prefer deriving from live pending/selection; fall back to modalBaseData cell
      const srcPending = pending || attachPickPending || modalBaseData;
      if (srcPending.target === "note" || srcPending.target === "output") {
        alert("Between-lines notes attach to cell source lines. Select text in a code or markdown cell.");
        setPlacementUI("selection");
        return false;
      }
      const cellId = srcPending.cell_id != null ? srcPending.cell_id : srcPending.cell;
      if (cellId == null || cellId === "" || cellId < 0) {
        alert("Select text in a notebook cell first.");
        setPlacementUI("selection");
        return false;
      }
      const source = cellSource(cellId);
      let offset = 0;
      if (srcPending.substring) {
        const idx = findNth(source, srcPending.substring, srcPending.occurrence || 0);
        offset = idx >= 0 ? idx : 0;
      } else if (srcPending.target === "between_lines" && srcPending.after_line != null) {
        // Already a between-lines payload — keep after_line, just flip side if needed
        const info = {
          target: "between_lines",
          cell_id: cellId,
          after_line: srcPending.after_line,
          side: placement,
          substring: "",
          occurrence: 0
        };
        // Recompute after_line from side using selection line when possible
        const recomputed = betweenLinesFromOffset(cellId, source, offset, placement);
        const use = recomputed.error ? info : recomputed;
        const sideLbl = use.side === "above" ? "above" : "below";
        fieldPreview.textContent =
          (sideLbl === "above" ? "Above this line" : sideLbl === "below" ? "Below this line" : "Between lines (" + sideLbl + ")") + ", after L" + (use.after_line != null ? use.after_line : 0);
        fieldOcc.value = "0";
        fieldOcc.disabled = true;
        backdrop.dataset.cellId = String(use.cell_id != null ? use.cell_id : "");
        backdrop.dataset.substring = "";
        backdrop.dataset.target = "between_lines";
        backdrop.dataset.parent = "";
        backdrop.dataset.outputIndex = "";
        backdrop.dataset.afterLine = use.after_line != null ? String(use.after_line) : "";
        backdrop.dataset.side = use.side === "above" || use.side === "below" ? use.side : "";
        return true;
      }
      const info = betweenLinesFromOffset(cellId, source, offset, placement);
      if (info.error) {
        alert(info.error);
        setPlacementUI("selection");
        return false;
      }
      const sideLbl = info.side === "above" ? "above" : "below";
      fieldPreview.textContent =
        (sideLbl === "above" ? "Above this line" : sideLbl === "below" ? "Below this line" : "Between lines (" + sideLbl + ")") + ", after L" + (info.after_line != null ? info.after_line : 0);
      fieldOcc.value = "0";
      fieldOcc.disabled = true;
      backdrop.dataset.cellId = String(info.cell_id != null ? info.cell_id : "");
      backdrop.dataset.substring = "";
      backdrop.dataset.target = "between_lines";
      backdrop.dataset.parent = "";
      backdrop.dataset.outputIndex = "";
      backdrop.dataset.afterLine = info.after_line != null ? String(info.after_line) : "";
      backdrop.dataset.side = info.side === "above" || info.side === "below" ? info.side : "";
      return true;
    }
    // selection (highlight / nested / output)
    const data = modalBaseData;
    fieldPreview.textContent = data.substring || "";
    fieldOcc.value = String(data.occurrence || 0);
    fieldOcc.disabled = false;
    backdrop.dataset.cellId = String(data.cell_id != null ? data.cell_id : "");
    backdrop.dataset.substring = data.substring || "";
    backdrop.dataset.target = data.target || "cell";
    backdrop.dataset.parent = data.parent_note_id != null ? String(data.parent_note_id) : "";
    backdrop.dataset.outputIndex = data.output_index != null ? String(data.output_index) : "";
    backdrop.dataset.afterLine = "";
    backdrop.dataset.side = "";
    return true;
  }

  function onPlacementChange() {
    applyPlacementToModal(selectedPlacement());
  }
  if (placeSelection) placeSelection.addEventListener("change", onPlacementChange);
  if (placeAbove) placeAbove.addEventListener("change", onPlacementChange);
  if (placeBelow) placeBelow.addEventListener("change", onPlacementChange);

  function endAttachPickMode() {
    attachPickActive = false;
    attachPickPending = null;
    document.body.classList.remove("attach-pick-mode");
    if (attachPickBanner) attachPickBanner.hidden = true;
  }

  function beginAttachPickMode(info) {
    if (!info) return;
    if (!notes().length) {
      alert("No existing notes to attach to. Make a note first.");
      return;
    }
    attachPickActive = true;
    attachPickPending = Object.assign({}, info);
    pending = attachPickPending;
    document.body.classList.add("attach-pick-mode");
    if (attachPickBanner) {
      const kept = info.selection_batch && info.selection_batch.length > 1 ? info.selection_batch.length : 1;
      attachPickBanner.textContent = kept > 1
        ? "Click a note card to attach " + kept + " anchors · Esc to cancel"
        : "Click a note card to attach the selection · Esc to cancel";
      attachPickBanner.hidden = false;
    }
    selBar.classList.remove("open");
  }

  function completeAttachPick(noteId) {
    if (!attachPickActive) return;
    const n = notes().find(function (x) { return x.note_id === noteId; });
    if (!n) return;
    const info = attachPickPending || pending;
    endAttachPickMode();
    if (!info) return;
    attachTargetId = n.note_id;
    if (info.placement) {
      placementPending = Object.assign({}, info, { intent: "attach" });
      placementTargetId = n.note_id;
      confirmPlacementAttach();
      return;
    }
    openPlacementModal(info, n);
  }

  const placementBackdrop = document.getElementById("placement-modal");
  const placeOnlySelection = document.getElementById("place-only-selection");
  const placeOnlyAbove = document.getElementById("place-only-above");
  const placeOnlyBelow = document.getElementById("place-only-below");
  const placeOnlyCellAbove = document.getElementById("place-only-cell-above");
  const placeOnlyCellBelow = document.getElementById("place-only-cell-below");
  const placementPreview = document.getElementById("placement-preview");
  const placementAttachLabel = document.getElementById("placement-attach-label");
  let placementPending = null;
  let placementTargetId = null;

  function placementOnlyValue() {
    if (placeOnlyCellAbove && placeOnlyCellAbove.checked) return "cell-above";
    if (placeOnlyCellBelow && placeOnlyCellBelow.checked) return "cell-below";
    if (placeOnlyAbove && placeOnlyAbove.checked) return "above";
    if (placeOnlyBelow && placeOnlyBelow.checked) return "below";
    return "selection";
  }

  function selectionLineForInfo(info) {
    if (!info) return 0;
    const cellId = info.cell_id != null ? info.cell_id : info.cell;
    const source = cellSource(cellId);
    let offset = null;
    if (Array.isArray(info.range) && info.range.length) {
      offset = Math.max(0, Number(info.range[0]) || 0);
    } else if (info.substring) {
      const idx = findNth(source, info.substring, info.occurrence || 0);
      offset = idx >= 0 ? idx : 0;
    } else if (info.line != null && info.line !== "") {
      const kept = Number(info.line);
      if (Number.isFinite(kept)) return Math.max(0, kept | 0);
    }
    if (offset == null) return 0;
    return selectionLineIndex(source, offset);
  }

  function buildAnchorFromPlacement(info, placement) {
    if (placement === "cell-above" || placement === "cell-below") {
      if (!info || info.target === "note" || info.target === "output") {
        return { error: "Between-cells anchors attach to a notebook cell. Select text in a code or markdown cell." };
      }
      const cellId = info.cell_id != null ? info.cell_id : info.cell;
      if (cellId == null || cellId === "") {
        return { error: "Select text in a notebook cell first." };
      }
      return {
        target: "between_cells",
        cell_id: cellId,
        side: placement === "cell-above" ? "above" : "below",
        substring: "",
        occurrence: 0,
        line: selectionLineForInfo(info)
      };
    }
    if (placement === "above" || placement === "below") {
      if (info.target === "note" || info.target === "output") {
        return { error: "Between-lines notes attach to cell source lines. Select text in a code or markdown cell." };
      }
      const cellId = info.cell_id != null ? info.cell_id : info.cell;
      if (cellId == null || cellId === "") {
        return { error: "Select text in a notebook cell first." };
      }
      const source = cellSource(cellId);
      let offset = Array.isArray(info.range) ? Math.max(0, Number(info.range[0]) || 0) : 0;
      if (!Array.isArray(info.range) && info.substring) {
        const idx = findNth(source, info.substring, info.occurrence || 0);
        offset = idx >= 0 ? idx : 0;
      }
      const built = betweenLinesFromOffset(cellId, source, offset, placement);
      if (built.error) return built;
      return {
        target: "between_lines",
        cell_id: built.cell_id,
        after_line: built.after_line,
        line_range: built.line_range,
        side: built.side,
        substring: "",
        occurrence: 0
      };
    }
    const a = {
      target: info.target || "cell",
      substring: info.substring || "",
      occurrence: info.occurrence || 0,
      range: Array.isArray(info.range) ? info.range.slice(0, 2) : null
    };
    if (a.target === "note") a.parent_note_id = info.parent_note_id;
    else if (a.target === "output") {
      a.cell_id = info.cell_id != null ? info.cell_id : info.cell;
      a.output_index = info.output_index || 0;
    } else {
      a.cell_id = info.cell_id != null ? info.cell_id : info.cell;
    }
    return a;
  }

  function syncPlacementPreview() {
    if (!placementPending || !placementPreview) return;
    const placement = placementOnlyValue();
    const a = buildAnchorFromPlacement(placementPending, placement);
    if (a.error) {
      placementPreview.textContent = a.error;
      return;
    }
    if (a.target === "between_cells") {
      placementPreview.textContent = a.side === "above"
        ? "Between cells, in the gap above this cell"
        : "Between cells, in the gap below this cell";
    } else if (a.target === "between_lines") {
      const sideLbl = a.side === "above" ? "above" : "below";
      const edge =
        a.after_line < 0 ? " (cell top)" :
        (function () {
          const src = cellSource(a.cell_id);
          const lc = src.length ? src.split("\n").length : 1;
          return a.after_line >= lc - 1 ? " (cell bottom)" : "";
        })();
      placementPreview.textContent =
        (sideLbl === "above" ? "Above this line" : sideLbl === "below" ? "Below this line" : "Between lines (" + sideLbl + ")") + ", after L" + a.after_line + edge;
    } else {
      placementPreview.textContent = a.substring
        ? ('"' + truncatePreview(a.substring, 80) + '"')
        : "(selection)";
    }
  }

  function openPlacementModal(info, note) {
    placementPending = Object.assign({}, info || {});
    if (!placementPending.intent) placementPending.intent = note ? "attach" : "create";
    placementTargetId = note ? note.note_id : null;
    attachTargetId = note ? note.note_id : null;
    const title = document.getElementById("placement-modal-title");
    const attachLine = document.getElementById("placement-attach-line");
    const scope = document.getElementById("placement-scope");
    const confirmBtn = document.getElementById("placement-confirm");
    if (title) title.textContent = "Other anchor types";
    if (placementAttachLabel) placementAttachLabel.textContent = note ? noteLabel(note) : "";
    if (attachLine) attachLine.hidden = !note;
    const allowBetween = !(info && (info.target === "note" || info.target === "output"));
    if (scope) {
      scope.hidden = false;
      scope.textContent = allowBetween
        ? "Above this line and below this line sit in the gap around that line. Above this cell and below this cell sit in the gap between cells."
        : "These anchor types need a selection inside a code or markdown cell.";
    }
    if (confirmBtn) {
      confirmBtn.textContent = note ? "Attach" : (placementPending.intent === "queue" ? "Keep anchor" : "Continue");
      confirmBtn.disabled = !allowBetween;
    }
    if (placeOnlySelection) placeOnlySelection.checked = !allowBetween;
    if (placeOnlyAbove) {
      placeOnlyAbove.disabled = !allowBetween;
      placeOnlyAbove.checked = allowBetween;
    }
    if (placeOnlyBelow) {
      placeOnlyBelow.disabled = !allowBetween;
      placeOnlyBelow.checked = false;
    }
    if (placeOnlyCellAbove) {
      placeOnlyCellAbove.disabled = !allowBetween;
      placeOnlyCellAbove.checked = false;
    }
    if (placeOnlyCellBelow) {
      placeOnlyCellBelow.disabled = !allowBetween;
      placeOnlyCellBelow.checked = false;
    }
    syncPlacementPreview();
    if (placementBackdrop) placementBackdrop.classList.add("open");
    selBar.classList.remove("open");
  }

  function closePlacementModal() {
    if (placementBackdrop) placementBackdrop.classList.remove("open");
    placementPending = null;
    placementTargetId = null;
    pendingQueueRange = null;
  }

  function placementModalIsOpen() {
    return !!(placementBackdrop && placementBackdrop.classList.contains("open"));
  }

  function confirmPlacementAttach() {
    if (!placementPending) return;
    const intent = placementPending.intent || "attach";
    const placement = placementOnlyValue();
    function takePlacedSelection() {
      const current = Object.assign({}, placementPending, { placement: placement });
      delete current.intent;
      delete current.selection_batch;
      const batch = pendingSelections.map(function (item) { return Object.assign({}, item); });
      batch.push(current);
      return { current: current, batch: batch };
    }
    if (intent === "queue") {
      const startingSeveral = pendingSelections.length === 0;
      const kept = takePlacedSelection().current;
      const range = pendingQueueRange;
      pendingQueueRange = null;
      closePlacementModal();
      pendingSelections.push(kept);
      if (range) pendingSelectionRanges.push(range);
      pending = null;
      refreshPendingSelectionHighlights();
      const selection = window.getSelection && window.getSelection();
      if (selection && selection.removeAllRanges) selection.removeAllRanges();
      updateSelBarLabels();
      if (startingSeveral) showMultiAnchorHint();
      return;
    }
    if (intent === "create") {
      const placed = takePlacedSelection();
      const data = Object.assign({}, placed.current, { selection_batch: placed.batch });
      closePlacementModal();
      pendingSelections = [];
      pending = null;
      clearPendingSelectionHighlights();
      updateSelBarLabels();
      openModal("add", data, { attachMode: false, lockMode: false });
      setPlacementUI(placement, { hide: true });
      applyPlacementToModal(placement);
      return;
    }
    if (intent === "attach-pick") {
      const placed = takePlacedSelection();
      const data = Object.assign({}, placed.current, { selection_batch: placed.batch, placement: placement });
      closePlacementModal();
      beginAttachPickMode(data);
      if (!attachPickActive) return;
      pendingSelections = [];
      pending = null;
      clearPendingSelectionHighlights();
      updateSelBarLabels();
      return;
    }
    if (placementTargetId == null) return;
    const built = anchorsFromSelectionBatch(placementPending, placementPending.placement || placement, null);
    if (built.error || !built.anchors.length) {
      alert(built.error || "Select text before attaching.");
      return;
    }
    const n = notes().find(function (x) { return x.note_id === placementTargetId; });
    if (!n) {
      alert("Note no longer exists.");
      closePlacementModal();
      return;
    }
    const norm = normalizeNote(n, n.note_id);
    norm.anchors = norm.anchors.concat(built.anchors);
    replaceNoteInPlace(n, norm);
    closePlacementModal();
    persistAndRefresh();
  }

  if (placeOnlySelection) placeOnlySelection.addEventListener("change", syncPlacementPreview);
  if (placeOnlyAbove) placeOnlyAbove.addEventListener("change", syncPlacementPreview);
  if (placeOnlyBelow) placeOnlyBelow.addEventListener("change", syncPlacementPreview);
  if (placeOnlyCellAbove) placeOnlyCellAbove.addEventListener("change", syncPlacementPreview);
  if (placeOnlyCellBelow) placeOnlyCellBelow.addEventListener("change", syncPlacementPreview);
  const placementCancel = document.getElementById("placement-cancel");
  const placementConfirm = document.getElementById("placement-confirm");
  if (placementCancel) placementCancel.addEventListener("click", closePlacementModal);
  if (placementConfirm) placementConfirm.addEventListener("click", confirmPlacementAttach);
  if (placementBackdrop) {
    placementBackdrop.addEventListener("click", function (ev) {
      if (ev.target === placementBackdrop) closePlacementModal();
    });
  }


  if (modeNew) {
    modeNew.addEventListener("change", function () {
      if (modeNew.checked) {
        attachTargetId = null;
        setAttachModeUI(false, false);
        updateAttachPickedLabel();
      }
    });
  }
  if (modeAttach) {
    modeAttach.addEventListener("change", function () {
      if (!modeAttach.checked) return;
      // Switch into click-to-pick mode from the open modal
      const data = modalBaseData || selectionAnchorFromDataset();
      closeModal();
      beginAttachPickMode(Object.assign({
        color: DEFAULT_NOTE_COLOR,
        opacity: DEFAULT_NOTE_OPACITY,
        comment: "",
        header: ""
      }, data));
    });
  }

  function moveAnchorToOccurrence(anchor, occurrence) {
    if (!anchor) return null;
    const prev = Math.max(0, Number(anchor.occurrence) || 0);
    anchor.occurrence = occurrence;
    if (occurrence === prev) return null;
    if (!anchor.substring || anchor.target === "between_lines" || anchor.target === "between_cells") return null;
    const start = findNth(anchorTextForRange(anchor), anchor.substring, occurrence);
    if (start < 0) return "That occurrence of this text was not found.";
    anchor.range = [start, start + anchor.substring.length];
    return null;
  }

  function anchorsFromSelectionBatch(info, placement, occurrenceOverride) {
    const batch = info && Array.isArray(info.selection_batch) && info.selection_batch.length
      ? info.selection_batch
      : [info];
    const anchors = [];
    for (let i = 0; i < batch.length; i++) {
      const item = Object.assign({}, batch[i] || {});
      if (i === 0 && occurrenceOverride != null) {
        const moved = moveAnchorToOccurrence(item, Math.max(0, Number(occurrenceOverride) || 0));
        if (moved) return { error: moved, anchors: [] };
      }
      const anchor = buildAnchorFromPlacement(item, item.placement || placement || "selection");
      if (anchor && anchor.error) return { error: anchor.error, anchors: [] };
      anchors.push(normalizeAnchorToNewNotebook(anchor));
    }
    return { anchors: anchors };
  }

  function selectionAnchorFromDataset(occurrenceOverride) {
    const target = backdrop.dataset.target || "cell";
    const a = {
      target: target,
      substring: backdrop.dataset.substring || "",
      occurrence: Math.max(0, Number(occurrenceOverride) || 0)
    };
    if (target === "note") a.parent_note_id = parseInt(backdrop.dataset.parent, 10);
    else if (target === "output") {
      a.cell_id = backdrop.dataset.cellId || backdrop.dataset.cell || null;
      a.output_index = parseInt(backdrop.dataset.outputIndex, 10) || 0;
    } else if (target === "between_lines") {
      a.cell_id = backdrop.dataset.cellId || backdrop.dataset.cell || null;
      a.after_line = parseInt(backdrop.dataset.afterLine, 10) || 0;
      if (backdrop.dataset.side === "above" || backdrop.dataset.side === "below") {
        a.side = backdrop.dataset.side;
      }
      a.substring = "";
    } else if (target === "between_cells") {
      a.cell_id = backdrop.dataset.cellId || backdrop.dataset.cell || null;
      a.substring = "";
      if (backdrop.dataset.side === "above" || backdrop.dataset.side === "below") a.side = backdrop.dataset.side;
      else a.side = "below";
      if (backdrop.dataset.line != null && backdrop.dataset.line !== "") {
        a.line = Math.max(0, parseInt(backdrop.dataset.line, 10) || 0);
      }
    } else {
      a.cell_id = backdrop.dataset.cellId || backdrop.dataset.cell || null;
    }
    return normalizeAnchorToNewNotebook(a);
  }

  const anchorsPanel = document.getElementById("note-anchors-panel");
  const anchorsList = document.getElementById("note-anchors-list");

  function syncFocusedAnchorFields(note) {
    const norm = normalizeNote(note, note.note_id);
    const anchors = norm.anchors || [];
    if (!anchors.length) {
      focusAnchorIndex = 0;
      fieldPreview.textContent = "";
      fieldOcc.value = "0";
      return;
    }
    if (focusAnchorIndex < 0 || focusAnchorIndex >= anchors.length) focusAnchorIndex = 0;
    const a = anchors[focusAnchorIndex];
    fieldPreview.textContent = a.substring || "";
    fieldOcc.value = String(a.occurrence || 0);
    fieldOcc.disabled = false;
  }

  function renderAnchorsEditor(note) {
    if (!anchorsPanel || !anchorsList) return;
    const norm = normalizeNote(note, note.note_id);
    const anchors = norm.anchors || [];
    anchorsPanel.hidden = false;
    anchorsList.innerHTML = "";
    anchors.forEach(function (a, ai) {
      const li = document.createElement("li");
      if (ai === focusAnchorIndex) li.classList.add("focus-anchor");
      const meta = document.createElement("div");
      meta.className = "anchor-meta";
      meta.innerHTML = "";
      const kind = document.createElement("span");
      kind.className = "anchor-kind";
      kind.textContent = "#" + (ai + 1) + " · " + anchorKindLabel(a) + " · occ " + (a.occurrence || 0);
      meta.appendChild(kind);
      if (a.substring) meta.appendChild(document.createTextNode("“" + truncatePreview(a.substring, 80) + "”"));
      li.appendChild(meta);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = anchors.length <= 1 ? "Unattach (delete note)" : "Unattach";
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        unattachAnchor(note.note_id, ai);
      });
      li.appendChild(btn);
      li.addEventListener("click", function (ev) {
        if (ev.target === btn) return;
        focusAnchorIndex = ai;
        syncFocusedAnchorFields(note);
        renderAnchorsEditor(note);
      });
      anchorsList.appendChild(li);
    });
    syncFocusedAnchorFields(note);
  }

  function hideAnchorsEditor() {
    if (anchorsPanel) anchorsPanel.hidden = true;
    if (anchorsList) anchorsList.innerHTML = "";
  }

  function openModal(mode, data, opts) {
    if (notesLocked) return;
    opts = opts || {};
    editId = mode === "edit" ? data.note_id : null;
    const isEdit = mode === "edit";
    const attachMode = !!opts.attachMode;
    const lockMode = !!opts.lockMode;
    focusAnchorIndex = opts.focusAnchor != null ? opts.focusAnchor : 0;
    if (attachMode && opts.attachNoteId != null) {
      attachTargetId = opts.attachNoteId;
    } else if (!attachMode) {
      attachTargetId = null;
    }
    fieldColor.value = data.color || DEFAULT_NOTE_COLOR;
    if (fieldOpacity) {
      if (isEdit) {
        fieldOpacity.value = String(noteOpacity(data));
      } else if (data.opacity != null || data.alpha != null) {
        fieldOpacity.value = String(noteOpacity(data));
      } else {
        fieldOpacity.value = String(DEFAULT_NOTE_OPACITY);
      }
      syncOpacityLabel();
    }
    if (fieldHeader) fieldHeader.value = data.header || "";
    fieldComment.value = data.comment || "";
    fieldOcc.disabled = false;
    backdrop.dataset.mode = mode;
    if (isEdit) {
      modalBaseData = null;
      const norm = normalizeNote(data, data.note_id);
      const a = (norm.anchors && norm.anchors[focusAnchorIndex]) || primaryAnchor(norm);
      if (a.target === "between_lines") {
        const sideLbl = a.side === "above" ? "above" : (a.side === "below" ? "below" : "gap");
        fieldPreview.textContent =
          (sideLbl === "above" ? "Above this line" : sideLbl === "below" ? "Below this line" : "Between lines (" + sideLbl + ")") + ", after L" + (a.after_line != null ? a.after_line : 0);
        fieldOcc.value = "0";
        fieldOcc.disabled = true;
      } else if (a.target === "between_cells") {
        fieldPreview.textContent = a.side === "above"
          ? "Between cells, in the gap above this cell"
          : "Between cells, in the gap below this cell";
        fieldOcc.value = "0";
        fieldOcc.disabled = true;
      } else {
        fieldPreview.textContent = a.substring || "";
        fieldOcc.value = String(a.occurrence || 0);
        fieldOcc.disabled = false;
      }
      backdrop.dataset.cellId = String(a.cell_id != null ? a.cell_id : "");
      backdrop.dataset.substring = a.substring || "";
      backdrop.dataset.target = a.target || "cell";
      backdrop.dataset.parent = a.parent_note_id != null ? String(a.parent_note_id) : "";
      backdrop.dataset.outputIndex = a.output_index != null ? String(a.output_index) : "";
      backdrop.dataset.afterLine = a.after_line != null ? String(a.after_line) : "";
      backdrop.dataset.side = a.side === "above" || a.side === "below" ? a.side : "";
      backdrop.dataset.line = a.line != null ? String(a.line) : "";
      renderAnchorsEditor(data);
      setPlacementUI("selection", { hide: true });
    } else {
      // Keep original selection payload so placement can switch back from between-lines
      modalBaseData = Object.assign({}, data);
      if (data.target === "between_lines") {
        setPlacementUI(data.side === "above" ? "above" : "below");
      } else {
        setPlacementUI("selection");
      }
      hideAnchorsEditor();
      applyPlacementToModal(selectedPlacement());
      if (attachMode && attachTargetId != null) {
        const existing = notes().find(function (x) { return x.note_id === attachTargetId; });
        if (existing) fillMetaFromNote(existing);
      }
    }
    if (modeNew) modeNew.checked = !attachMode;
    if (modeAttach) modeAttach.checked = attachMode;
    setAttachModeUI(attachMode, isEdit);
    updateAttachPickedLabel();
    if (modeRow) {
      if (isEdit || lockMode) modeRow.style.display = "none";
      else modeRow.style.display = "flex";
    }
    document.getElementById("modal-title").textContent =
      isEdit ? "Edit note"
        : (attachMode ? "Attach to existing note"
          : (selectedPlacement() !== "selection" || data.target === "between_lines" ? "Add between-lines note"
            : (data.target === "note" ? "Add nested note"
              : (data.target === "output" ? "Add output note" : "Make a note"))));
    const delBtn = document.getElementById("modal-delete");
    if (delBtn) delBtn.style.display = isEdit ? "" : "none";
    backdrop.classList.add("open");
    selBar.classList.remove("open");
    setTimeout(function () { if (fieldHeader && !fieldHeader.disabled) { fieldHeader.focus(); fieldHeader.select(); } }, 0);
  }

  function closeModal() {
    backdrop.classList.remove("open");
    editId = null;
    focusAnchorIndex = 0;
    attachTargetId = null;
    modalBaseData = null;
    hideAnchorsEditor();
    setAttachModeUI(false, false);
    updateAttachPickedLabel();
    setPlacementUI("selection", { hide: false });
  }

  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  backdrop.addEventListener("click", function (ev) {
    if (ev.target === backdrop) closeModal();
  });

  function modalIsOpen() {
    return !!(backdrop && backdrop.classList.contains("open"));
  }

  function isMultilineField(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    return !!el.isContentEditable;
  }

  function saveModalFromUi() {
    const btn = document.getElementById("modal-save");
    if (btn) btn.click();
  }

  function deleteModalFromUi() {
    const btn = document.getElementById("modal-delete");
    if (!btn || btn.style.display === "none") return;
    btn.click();
  }

  document.addEventListener("keydown", function (ev) {
    const key = ev.key;
    if (key === "Escape" && attachPickActive) {
      ev.preventDefault();
      endAttachPickMode();
      return;
    }
    if (key === "Escape" && pendingSelections.length && !modalIsOpen() && !placementModalIsOpen()) {
      ev.preventDefault();
      pendingSelections = [];
      clearPendingSelectionHighlights();
      hideMultiAnchorHint();
      if (selBar) selBar.classList.remove("open");
      updateSelBarLabels();
      return;
    }
    if (key === "Escape" && placementModalIsOpen()) {
      ev.preventDefault();
      closePlacementModal();
      return;
    }
    if (placementModalIsOpen()) {
      if (key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        confirmPlacementAttach();
      }
      return;
    }
    if (!modalIsOpen()) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (key === "Escape") {
      ev.preventDefault();
      closeModal();
      return;
    }
    // Delete note: plain Delete key (edit mode only; never without modal).
    // Not Ctrl/Cmd+Backspace (that deletes words while typing). In text fields,
    // Delete still edits text; elsewhere in the open edit modal it deletes the note.
    if (key === "Delete" && !mod && !ev.altKey && editId != null) {
      const tag = (ev.target && ev.target.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input" || (ev.target && ev.target.isContentEditable)) {
        return;
      }
      ev.preventDefault();
      deleteModalFromUi();
      return;
    }
    // Save: Ctrl/Cmd+Enter always; bare Enter only when not in the comment textarea
    if (key === "Enter" && mod) {
      ev.preventDefault();
      saveModalFromUi();
      return;
    }
    if (key === "Enter" && !mod && !ev.shiftKey) {
      if (isMultilineField(ev.target)) return;
      const tag = (ev.target && ev.target.tagName || "").toLowerCase();
      if (tag === "button" || tag === "a") return;
      ev.preventDefault();
      saveModalFromUi();
    }
  });

  function persistAndRefresh() {
    state.notes = notes().map(function (n, i) {
      return normalizeNote(n, n.note_id != null ? n.note_id : i);
    });
    applyClientHighlights();
  }

  function parseOccurrenceInput() {
    const raw = String(fieldOcc.value == null ? "" : fieldOcc.value).trim();
    if (!/^\d+$/.test(raw)) return null;
    const v = parseInt(raw, 10);
    if (!(v >= 0)) return null;
    return v;
  }

  document.getElementById("modal-save").addEventListener("click", function () {
    const occurrence = parseOccurrenceInput();
    if (occurrence == null) {
      alert("Occurrence must be an integer ≥ 0");
      fieldOcc.focus();
      return;
    }
    if (editId != null) {
      const color = fieldColor.value || DEFAULT_NOTE_COLOR;
      const opacity = fieldOpacity ? noteOpacity({ opacity: fieldOpacity.value }) : 1;
      const header = fieldHeader ? (fieldHeader.value || "") : "";
      const comment = fieldComment.value || "";
      const n = notes().find(function (x) { return x.note_id === editId; });
      if (n) {
        const norm = normalizeNote(n, n.note_id);
        norm.color = color;
        norm.opacity = opacity;
        norm.header = header;
        norm.comment = comment;
        // Occurrence is the match index of the substring. The highlight follows
        // range when one is stored, so a new occurrence has to move that range.
        const ai = (focusAnchorIndex >= 0 && norm.anchors && focusAnchorIndex < norm.anchors.length)
          ? focusAnchorIndex : 0;
        if (norm.anchors && norm.anchors[ai]) {
          const moved = moveAnchorToOccurrence(norm.anchors[ai], occurrence);
          if (moved) {
            alert(moved);
            fieldOcc.focus();
            return;
          }
        }
        replaceNoteInPlace(n, norm);
      }
    } else {
      const builtAnchors = anchorsFromSelectionBatch(modalBaseData, selectedPlacement(), occurrence);
      if (builtAnchors.error || !builtAnchors.anchors.length) {
        alert(builtAnchors.error || "Select text before making a note.");
        return;
      }
      const newAnchors = builtAnchors.anchors;
      const attaching = modeAttach && modeAttach.checked;
      if (attaching) {
        const id = attachTargetId != null ? attachTargetId : null;
        const n = notes().find(function (x) { return x.note_id === id; });
        if (!n) {
          alert("Click an existing note card to attach to (Esc cancels).");
          closeModal();
          beginAttachPickMode(modalBaseData || pending);
          return;
        }
        const norm = normalizeNote(n, n.note_id);
        norm.anchors = norm.anchors.concat(newAnchors);
        replaceNoteInPlace(n, norm);
      } else {
        const color = fieldColor.value || DEFAULT_NOTE_COLOR;
        const opacity = fieldOpacity ? noteOpacity({ opacity: fieldOpacity.value }) : 1;
        const header = fieldHeader ? (fieldHeader.value || "") : "";
        const comment = fieldComment.value || "";
        const maxId = notes().reduce(function (m, n) { return Math.max(m, n.note_id); }, -1);
        const note = normalizeNote({
          note_id: maxId + 1,
          color: color,
          opacity: opacity,
          header: header,
          comment: comment,
          anchors: newAnchors
        }, maxId + 1);
        notes().push(note);
      }
    }
    closeModal();
    persistAndRefresh();
  });

  document.querySelectorAll(".js-download-notes, #btn-download-notes").forEach(function (btn) {
    btn.addEventListener("click", downloadNotesJson);
  });
  document.querySelectorAll("#btn-download-ipynb").forEach(function (btn) {
    btn.addEventListener("click", downloadIpynb);
  });
  document.querySelectorAll(".js-download-html, #btn-download-html").forEach(function (btn) {
    btn.addEventListener("click", downloadAsHtml);
  });
  if (notesLocked) {
    const loadBtn = document.getElementById("btn-load-notes");
    const notesFile = document.getElementById("notes-file-input");
    if (loadBtn) loadBtn.hidden = true;
    if (notesFile) notesFile.hidden = true;
  } else {
    wireLoadNotesButton();
  }

  function removeNoteById(id) {
    state.notes = notes().filter(function (x) {
      if (x.note_id === id) return false;
      const norm = normalizeNote(x, x.note_id);
      // Drop this note if its only/primary role was nesting under deleted id
      const pA = primaryAnchor(norm);
      if (pA.target === "note" && pA.parent_note_id === id) return false;
      // Strip any anchors that pointed at the deleted note
      norm.anchors = (norm.anchors || []).filter(function (a) {
        return !(a.target === "note" && a.parent_note_id === id);
      });
      if (!norm.anchors.length) return false;
      replaceNoteInPlace(x, norm);
      return true;
    });
    persistAndRefresh();
  }

  function deleteNoteById(id) {
    if (!confirm("Delete this note?")) return false;
    removeNoteById(id);
    return true;
  }

  function unattachAnchor(noteId, anchorIndex) {
    const n = notes().find(function (x) { return x.note_id === noteId; });
    if (!n) return;
    const norm = normalizeNote(n, n.note_id);
    const anchors = norm.anchors || [];
    if (anchorIndex < 0 || anchorIndex >= anchors.length) return;
    if (anchors.length <= 1) {
      if (!confirm("Unattaching the last substring deletes this note. Continue?")) return;
      closeModal();
      removeNoteById(noteId);
      return;
    }
    if (!confirm("Unattach this substring from the note?")) return;
    anchors.splice(anchorIndex, 1);
    norm.anchors = anchors;
    replaceNoteInPlace(n, normalizeNote(norm, noteId));
    if (focusAnchorIndex >= anchors.length) focusAnchorIndex = anchors.length - 1;
    else if (focusAnchorIndex > anchorIndex) focusAnchorIndex -= 1;
    persistAndRefresh();
    if (editId === noteId) renderAnchorsEditor(n);
  }

  document.getElementById("modal-delete").addEventListener("click", function () {
    if (editId == null) return;
    const id = editId;
    closeModal();
    deleteNoteById(id);
  });

  function openEditFromTarget(ev) {
    const mark = ev.target.closest("mark.note-hl");
    if (mark) {
      const id = parseInt(mark.getAttribute("data-note"), 10);
      const ai = parseInt(mark.getAttribute("data-anchor") || "0", 10) || 0;
      const n = notes().find(function (x) { return x.note_id === id; });
      if (n) openModal("edit", n, { focusAnchor: ai });
      return true;
    }
    const card = ev.target.closest(".note-card");
    if (card) {
      const inBody = ev.target.closest(".annotatable-note");
      const sel = window.getSelection();
      if (inBody && sel && !sel.isCollapsed) return false;
      const id = parseInt(card.getAttribute("data-note"), 10);
      const n = notes().find(function (x) { return x.note_id === id; });
      if (n) openModal("edit", n, { focusAnchor: 0 });
      return true;
    }
    return false;
  }

  // Attach-pick mode: left-click a note card to choose the target
  document.body.addEventListener("click", function (ev) {
    if (!attachPickActive) return;
    const card = ev.target.closest && ev.target.closest(".note-card[data-note]");
    if (!card) return;
    ev.preventDefault();
    ev.stopPropagation();
    const id = parseInt(card.getAttribute("data-note"), 10);
    if (!Number.isFinite(id)) return;
    completeAttachPick(id);
  }, true);

  // Edit via right-click on highlight or note card (suppress browser menu)
  document.body.addEventListener("contextmenu", function (ev) {
    if (notesLocked) return;
    if (attachPickActive) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (openEditFromTarget(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  });

  const memoryStore = Object.create(null);
  function storageGet(key) {
    try {
      const persistent = localStorage.getItem(key);
      if (persistent != null) return persistent;
    } catch (e) {}
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      memoryStore[key] = value;
    }
  }

  function forgetStoredNotes() {
    function wipe(store) {
      try {
        const keys = [];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (!key) continue;
          if (key === "ipynb_to_html_notes" || key === "ipynb_to_html_src" || key.indexOf("ipynb_to_html_notes::") === 0) {
            keys.push(key);
          }
        }
        keys.forEach(function (key) { store.removeItem(key); });
      } catch (e) {}
    }
    try { wipe(localStorage); } catch (e) {}
    try { wipe(sessionStorage); } catch (e) {}
  }

  forgetStoredNotes();

  ensureNotebookCellIds();
  state.notes = notes().map(function (n, i) {
    return normalizeNote(n, n.note_id != null ? n.note_id : i);
  });
  resolveNotesCellIds(state.notes);

  // ---- Shared viewport jump/count helper (notes nav + diff nav) ----
  function classifyViewportTargets(targets) {
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const above = [];
    const below = [];
    targets.forEach(function (t) {
      const r = t.el.getBoundingClientRect();
      if (r.bottom <= 0) {
        above.push({ id: t.id, el: t.el, edge: r.bottom, top: r.top });
        return;
      }
      if (r.top >= vh) {
        below.push({ id: t.id, el: t.el, edge: r.top, top: r.top });
      }
    });
    above.sort(function (a, b) { return b.edge - a.edge; });
    below.sort(function (a, b) { return a.edge - b.edge; });
    return { above: above, below: below };
  }

  function scrollViewportToElement(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const y = (window.pageYOffset || document.documentElement.scrollTop || 0) +
      r.top - (vh / 2) + (r.height / 2);
    const top = Math.max(0, y);
    try {
      window.scrollTo({ top: top, left: window.pageXOffset || 0, behavior: "smooth" });
    } catch (e) {
      window.scrollTo(window.pageXOffset || 0, top);
    }
  }

  const viewportFlashTimers = Object.create(null);
  function flashViewportTarget(el, flashClass) {
    if (!el || !flashClass) return;
    document.querySelectorAll("." + flashClass).forEach(function (n) {
      n.classList.remove(flashClass);
    });
    const card = el.classList && el.classList.contains("note-card")
      ? el
      : (el.closest && el.closest(".note-card")) || el;
    card.classList.add(flashClass);
    if (viewportFlashTimers[flashClass]) clearTimeout(viewportFlashTimers[flashClass]);
    viewportFlashTimers[flashClass] = setTimeout(function () {
      card.classList.remove(flashClass);
    }, 1200);
  }

  function updateViewportNavPair(opts) {
    const btnAbove = document.getElementById(opts.aboveId);
    const btnBelow = document.getElementById(opts.belowId);
    const countAbove = document.getElementById(opts.aboveCountId);
    const countBelow = document.getElementById(opts.belowCountId);
    if (!btnAbove || !btnBelow) return null;
    const classified = classifyViewportTargets(opts.targets());
    const nAbove = classified.above.length;
    const nBelow = classified.below.length;
    if (countAbove) countAbove.textContent = String(nAbove);
    if (countBelow) countBelow.textContent = String(nBelow);
    btnAbove.disabled = nAbove === 0;
    btnBelow.disabled = nBelow === 0;
    btnAbove.setAttribute("aria-label", nAbove + " " + opts.unit + " above — jump to nearest");
    btnBelow.setAttribute("aria-label", nBelow + " " + opts.unit + " below — jump to nearest");
    btnAbove.setAttribute(opts.dataAttr, nAbove ? String(classified.above[0].id) : "");
    btnBelow.setAttribute(opts.dataAttr, nBelow ? String(classified.below[0].id) : "");
    return classified;
  }

  function jumpViewportNav(opts, direction) {
    const btn = document.getElementById(
      direction === "above" ? opts.aboveId : opts.belowId
    );
    if (!btn || btn.disabled) return;
    const classified = classifyViewportTargets(opts.targets());
    const hit = direction === "above" ? classified.above[0] : classified.below[0];
    if (!hit) return;
    const el = (opts.resolve && opts.resolve(hit.id)) || hit.el;
    if (!el) return;
    scrollViewportToElement(el);
    flashViewportTarget(el, opts.flashClass);
    setTimeout(opts.update, 350);
    setTimeout(opts.update, 700);
  }

  function wireViewportNavPair(opts) {
    const root = document.getElementById(opts.rootId);
    const btnAbove = document.getElementById(opts.aboveId);
    const btnBelow = document.getElementById(opts.belowId);
    if (!btnAbove || !btnBelow) return;
    if (root) {
      root.addEventListener("click", function (ev) {
        const btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
        if (!btn || btn.disabled) return;
        if (btn.id === opts.aboveId) jumpViewportNav(opts, "above");
        else if (btn.id === opts.belowId) jumpViewportNav(opts, "below");
      });
    } else {
      btnAbove.addEventListener("click", function () { jumpViewportNav(opts, "above"); });
      btnBelow.addEventListener("click", function () { jumpViewportNav(opts, "below"); });
    }
  }

  // Notes nav: comment/header cards only — tint-only (empty header+comment) marks excluded.
  function noteNavTargets() {
    const seen = {};
    const out = [];
    document.querySelectorAll(".note-card[data-note]").forEach(function (card) {
      const id = parseInt(card.getAttribute("data-note"), 10);
      if (!Number.isFinite(id) || seen[id]) return;
      seen[id] = true;
      out.push({ id: id, el: card });
    });
    document.querySelectorAll("mark.note-hl[data-note]").forEach(function (mark) {
      const id = parseInt(mark.getAttribute("data-note"), 10);
      if (!Number.isFinite(id) || seen[id]) return;
      const note = notes().find(function (n) { return n.note_id === id; });
      // Diff tint notes are highlight-only (no card) — keep them out of notes nav.
      if (!note || !note.has_comment) return;
      seen[id] = true;
      out.push({ id: id, el: mark });
    });
    return out;
  }

  function findNoteNavElement(noteId) {
    if (noteId == null || noteId === "") return null;
    const card = document.getElementById("note-comment-" + noteId);
    if (card) return card;
    return document.querySelector('mark.note-hl[data-note="' + noteId + '"]');
  }

  const noteNavOpts = {
    rootId: "note-nav",
    aboveId: "note-nav-above",
    belowId: "note-nav-below",
    aboveCountId: "note-nav-above-count",
    belowCountId: "note-nav-below-count",
    dataAttr: "data-nav-note",
    unit: "notes",
    flashClass: "note-nav-flash",
    targets: noteNavTargets,
    resolve: findNoteNavElement,
    update: function () { updateNoteNav(); }
  };

  function updateNoteNav() {
    updateViewportNavPair(noteNavOpts);
  }

  function jumpNoteNav(direction) {
    jumpViewportNav(noteNavOpts, direction);
  }

  // Diff nav walks each changed region. One cell can hold several, and the
  // next one may be below the viewport, so a cell-sized jump would skip it.
  let activeDiffIndex = 0;
  let diffNavJumping = false;

  function elementViewportRect(el) {
    const rects = el.getClientRects ? el.getClientRects() : [];
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r.width && !r.height) continue;
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    if (top === Infinity) return null;
    return { top: top, bottom: bottom, height: bottom - top };
  }

  function hunkViewportRect(target) {
    const els = target.elements || [target.el];
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < els.length; i++) {
      const r = elementViewportRect(els[i]);
      if (!r) continue;
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    if (top === Infinity) return null;
    return { top: top, bottom: bottom, height: bottom - top };
  }

  function diffRegionsInCell(cell) {
    const stripes = [];
    const marks = [];
    cell.querySelectorAll(".diff-stripe-run.add, .diff-stripe-run.del").forEach(function (el) {
      if (elementViewportRect(el)) stripes.push(el);
    });
    cell.querySelectorAll("mark.diff-inline").forEach(function (el) {
      if (elementViewportRect(el)) marks.push(el);
    });
    marks.sort(function (a, b) {
      const ra = elementViewportRect(a);
      const rb = elementViewportRect(b);
      if (Math.abs(ra.top - rb.top) > 1) return ra.top - rb.top;
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    const markGroups = [];
    marks.forEach(function (el) {
      const rect = elementViewportRect(el);
      const prev = markGroups[markGroups.length - 1];
      if (prev && rect.top <= prev.bottom + 4) {
        prev.elements.push(el);
        if (rect.top < prev.top) prev.top = rect.top;
        if (rect.bottom > prev.bottom) prev.bottom = rect.bottom;
        return;
      }
      markGroups.push({ elements: [el], top: rect.top, bottom: rect.bottom });
    });
    const stripeRects = stripes.map(function (el) {
      return { el: el, rect: elementViewportRect(el) };
    });
    const regions = stripeRects.map(function (item) {
      return { elements: [item.el], top: item.rect.top };
    });
    markGroups.forEach(function (group) {
      const insideStripe = stripeRects.some(function (item) {
        return group.top < item.rect.bottom && item.rect.top < group.bottom;
      });
      if (insideStripe) return;
      regions.push({ elements: group.elements, top: group.top });
    });
    regions.sort(function (a, b) { return a.top - b.top; });
    return regions;
  }

  function diffNavTargets() {
    const out = [];
    document.querySelectorAll(".cell[data-diff-status]").forEach(function (cell) {
      if (!cell.getClientRects().length) return;
      const id = cell.getAttribute("data-cell-id") || cell.id || "";
      if (!id) return;
      const diff = diffMetadataForCell(id) || {};
      const cellNumber = diff.cell_number || (cellIndexById(id) + 1);
      const regions = diffRegionsInCell(cell);
      if (!regions.length) {
        out.push({ id: id, el: cell, elements: [cell], cellNumber: cellNumber });
        return;
      }
      regions.forEach(function (region) {
        out.push({
          id: id,
          el: region.elements[0],
          elements: region.elements,
          cellNumber: cellNumber
        });
      });
    });
    return out;
  }

  function nearestDiffIndex(targets) {
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const middle = vh / 2;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(0, (document.documentElement.scrollHeight || 0) - vh);
    if (scrollTop >= maxScroll - 2) {
      for (let i = targets.length - 1; i >= 0; i--) {
        const rect = hunkViewportRect(targets[i]);
        if (rect && rect.bottom > 0 && rect.top < vh) return i;
      }
    }
    let best = 0;
    let distance = Infinity;
    targets.forEach(function (target, index) {
      const rect = hunkViewportRect(target);
      if (!rect) return;
      let nextDistance;
      if (rect.top <= middle && rect.bottom >= middle) nextDistance = 0;
      else if (rect.bottom < middle) nextDistance = middle - rect.bottom;
      else nextDistance = rect.top - middle;
      if (nextDistance < distance) {
        distance = nextDistance;
        best = index;
      }
    });
    return best;
  }

  function scrollDiffHunk(target) {
    const rect = hunkViewportRect(target);
    if (!rect) return;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    const tall = rect.height >= vh - 24;
    const viewAnchor = tall ? 12 : vh / 2;
    const elementAnchor = tall ? 0 : rect.height / 2;
    const y = scrollTop + rect.top - viewAnchor + elementAnchor;
    const top = Math.max(0, y);
    try {
      window.scrollTo({ top: top, left: window.pageXOffset || 0, behavior: "smooth" });
    } catch (e) {
      window.scrollTo(window.pageXOffset || 0, top);
    }
  }

  function flashDiffHunk(target) {
    document.querySelectorAll(".diff-nav-flash").forEach(function (n) {
      n.classList.remove("diff-nav-flash");
    });
    const els = target.elements || [target.el];
    els.forEach(function (el) { el.classList.add("diff-nav-flash"); });
    if (viewportFlashTimers["diff-nav-flash"]) clearTimeout(viewportFlashTimers["diff-nav-flash"]);
    viewportFlashTimers["diff-nav-flash"] = setTimeout(function () {
      els.forEach(function (el) { el.classList.remove("diff-nav-flash"); });
    }, 1200);
  }

  function updateDiffNav() {
    const nav = document.getElementById("diff-nav");
    const prev = document.getElementById("diff-nav-prev");
    const next = document.getElementById("diff-nav-next");
    const position = document.getElementById("diff-nav-position");
    const targets = diffNavTargets();
    if (nav) targets.length ? nav.removeAttribute("hidden") : nav.setAttribute("hidden", "");
    if (!targets.length) return;
    if (!diffNavJumping) activeDiffIndex = nearestDiffIndex(targets);
    activeDiffIndex = Math.max(0, Math.min(activeDiffIndex, targets.length - 1));
    const current = targets[activeDiffIndex];
    const coversCenter = hunkCoversCenter(current);
    if (position) position.textContent = "Cell " + current.cellNumber + " · diff " + (activeDiffIndex + 1) + "/" + targets.length;
    if (prev) prev.disabled = activeDiffIndex <= 0;
    // A diff that is only the nearest one because it sits below the screen
    // is not current yet, so Next must stay available to bring it up.
    if (next) next.disabled = activeDiffIndex >= targets.length - 1 && coversCenter;
  }

  function hunkCoversCenter(target) {
    const rect = target && hunkViewportRect(target);
    if (!rect) return false;
    const middle = (window.innerHeight || document.documentElement.clientHeight || 0) / 2;
    return rect.top <= middle && rect.bottom >= middle;
  }

  function jumpSequentialDiff(delta) {
    const targets = diffNavTargets();
    if (!targets.length) return;
    if (!diffNavJumping) activeDiffIndex = nearestDiffIndex(targets);
    activeDiffIndex = Math.max(0, Math.min(activeDiffIndex, targets.length - 1));
    const rect = hunkViewportRect(targets[activeDiffIndex]);
    const middle = (window.innerHeight || document.documentElement.clientHeight || 0) / 2;
    const coversCenter = rect && rect.top <= middle && rect.bottom >= middle;
    if (delta > 0) {
      // The nearest diff can still be below the screen. The first Next
      // press lands on that one instead of stepping past it.
      const stillBelow = rect && rect.top > middle && !coversCenter;
      if (!stillBelow || diffNavJumping) {
        activeDiffIndex = Math.min(activeDiffIndex + 1, targets.length - 1);
      }
    } else if (delta < 0) {
      const stillAbove = rect && rect.bottom < middle && !coversCenter;
      if (!stillAbove || diffNavJumping) {
        activeDiffIndex = Math.max(activeDiffIndex - 1, 0);
      }
    }
    diffNavJumping = true;
    const target = targets[activeDiffIndex];
    scrollDiffHunk(target);
    flashDiffHunk(target);
    updateDiffNav();
    setTimeout(function () { diffNavJumping = false; updateDiffNav(); }, 700);
  }

  function wireNoteNav() {
    wireViewportNavPair(noteNavOpts);
    const prev = document.getElementById("diff-nav-prev");
    const next = document.getElementById("diff-nav-next");
    if (prev) prev.addEventListener("click", function () { jumpSequentialDiff(-1); });
    if (next) next.addEventListener("click", function () { jumpSequentialDiff(1); });
    let scrollRaf = 0;
    function onScrollOrResize() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; updateNoteNav(); updateDiffNav(); });
    }
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    updateNoteNav();
    updateDiffNav();
  }

  applyClientHighlights();
  window.addEventListener("resize", function () { placeBetweenCellMarkers(); layoutNoteCards(); syncTallOutputs(); });
  window.addEventListener("load", syncTallOutputs);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { syncTallOutputs(); });
  wireNoteNav();

  state.downloadNotesJson = downloadNotesJson;
  state.downloadIpynb = downloadIpynb;
  state.downloadAsHtml = downloadAsHtml;
  state.applyClientHighlights = applyClientHighlights;
  state.updateNoteNav = updateNoteNav;
  state.updateDiffNav = updateDiffNav;
  // Test/verify hooks for math-aware selection mapping
  state.__test = {
    collectDomProjection: collectDomProjection,
    selectionOffsetsInProjection: selectionOffsetsInProjection,
    mapSelectionToSource: mapSelectionToSource,
    mapProjSliceToSource: mapProjSliceToSource,
    selectionIntersectsMath: selectionIntersectsMath,
    wrapTexMathSpans: wrapTexMathSpans,
    assignDomTexSourceStarts: assignDomTexSourceStarts,
    occurrenceAtSourceStart: occurrenceAtSourceStart,
    countNonOverlappingBefore: countNonOverlappingBefore,
    findNth: findNth,
    highlightBg: highlightBg,
    noteOpacity: noteOpacity
  };
});
