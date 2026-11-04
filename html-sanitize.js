/**
 * Allowlist sanitizer for notebook HTML, SVG, images, links, and note colors.
 * Works in Node and in the browser. Generated pages inline factorySource so the
 * viewer can sanitize again when it rewrites output HTML.
 */
(function (root, factory) {
  var api = factory();
  api.factorySource = "(" + factory.toString() + ")()";
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HtmlSanitize = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ALLOWED = {
    a: 1, abbr: 1, b: 1, blockquote: 1, br: 1, caption: 1, cite: 1, code: 1,
    col: 1, colgroup: 1, dd: 1, del: 1, details: 1, dfn: 1, div: 1, dl: 1,
    dt: 1, em: 1, figcaption: 1, figure: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1,
    h6: 1, hr: 1, i: 1, img: 1, ins: 1, kbd: 1, li: 1, mark: 1, ol: 1, p: 1,
    pre: 1, q: 1, s: 1, samp: 1, small: 1, span: 1, strong: 1, sub: 1, summary: 1,
    sup: 1, table: 1, tbody: 1, td: 1, tfoot: 1, th: 1, thead: 1, time: 1, tr: 1,
    u: 1, ul: 1, var: 1, wbr: 1
  };
  var VOID = { br: 1, col: 1, hr: 1, img: 1, wbr: 1 };
  var DROP_CONTENT = {
    base: 1, embed: 1, frame: 1, frameset: 1, head: 1, iframe: 1, link: 1,
    math: 1, meta: 1, noembed: 1, noframes: 1, noscript: 1, object: 1,
    plaintext: 1, script: 1, style: 1, svg: 1, template: 1, textarea: 1,
    title: 1, xmp: 1
  };
  var STYLE_PROPS = {
    background: 1, "background-color": 1, border: 1, "border-bottom": 1,
    "border-collapse": 1, "border-color": 1, "border-left": 1, "border-right": 1,
    "border-spacing": 1, "border-top": 1, "caption-side": 1, color: 1,
    display: 1, "empty-cells": 1, "font-size": 1, "font-style": 1, "font-weight": 1,
    height: 1, "line-height": 1, "list-style": 1, "list-style-position": 1,
    "margin-top": 1, "margin-right": 1, "margin-bottom": 1, "margin-left": 1,
    "list-style-type": 1, margin: 1, "max-width": 1, "min-width": 1,
    opacity: 1, overflow: 1, "overflow-wrap": 1, "overflow-x": 1, "overflow-y": 1,
    padding: 1, "padding-bottom": 1, "padding-left": 1, "padding-right": 1,
    "padding-top": 1, "text-align": 1, "text-decoration": 1,
    "text-decoration-color": 1, "text-decoration-thickness": 1,
    "text-underline-offset": 1, "text-transform": 1,
    "vertical-align": 1, "white-space": 1, width: 1, "word-break": 1,
    "align-items": 1, "align-self": 1, "justify-content": 1,
    flex: 1, "flex-basis": 1, "flex-direction": 1, "flex-grow": 1,
    "flex-shrink": 1, "flex-wrap": 1, gap: 1, "column-gap": 1, "row-gap": 1,
    "box-sizing": 1, "box-shadow": 1, "border-radius": 1, "letter-spacing": 1,
    "font-family": 1, float: 1, clear: 1
  };

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  function decodeEntities(text) {
    return String(text)
      .replace(/&#(\d+);/g, function (_, n) {
        var code = parseInt(n, 10);
        if (!(code >= 0 && code <= 0x10ffff)) return "";
        try { return String.fromCodePoint(code); } catch (e) { return ""; }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) {
        var code = parseInt(h, 16);
        if (!(code >= 0 && code <= 0x10ffff)) return "";
        try { return String.fromCodePoint(code); } catch (e) { return ""; }
      })
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/gi, "\u00a0")
      .replace(/&amp;/gi, "&");
  }

  function safeHexColor(color) {
    var value = String(color || "").replace(/^\s+|\s+$/g, "");
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
      ? value
      : "#ffe566";
  }

  function safeUrl(url, kind) {
    var value = String(url == null ? "" : url).replace(/^\s+|\s+$/g, "");
    if (!value || value.length > 4096) return "";
    if (/[\u0000-\u0020\u007f<>"'\\`]/.test(value)) return "";
    var lower = value.toLowerCase();
    var allowed = kind === "image"
      ? lower.indexOf("https://") === 0 || lower.indexOf("http://") === 0
      : lower.indexOf("https://") === 0 || lower.indexOf("http://") === 0 || lower.indexOf("mailto:") === 0;
    if (!allowed) return "";
    return value;
  }

  function safeImageSrc(url) {
    var direct = safeUrl(url, "image");
    if (direct) return direct;
    var compact = String(url == null ? "" : url).replace(/\s+/g, "");
    var match = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(compact);
    if (!match) return "";
    var subtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
    return "data:image/" + subtype + ";base64," + match[2];
  }

  function safeClass(value) {
    var parts = String(value || "").split(/\s+/);
    var out = [];
    for (var i = 0; i < parts.length && out.length < 24; i++) {
      if (/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(parts[i])) out.push(parts[i]);
    }
    return out.join(" ");
  }

  function safeStyle(value) {
    var text = decodeEntities(value);
    if (/[\\<>]|\/\*|\*\//.test(text)) return "";
    if (/url\s*\(|expression\s*\(|image-set\s*\(|javascript\s*:|@import|-moz-binding|behavior\s*:/i.test(text))
      return "";
    var decls = text.split(";");
    var out = [];
    for (var i = 0; i < decls.length && out.length < 32; i++) {
      var decl = decls[i].replace(/^\s+|\s+$/g, "");
      if (!decl) continue;
      var colon = decl.indexOf(":");
      if (colon < 1) continue;
      var prop = decl.slice(0, colon).replace(/^\s+|\s+$/g, "").toLowerCase();
      var cssValue = decl.slice(colon + 1).replace(/^\s+|\s+$/g, "");
      cssValue = cssValue.replace(/\s*!important\s*$/i, "").replace(/\s+$/g, "");
      if (!STYLE_PROPS[prop] || !cssValue || cssValue.length > 240) continue;
      if (!/^[#a-zA-Z0-9(),.%\s'"+-]+$/.test(cssValue)) continue;
      out.push(prop + ": " + cssValue);
    }
    return out.join("; ");
  }

  function allowedAttr(tag, name, value) {
    if (!name || name.indexOf("on") === 0) return null;
    if (name === "class") {
      var cls = safeClass(value);
      return cls ? { name: "class", value: cls } : null;
    }
    if (name === "title" || (name === "alt" && tag === "img")) {
      return { name: name, value: String(value).slice(0, 300) };
    }
    if (name === "style") {
      var style = safeStyle(value);
      return style ? { name: "style", value: style } : null;
    }
    if (name === "href" && tag === "a") {
      var href = safeUrl(value, "link");
      return href ? { name: "href", value: href } : null;
    }
    if (name === "cite" && (tag === "blockquote" || tag === "q")) {
      var cite = safeUrl(value, "link");
      return cite ? { name: "cite", value: cite } : null;
    }
    if (name === "src" && tag === "img") {
      var src = safeImageSrc(value);
      return src ? { name: "src", value: src } : null;
    }
    if ((name === "width" || name === "height") &&
        (tag === "img" || tag === "col" || tag === "td" || tag === "th" || tag === "table" || tag === "colgroup")) {
      return /^\d{1,4}$/.test(value) ? { name: name, value: value } : null;
    }
    if ((name === "colspan" || name === "rowspan") && (tag === "td" || tag === "th")) {
      return /^\d{1,3}$/.test(value) ? { name: name, value: value } : null;
    }
    if (name === "span" && (tag === "col" || tag === "colgroup")) {
      return /^\d{1,3}$/.test(value) ? { name: "span", value: value } : null;
    }
    if (name === "scope" && (tag === "td" || tag === "th")) {
      var scope = String(value).toLowerCase();
      if (scope === "row" || scope === "col" || scope === "rowgroup" || scope === "colgroup")
        return { name: "scope", value: scope };
      return null;
    }
    if (name === "start" && tag === "ol") {
      return /^\d{1,6}$/.test(value) ? { name: "start", value: value } : null;
    }
    if (name === "open" && tag === "details") return { name: "open", value: "open" };
    if (name === "align" && (tag === "td" || tag === "th" || tag === "tr" || tag === "table" || tag === "col")) {
      var align = String(value).toLowerCase();
      if (align === "left" || align === "right" || align === "center")
        return { name: "align", value: align };
    }
    return null;
  }

  function sanitizeAttrs(tag, raw) {
    var attrs = [];
    var i = 0;
    var n = raw.length;
    while (i < n) {
      while (i < n && /[\s/]/.test(raw.charAt(i))) i++;
      if (i >= n) break;
      if (!/[A-Za-z_:]/.test(raw.charAt(i))) { i++; continue; }
      var start = i;
      while (i < n && /[A-Za-z0-9_:-]/.test(raw.charAt(i))) i++;
      var name = raw.slice(start, i).toLowerCase();
      while (i < n && /\s/.test(raw.charAt(i))) i++;
      var value = "";
      if (raw.charAt(i) === "=") {
        i++;
        while (i < n && /\s/.test(raw.charAt(i))) i++;
        var quote = raw.charAt(i);
        if (quote === '"' || quote === "'") {
          i++;
          var valueStart = i;
          while (i < n && raw.charAt(i) !== quote) i++;
          value = raw.slice(valueStart, i);
          if (i < n) i++;
        } else {
          valueStart = i;
          while (i < n && !/[\s>]/.test(raw.charAt(i)) && raw.charAt(i) !== "/") i++;
          value = raw.slice(valueStart, i);
        }
      }
      var safe = allowedAttr(tag, name, decodeEntities(value));
      if (safe) attrs.push(" " + safe.name + '="' + escapeHtml(safe.value) + '"');
    }
    return attrs.join("");
  }

  function attrList(raw) {
    var attrs = [];
    var i = 0;
    var n = raw.length;
    while (i < n) {
      while (i < n && /[\s/]/.test(raw.charAt(i))) i++;
      if (i >= n) break;
      if (!/[A-Za-z_:]/.test(raw.charAt(i))) { i++; continue; }
      var start = i;
      while (i < n && /[A-Za-z0-9_:-]/.test(raw.charAt(i))) i++;
      var name = raw.slice(start, i).toLowerCase();
      while (i < n && /\s/.test(raw.charAt(i))) i++;
      var value = "";
      if (raw.charAt(i) === "=") {
        i++;
        while (i < n && /\s/.test(raw.charAt(i))) i++;
        var quote = raw.charAt(i);
        if (quote === '"' || quote === "'") {
          i++;
          var valueStart = i;
          while (i < n && raw.charAt(i) !== quote) i++;
          value = raw.slice(valueStart, i);
          if (i < n) i++;
        } else {
          valueStart = i;
          while (i < n && !/[\s>]/.test(raw.charAt(i)) && raw.charAt(i) !== "/") i++;
          value = raw.slice(valueStart, i);
        }
      }
      attrs.push({ name: name, value: value });
    }
    return attrs;
  }

  // GFM task lists. Only a disabled checkbox is kept, so the control cannot be edited.
  function checkboxInputHtml(raw) {
    var attrs = attrList(raw);
    var type = "";
    var checked = false;
    var disabled = false;
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name;
      if (name === "type") {
        if (type) return "";
        type = String(attrs[i].value || "").toLowerCase();
      } else if (name === "checked") checked = true;
      else if (name === "disabled") disabled = true;
      else return "";
    }
    if (type !== "checkbox" || !disabled) return "";
    return "<input disabled" + (checked ? " checked" : "") + ' type="checkbox">';
  }

  function sanitizeHtml(input) {
    var html = String(input || "");
    var out = [];
    var i = 0;
    var n = html.length;
    var skipUntil = "";
    var skipDepth = 0;

    while (i < n) {
      if (html.charAt(i) !== "<") {
        var next = html.indexOf("<", i);
        if (next < 0) next = n;
        if (!skipUntil) out.push(html.slice(i, next));
        i = next;
        continue;
      }
      if (html.slice(i, i + 4) === "<!--") {
        var commentEnd = html.indexOf("-->", i + 4);
        i = commentEnd < 0 ? n : commentEnd + 3;
        continue;
      }
      if (html.slice(i, i + 2) === "<!" || html.slice(i, i + 2) === "<?") {
        var declEnd = html.indexOf(">", i + 2);
        i = declEnd < 0 ? n : declEnd + 1;
        continue;
      }

      var closing = html.charAt(i + 1) === "/";
      var cursor = closing ? i + 2 : i + 1;
      while (cursor < n && /\s/.test(html.charAt(cursor))) cursor++;
      var nameStart = cursor;
      while (cursor < n && /[A-Za-z0-9]/.test(html.charAt(cursor))) cursor++;
      var tag = html.slice(nameStart, cursor).toLowerCase();
      if (!tag) {
        if (!skipUntil) out.push("&lt;");
        i += 1;
        continue;
      }

      var end = cursor;
      var quote = "";
      while (end < n) {
        var ch = html.charAt(end);
        if (quote) {
          if (ch === quote) quote = "";
          end++;
          continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; end++; continue; }
        if (ch === ">") break;
        end++;
      }
      if (end >= n) break;
      var rawAttrs = html.slice(cursor, end);
      var selfClose = /\/\s*$/.test(rawAttrs);
      i = end + 1;

      if (skipUntil) {
        if (!closing && tag === skipUntil && !selfClose) skipDepth++;
        else if (closing && tag === skipUntil) {
          if (skipDepth === 0) skipUntil = "";
          else skipDepth--;
        }
        continue;
      }
      if (tag === "br") {
        out.push("<br>");
        continue;
      }
      if (tag === "input") {
        if (!closing) {
          var box = checkboxInputHtml(rawAttrs);
          if (box) out.push(box);
        }
        continue;
      }
      if (closing) {
        if (ALLOWED[tag] && !VOID[tag]) out.push("</" + tag + ">");
        continue;
      }
      if (DROP_CONTENT[tag]) {
        if (!selfClose) { skipUntil = tag; skipDepth = 0; }
        continue;
      }
      if (!ALLOWED[tag]) continue;
      var attrs = sanitizeAttrs(tag, rawAttrs);
      if (VOID[tag]) out.push("<" + tag + attrs + ">");
      else if (selfClose) out.push("<" + tag + attrs + "></" + tag + ">");
      else out.push("<" + tag + attrs + ">");
    }
    return out.join("");
  }

  function rasterImageHtml(mime, data) {
    var subtype = mime === "image/jpeg" || mime === "image/jpg" ? "jpeg" : "png";
    var b64 = String(data || "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
      return '<div class="output-body html-out">[image omitted]</div>';
    }
    return '<div class="output-body html-out"><img alt="' + subtype +
      ' output" src="data:image/' + subtype + ";base64," + b64 + '"></div>';
  }

  // Text the browser shows for sanitized notebook HTML. Dropped elements such
  // as style, script, and svg contribute nothing, and entities are decoded.
  function visibleHtmlText(input) {
    var html = sanitizeHtml(input);
    var parts = [];
    var i = 0;
    var n = html.length;
    while (i < n) {
      if (html.charAt(i) !== "<") {
        var next = html.indexOf("<", i);
        if (next < 0) next = n;
        parts.push(decodeEntities(html.slice(i, next)));
        i = next;
        continue;
      }
      var end = html.indexOf(">", i);
      if (end < 0) {
        parts.push(decodeEntities(html.slice(i)));
        break;
      }
      i = end + 1;
    }
    return parts.join("");
  }

  function svgImageHtml(svg) {
    var text = String(svg || "");
    if (!text.replace(/^\s+|\s+$/g, "")) {
      return '<div class="output-body html-out">[svg omitted]</div>';
    }
    var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
    return '<div class="output-body html-out"><img alt="svg output" src="' +
      escapeHtml(url) + '"></div>';
  }

  return {
    escapeHtml: escapeHtml,
    safeHexColor: safeHexColor,
    safeUrl: safeUrl,
    sanitizeHtml: sanitizeHtml,
    visibleHtmlText: visibleHtmlText,
    rasterImageHtml: rasterImageHtml,
    svgImageHtml: svgImageHtml
  };
});
