/**
 * CSS inlined into generated notebook HTML.
 * On desktop, note cards overlay the notebook beside each cell. A note whose
 * anchors span several cells can sit at their centroid. Narrow layouts keep
 * notes in normal flow below their cell.
 */
(function (root, factory) {
  var styles = factory();
  if (typeof module === "object" && module.exports) module.exports = styles;
  else root.NotebookViewerStyles = styles;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    css: `
:root {
  --bg: #f5f5f5;
  --surface: #ffffff;
  --ink: #1a1a1a;
  --muted: #5c5c5c;
  --border: #c8c8c8;
  --cell-border: #bfbfbf;
  --code-bg: #ffffff;
  --code-fg: #24292e;
  --code-border: #d0d0d0;
  --md-accent: #0b6e4f;
  --out-bg: #fafafa;
  --err-bg: #fdecea;
  --err-fg: #8a1f11;
  --prompt: #303f9f;
  --radius: 6px;
  --notes-rail-width: 17rem;
  --notes-rail-gap: 0.75rem;
  /* Widest In/Out/err in this notebook, set as --prompt-chars when the page is built. */
  --prompt-pad-left: 0.4rem;
  --prompt-chars: 6;
  --prompt-col: calc(var(--prompt-pad-left) + var(--prompt-chars) * 1ch);
  --prompt-gap: 0.5rem;
  --source-pad-x: 1rem;
  /* Cell width like c4ae8f7 (page max 96rem minus one notes rail + gap); notes still grow right */
  --page-max: 96rem;
  --cell-column-width: min(
    calc(var(--page-max) - var(--notes-rail-width) - var(--notes-rail-gap)),
    calc(100vw - 2.5rem - var(--notes-rail-width) - var(--notes-rail-gap))
  );
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 1.25rem 1rem 4rem;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  font-size: 1.05rem;
  line-height: 1.55;
  color: var(--ink);
  text-align: left;
  background: var(--bg);
  overflow-x: auto;
}
.page {
  /* Grow with notes cascade; at least full viewport width */
  width: max-content;
  min-width: 100%;
  max-width: none;
  margin: 0;
  text-align: left;
}
.cells-stack {
  display: flex;
  flex-direction: column;
  /* Classic Jupyter / nbviewer: tight gap between cells (~5–8px) */
  gap: 0.4rem;
}
.cell-row {
  display: grid;
  /* minmax(0, …) matches c4ae8f7 fluid cell column; notes column is max-content (grows) */
  grid-template-columns: minmax(0, var(--cell-column-width)) max-content;
  gap: var(--notes-rail-gap);
  align-items: start;
  position: relative;
  width: max-content;
  min-width: 100%;
}
.notes-cascade {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: var(--notes-rail-gap);
  align-items: stretch;
  position: relative;
  width: max-content;
  min-width: var(--notes-rail-width);
  overflow: visible;
  box-sizing: border-box;
}
.cell-notes-rail {
  position: relative;
  width: var(--notes-rail-width);
  flex: 0 0 var(--notes-rail-width);
  min-height: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.82rem;
  line-height: 1.4;
}
.note-card {
  position: absolute;
  left: 0;
  width: 100%;
  z-index: 2;
  cursor: pointer;
}
.note-card .annotatable-note { cursor: text; }
.note-card-nested {
  /* nested cards sit in their own depth rail (same geometry as L1), not indented inside parent */
}
.annotatable-output { cursor: text; }
svg.cell-connectors {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 3;
}
header.doc-header {
  margin-bottom: 1.25rem;
}
header.doc-header .toolbar {
  padding-bottom: 0.75rem;
  border-bottom: 2px solid var(--border);
}
header.doc-header h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
  min-width: 0;
  overflow-wrap: anywhere;
}
header.doc-header .meta {
  color: var(--muted);
  font-size: 0.9rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: center;
  justify-content: space-between;
  width: var(--cell-column-width);
  max-width: 100%;
  margin: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.85rem;
}
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-left: auto;
}
.toolbar-bottom {
  margin-top: 1.75rem;
  justify-content: flex-end;
}
.toolbar button, .modal button, .note-card-actions button, .sel-bar button {
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: var(--radius);
  padding: 0.35rem 0.7rem;
  color: var(--ink);
}
.toolbar button:hover, .modal button:hover, .note-card-actions button:hover, .sel-bar button:hover {
  background: #f0f0f0;
}
.toolbar button.primary {
  background: #1a1a1a;
  color: #fff;
  border-color: #1a1a1a;
}
.modal button.danger {
  background: #fff;
  color: #8a1f11;
  border-color: #e0a8a0;
}
.modal button.danger:hover { background: #fdecea; }
.toolbar .hint { color: var(--muted); margin-left: 0.25rem; }
.note-nav {
  position: fixed;
  right: 0.85rem;
  bottom: 0.85rem;
  z-index: 45;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  max-width: calc(100vw - 1.7rem);
}
.note-nav button {
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: var(--radius);
  padding: 0.35rem 0.6rem;
  color: var(--ink);
  text-align: left;
  white-space: nowrap;
}
.note-nav button:hover:not(:disabled) { background: #f0f0f0; }
.note-nav button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.note-nav .note-nav-count {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  min-width: 1.25em;
  display: inline-block;
  text-align: center;
}
.note-card.note-nav-flash {
  outline: 2px solid var(--md-accent);
  outline-offset: 2px;
}
@media (max-width: 640px) {
  .note-nav {
    right: 0.5rem;
    bottom: 0.5rem;
    left: 0.5rem;
    max-width: none;
  }
  .note-nav button { white-space: normal; }
}
.cell {
  position: relative;
  margin: 0;
  width: 100%;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--cell-border);
  border-radius: var(--radius);
}
.cell-body { padding: 0.55rem 0.65rem 0.65rem; min-width: 0; }
/* Leave room under a collapsed button so its rounded corners stay visible. */
.cell-body:has(> .outputs > .output-collapse.is-tall:not(.is-open)),
.cell-body:has(> .output-collapse.is-tall:not(.is-open)) {
  padding-bottom: 0.45rem;
}
/* Drop the inset before In/Out so the code column picks up that width. */
.cell-code .cell-body,
.cell-synthetic-output .cell-body { padding-left: 0; }
/* White markdown cell stays full width; its text lines up with the code.
   Prompt font here so 1ch in --prompt-col matches the In/Out labels. */
.cell-md .cell-body {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.8rem;
  padding: 5px 0 5px calc(var(--prompt-col) + var(--prompt-gap) + var(--source-pad-x));
}
.tex-math { white-space: pre-wrap; }
/* Inline vs display after KaTeX auto-render */
.md-rendered .tex-math > .katex { display: inline; }
.md-rendered .tex-math > .katex-display,
.note-card-body .tex-math > .katex-display {
  display: block;
  margin: 0.75em 0;
  text-align: center;
}

/* Markdown cells follow JupyterLab rendered HTML. Note cards stay compact. */
.cell-md .md-rendered {
  color: rgba(0, 0, 0, 0.87);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 14px;
  line-height: 1.6;
  padding-right: 20px;
}
.cell-md .md-rendered em { font-style: italic; }
.cell-md .md-rendered strong { font-weight: bold; }
.cell-md .md-rendered u { text-decoration: underline; }
.cell-md .md-rendered a:link { color: #0d47a1; text-decoration: none; }
.cell-md .md-rendered a:hover { text-decoration: underline; }
.cell-md .md-rendered a:visited { color: #7b1fa2; text-decoration: none; }
.cell-md .md-rendered h1,
.cell-md .md-rendered h2,
.cell-md .md-rendered h3,
.cell-md .md-rendered h4,
.cell-md .md-rendered h5,
.cell-md .md-rendered h6 {
  color: inherit;
  font-weight: 500;
  font-style: normal;
  line-height: 1;
  margin: 1.2em 0 0.8em;
}
.cell-md .md-rendered h1 { font-size: 2.0736em; }
.cell-md .md-rendered h2 { font-size: 1.728em; }
.cell-md .md-rendered h3 { font-size: 1.44em; }
.cell-md .md-rendered h4 { font-size: 1.2em; }
.cell-md .md-rendered h5 { font-size: 1em; }
.cell-md .md-rendered h6 { font-size: 0.83333em; }
.cell-md .md-rendered :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0.6em; }
.cell-md .md-rendered :is(h1, h2, h3, h4, h5, h6):last-child { margin-bottom: 0.4em; }
.cell-md .md-rendered :is(h1, h2, h3, h4, h5, h6) em,
.cell-md .md-rendered :is(h1, h2, h3, h4, h5, h6) i,
.note-card-body.md-note :is(h1, h2, h3, h4, h5, h6) em,
.note-card-body.md-note :is(h1, h2, h3, h4, h5, h6) i {
  font-style: italic;
  font-weight: inherit;
}
.cell-md .md-rendered p { text-align: left; margin: 0 0 1em; }
.cell-md .md-rendered ul,
.cell-md .md-rendered ol { padding-left: 2em; margin: 0 0 1em; }
.cell-md .md-rendered ul { list-style: disc; }
.cell-md .md-rendered ul ul { list-style: square; }
.cell-md .md-rendered ul ul ul { list-style: circle; }
.cell-md .md-rendered ol { list-style: decimal; }
.cell-md .md-rendered ol ol { list-style: upper-alpha; }
.cell-md .md-rendered ol ol ol { list-style: lower-alpha; }
.cell-md .md-rendered ol ol ol ol { list-style: lower-roman; }
.cell-md .md-rendered ul ul,
.cell-md .md-rendered ul ol,
.cell-md .md-rendered ol ul,
.cell-md .md-rendered ol ol { margin-bottom: 0; }
.cell-md .md-rendered hr {
  border: 0;
  height: 1px;
  background: #bdbdbd;
  margin: 1em 0;
}
.cell-md .md-rendered > pre { margin: 1.5em 2em; }
.cell-md .md-rendered pre,
.cell-md .md-rendered code {
  border: 0;
  background: #fff;
  color: rgba(0, 0, 0, 0.87);
  font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
  font-size: inherit;
  line-height: 1.3077;
  padding: 0;
  white-space: pre-wrap;
}
.cell-md .md-rendered :not(pre) > code {
  background: #eee;
  padding: 1px 5px;
  border-radius: 2px;
}
.cell-md .md-rendered pre code {
  background: none;
  padding: 0;
  color: inherit;
  white-space: inherit;
  display: block;
}
.cell-md .md-rendered table {
  border-collapse: collapse;
  border-spacing: 0;
  border: none;
  color: rgba(0, 0, 0, 0.87);
  font-size: 13px;
  table-layout: fixed;
  margin: 0 auto 1em;
}
.cell-md .md-rendered thead {
  border-bottom: 1px solid #bdbdbd;
  vertical-align: bottom;
}
.cell-md .md-rendered td,
.cell-md .md-rendered th,
.cell-md .md-rendered tr {
  vertical-align: middle;
  padding: 0.5em;
  line-height: normal;
  white-space: normal;
  max-width: none;
  border: none;
}
.cell-md .md-rendered th { font-weight: bold; }
.cell-md .md-rendered tbody tr:nth-child(odd) { background: #fff; }
.cell-md .md-rendered tbody tr:nth-child(even) { background: #f5f5f5; }
.cell-md .md-rendered tbody tr:hover { background: #e1f5fe; }
.cell-md .md-rendered blockquote {
  margin: 1em 2em;
  padding: 0 1em;
  border-left: 5px solid #e0e0e0;
}
.cell-md .md-rendered img { max-width: 100%; height: auto; }
.cell-md .md-rendered > img { display: block; margin: 0 0 1em; }
.cell-md .md-rendered input[type="checkbox"] {
  margin: 0 0.35em 0 0;
  vertical-align: middle;
}
.cell-md .md-rendered > *:last-child { margin-bottom: 0.5em; }
.note-card-body.md-note table {
  border-collapse: collapse;
  border-spacing: 0;
  margin: 0.6em 0;
  border: none;
}
.note-card-body.md-note thead {
  border-bottom: 1px solid var(--border);
  vertical-align: bottom;
}
.note-card-body.md-note th,
.note-card-body.md-note td {
  padding: 0.4em 0.6em;
  border: none;
  vertical-align: middle;
}
.note-card-body.md-note th { font-weight: 700; }
.note-card-body.md-note tbody tr:nth-child(odd) { background: #f6f7f9; }
.note-card-body.md-note blockquote {
  margin: 0.6em 0 0.6em 0.15em;
  padding: 0 0.8em;
  border-left: 4px solid var(--border);
}
.note-card-body.md-note input[type="checkbox"] {
  margin: 0 0.35em 0 0;
  vertical-align: middle;
}
.md-rendered.annotatable {
  cursor: text;
}
.cell-code .input-row {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--prompt-gap);
  align-items: start;
}
.prompt {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.8rem;
  color: var(--prompt);
  padding: 0.85rem 0 0 var(--prompt-pad-left);
  min-width: var(--prompt-col);
  text-align: left;
  white-space: nowrap;
  user-select: none;
}
.prompt.in { color: #303f9f; }
.prompt.out { color: #a05a2c; }
.prompt.in,
.prompt.out { text-align: right; }
.prompt.err { color: var(--err-fg); }
pre.source {
  margin: 0;
  padding: 0.85rem var(--source-pad-x);
  background: var(--code-bg);
  color: var(--code-fg);
  border: 1px solid var(--code-border);
  border-radius: var(--radius);
  overflow-x: auto;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.86rem;
  line-height: 1.45;
  white-space: pre;
  tab-size: 4;
}
pre.source code {
  display: block;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background: none;
  padding: 0;
  white-space: pre;
  tab-size: 4;
}
.tok-kw { color: #d73a49; font-weight: 600; }
.tok-str { color: #032f62; }
.tok-comment { color: #6a737d; font-style: italic; }
.tok-num { color: #005cc5; }
mark.note-hl {
  color: inherit;
  /* No vertical padding — it inflates line boxes and desyncs diff run stripes */
  padding: 0;
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  cursor: pointer;
}
.outputs { margin-top: 0.45rem; }
.output-row {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--prompt-gap);
  align-items: start;
  margin-top: 0.35rem;
}
.output-body {
  background: var(--out-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.7rem 0.9rem;
  overflow-x: auto;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.86rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.output-body.html-out {
  /* JupyterLab .jp-RenderedHTMLCommon: proportional text, not the stream font. */
  font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.87);
  white-space: normal;
  word-break: normal;
  background: var(--surface);
}
/* Same table rules as JupyterLab rendermime. Non-markdown HTML is right-aligned.
   Pandas ships the index rules in a <style> block; the sanitizer drops it. */
.output-body.html-out table {
  border-collapse: collapse;
  border-spacing: 0;
  border: none;
  color: rgba(0, 0, 0, 0.87);
  font-size: 13px;
  table-layout: fixed;
  margin: 0 auto 1em;
}
.output-body.html-out thead {
  border-bottom: 1px solid #bdbdbd;
  vertical-align: bottom;
}
.output-body.html-out td,
.output-body.html-out th,
.output-body.html-out tr {
  vertical-align: middle;
  padding: 0.5em;
  line-height: normal;
  white-space: normal;
  word-break: normal;
  max-width: none;
  border: none;
  text-align: right;
}
.output-body.html-out th { font-weight: bold; }
.output-body.html-out tbody tr:nth-child(odd) { background: #fff; }
.output-body.html-out tbody tr:nth-child(even) { background: #f5f5f5; }
.output-body.html-out tbody tr:hover { background: #e1f5fe; }
.output-body.html-out .dataframe tbody tr th { vertical-align: top; }
.output-body.html-out .dataframe tbody tr th:only-of-type { vertical-align: middle; }
.output-body.html-out .dataframe thead th { text-align: right; }
.output-body.html-out p { text-align: left; margin: 0 0 1em; }
.output-body.html-out > *:last-child { margin-bottom: 0.5em; }
.output-body.stderr, .output-body.error {
  background: var(--err-bg); color: var(--err-fg); border-color: #f0c2bc;
}
.output-body img { max-width: 100%; height: auto; display: block; }
.output-collapse { position: relative; }
.output-collapse-body { display: flow-root; }
/* Clip the hidden text inside the body so the rounded button can sit on the
   cell border without being cut off. scrollHeight still reports the full height. */
.output-collapse.is-tall:not(.is-open) { overflow: visible; }
/* Same prompt column and font as the code row, so 1ch matches and both
   the show and hide buttons line up with the code block. */
.cell-code .output-collapse.is-tall,
.cell-synthetic-output .output-collapse.is-tall {
  display: grid;
  grid-template-columns: var(--prompt-col) minmax(0, 1fr);
  column-gap: var(--prompt-gap);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.8rem;
}
.output-collapse.is-tall.is-open > .output-collapse-body {
  grid-column: 1 / -1;
  grid-row: 2;
}
.output-collapse.is-tall:not(.is-open) > .output-collapse-body {
  position: absolute;
  left: 0;
  width: 100%;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
.output-collapse-toggle {
  display: none;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  cursor: pointer;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.85rem;
  color: var(--muted);
  text-align: left;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.35rem 0.6rem;
}
.output-collapse.is-tall > .output-collapse-toggle {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  grid-column: 2;
  grid-row: 1;
  width: 100%;
}
.output-collapse-toggle::before {
  content: "";
  flex: 0 0 auto;
  width: 0;
  height: 0;
  border-left: 0.34em solid transparent;
  border-right: 0.34em solid transparent;
}
/* Down while the output is hidden (show it); up while it is open (hide it). */
.output-collapse.is-tall:not(.is-open) > .output-collapse-toggle::before {
  border-top: 0.42em solid currentColor;
}
.output-collapse.is-tall.is-open > .output-collapse-toggle::before {
  border-bottom: 0.42em solid currentColor;
}
.output-collapse.is-tall.is-open > .output-collapse-toggle { margin-bottom: 0.35rem; }
.output-collapse-toggle:hover { background: #f3f3f3; }
.note-card {
  background: #fff;
  border: 1px solid var(--border);
  border-left: 4px solid #888;
  border-radius: var(--radius);
  padding: 0.45rem 0.55rem;
  margin-bottom: 0.55rem;
  color: var(--ink);
}
.note-card:last-child { margin-bottom: 0; }
.note-card-header {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.3;
  color: var(--ink);
  margin: -0.45rem -0.55rem 0.35rem;
  padding: 0.35rem 0.55rem 0.32rem;
  border: none;
  background: var(--note-color, transparent);
  /* square on the left so header meets the accent bar with no white gap */
  border-radius: 0 var(--radius) 0 0;
}
.note-card-body {
  white-space: normal;
  word-break: break-word;
  font-size: 0.92em;
  line-height: 1.45;
}
.note-card-body.md-note > *:first-child { margin-top: 0; }
.note-card-body.md-note > *:last-child { margin-bottom: 0; }
.note-card-body.md-note p { margin: 0.35em 0; }
.note-card-body.md-note ul, .note-card-body.md-note ol { margin: 0.35em 0 0.35em 1.2em; padding: 0; }
.note-card-body.md-note li > p:first-child { margin-top: 0; }
.note-card-body.md-note li > p:last-child { margin-bottom: 0; }
.note-card-body.md-note li > ul, .note-card-body.md-note li > ol { margin-top: 0.2em; margin-bottom: 0.2em; }
.note-card-body.md-note h1, .note-card-body.md-note h2, .note-card-body.md-note h3,
.note-card-body.md-note h4, .note-card-body.md-note h5, .note-card-body.md-note h6 {
  /* Comment markdown headings stay compact — distinct from cell .cell-md headings */
  color: inherit;
  font-weight: 650;
  line-height: 1.25;
  margin: 0.45em 0 0.25em;
  border: none;
  padding: 0;
  font-style: normal;
}
.note-card-body.md-note h1 { font-size: 1.15em; }
.note-card-body.md-note h2 { font-size: 1.08em; }
.note-card-body.md-note h3 { font-size: 1.02em; }
.note-card-body.md-note h4, .note-card-body.md-note h5, .note-card-body.md-note h6 { font-size: 1em; }
.note-card-body.md-note code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: #f0f0f0;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}
.note-card-body.md-note a { color: var(--md-accent); }
.note-card-actions { margin-top: 0.35rem; }
.note-card-actions button {
  font-size: 0.75rem;
  padding: 0.15rem 0.4rem;
}
.sel-bar {
  display: none;
  position: fixed;
  z-index: 50;
  background: #1a1a1a;
  color: #fff;
  padding: 0.4rem 0.55rem;
  border-radius: var(--radius);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.8rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  gap: 0.35rem;
  align-items: flex-start;
  flex-wrap: wrap;
  max-width: min(42rem, calc(100vw - 1.5rem));
}
.sel-bar.open { display: flex; }
body[data-allow-notes="false"] .sel-bar,
body[data-allow-notes="false"] #note-modal,
body[data-allow-notes="false"] #placement-modal,
body[data-allow-notes="false"] #attach-pick-banner {
  display: none !important;
}
.sel-bar-count {
  flex: 1 0 100%;
  font-size: 0.72rem;
  opacity: 0.8;
}
.sel-bar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: flex-start;
}
.sel-bar-actions[hidden] { display: none !important; }
.sel-bar-multi-hint {
  margin: 0;
  padding: 0.2rem 0.15rem;
  line-height: 1.35;
}
.sel-bar-multi-hint[hidden] { display: none !important; }
.sel-bar button { background: #fff; white-space: nowrap; }
.sel-action {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
}
.sel-action > .sel-more {
  display: none;
  margin-top: 0.28rem;
  padding: 0.08rem 0.45rem;
  line-height: 1.1;
  letter-spacing: 0.12em;
  text-align: center;
}
.sel-action:hover > .sel-more,
.sel-action:focus-within > .sel-more {
  display: block;
}
/* Marker in the gap between consecutive source lines (must be <mark.note-hl>
   so layoutNoteCards / connectors find it like substring highlights).
   Absolutely positioned — must not expand cell line spacing. */
.between-lines-mark {
  display: block;
  width: 100%;
  height: 3px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 1px;
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: auto;
  z-index: 4;
  background-color: var(--between-color, #ffe566) !important;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.08);
  line-height: 0;
  font-size: 0;
  overflow: visible;
  box-sizing: border-box;
}
/* Same bar as between-lines. Each one adds twice its height to the gap between cell rows. The bar uses one height; the other height is split equally above and below the bar. */
.between-cells-mark {
  z-index: 5;
}
.modal-backdrop {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 60;
  align-items: center;
  justify-content: center;
}
.modal-backdrop.open { display: flex; }
.modal {
  background: #fff;
  border-radius: var(--radius);
  padding: 1rem 1.15rem;
  width: min(24rem, 92vw);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.9rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.modal h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
.modal label { display: block; margin: 0.5rem 0 0.2rem; color: var(--muted); font-size: 0.8rem; }
.modal input[type="text"], .modal input[type="number"], .modal input[type="color"], .modal textarea, .modal select {
  width: 100%;
  font: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.4rem 0.5rem;
}
.modal textarea { min-height: 4rem; resize: vertical; }
.modal .row { display: flex; gap: 0.5rem; align-items: center; }
.modal .actions { margin-top: 0.9rem; display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }
.modal .shortcut-hint {
  margin-top: 0.45rem;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
}
.note-anchors-panel { margin-top: 0.65rem; }
.note-anchors-panel[hidden] { display: none !important; }
.note-anchors-list {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 10rem;
  overflow: auto;
}
.note-anchors-list li {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  justify-content: space-between;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.4rem 0.5rem;
  background: #fafafa;
  font-size: 0.8rem;
}
.note-anchors-list li.focus-anchor {
  border-color: #1a1a1a;
  background: #fff;
}
.note-anchors-list .anchor-meta {
  min-width: 0;
  flex: 1;
  word-break: break-word;
  white-space: pre-wrap;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.note-anchors-list .anchor-kind {
  display: block;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: var(--muted);
  font-size: 0.72rem;
  margin-bottom: 0.15rem;
}
.note-anchors-list button {
  flex: 0 0 auto;
  font-size: 0.75rem;
  padding: 0.2rem 0.45rem;
}
.modal .preview {
  margin-top: 0.5rem;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  background: #f7f7f7;
  border-radius: var(--radius);
  padding: 0.4rem 0.5rem;
  max-height: 6rem;
  overflow: auto;
  border: 1px solid var(--border);
}
footer.doc-footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.8rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
@media (max-width: 900px) {
  :root {
    --cell-column-width: 100%;
  }
  .page { width: 100%; min-width: 0; }
  .cell-row {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    min-width: 0;
  }
  .notes-cascade {
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: visible;
  }
  .cell-notes-rail { min-height: 0; width: 100%; flex: 1 1 auto; }
  .note-card { position: relative; margin-bottom: 0.5rem; top: auto !important; }
  svg.cell-connectors { display: none; }
  body { padding: 1rem 0.75rem 4rem; }
}


.note-placement-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 0.85rem;
  align-items: center;
  margin: 0.55rem 0 0.15rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fafafa;
  font-size: 0.85rem;
}
.note-placement-row .note-placement-label {
  color: var(--muted);
  font-size: 0.8rem;
  margin-right: 0.15rem;
}
.note-placement-row label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.attach-picked-hint {
  margin: 0.45rem 0 0.15rem;
  padding: 0.4rem 0.55rem;
  border-radius: var(--radius);
  border: 1px solid #8a9bb5;
  background: #eef3fb;
  font-size: 0.85rem;
  color: var(--ink);
}
.attach-pick-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  padding: 0.65rem 1rem;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
  color: #102033;
  background: linear-gradient(180deg, #ffe08a 0%, #ffd45c 100%);
  border-bottom: 2px solid #c9a227;
  box-shadow: 0 2px 10px rgba(0,0,0,0.12);
}
.attach-pick-banner[hidden] { display: none !important; }
body.attach-pick-mode {
  cursor: crosshair;
}
body.attach-pick-mode .note-card {
  cursor: pointer;
  outline: 2px dashed #2f6fed;
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.18);
  transition: outline-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
body.attach-pick-mode .note-card:hover {
  outline-style: solid;
  outline-color: #1d4ed8;
  box-shadow: 0 0 0 4px rgba(29, 78, 216, 0.28);
  transform: translateY(-1px);
}
body.attach-pick-mode .cells-stack {
  filter: saturate(0.85);
}
body.attach-pick-mode .sel-bar { display: none !important; }


.placement-modal-backdrop.open { display: flex; }
.placement-modal {
  width: min(28rem, 92vw);
}
.placement-modal .placement-choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  align-items: stretch;
}
.placement-modal .placement-choice-grid .placement-selected-text {
  display: none;
}
.placement-modal .placement-choice-grid label {
  margin: 0;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
}
.placement-modal .placement-choice-grid label:has(input:checked) {
  border-color: #1a1a1a;
  background: #f4f4f4;
}
.placement-modal .placement-choice-grid label:has(input:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}
.placement-scope {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.placement-attach-target {
  margin: 0.35rem 0 0.55rem;
  font-size: 0.9rem;
  color: var(--ink);
}
.placement-modal .note-placement-row {
  margin-top: 0;
}

/* Unified notebook diff: run stripes + whole-cell backgrounds (no −/+ glyphs) */
:root {
  --diff-del-bg: #fce8e6;
  --diff-add-bg: #e6f4ea;
  --diff-del-ink: #c5221f;
  --diff-add-ink: #137333;
  --diff-stripe-width: 4px;
  --diff-line-height: 1.45em; /* em relative to .diff-stripe-rail font-size */
}
.source-wrap {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  width: 100%;
  border: 1px solid var(--code-border);
  border-radius: 4px;
  background: var(--code-bg);
  overflow: auto;
  position: relative;
}
.source-wrap > pre.source {
  border: none;
  border-radius: 0;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}
.diff-stripe-rail {
  flex: 0 0 var(--diff-stripe-width);
  width: var(--diff-stripe-width);
  align-self: stretch;
  /* Same vertical padding as .source so content boxes share start/end */
  padding: 0.85rem 0;
  user-select: none;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
  min-height: 100%;
}
.diff-stripe-run {
  display: block;
  width: 100%;
  min-height: 0;
  border-radius: 1px;
}
.diff-stripe-run.del { background: var(--diff-del-ink); }
.diff-stripe-run.add { background: var(--diff-add-ink); }
.diff-stripe-run.pad { background: transparent; }
pre.source.diff-lined {
  /* Line tints from diff.lines — same rows as the stripe rail; do not alter rail */
  background-color: var(--code-bg);
  background-repeat: no-repeat;
  background-origin: content-box;
  background-clip: content-box;
}
pre.source.diff-lined code {
  background: transparent;
}
/* Wholly added/removed cell or output: soft background (no left bar) */
.cell.diff-del {
  background: var(--diff-del-bg);
}
.cell.diff-add {
  background: var(--diff-add-bg);
}
.cell-synthetic-output.diff-del .output-body,
.cell-synthetic-output.diff-add .output-body,
.cell.diff-del .annotatable-output,
.cell.diff-add .annotatable-output {
  border-radius: 4px;
}
.cell-synthetic-output .prompt.out { color: var(--muted); }
.cell-synthetic-output .source-wrap,
.cell-synthetic-output pre.source {
  background: var(--out-bg);
}
.cell-synthetic-output .output-row,
.cell-synthetic-output .input-row {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--prompt-gap);
  align-items: start;
}
/* Diff nav sits above notes nav */
.viewport-nav {
  position: fixed;
  right: 0.85rem;
  bottom: 0.85rem;
  z-index: 45;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-width: calc(100vw - 1.7rem);
}
.viewport-nav .note-nav,
.viewport-nav .diff-nav {
  position: static;
  right: auto;
  bottom: auto;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
.diff-nav {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem;
}
.diff-nav[hidden] { display: none !important; }
.diff-nav .diff-nav-label {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 0.1rem 0.35rem 0.15rem;
}
.diff-nav button {
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: var(--radius);
  padding: 0.35rem 0.6rem;
  color: var(--ink);
  text-align: left;
  white-space: nowrap;
}
.diff-nav button:hover:not(:disabled) { background: #f0f0f0; }
.diff-nav button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.diff-nav .diff-nav-count {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  min-width: 1.25em;
  display: inline-block;
  text-align: center;
}
.cell.diff-nav-flash,
.diff-stripe-run.diff-nav-flash,
mark.diff-inline.diff-nav-flash {
  outline: 2px solid var(--diff-add-ink);
  outline-offset: 2px;
}
@media (max-width: 640px) {
  .viewport-nav {
    right: 0.5rem;
    bottom: 0.5rem;
    left: 0.5rem;
    max-width: none;
  }
  .diff-nav button { white-space: normal; }
}
`,
    flow: `
@media (min-width: 901px) {
  .cell-row {
    grid-template-columns: minmax(0, var(--cell-column-width)) var(--notes-rail-width);
  }
  .notes-cascade {
    grid-column: 2;
    grid-row: 1;
    position: absolute;
    top: 0;
    left: 0;
  }
}
@media (max-width: 900px) {
  .notes-cascade {
    grid-column: auto;
    grid-row: auto;
    position: relative;
    top: auto;
    left: auto;
  }
}
`,
    diff: `
.diff-inline{border-radius:2px;padding:0 .02em;pointer-events:none}
.diff-inline-del{background:#ffcdd2!important;color:#8a1f11!important;text-decoration:line-through;text-decoration-thickness:1.5px}
.diff-inline-del *{color:#8a1f11!important}
.diff-inline-add{background:#c8e6c9!important;color:#0d6b2f!important}
.diff-inline-add *{color:#0d6b2f!important}
.diff-right-source,.diff-filtered-source,.diff-additions-source{display:none}
body.diff-mode-filtered .cell-row.diff-filtered-hidden,body.diff-mode-additions .cell-row.diff-filtered-hidden{display:none}
.diff-source-view{min-width:0;flex:1}
.diff-source-view>.source-wrap,.diff-source-view>pre{width:100%}
body.diff-mode-filtered .diff-full-source{display:none}
body.diff-mode-filtered .diff-filtered-source{display:block}
body.diff-mode-additions .diff-full-source,body.diff-mode-additions .diff-filtered-source{display:none}
body.diff-mode-additions .diff-additions-source{display:block}
body.diff-mode-additions .diff-removed-row,body.diff-mode-off .diff-removed-row{display:none!important}
body.diff-mode-additions .diff-change{background:var(--surface)!important;border-left-color:var(--cell-border)!important}
body.diff-mode-off .diff-source-view{display:none}
body.diff-mode-off .diff-right-source{display:block}
body.diff-mode-off .diff-stripe-rail{display:none}
body.diff-mode-off .diff-lined{background-image:none!important}
body.diff-mode-off .diff-add,body.diff-mode-off .diff-change{background:var(--surface)!important;border-left-color:var(--cell-border)!important}
.diff-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:.25rem}
.diff-mode-grid button[aria-pressed=true]{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.diff-nav-position{font-size:.76rem;color:var(--muted);padding:.1rem .35rem;white-space:nowrap}`,
  };
});
