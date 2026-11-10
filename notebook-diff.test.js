"use strict";

var assert = require("node:assert/strict");
var diff = require("./notebook-diff.js");

function cell(id, source, type, outputs) {
  return {
    id: id,
    cell_type: type || "code",
    source: source,
    metadata: {},
    outputs: outputs || [],
  };
}

function merge(baseCells, headCells, options) {
  return diff.mergeNotebooks(
    { cells: baseCells, metadata: {} },
    { cells: headCells, metadata: {} },
    options
  ).notebook;
}

function statuses(notebook) {
  return notebook.cells.map(function (cell) {
    return cell.metadata.ipynb_to_html.diff.status;
  }).join(",");
}

// Recreated code and Markdown retain the student's ID, including source arrays.
["code", "markdown"].forEach(function (type) {
  var base = [cell("old", ["same", "\n"], type)];
  var head = [cell("new", "same\n", type)];
  var before = JSON.stringify([base, head]);
  var notebook = merge(base, head);
  assert.equal(statuses(notebook), "equal");
  assert.equal(notebook.cells[0].id, "new");
  assert.equal(notebook.cells[0].metadata.ipynb_to_html.diff.note_target_cell_id, "new");
  assert.equal(JSON.stringify([base, head]), before);
});

// An ID present on only one side still permits an exact content match.
assert.equal(statuses(merge([cell(undefined, "same")], [cell("new", "same")])), "equal");
assert.equal(statuses(merge([cell("old", "same")], [cell(undefined, "same")])), "equal");

// Different text or cell types must not be silently treated as equal.
assert.equal(statuses(merge([cell("old", "x = 1")], [cell("new", "x = 2")])), "del,add");
assert.equal(statuses(merge([cell("old", "same", "code")], [cell("new", "same", "markdown")])), "del,add");
assert.equal(statuses(merge([cell("same-id", "x = 1")], [cell("same-id", "x = 2")])), "change");

// Repeated content is matched one-to-one; an extra copy remains an addition.
assert.equal(statuses(merge(
  [cell("old-1", "same"), cell("old-2", "same")],
  [cell("new-1", "same"), cell("new-2", "same"), cell("new-3", "same")]
)), "equal,equal,add");

// A new copy must not steal the match from an existing, edited cell.
var withCopy = merge(
  [cell("kept", "x = 1")],
  [cell("copy", "x = 1"), cell("kept", "x = 2")]
);
assert.equal(statuses(withCopy), "add,change");
assert.equal(withCopy.cells[1].id, "kept");

// Outputs are compared independently even when source text matches.
var outputDiff = merge(
  [cell("old", "print(1)", "code", [{ output_type: "stream", name: "stdout", text: "1\n" }])],
  [cell("new", "print(1)", "code", [{ output_type: "stream", name: "stdout", text: "2\n" }])]
);
assert.equal(statuses(outputDiff), "change,del,add");
assert.equal(outputDiff.cells[0].metadata.ipynb_to_html.diff.output_only, true);

// Filtered variants use the same matching and keep the student's cell ID.
var full = merge([cell("old", "x = ...")], [cell("new", "x = ...")]);
var filtered = merge([cell("old", "x = ...")], [cell("new", "x = ...")], {
  ignoreDeletionPatterns: ["^[^A-Za-z0-9]*$"],
  ignoreAdditionPatterns: ["^\\s*$"],
});
diff.attachDiffVariant(full, filtered, "filtered");
assert.equal(full.cells[0].metadata.ipynb_to_html.diff.variants.filtered.status, "equal");

console.log("Notebook cell matching checks passed.");
