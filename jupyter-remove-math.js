/**
 * JupyterLab 4.4.5 packages/rendermime/src/latex.ts
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 *
 * Hides math from the Markdown parser. Adapted from Davide Cervone's
 * MathJax code (Apache 2) with StackExchange modifications, as shipped
 * by JupyterLab.
 *
 * Two local changes, both outside the delimiter scan:
 * - no Internet Explorer newline rewrite (there is no navigator in Node)
 * - saved math stays notebook source. Jupyter HTML-escapes & < > because
 *   replaceMath splices the string into HTML. This grader escapes once
 *   when it writes the tex-math span, so data-tex still matches the source.
 */
(function (root, factory) {
  var api = factory();
  api.source = "globalThis.JupyterRemoveMath=(" + factory.toString() + ")();\n";
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JupyterRemoveMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var inline = "$";

  var MATHSPLIT =
    /(\$\$?|\\(?:begin|end)\{[a-z]*\*?\}|\\[{}$]|[{}]|(?:\n\s*)+|@@\d+@@|\\\\(?:\(|\)|\[|\]))/i;

  function removeMath(text) {
    var math = [];
    var start = null;
    var end = null;
    var last = null;
    var braces = 0;
    var deTilde;

    var hasCodeSpans = text.indexOf("`") >= 0 || text.indexOf("~~~") >= 0;
    if (hasCodeSpans) {
      text = String(text)
        .replace(/~/g, "~T")
        .replace(
          /^(?<fence>`{3,}|(~T){3,})[^`\n]*\n([\s\S]*?)^\k<fence>`*$/gm,
          function (wholematch) {
            return wholematch.replace(/\$/g, "~D");
          }
        )
        .replace(/(^|[^\\])(`+)([^\n]*?[^`\n])\2(?!`)/gm, function (wholematch) {
          return wholematch.replace(/\$/g, "~D");
        });
      deTilde = function (value) {
        return value.replace(/~([TD])/g, function (_whole, character) {
          return character === "T" ? "~" : inline;
        });
      };
    } else {
      deTilde = function (value) {
        return value;
      };
    }

    var blocks = String(text).replace(/\r\n?/g, "\n").split(MATHSPLIT);

    for (var i = 1, m = blocks.length; i < m; i += 2) {
      var block = blocks[i];
      if (block.charAt(0) === "@") {
        blocks[i] = "@@" + math.length + "@@";
        math.push(block);
      } else if (start !== null) {
        if (block === end) {
          if (braces) {
            last = i;
          } else {
            blocks = processMath(start, i, deTilde, math, blocks);
            start = null;
            end = null;
            last = null;
          }
        } else if (block.match(/\n.*\n/)) {
          if (last !== null) {
            i = last;
            blocks = processMath(start, i, deTilde, math, blocks);
          }
          start = null;
          end = null;
          last = null;
          braces = 0;
        } else if (block === "{") {
          braces++;
        } else if (block === "}" && braces) {
          braces--;
        }
      } else if (block === inline || block === "$$") {
        start = i;
        end = block;
        braces = 0;
      } else if (block === "\\\\(" || block === "\\\\[") {
        start = i;
        end = block.slice(-1) === "(" ? "\\\\)" : "\\\\]";
        braces = 0;
      } else if (block.substr(1, 5) === "begin") {
        start = i;
        end = "\\end" + block.substr(6);
        braces = 0;
      }
    }
    if (start !== null && last !== null) {
      blocks = processMath(start, last, deTilde, math, blocks);
    }
    return { text: deTilde(blocks.join("")), math: math };
  }

  function processMath(i, j, preProcess, math, blocks) {
    var block = blocks.slice(i, j + 1).join("");
    while (j > i) {
      blocks[j] = "";
      j--;
    }
    blocks[i] = "@@" + math.length + "@@";
    if (preProcess) block = preProcess(block);
    math.push(block);
    return blocks;
  }

  function restoreMathSpans(html, math, escapeHtml) {
    return String(html).replace(/@@(\d+)@@/g, function (match, n) {
      var raw = math[n];
      if (raw == null) return match;
      var safe = escapeHtml(raw);
      if (/^@@\d+@@$/.test(raw)) return safe;
      return '<span class="tex-math" data-tex="' + safe + '">' + safe + "</span>";
    });
  }

  return {
    removeMath: removeMath,
    restoreMathSpans: restoreMathSpans
  };
});
