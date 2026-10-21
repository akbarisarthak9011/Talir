/* Tailr ATS self-check: reads the generated PDF back with pdf.js, like an applicant tracking
   system would, and checks the result. Downloads stay blocked until every critical check passes. */
(function (root) {
  "use strict";
  var E = root.TailrEngine || (typeof require === "function" ? require("./engine.js") : null);
  var norm = E.norm, clean = E.clean;
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var PHONE_RE = /^\+?\d[\d ().-]{6,}\d$/;

  /* Lines of text per page, in reading order. */
  function extractLines(pdfjs, bytes) {
    var data = new Uint8Array(bytes.slice ? bytes.slice(0) : bytes);
    return pdfjs.getDocument({ data: data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise.then(function (pdf) {
      var jobs = [];
      for (var p = 1; p <= pdf.numPages; p++) jobs.push(pdf.getPage(p).then(function (pg) { return pg.getTextContent(); }));
      return Promise.all(jobs).then(function (contents) {
        return contents.map(function (tc) {
          var rows = [];
          tc.items.forEach(function (it) {
            if (typeof it.str !== "string" || !it.str.trim()) return;
            var y = it.transform[5], x = it.transform[4];
            var row = rows.filter(function (r) { return Math.abs(r.y - y) < 1.5; })[0];
            if (!row) { row = { y: y, items: [] }; rows.push(row); }
            row.items.push({ x: x, s: it.str });
          });
          rows.sort(function (a, b) { return b.y - a.y; });
          return rows.map(function (r) { return clean(r.items.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join(" ")); });
        });
      });
    });
  }

  /* expect: { pageLimit, headings[], name, email, phone, keywords[] (labels the candidate truly has), forbidden[] } */
  function runChecks(pages, expect) {
    var lines = [].concat.apply([], pages);
    var nl = lines.map(norm);
    var all = nl.join(" ");
    var checks = [];
    function add(id, pass, critical, detail) { checks.push({ id: id, pass: !!pass, critical: !!critical, detail: detail || "" }); }

    add("readable", lines.length > 3 && expect.name && all.indexOf(norm(expect.name)) >= 0, true, lines.length ? "" : "no text");
    add("pages", pages.length <= expect.pageLimit, true, pages.length + "/" + expect.pageLimit);
    var missingH = (expect.headings || []).filter(function (h) { return nl.indexOf(norm(h)) < 0; });
    add("headings", !missingH.length, true, missingH.join(", "));
    var emailTok = all.split(/[\s|]+/).filter(function (t) { return /@/.test(t); })[0] || "";
    add("email", expect.email && EMAIL_RE.test(expect.email) && norm(emailTok) === norm(expect.email), true, expect.email ? "" : "missing");
    if (expect.phone) {
      var digits = expect.phone.replace(/\D/g, "");
      var found = lines.some(function (l) { return l.split("|").some(function (part) { part = clean(part); return PHONE_RE.test(part) && part.replace(/\D/g, "") === digits; }); });
      add("phone", found, true, "");
    } else add("phone", false, false, "missing");
    var skip = {}; (expect.headings || []).forEach(function (h) { skip[norm(h)] = 1; });
    var dangling = lines.filter(function (l, i) { return !skip[nl[i]] && E.endsDangling(l); });
    add("dangling", !dangling.length, true, dangling.slice(0, 3).join(" / "));
    var split = [], lost = [];
    (expect.keywords || []).forEach(function (k) {
      var nk = norm(k).trim();
      if (!nk) return;
      var inLine = nl.some(function (l) { return l.indexOf(nk) >= 0; });
      if (inLine) return;
      if (nk.indexOf(" ") >= 0 && all.indexOf(nk) >= 0) split.push(k); else lost.push(k);
    });
    add("split", !split.length, true, split.join(", "));
    add("keywords", !lost.length, true, lost.join(", "));
    var bad = (expect.forbidden || []).filter(function (f) { return f && all.indexOf(norm(f)) >= 0; });
    add("stale", !bad.length, true, bad.join(", "));
    return { checks: checks, lines: lines, pass: checks.every(function (c) { return c.pass || !c.critical; }) };
  }

  function check(pdfjs, bytes, expect) {
    return extractLines(pdfjs, bytes).then(function (pages) { return Object.assign(runChecks(pages, expect), { pages: pages }); });
  }

  var api = { extractLines: extractLines, runChecks: runChecks, check: check };
  root.TailrAts = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
