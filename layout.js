/* Tailr CV layout: one column, standard headings, wrap once, fit to the page limit.
   Text is stored as single-line strings; it is wrapped exactly once here, with
   doc.splitTextToSize(), and the returned lines are drawn as they are. */
(function (root) {
  "use strict";
  var E = root.TailrEngine || (typeof require === "function" ? require("./engine.js") : null);
  var norm = E.norm, clean = E.clean;
  var NBSP = " ";
  var PT = 0.352778; // mm per point
  var PAGE = { w: 210, h: 297 };

  var HEADINGS = {
    en: { summary: "Professional Summary", skills: "Skills", experience: "Professional Experience", projects: "Projects", education: "Education", certifications: "Certifications", languages: "Languages" },
    fr: { summary: "Profil professionnel", skills: "Compétences", experience: "Expérience professionnelle", projects: "Projets", education: "Formation", certifications: "Certifications", languages: "Langues" }
  };

  /* Base look and the order in which space is reclaimed: spacing -> margins (min 12 mm) -> font size (min 9.5 pt). */
  var BASE = { body: 10.5, head: 11.5, name: 18, headline: 11, margin: 16, lf: 1.2, secGap: 4.2, itemGap: 2.0, paraGap: 0.8 };
  var LADDER = [
    { step: "spacing", lf: 1.15, secGap: 3.4, itemGap: 1.5, paraGap: 0.6 },
    { step: "spacing", lf: 1.1, secGap: 2.8, itemGap: 1.0, paraGap: 0.4 },
    { step: "margins", margin: 14 },
    { step: "margins", margin: 12 },
    { step: "font", body: 10, head: 11, name: 17, headline: 10.5 },
    { step: "font", body: 9.5, head: 11, name: 16, headline: 10 }
  ];
  var MIN = { margin: 12, body: 9.5 };

  function sectionOrder(cv) {
    var noExp = !(cv.experience || []).length;
    var order = ["summary", "skills"];
    if (noExp) order.push("education");
    order.push("experience", "projects");
    if (!noExp) order.push("education");
    order.push("certifications", "languages");
    return order.filter(function (k) {
      var v = cv[k];
      return Array.isArray(v) ? v.length > 0 : !!clean(v);
    });
  }

  /* ---------- wrapping ---------- */
  var DANGLE_RE = new RegExp("(^|[\\s" + NBSP + "])(" + E.DANGLING.filter(function (w) { return /^[a-zà-ÿ']+$/i.test(w); }).map(E.esc).join("|") + ") (?=\\S)", "gi");
  /* Keep things together that must not be split: multi-word keywords, a word and the number after
     it ("CGPA 7.84"), and short words that must not end a line ("I", "to", "the", "de"...). */
  function protect(text, phrases) {
    var t = clean(text);
    if (phrases && phrases.length) {
      var n = norm(t);
      if (n.length === t.length) {
        var arr = t.split("");
        phrases.forEach(function (p) {
          var np = norm(p).trim();
          if (np.indexOf(" ") < 0 || np.length > 40) return;
          var from = 0, i;
          while ((i = n.indexOf(np, from)) >= 0) {
            var before = i === 0 || /[^a-z0-9]/.test(n[i - 1]), after = i + np.length >= n.length || /[^a-z0-9]/.test(n[i + np.length]);
            if (before && after) for (var j = i; j < i + np.length; j++) if (arr[j] === " ") arr[j] = NBSP;
            from = i + np.length;
          }
        });
        t = arr.join("");
      }
    }
    t = t.replace(/(\S{1,8}) (?=[+-]?\d)/g, function (m, w) { return /[.,;:]$/.test(w) ? m : w + NBSP; });
    for (var k = 0; k < 3; k++) t = t.replace(DANGLE_RE, function (m, pre, w) { return pre + w + NBSP; });
    return t;
  }
  function wrap(doc, text, maxW, opts) {
    opts = opts || {};
    var t = protect(text, opts.phrases);
    // a protected group that is wider than the column cannot stay together: release it
    t = t.split(" ").map(function (tok) {
      if (tok.indexOf(NBSP) < 0 || doc.getTextWidth(tok) <= maxW - (opts.textIndent || 0)) return tok;
      var dang = tok.replace(new RegExp("(^|" + NBSP + ")(" + E.DANGLING.filter(function (w) { return /^[a-zà-ÿ']+$/i.test(w); }).map(E.esc).join("|") + ")" + NBSP, "gi"), "$1$2 ");
      return dang.split(" ").every(function (x) { return doc.getTextWidth(x) <= maxW - (opts.textIndent || 0); }) ? dang : tok.split(NBSP).join(" ");
    }).join(" ");
    var lines = doc.splitTextToSize(t, maxW, opts.textIndent ? { textIndent: opts.textIndent } : undefined);
    return lines.map(function (l) { return l.split(NBSP).join(" ").replace(/\s+$/, ""); });
  }

  /* ---------- blocks ---------- */
  function lh(size, s) { return size * PT * s.lf; }
  function setF(doc, style, size) { doc.setFont("Carlito", style); doc.setFontSize(size); }

  /* Builds measured blocks (atomic pieces that are not split across pages). */
  function buildBlocks(doc, cv, s, lang, phrases) {
    var H = HEADINGS[lang] || HEADINGS.en;
    var x0 = s.margin, W = PAGE.w - 2 * s.margin;
    var blocks = [];
    function add(b) { blocks.push(b); return b; }
    function textLines(style, size, txt, maxW, extra) { setF(doc, style, size); return wrap(doc, txt, maxW, Object.assign({ phrases: phrases }, extra || {})); }

    // name, headline, contact
    var nameLines = textLines("bold", s.name, cv.name, W);
    add({ kind: "name", h: nameLines.length * lh(s.name, s) , ops: nameLines.map(function (l, i) { return { t: l, x: x0, dy: (i + 0.8) * lh(s.name, s), style: "bold", size: s.name }; }) });
    if (clean(cv.headline)) {
      var hl = textLines("normal", s.headline, cv.headline, W);
      add({ kind: "headline", h: hl.length * lh(s.headline, s), ops: hl.map(function (l, i) { return { t: l, x: x0, dy: (i + 0.8) * lh(s.headline, s), style: "normal", size: s.headline }; }) });
    }
    var c = cv.contact || {};
    var items = [c.phone, c.email, c.location, c.linkedin, c.portfolio].map(clean).filter(Boolean).map(function (it) { return it.replace(/ /g, NBSP); });
    if (items.length) {
      setF(doc, "normal", s.body);
      var cl = doc.splitTextToSize(items.join(" | "), W).map(function (l) { return l.split(NBSP).join(" "); });
      add({ kind: "contact", h: cl.length * lh(s.body, s) + s.itemGap, ops: cl.map(function (l, i) { return { t: l, x: x0, dy: (i + 0.8) * lh(s.body, s), style: "normal", size: s.body }; }) });
    }

    function heading(key) {
      add({ kind: "heading", keep: true, h: s.secGap + lh(s.head, s) + 1.2, ops: [{ t: H[key], x: x0, dy: s.secGap + 0.8 * lh(s.head, s), style: "bold", size: s.head }], rule: { dy: s.secGap + lh(s.head, s) + 0.2 } });
    }
    function para(txt, ref, gapAfter) {
      var ls = textLines("normal", s.body, txt, W);
      return add({ kind: "para", ref: ref, h: ls.length * lh(s.body, s) + (gapAfter || 0), ops: ls.map(function (l, i) { return { t: l, x: x0, dy: (i + 0.8) * lh(s.body, s), style: "normal", size: s.body }; }) });
    }
    function bullet(txt, ref) {
      var ind = 4;
      var ls = textLines("normal", s.body, txt, W - ind);
      var ops = [{ t: "•", x: x0 + 0.8, dy: 0.8 * lh(s.body, s), style: "normal", size: s.body }];
      ls.forEach(function (l, i) { ops.push({ t: l, x: x0 + ind, dy: (i + 0.8) * lh(s.body, s), style: "normal", size: s.body }); });
      return add({ kind: "bullet", ref: ref, h: ls.length * lh(s.body, s) + s.paraGap, ops: ops, lines: ls });
    }
    function entryHead(left, right, ref, first) {
      setF(doc, "normal", s.body);
      var rw = right ? doc.getTextWidth(right) : 0;
      var ls = textLines("bold", s.body, left, W - (rw ? rw + 4 : 0));
      var top = first ? 0.6 : s.itemGap;
      var ops = ls.map(function (l, i) { return { t: l, x: x0, dy: top + (i + 0.8) * lh(s.body, s), style: "bold", size: s.body }; });
      if (right) ops.push({ t: right, x: x0 + W, dy: top + 0.8 * lh(s.body, s), style: "normal", size: s.body, align: "right" });
      return add({ kind: "entryHead", keep: true, ref: ref, h: top + ls.length * lh(s.body, s), ops: ops });
    }
    function entrySub(txt, ref) {
      var ls = textLines("normal", s.body, txt, W);
      return add({ kind: "entrySub", keep: true, ref: ref, h: ls.length * lh(s.body, s), ops: ls.map(function (l, i) { return { t: l, x: x0, dy: (i + 0.8) * lh(s.body, s), style: "normal", size: s.body }; }) });
    }

    sectionOrder(cv).forEach(function (key) {
      heading(key);
      if (key === "summary") para(cv.summary, { sec: "summary" });
      if (key === "skills") cv.skills.forEach(function (g, gi) {
        var lab = clean(g.label) + ": ";
        setF(doc, "bold", s.body);
        var lw = doc.getTextWidth(lab);
        var ls = textLines("normal", s.body, g.items, W, { textIndent: lw });
        var ops = [{ t: lab.trim(), x: x0, dy: 0.8 * lh(s.body, s), style: "bold", size: s.body }];
        ls.forEach(function (l, i) { ops.push({ t: l, x: i ? x0 : x0 + lw, dy: (i + 0.8) * lh(s.body, s), style: "normal", size: s.body }); });
        add({ kind: "skill", ref: { sec: "skills", i: gi }, h: ls.length * lh(s.body, s) + s.paraGap, ops: ops });
      });
      if (key === "experience") cv.experience.forEach(function (r, ri) {
        entryHead(r.title, r.dates, { sec: "experience", i: ri }, ri === 0);
        var sub = [r.company, r.location].map(clean).filter(Boolean).join(", ");
        if (sub) entrySub(sub, { sec: "experience", i: ri });
        r.bullets.forEach(function (b, bi) { bullet(b, { sec: "experience", i: ri, j: bi }); });
      });
      if (key === "projects") cv.projects.forEach(function (p, pi) {
        entryHead(p.name, p.dates, { sec: "projects", i: pi }, pi === 0);
        if (clean(p.tech)) entrySub(p.tech, { sec: "projects", i: pi });
        p.bullets.forEach(function (b, bi) { bullet(b, { sec: "projects", i: pi, j: bi }); });
      });
      if (key === "education") cv.education.forEach(function (e, ei) {
        entryHead(e.degree, e.dates, { sec: "education", i: ei }, ei === 0);
        var sub = [e.school, e.location].map(clean).filter(Boolean).join(", ");
        if (sub) entrySub(sub, { sec: "education", i: ei });
        if (clean(e.details)) para(e.details, { sec: "education", i: ei });
      });
      if (key === "certifications") cv.certifications.forEach(function (ct, ci) { bullet(ct, { sec: "certifications", i: ci }); });
      if (key === "languages") para(cv.languages.map(function (l) { return clean(l.language) + (clean(l.level) ? " (" + clean(l.level) + ")" : ""); }).join(", "), { sec: "languages" });
    });
    return blocks;
  }

  /* Places blocks on pages. A heading or entry header always stays with the block after it. */
  function paginate(blocks, s) {
    var bottom = PAGE.h - s.margin;
    var pages = [[]], y = s.margin;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var need = b.h, j = i;
      while (blocks[j] && blocks[j].keep && blocks[j + 1]) { j++; need += blocks[j].h; }
      if (y + need > bottom && pages[pages.length - 1].length) { pages.push([]); y = s.margin; }
      pages[pages.length - 1].push({ b: b, y: y });
      y += b.h;
    }
    return { pages: pages, lastY: y, bottom: bottom };
  }

  function layout(doc, cv, s, lang, phrases) {
    var blocks = buildBlocks(doc, cv, s, lang, phrases);
    var p = paginate(blocks, s);
    return { settings: s, blocks: blocks, pages: p.pages, pageCount: p.pages.length, lastY: p.lastY, bottom: p.bottom, overflowMm: p.pages.length > 1 ? (p.pages.length - 1) * (p.bottom - s.margin) + (p.lastY - s.margin) - (p.bottom - s.margin) : 0 };
  }

  /* Fit loop: try the base look, then each ladder step, then shorten bullets until it fits.
     shorten(cv, info) returns a new, shorter cv or null when nothing more can be cut. */
  function fit(doc, cv, opts) {
    opts = opts || {};
    var limit = opts.pageLimit || 1, lang = opts.lang || "en", phrases = opts.phrases || [];
    var s = Object.assign({}, BASE), steps = [];
    var res = layout(doc, cv, s, lang, phrases);
    for (var i = 0; i < LADDER.length && res.pageCount > limit; i++) {
      s = Object.assign({}, s, LADDER[i]);
      s.margin = Math.max(s.margin, MIN.margin); s.body = Math.max(s.body, MIN.body);
      steps.push(LADDER[i].step);
      res = layout(doc, cv, s, lang, phrases);
    }
    var shortened = 0;
    while (res.pageCount > limit && opts.shorten && shortened < 40) {
      var next = opts.shorten(cv, { overflowMm: res.overflowMm, round: shortened });
      if (!next) break;
      cv = next; shortened++;
      if (steps[steps.length - 1] !== "shorten") steps.push("shorten");
      res = layout(doc, cv, s, lang, phrases);
    }
    return { cv: cv, layout: res, settings: s, steps: steps, fits: res.pageCount <= limit, shortenRounds: shortened };
  }

  /* Deterministic shortening (no AI): remove the lowest-priority bullet, never leaving a role or
     project with fewer than one bullet. priority(text) -> number (lower is cut first). */
  function dropLowestBullet(cv, priority) {
    var cands = [];
    ["experience", "projects"].forEach(function (sec) {
      (cv[sec] || []).forEach(function (r, i) {
        if (r.bullets.length <= 1) return;
        r.bullets.forEach(function (b, j) { if (j === 0) return; cands.push({ sec: sec, i: i, j: j, p: priority(b) - (sec === "projects" ? 0.5 : 0) - j * 0.01 + i * -0.05, text: b }); });
      });
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return a.p - b.p; });
    var c = cands[0];
    var next = JSON.parse(JSON.stringify(cv));
    next[c.sec][c.i].bullets.splice(c.j, 1);
    next._dropped = (cv._dropped || []).concat([{ sec: c.sec, i: c.i, text: c.text }]);
    return next;
  }

  /* Page limit: 1 page, or 2 for candidates with 10+ years of experience. */
  function pageLimit(years) { return years >= 10 ? 2 : 1; }

  var api = { HEADINGS: HEADINGS, BASE: BASE, LADDER: LADDER, MIN: MIN, PAGE: PAGE, sectionOrder: sectionOrder, protect: protect, wrap: wrap,
    buildBlocks: buildBlocks, layout: layout, fit: fit, dropLowestBullet: dropLowestBullet, pageLimit: pageLimit, NBSP: NBSP };
  root.TailrLayout = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
