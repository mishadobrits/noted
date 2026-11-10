/**
 * Merge two Jupyter notebooks into one unified notebook for the diff viewer.
 *
 * Alignment: preserve shared cell IDs, else equal source (+ cell_type) via LCS,
 * including cells recreated with a different ID.
 * Outputs become separate synthetic cells so the existing MIME renderer is reused.
 * Diff chrome metadata (line statuses and inline runs) lives on
 * cell.metadata.ipynb_to_html.diff. Diff decoration is never stored as a note.
 *
 * Line statuses: " " equal, "-" deleted line, "+" added line, "~" within-line.
 * One logical insertion, deletion, or replacement stays inline. Lines with
 * multiple independent edits stay as a deleted line followed by an added line.
 *
 * Browser: NotebookDiff global. Node: module.exports.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.NotebookDiff = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var META_KEY = "ipynb_to_html";
  var COLOR_DEL = "#ffcdd2";
  var COLOR_ADD = "#c8e6c9";
  /** Strong enough to read on white; CSS line bg is the primary tint signal. */
  var OPACITY_TINT = 0.65;
  /**
   * Similarity to pair lines within a replacement hunk. A paired line is only
   * collapsed to `~` when inlineLineDiff identifies one logical edit;
   * otherwise it is emitted as an adjacent deleted/added pair.
   */
  var LINE_SIMILARITY_THRESHOLD = 0.6;

  function sourceText(cell) {
    var src = cell && cell.source;
    if (Array.isArray(src)) return src.join("");
    return src == null ? "" : String(src);
  }

  function joinText(value) {
    if (Array.isArray(value)) return value.join("");
    if (value == null) return "";
    return String(value);
  }

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function cellIdOf(cell) {
    return cell && typeof cell.id === "string" && cell.id.trim()
      ? cell.id.trim()
      : "";
  }

  function contentKey(cell) {
    return (cell.cell_type || "") + "\0" + sourceText(cell);
  }

  function alignKey(cell) {
    var id = cellIdOf(cell);
    if (id) return "id:" + id;
    return "src:" + fnv1a(contentKey(cell)) + ":" + contentKey(cell).length;
  }

  /** LCS-based diff of two sequences; equality via eq(a, b). */
  function diffSequences(a, b, eq) {
    var n = a.length;
    var m = b.length;
    var dp = new Array(n + 1);
    for (var i = 0; i <= n; i++) {
      dp[i] = new Array(m + 1);
      for (var j = 0; j <= m; j++) dp[i][j] = 0;
    }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        if (eq(a[i], b[j])) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var ops = [];
    i = 0;
    j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) {
        ops.push({ type: "equal", ai: i, bi: j });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: "delete", ai: i, bi: -1 });
        i++;
      } else {
        ops.push({ type: "insert", ai: -1, bi: j });
        j++;
      }
    }
    while (i < n) {
      ops.push({ type: "delete", ai: i, bi: -1 });
      i++;
    }
    while (j < m) {
      ops.push({ type: "insert", ai: -1, bi: j });
      j++;
    }
    return ops;
  }

  function splitLines(text) {
    var s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (s === "") return [];
    var lines = s.split("\n");
    // Drop the empty slot created by a trailing newline so "a\nb\n" → ["a","b"].
    // Mid-cell blank lines ("" between content) are kept.
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  function joinLines(lines) {
    if (!lines || !lines.length) return "";
    // Notebook cell sources conventionally end with a single trailing \n.
    return lines.join("\n") + "\n";
  }

  function compileIgnoredPatterns(patterns, optionName) {
    if (patterns == null) return [];
    if (typeof patterns === "string") patterns = patterns.split(/\r?\n/);
    if (!Array.isArray(patterns)) {
      throw new Error((optionName || "ignorePatterns") + " must be a list of regular expressions");
    }
    return patterns
      .filter(function (pattern) {
        return pattern instanceof RegExp || String(pattern).trim() !== "";
      })
      .map(function (pattern) {
        if (pattern instanceof RegExp) {
          return new RegExp(pattern.source, pattern.flags);
        }
        try {
          return new RegExp(String(pattern));
        } catch (e) {
          throw new Error(
            "Invalid " + (optionName || "ignored") + " regex " + JSON.stringify(String(pattern)) +
              ": " + e.message
          );
        }
      });
  }

  function compileIgnoredDeletionPatterns(patterns) {
    return compileIgnoredPatterns(patterns, "ignored-deletion");
  }

  function ignoredDeletion(line, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      patterns[i].lastIndex = 0;
      if (patterns[i].test(String(line))) return true;
    }
    return false;
  }

  function lineSimilarity(a, b) {
    if (a === b) return 1;
    // Compare trimmed content so shared indentation cannot inflate the score.
    var ta = String(a || "").trim();
    var tb = String(b || "").trim();
    if (!ta.length && !tb.length) return 1;
    if (!ta.length || !tb.length) return 0;
    var shorter = Math.min(ta.length, tb.length);
    var longer = Math.max(ta.length, tb.length);
    // Reject wildly different lengths even if a short LCS ratio looks high.
    if (longer > 0 && shorter / longer < 0.35) return 0;
    var aa = ta.split("");
    var bb = tb.split("");
    var ops = diffSequences(aa, bb, function (x, y) {
      return x === y;
    });
    var eq = 0;
    for (var i = 0; i < ops.length; i++) {
      if (ops[i].type === "equal") eq++;
    }
    return (2 * eq) / (ta.length + tb.length);
  }

  /**
   * Char-level diff between two lines. Returns whether there are deletes and/or
   * inserts, plus interleaved display text and runs (for pure inline cases).
   */
  function diffChars(baseLine, headLine) {
    var a = String(baseLine || "").split("");
    var b = String(headLine || "").split("");
    var ops = diffSequences(a, b, function (x, y) {
      return x === y;
    });
    var hasDel = false;
    var hasIns = false;
    var text = "";
    var runs = [];
    var curStatus = null;
    var curStart = 0;

    function flush(end) {
      if (curStatus && end > curStart) {
        runs.push({ status: curStatus, start: curStart, end: end });
      }
      curStatus = null;
      curStart = end;
    }

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === "equal") {
        flush(text.length);
        text += a[op.ai];
        curStart = text.length;
      } else if (op.type === "delete") {
        hasDel = true;
        if (curStatus !== "-") {
          flush(text.length);
          curStatus = "-";
          curStart = text.length;
        }
        text += a[op.ai];
      } else {
        hasIns = true;
        if (curStatus !== "+") {
          flush(text.length);
          curStatus = "+";
          curStart = text.length;
        }
        text += b[op.bi];
      }
    }
    flush(text.length);
    return { hasDel: hasDel, hasIns: hasIns, text: text, runs: runs };
  }

  function inlineEditGroupCount(runs) {
    if (!runs || !runs.length) return 0;
    var groups = 1;
    for (var i = 1; i < runs.length; i++) {
      if (runs[i].start > runs[i - 1].end) groups++;
    }
    return groups;
  }

  function identifierSpanContaining(line, start, end) {
    var re = /[A-Za-z_][A-Za-z0-9_]*/g;
    var match;
    while ((match = re.exec(line))) {
      var span = { start: match.index, end: match.index + match[0].length };
      if (span.start <= start && span.end >= end) return span;
    }
    return null;
  }

  /**
   * Character LCS can fragment one identifier rename into several edits (for
   * example train_transform → val_transform). Treat the complete identifier as
   * one replacement so the rendered result is readable and deterministic.
   */
  function coalesceIdentifierReplacement(baseLine, headLine) {
    var oldLine = String(baseLine || "");
    var newLine = String(headLine || "");
    var start = 0;
    while (
      start < oldLine.length &&
      start < newLine.length &&
      oldLine.charAt(start) === newLine.charAt(start)
    ) {
      start++;
    }
    var oldEnd = oldLine.length;
    var newEnd = newLine.length;
    while (
      oldEnd > start &&
      newEnd > start &&
      oldLine.charAt(oldEnd - 1) === newLine.charAt(newEnd - 1)
    ) {
      oldEnd--;
      newEnd--;
    }
    if (oldEnd <= start || newEnd <= start) return null;
    var oldSpan = identifierSpanContaining(oldLine, start, oldEnd);
    var newSpan = identifierSpanContaining(newLine, start, newEnd);
    if (!oldSpan || !newSpan || oldSpan.start !== newSpan.start) return null;
    if (oldLine.slice(0, oldSpan.start) !== newLine.slice(0, newSpan.start)) {
      return null;
    }
    if (oldLine.slice(oldSpan.end) !== newLine.slice(newSpan.end)) return null;

    var prefix = oldLine.slice(0, oldSpan.start);
    var oldToken = oldLine.slice(oldSpan.start, oldSpan.end);
    var newToken = newLine.slice(newSpan.start, newSpan.end);
    var suffix = oldLine.slice(oldSpan.end);
    var oldStart = prefix.length;
    var newStart = oldStart + oldToken.length;
    return {
      hasDel: true,
      hasIns: true,
      text: prefix + oldToken + newToken + suffix,
      runs: [
        { status: "-", start: oldStart, end: newStart },
        { status: "+", start: newStart, end: newStart + newToken.length },
      ],
    };
  }

  function singleContiguousInsertionOrDeletion(baseLine, headLine) {
    var oldLine = String(baseLine || "");
    var newLine = String(headLine || "");
    var start = 0;
    while (
      start < oldLine.length &&
      start < newLine.length &&
      oldLine.charAt(start) === newLine.charAt(start)
    ) {
      start++;
    }
    var oldEnd = oldLine.length;
    var newEnd = newLine.length;
    while (
      oldEnd > start &&
      newEnd > start &&
      oldLine.charAt(oldEnd - 1) === newLine.charAt(newEnd - 1)
    ) {
      oldEnd--;
      newEnd--;
    }
    var oldMiddle = oldLine.slice(start, oldEnd);
    var newMiddle = newLine.slice(start, newEnd);
    if (oldMiddle && newMiddle) return null;
    if (!oldMiddle && !newMiddle) return null;
    if (oldMiddle) {
      return {
        hasDel: true,
        hasIns: false,
        text: oldLine,
        runs: [{ status: "-", start: start, end: oldEnd }],
      };
    }
    return {
      hasDel: false,
      hasIns: true,
      text: newLine,
      runs: [{ status: "+", start: start, end: newEnd }],
    };
  }

  function inlineLineDiff(baseLine, headLine) {
    var contiguous = singleContiguousInsertionOrDeletion(baseLine, headLine);
    if (contiguous) return contiguous;
    var oldText = String(baseLine || "");
    var newText = String(headLine || "");
    var placeholderAt = oldText.indexOf("...");
    if (placeholderAt >= 0 && oldText.indexOf("...", placeholderAt + 3) < 0) {
      var placeholderPrefix = oldText.slice(0, placeholderAt);
      var placeholderSuffix = oldText.slice(placeholderAt + 3);
      if (
        newText.indexOf(placeholderPrefix) === 0 &&
        newText.slice(newText.length - placeholderSuffix.length) === placeholderSuffix
      ) {
        var newMiddleEnd = newText.length - placeholderSuffix.length;
        var newMiddle = newText.slice(placeholderPrefix.length, newMiddleEnd);
        return {
          hasDel: true,
          hasIns: newMiddle.length > 0,
          text: placeholderPrefix + "..." + newMiddle + placeholderSuffix,
          runs: [
            { status: "-", start: placeholderPrefix.length, end: placeholderPrefix.length + 3 },
          ].concat(newMiddle ? [{
            status: "+",
            start: placeholderPrefix.length + 3,
            end: placeholderPrefix.length + 3 + newMiddle.length,
          }] : []),
        };
      }
    }
    var cd = diffChars(baseLine, headLine);
    if (!cd.hasDel && !cd.hasIns) return null;
    if (inlineEditGroupCount(cd.runs) === 1) {
      var changed = 0;
      for (var i = 0; i < cd.runs.length; i++) {
        changed += cd.runs[i].end - cd.runs[i].start;
      }
      // A replacement needs some unchanged context. Pure insertions/deletions
      // already preserve one side and are safe even when their size is large.
      if (!cd.hasDel || !cd.hasIns || cd.text.length > changed) return cd;
    }
    if (oldText.replace(/\s/g, "") === newText.replace(/\s/g, "")) return cd;
    var identifier = coalesceIdentifierReplacement(baseLine, headLine);
    if (identifier) return identifier;

    // When the assignment target is unchanged, treat the whole assignment
    // tail as one logical replacement. This keeps placeholders atomic:
    // `loss(...)` -> `loss(real_argument)` must not retain one misleading dot.
    var oldAssignment = /^(\s*[A-Za-z_][A-Za-z0-9_.]*)(\s*=.*)$/.exec(String(baseLine || ""));
    var newAssignment = /^(\s*[A-Za-z_][A-Za-z0-9_.]*)(\s*=.*)$/.exec(String(headLine || ""));
    if (
      oldAssignment && newAssignment &&
      oldAssignment[1].trim() === newAssignment[1].trim() &&
      (
        oldAssignment[2].indexOf("...") >= 0 ||
        newAssignment[2].indexOf("...") >= 0 ||
        (/^\s*=\s*[0-9.eE+,\-]+\s*$/.test(oldAssignment[2]) &&
          /^\s*=\s*[0-9.eE+,\-]+\s*$/.test(newAssignment[2]))
      )
    ) {
      var prefix = newAssignment[1].replace(/\s+$/, "");
      var oldTail = String(baseLine).slice(oldAssignment[1].replace(/\s+$/, "").length);
      var newTail = String(headLine).slice(newAssignment[1].replace(/\s+$/, "").length);
      return {
        hasDel: true,
        hasIns: true,
        text: prefix + oldTail + newTail,
        runs: [
          { status: "-", start: prefix.length, end: prefix.length + oldTail.length },
          { status: "+", start: prefix.length + oldTail.length, end: prefix.length + oldTail.length + newTail.length },
        ],
      };
    }
    return null;
  }

  /**
   * Ignore-patterns apply to inline deletions as well as whole deleted lines.
   * Removing a matching run also shifts the remaining run offsets so the
   * rendered text continues to line up with its highlights.
   */
  function suppressIgnoredInlineChanges(diff, ignoredDeletionPatterns, ignoredAdditionPatterns) {
    if (!diff || !diff.runs || !diff.runs.length ||
        (!ignoredDeletionPatterns.length && !ignoredAdditionPatterns.length)) {
      return diff;
    }
    var ignored = [];
    for (var i = 0; i < diff.runs.length; i++) {
      var candidate = diff.runs[i];
      var patterns = candidate.status === "-"
        ? ignoredDeletionPatterns
        : candidate.status === "+"
          ? ignoredAdditionPatterns
          : [];
      ignored[i] = patterns.length > 0 &&
        ignoredDeletion(diff.text.slice(candidate.start, candidate.end), patterns);
    }
    if (!ignored.some(function (value) { return value; })) return diff;

    var text = "";
    var runs = [];
    var cursor = 0;
    for (i = 0; i < diff.runs.length; i++) {
      var run = diff.runs[i];
      text += diff.text.slice(cursor, run.start);
      if (!ignored[i]) {
        var start = text.length;
        text += diff.text.slice(run.start, run.end);
        runs.push({ status: run.status, start: start, end: text.length });
      }
      cursor = run.end;
    }
    text += diff.text.slice(cursor);
    return {
      hasDel: runs.some(function (run) { return run.status === "-"; }),
      hasIns: runs.some(function (run) { return run.status === "+"; }),
      text: text,
      runs: runs,
    };
  }

  function inlineSideText(diff, side) {
    var text = "";
    var cursor = 0;
    for (var i = 0; i < diff.runs.length; i++) {
      var run = diff.runs[i];
      text += diff.text.slice(cursor, run.start);
      if (run.status === side) text += diff.text.slice(run.start, run.end);
      cursor = run.end;
    }
    return text + diff.text.slice(cursor);
  }

  /**
   * Pair similar old/new lines inside a replacement hunk while preserving their
   * order. One logical edit is rendered once with character-level runs;
   * multi-edit pairs and unmatched lines remain deletion/addition rows.
   */
  function refineReplaceHunk(delLines, addLines, ignoredDeletionPatterns, ignoredAdditionPatterns) {
    var lines = [];
    var statuses = [];
    var inlineRuns = [];
    var ops = diffSequences(delLines, addLines, function (oldLine, newLine) {
      // Never consume a real line by pairing it with a blank line. Besides
      // looking wrong, that displaces every following replacement in a hunk.
      if (!String(oldLine).trim() || !String(newLine).trim()) {
        return !String(oldLine).trim() && !String(newLine).trim();
      }
      return (
        inlineLineDiff(oldLine, newLine) != null ||
        lineSimilarity(oldLine, newLine) >= LINE_SIMILARITY_THRESHOLD
      );
    });

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === "equal") {
        var oldLine = delLines[op.ai];
        var newLine = addLines[op.bi];
        var displayOldLine = oldLine;
        var cd;
        if (!String(oldLine).trim() && !String(newLine).trim()) {
          cd = { text: newLine, runs: [], hasDel: false, hasIns: false };
        } else if (ignoredDeletion(oldLine, ignoredDeletionPatterns)) {
          cd = null;
        } else {
          var comparisonOldLine = oldLine;
          // Do not let LCS preserve one arbitrary dot from an ignored `...`
          // placeholder. If the complete placeholder is filtered, remove it
          // before character matching so `f(...)` becomes `f()` cleanly.
          if (
            comparisonOldLine.indexOf("...") >= 0 &&
            ignoredDeletion("...", ignoredDeletionPatterns)
          ) {
            comparisonOldLine = comparisonOldLine.replace(/\.\.\./g, "");
          }
          displayOldLine = comparisonOldLine;
          if (comparisonOldLine === newLine) {
            cd = { text: newLine, runs: [], hasDel: false, hasIns: false };
          } else {
            var raw = diffChars(comparisonOldLine, newLine);
            var filtered = suppressIgnoredInlineChanges(
              raw,
              ignoredDeletionPatterns,
              ignoredAdditionPatterns
            );
            if (filtered !== raw) {
              displayOldLine = inlineSideText(filtered, "-");
              var filteredNewLine = inlineSideText(filtered, "+");
              cd = displayOldLine === filteredNewLine
                ? { text: filteredNewLine, runs: [], hasDel: false, hasIns: false }
                : inlineLineDiff(displayOldLine, filteredNewLine);
            } else {
              cd = inlineLineDiff(comparisonOldLine, newLine);
            }
          }
        }
        if (cd && !cd.runs.length) {
          lines.push(cd.text);
          statuses.push(" ");
          inlineRuns.push(null);
        } else if (cd) {
          lines.push(cd.text);
          statuses.push("~");
          inlineRuns.push(cd.runs);
        } else {
          if (!ignoredDeletion(displayOldLine, ignoredDeletionPatterns)) {
            lines.push(displayOldLine);
            statuses.push("-");
            inlineRuns.push(null);
          }
          if (!ignoredDeletion(newLine, ignoredAdditionPatterns)) {
            lines.push(newLine);
            statuses.push("+");
            inlineRuns.push(null);
          }
        }
      } else if (op.type === "delete") {
        if (!ignoredDeletion(delLines[op.ai], ignoredDeletionPatterns)) {
          lines.push(delLines[op.ai]);
          statuses.push("-");
          inlineRuns.push(null);
        }
      } else {
        if (!ignoredDeletion(addLines[op.bi], ignoredAdditionPatterns)) {
          lines.push(addLines[op.bi]);
          statuses.push("+");
          inlineRuns.push(null);
        }
      }
    }
    // A differ may place equivalent blank rows at opposite ends of a large
    // replacement hunk. Pair those rows explicitly so indentation-only blank
    // changes do not become distracting red/green lines.
    var blankDeletes = [];
    var blankAdds = [];
    for (var j = 0; j < lines.length; j++) {
      if (String(lines[j]).trim()) continue;
      if (statuses[j] === "-") blankDeletes.push(j);
      else if (statuses[j] === "+") blankAdds.push(j);
    }
    var pairedBlanks = Math.min(blankDeletes.length, blankAdds.length);
    var removeBlankDeletes = Object.create(null);
    for (j = 0; j < pairedBlanks; j++) {
      statuses[blankAdds[j]] = " ";
      inlineRuns[blankAdds[j]] = null;
      removeBlankDeletes[blankDeletes[j]] = true;
    }
    if (pairedBlanks) {
      lines = lines.filter(function (_, index) { return !removeBlankDeletes[index]; });
      statuses = statuses.filter(function (_, index) { return !removeBlankDeletes[index]; });
      inlineRuns = inlineRuns.filter(function (_, index) { return !removeBlankDeletes[index]; });
    }
    return { lines: lines, statuses: statuses, inlineRuns: inlineRuns };
  }

  /**
   * Unified line merge. Returns { lines, statuses, inlineRuns } where statuses[i]
   * is " " | "-" | "+" | "~".
   */
  function mergeLines(baseText, headText, options) {
    options = options || {};
    var ignoredPatterns = options.ignoredDeletionRegexes ||
      compileIgnoredDeletionPatterns(options.ignoreDeletionPatterns);
    var ignoredAdditionPatterns = options.ignoredAdditionRegexes ||
      compileIgnoredPatterns(options.ignoreAdditionPatterns, "ignored-addition");
    var a = splitLines(baseText);
    var b = splitLines(headText);
    if (!a.length && !b.length) {
      return { lines: [""], statuses: [" "], inlineRuns: [null] };
    }
    var ops = diffSequences(a, b, function (x, y) {
      return x === y;
    });
    var lines = [];
    var statuses = [];
    var inlineRuns = [];
    var i = 0;
    while (i < ops.length) {
      var op = ops[i];
      if (op.type === "equal") {
        // Prefer head spelling when equal (identical).
        lines.push(b[op.bi]);
        statuses.push(" ");
        inlineRuns.push(null);
        i++;
        continue;
      }
      var delLines = [];
      var addLines = [];
      while (i < ops.length && ops[i].type !== "equal") {
        if (ops[i].type === "delete") delLines.push(a[ops[i].ai]);
        else addLines.push(b[ops[i].bi]);
        i++;
      }
      if (delLines.length && addLines.length) {
        var refined = refineReplaceHunk(
          delLines,
          addLines,
          ignoredPatterns,
          ignoredAdditionPatterns
        );
        for (var r = 0; r < refined.lines.length; r++) {
          lines.push(refined.lines[r]);
          statuses.push(refined.statuses[r]);
          inlineRuns.push(refined.inlineRuns[r]);
        }
      } else if (delLines.length) {
        for (r = 0; r < delLines.length; r++) {
          if (!ignoredDeletion(delLines[r], ignoredPatterns)) {
            lines.push(delLines[r]);
            statuses.push("-");
            inlineRuns.push(null);
          }
        }
      } else {
        for (r = 0; r < addLines.length; r++) {
          if (!ignoredDeletion(addLines[r], ignoredAdditionPatterns)) {
            lines.push(addLines[r]);
            statuses.push("+");
            inlineRuns.push(null);
          }
        }
      }
    }
    // Blank lines often align to a nearby equal row instead of their logical
    // counterpart. Reconcile any remaining delete/add pair across hunks and
    // keep the new-notebook position, which is the canonical notes target.
    var remainingBlankDeletes = [];
    var remainingBlankAdds = [];
    for (var blankIndex = 0; blankIndex < lines.length; blankIndex++) {
      if (String(lines[blankIndex]).trim()) continue;
      if (statuses[blankIndex] === "-") remainingBlankDeletes.push(blankIndex);
      else if (statuses[blankIndex] === "+") remainingBlankAdds.push(blankIndex);
    }
    var remainingPairs = Math.min(remainingBlankDeletes.length, remainingBlankAdds.length);
    var removeRemainingDeletes = Object.create(null);
    for (blankIndex = 0; blankIndex < remainingPairs; blankIndex++) {
      statuses[remainingBlankAdds[blankIndex]] = " ";
      inlineRuns[remainingBlankAdds[blankIndex]] = null;
      removeRemainingDeletes[remainingBlankDeletes[blankIndex]] = true;
    }
    if (remainingPairs) {
      lines = lines.filter(function (_, index) { return !removeRemainingDeletes[index]; });
      statuses = statuses.filter(function (_, index) { return !removeRemainingDeletes[index]; });
      inlineRuns = inlineRuns.filter(function (_, index) { return !removeRemainingDeletes[index]; });
    }
    return { lines: lines, statuses: statuses, inlineRuns: inlineRuns };
  }

  function lineStatusesUniform(statuses, ch) {
    if (!statuses.length) return false;
    for (var i = 0; i < statuses.length; i++) {
      if (statuses[i] !== ch) return false;
    }
    return true;
  }

  function ensureMeta(cell) {
    cell.metadata = cell.metadata || {};
    cell.metadata[META_KEY] = cell.metadata[META_KEY] || {};
    return cell.metadata[META_KEY];
  }

  function setDiffMeta(cell, status, lineStatuses, inlineRuns, rightSource) {
    var meta = ensureMeta(cell);
    meta.diff = {
      status: status,
      lines: lineStatuses || [],
    };
    if (inlineRuns && inlineRuns.length) meta.diff.inline_runs = inlineRuns;
    if (rightSource != null) meta.diff.right_source = String(rightSource);
  }

  function stableMergedId(kind, baseCell, headCell, extra) {
    var bid = baseCell ? cellIdOf(baseCell) : "";
    var hid = headCell ? cellIdOf(headCell) : "";
    if (kind === "pair") {
      if (bid && hid && bid === hid) return bid;
      if (hid) return hid;
      if (bid) return bid;
      return (
        "diff:m:" +
        fnv1a(
          contentKey(baseCell || {}) + "\n" + contentKey(headCell || {})
        )
      );
    }
    if (kind === "del") {
      return bid ? "diff:del:" + bid : "diff:del:" + fnv1a(contentKey(baseCell));
    }
    if (kind === "add") {
      return hid || "diff:add:" + fnv1a(contentKey(headCell));
    }
    if (kind === "out") {
      return "diff:out:" + extra;
    }
    return "diff:" + fnv1a(String(extra || Math.random()));
  }

  var ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;
  var HTML_TAG = /<[^>]+>/g;

  /**
   * Canonical annotatable text for an output — kept in sync with
   * IpynbToHtml.outputAnnotatableText (prefer that when loaded).
   */
  function outputAnnotatableTextLocal(output) {
    if (!output || typeof output !== "object") return "";
    var otype = output.output_type || "";
    if (otype === "stream") return joinText(output.text);
    if (otype === "error") {
      var ename = output.ename || "Error";
      var evalue = output.evalue || "";
      var traceback = output.traceback || [];
      var tbLines = (Array.isArray(traceback) ? traceback : [traceback]).map(
        function (line) {
          return String(line).replace(ANSI_ESCAPE, "");
        }
      );
      if (!tbLines.length) return ename + ": " + evalue;
      return tbLines.join("\n");
    }
    if (otype === "execute_result" || otype === "display_data") {
      var data = output.data || {};
      if (data["text/html"] != null) {
        var html = joinText(data["text/html"]);
        var sanitize = root && root.HtmlSanitize;
        if (!sanitize && typeof require === "function") {
          try { sanitize = require("./html-sanitize.js"); } catch (e) { sanitize = null; }
        }
        if (sanitize && typeof sanitize.visibleHtmlText === "function")
          return sanitize.visibleHtmlText(html);
        return String(html).replace(HTML_TAG, "");
      }
      if (data["text/plain"] != null) return joinText(data["text/plain"]);
      return "";
    }
    return "";
  }

  function outputAnnotatableText(output) {
    if (
      root &&
      root.IpynbToHtml &&
      typeof root.IpynbToHtml.outputAnnotatableText === "function"
    ) {
      return root.IpynbToHtml.outputAnnotatableText(output);
    }
    return outputAnnotatableTextLocal(output);
  }

  function canonicalJson(value) {
    if (value == null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(canonicalJson).join(",") + "]";
    }
    return (
      "{" +
      Object.keys(value)
        .filter(function (key) {
          return key !== "metadata";
        })
        .sort()
        .map(function (key) {
          return JSON.stringify(key) + ":" + canonicalJson(value[key]);
        })
        .join(",") +
      "}"
    );
  }

  function outputKey(output) {
    return canonicalJson(output || {});
  }

  function makeSyntheticOutputCell(
    parentId,
    viewIndex,
    output,
    sideStatus,
    sourceOutputIndex
  ) {
    var text = outputAnnotatableText(output);
    var id = stableMergedId(
      "out",
      null,
      null,
      parentId + ":" +
        (sourceOutputIndex != null ? sourceOutputIndex : viewIndex) +
        ":" + sideStatus
    );
    var cell = {
      id: id,
      cell_type: "raw",
      metadata: {},
      source: text,
    };
    var meta = ensureMeta(cell);
    meta.synthetic = "output";
    meta.from_cell_id = parentId;
    meta.output_index =
      sourceOutputIndex != null ? sourceOutputIndex : viewIndex;
    meta.from_right = sideStatus !== "del";
    meta.output = cloneJson(output);
    var status = sideStatus || "equal";
    var n = splitLines(text);
    if (!n.length) n = [""];
    var ch = status === "add" ? "+" : status === "del" ? "-" : " ";
    var lines = n.map(function () {
      return ch;
    });
    setDiffMeta(cell, status, lines);
    meta.diff.nav_target = false;
    return cell;
  }

  function stripOutputs(cell) {
    var c = cloneJson(cell);
    if (c.cell_type === "code") c.outputs = [];
    return c;
  }

  function buildPairCell(baseCell, headCell, mergeOptions) {
    var baseSrc = sourceText(baseCell);
    var headSrc = sourceText(headCell);
    var id = stableMergedId("pair", baseCell, headCell);
    var merged;
    var notes = [];
    var outCells = [];

    if (baseSrc === headSrc) {
      merged = stripOutputs(cloneJson(headCell));
      merged.id = id;
      var eqLines = splitLines(headSrc);
      if (!eqLines.length) eqLines = [""];
      setDiffMeta(
        merged,
        "equal",
        eqLines.map(function () {
          return " ";
        }),
        null,
        headSrc
      );
    } else {
      var uni = mergeLines(baseSrc, headSrc, mergeOptions);
      var text = joinLines(uni.lines);
      var status = "change";
      if (!uni.statuses.length || lineStatusesUniform(uni.statuses, " ")) {
        status = "equal";
      } else if (lineStatusesUniform(uni.statuses, "-")) status = "del";
      else if (lineStatusesUniform(uni.statuses, "+")) status = "add";
      merged = stripOutputs(cloneJson(headCell));
      merged.id = id;
      merged.cell_type = headCell.cell_type || baseCell.cell_type || "code";
      merged.source = text;
      setDiffMeta(merged, status, uni.statuses, uni.inlineRuns, headSrc);
    }

    var baseOuts = (baseCell.cell_type === "code" && baseCell.outputs) || [];
    var headOuts = (headCell.cell_type === "code" && headCell.outputs) || [];
    var outOps = diffSequences(
      baseOuts.map(outputKey),
      headOuts.map(outputKey),
      function (x, y) {
        return x === y;
      }
    );
    var outIdx = 0;
    var outputsChanged = false;
    for (var oi = 0; oi < outOps.length; oi++) {
      var op = outOps[oi];
      if (op.type === "equal") {
        outCells.push(
          makeSyntheticOutputCell(
            id,
            outIdx++,
            headOuts[op.bi],
            "equal",
            op.bi
          )
        );
      } else if (op.type === "delete") {
        outputsChanged = true;
        var removedOutput = baseOuts[op.ai];
        var removedOutputText = outputAnnotatableText(removedOutput);
        if (
          !removedOutputText ||
          !ignoredDeletion(
            removedOutputText,
            mergeOptions.ignoredDeletionRegexes || []
          )
        ) {
          outCells.push(
            makeSyntheticOutputCell(
              id,
              outIdx++,
              removedOutput,
              "del",
              op.ai
            )
          );
        }
      } else {
        outputsChanged = true;
        var addedOutput = headOuts[op.bi];
        var addedOutputText = outputAnnotatableText(addedOutput);
        if (
          !addedOutputText ||
          !ignoredDeletion(
            addedOutputText,
            mergeOptions.ignoredAdditionRegexes || []
          )
        ) {
          outCells.push(
            makeSyntheticOutputCell(
              id,
              outIdx++,
              addedOutput,
              "add",
              op.bi
            )
          );
        }
      }
    }
    if (outputsChanged) {
      var pairDiff = ensureMeta(merged).diff;
      if (!pairDiff || pairDiff.status === "equal") {
        var outputOnlyLines = splitLines(headSrc);
        if (!outputOnlyLines.length) outputOnlyLines = [""];
        setDiffMeta(
          merged,
          "change",
          outputOnlyLines.map(function () {
            return " ";
          }),
          null,
          headSrc
        );
        ensureMeta(merged).diff.output_only = true;
      }
    }

    return { cell: merged, notes: notes, outputCells: outCells };
  }

  function buildSideCell(cell, side, mergeOptions) {
    var id =
      side === "del"
        ? stableMergedId("del", cell, null)
        : stableMergedId("add", null, cell);
    var c = stripOutputs(cloneJson(cell));
    c.id = id;
    var src = sourceText(c);
    var lines = splitLines(src);
    if (!lines.length) lines = [""];
    var ch = side === "del" ? "-" : "+";
    var statuses = lines.map(function () {
      return ch;
    });
    // A wholly-added cell is already the right/new cell.  Keep the right-side
    // source explicitly as well: the interactive viewer redraws from this
    // field in "new notebook" and diff-off modes.
    setDiffMeta(c, side, statuses, null, side === "add" ? src : null);
    // Wholly add/del: background only — no per-line tint notes
    var notes = [];
    var outCells = [];
    if (cell.cell_type === "code" && cell.outputs && cell.outputs.length) {
      for (var i = 0; i < cell.outputs.length; i++) {
        var outputText = outputAnnotatableText(cell.outputs[i]);
        if (
          (side === "del" || side === "add") &&
          outputText &&
          ignoredDeletion(
            outputText,
            (mergeOptions && (side === "del"
              ? mergeOptions.ignoredDeletionRegexes
              : mergeOptions.ignoredAdditionRegexes)) || []
          )
        ) {
          continue;
        }
        outCells.push(
          makeSyntheticOutputCell(id, i, cell.outputs[i], side, i)
        );
      }
    }
    return { cell: c, notes: notes, outputCells: outCells };
  }

  /**
   * Merge base (old/left) and head (new/right) into one notebook.
   * The right notebook supplies metadata, IDs, user notes, and the non-diff view.
   */
  function mergeNotebooks(baseNb, headNb, options) {
    options = options || {};
    if (!baseNb || !headNb) throw new Error("mergeNotebooks requires two notebooks");
    var baseCells = Array.isArray(baseNb.cells) ? baseNb.cells : [];
    var headCells = Array.isArray(headNb.cells) ? headNb.cells : [];
    var mergeOptions = {
      ignoredDeletionRegexes: compileIgnoredDeletionPatterns(
        options.ignoreDeletionPatterns
      ),
      ignoredAdditionRegexes: compileIgnoredPatterns(
        options.ignoreAdditionPatterns,
        "ignored-addition"
      ),
    };

    var baseKeys = baseCells.map(function (cell) {
      return { id: cellIdOf(cell), content: contentKey(cell) };
    });
    var headKeys = headCells.map(function (cell) {
      return { id: cellIdOf(cell), content: contentKey(cell) };
    });
    var baseIds = new Set(baseKeys.map(function (key) { return key.id; }));
    var sharedIds = new Set(headKeys.filter(function (key) {
      return key.id && baseIds.has(key.id);
    }).map(function (key) { return key.id; }));
    var ops = diffSequences(baseKeys, headKeys, function (a, b) {
      if (a.id && a.id === b.id) return true;
      // A duplicate source must not take the place of a surviving cell ID.
      if (sharedIds.has(a.id) || sharedIds.has(b.id)) return false;
      return a.content === b.content;
    });

    var cells = [];
    var notes = [];
    var seenIds = Object.create(null);

    function nearestHeadCell(opIndex) {
      var j;
      for (j = opIndex + 1; j < ops.length; j++) {
        if (ops[j].bi != null) return headCells[ops[j].bi];
      }
      for (j = opIndex - 1; j >= 0; j--) {
        if (ops[j].bi != null) return headCells[ops[j].bi];
      }
      return null;
    }

    function setNewNotebookNoteTarget(builtPart, targetCell, side) {
      if (!builtPart || !targetCell) return;
      var targetId = cellIdOf(targetCell);
      if (!targetId) return;
      var parts = [builtPart.cell].concat(builtPart.outputCells || []);
      for (var pi = 0; pi < parts.length; pi++) {
        var diff = ensureMeta(parts[pi]).diff;
        if (!diff) continue;
        diff.note_target_cell_id = targetId;
        diff.note_target_side = side || "above";
      }
    }

    function takeId(cell) {
      var id = cellIdOf(cell) || cell.id;
      if (!id || seenIds[id]) {
        id = (id || "diff") + "~" + fnv1a(String(cells.length) + ":" + sourceText(cell));
        cell.id = id;
      }
      seenIds[id] = true;
      cell.id = id;
      return id;
    }

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var built;
      if (op.type === "equal") {
        var baseCell = baseCells[op.ai];
        var headCell = headCells[op.bi];
        if (
          baseCell.cell_type !== headCell.cell_type ||
          (sourceText(baseCell) !== sourceText(headCell) &&
            (baseCell.cell_type === "markdown" ||
              headCell.cell_type === "markdown"))
        ) {
          var removedMarkdown = buildSideCell(baseCell, "del", mergeOptions);
          var addedMarkdown = buildSideCell(headCell, "add", mergeOptions);
          ensureMeta(removedMarkdown.cell).diff.nav_target = false;
          setNewNotebookNoteTarget(removedMarkdown, headCell, "above");
          takeId(removedMarkdown.cell);
          cells.push(removedMarkdown.cell);
          for (var rmo = 0; rmo < removedMarkdown.outputCells.length; rmo++) {
            takeId(removedMarkdown.outputCells[rmo]);
            cells.push(removedMarkdown.outputCells[rmo]);
          }
          built = addedMarkdown;
        } else {
          built = buildPairCell(baseCell, headCell, mergeOptions);
        }
      } else if (op.type === "delete") {
        built = buildSideCell(baseCells[op.ai], "del", mergeOptions);
        setNewNotebookNoteTarget(built, nearestHeadCell(i), "above");
      } else {
        built = buildSideCell(headCells[op.bi], "add", mergeOptions);
      }
      if (op.type !== "delete" && op.bi != null) {
        setNewNotebookNoteTarget(built, headCells[op.bi], "above");
      }
      takeId(built.cell);
      cells.push(built.cell);
      for (var ni = 0; ni < built.notes.length; ni++) notes.push(built.notes[ni]);
      for (var oi = 0; oi < built.outputCells.length; oi++) {
        takeId(built.outputCells[oi]);
        // Wholly add/del outputs: background only — no tint notes
        cells.push(built.outputCells[oi]);
      }
    }

    var notebook = {
      nbformat: headNb.nbformat || baseNb.nbformat || 4,
      nbformat_minor:
        headNb.nbformat_minor != null
          ? headNb.nbformat_minor
          : baseNb.nbformat_minor != null
            ? baseNb.nbformat_minor
            : 5,
      metadata: cloneJson(headNb.metadata || baseNb.metadata || {}),
      cells: cells,
    };
    notebook.metadata[META_KEY] = notebook.metadata[META_KEY] || {};
    notebook.metadata[META_KEY].diff = {
      baseName: options.baseName || "base.ipynb",
      headName: options.headName || "head.ipynb",
      generated: true,
    };

    return {
      notebook: notebook,
      notes: notes,
      meta: notebook.metadata[META_KEY].diff,
    };
  }

  // Attach an alternate presentation of the same merged cells without
  // changing the primary diff algorithm or its inline runs.
  function attachDiffVariant(primaryNotebook, variantNotebook, name) {
    if (!primaryNotebook || !variantNotebook || !name) return primaryNotebook;
    var variantById = Object.create(null);
    (variantNotebook.cells || []).forEach(function (cell) {
      if (cell && cell.id != null) variantById[String(cell.id)] = cell;
    });
    (primaryNotebook.cells || []).forEach(function (cell) {
      if (!cell || cell.id == null) return;
      var variant = variantById[String(cell.id)];
      var primaryMeta = ensureMeta(cell);
      primaryMeta.diff = primaryMeta.diff || {};
      primaryMeta.diff.variants = primaryMeta.diff.variants || {};
      if (!variant) {
        primaryMeta.diff.variants[name] = { hidden: true };
        return;
      }
      var variantMeta = ensureMeta(variant).diff || {};
      primaryMeta.diff.variants[name] = {
        source: sourceText(variant),
        status: variantMeta.status,
        lines: cloneJson(variantMeta.lines || []),
        inline_runs: cloneJson(variantMeta.inline_runs || []),
      };
    });
    return primaryNotebook;
  }

  return {
    META_KEY: META_KEY,
    COLOR_DEL: COLOR_DEL,
    COLOR_ADD: COLOR_ADD,
    LINE_SIMILARITY_THRESHOLD: LINE_SIMILARITY_THRESHOLD,
    compileIgnoredDeletionPatterns: compileIgnoredDeletionPatterns,
    attachDiffVariant: attachDiffVariant,
    inlineLineDiff: inlineLineDiff,
    mergeNotebooks: mergeNotebooks,
    mergeLines: mergeLines,
    diffSequences: diffSequences,
    alignKey: alignKey,
    sourceText: sourceText,
    outputAnnotatableText: outputAnnotatableText,
  };
});
