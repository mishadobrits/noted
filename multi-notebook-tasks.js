(function (root, factory) {
  var config = factory();
  if (typeof module === "object" && module.exports) module.exports = config;
  else root.MultiNotebookTaskConfig = config;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // `cell_id` is the legacy first-cell key. Imported files may instead use
  // `start_cell_id` with inclusive `end_cell_id`. Optional
  // `end_before_cell_id` remains an exclusive boundary for built-in configs.
  return [
    {
      cell_id: "38b960d0-a472-4b92-a28d-25c5f056954e",
      end_before_cell_id: "952f0f48-a5a0-41cc-a4d2-c0629583501c",
      points: 2,
    },
    { cell_id: "27c18146-109e-4726-98c2-a08f777c7960", points: 3 },
    { cell_id: "cbddb5ab-ce3f-4ce2-aad3-fcc7c2a04308", points: 3 },
    { cell_id: "4aa66c0e-6e80-42c9-a891-80087b17201a", points: 2 },
    { cell_id: "8bbf9c46-111f-44fa-8f59-62fe73e714be", points: 2 },
    { cell_id: "a9ac1e44-761f-4af6-b605-463bd4a0e87e", points: 3 },
  ];
});
