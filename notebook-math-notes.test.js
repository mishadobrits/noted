"use strict";

// Generate a browser regression page, then open it and check the result banner:
// node notebook-math-notes.test.js /tmp/notebook-math-notes.html
var converter = require("./ipynb-to-html.js");
var diff = require("./notebook-diff.js");

function createTestHtml() {
  function cell(id, source) {
    return { id: id, cell_type: "markdown", metadata: {}, source: source };
  }
  var base = { metadata: {}, cells: [
    cell("formula", "$$ x^2 $$"),
    cell("changed", "$$ y^2 $$"),
    cell("repeated", "$$ z^2 $$\n\n$$ z^2 $$"),
  ] };
  var head = JSON.parse(JSON.stringify(base));
  head.cells[1].source = "$$ y^3 $$";
  var merged = diff.mergeNotebooks(base, head).notebook;
  diff.attachDiffVariant(merged, diff.mergeNotebooks(base, head, {
    ignoreAdditionPatterns: ["^\\s*$"],
  }).notebook, "filtered");
  var notes = head.cells.map(function (cell, index) {
    var start = index === 2 ? cell.source.lastIndexOf("$$ z") : 0;
    return {
      color: "#ffe566",
      comment: "Formula note " + index,
      anchors: [{ cell_id: cell.id, range: [start, cell.source.length] }],
    };
  });
  var html = converter.convertNotebookToHtml(merged, {
    exportNotebook: head,
    notes: notes,
    sourceName: "Formula note regression",
    noteStorageKey: "formula-note-regression",
  });
  function checkInBrowser() {
    var result = document.createElement("p");
    result.id = "math-notes-test-result";
    document.body.prepend(result);
    function check(condition, message) {
      if (!condition) throw new Error(message);
    }
    function checkNotes(mode) {
      ["formula", "changed", "repeated"].forEach(function (id, noteId) {
        var row = document.querySelector('.cell-row[data-cell-id="' + id + '"]');
        var marks = row.querySelectorAll('.md-rendered .tex-math mark.note-hl[data-note="' + noteId + '"]');
        check(marks.length === 1, mode + ": missing or duplicate formula highlight for " + id);
        check(marks[0].getAttribute("data-note-anchor") === "1", mode + ": missing connector anchor for " + id);
        check(!!marks[0].closest(".katex"), mode + ": highlight must preserve rendered math for " + id);
      });
      var repeated = document.querySelectorAll('#cell-repeated .tex-math');
      check(!repeated[0].querySelector("mark.note-hl"), mode + ": highlighted the wrong formula occurrence");
    }
    try {
      checkNotes("initial");
      ["off", "full", "filtered", "additions", "off"].forEach(function (mode) {
        document.querySelector('[data-diff-mode="' + mode + '"]').click();
        checkNotes(mode);
      });
      result.textContent = "PASS: formula highlights and connector anchors survive rendering and diff mode changes.";
    } catch (error) {
      result.textContent = "FAIL: " + error.message;
      throw error;
    }
  }
  return html.replace("</body>", "<script>(" + checkInBrowser.toString() + ")();</script></body>");
}

module.exports = createTestHtml;
if (require.main === module) {
  if (!process.argv[2]) throw new Error("Pass an output HTML path.");
  require("node:fs").writeFileSync(process.argv[2], createTestHtml());
}
