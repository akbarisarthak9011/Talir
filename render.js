/* Tailr renderers: jsPDF (embedded Carlito font, black text, one column) and DOCX (same content). */
(function (root) {
  "use strict";
  var LY = root.TailrLayout || (typeof require === "function" ? require("./layout.js") : null);
  var E = root.TailrEngine || (typeof require === "function" ? require("./engine.js") : null);
  var clean = E.clean;

  function jsPDFCtor() {
    if (root.jspdf && root.jspdf.jsPDF) return root.jspdf.jsPDF;
    if (typeof require === "function") return require("jspdf").jsPDF;
    throw new Error("jsPDF not loaded");
  }

  /* fonts: { regular: binaryString, bold: binaryString } */
  var fontCache = null;
  function bufToBinary(buf) {
    var bytes = new Uint8Array(buf), out = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return out;
  }
  function loadFonts(base) {
    if (fontCache) return Promise.resolve(fontCache);
    base = base || "fonts/";
    return Promise.all(["Carlito-Regular.ttf", "Carlito-Bold.ttf"].map(function (f) {
      return fetch(base + f).then(function (r) { if (!r.ok) throw new Error("font " + f); return r.arrayBuffer(); });
    })).then(function (b) { fontCache = { regular: bufToBinary(b[0]), bold: bufToBinary(b[1]) }; return fontCache; });
  }
  function createDoc(fonts) {
    var J = jsPDFCtor();
    var doc = new J({ unit: "mm", format: "a4", compress: true });
    doc.addFileToVFS("Carlito-Regular.ttf", fonts.regular);
    doc.addFont("Carlito-Regular.ttf", "Carlito", "normal");
    doc.addFileToVFS("Carlito-Bold.ttf", fonts.bold);
    doc.addFont("Carlito-Bold.ttf", "Carlito", "bold");
    doc.setFont("Carlito", "normal");
    doc.setTextColor(0, 0, 0);
    return doc;
  }

  function drawLayout(doc, lay, meta) {
    meta = meta || {};
    doc.setProperties({ title: meta.title || "CV", author: meta.author || "", subject: meta.subject || "CV", creator: "Tailr" });
    lay.pages.forEach(function (page, pi) {
      if (pi > 0) doc.addPage();
      page.forEach(function (pb) {
        var b = pb.b;
        b.ops.forEach(function (o) {
          doc.setFont("Carlito", o.style); doc.setFontSize(o.size); doc.setTextColor(0, 0, 0);
          doc.text(o.t, o.x, pb.y + o.dy, o.align === "right" ? { align: "right" } : undefined);
        });
        if (b.rule) { doc.setDrawColor(110, 110, 110); doc.setLineWidth(0.25); doc.line(lay.settings.margin, pb.y + b.rule.dy, LY.PAGE.w - lay.settings.margin, pb.y + b.rule.dy); }
      });
    });
    return doc;
  }

  /* Full PDF pipeline: fit to the page limit, then draw. Returns { bytes (ArrayBuffer), fit } */
  function buildPdf(fonts, cv, opts) {
    var measure = createDoc(fonts);
    var f = LY.fit(measure, cv, opts);
    var doc = createDoc(fonts);
    drawLayout(doc, f.layout, { title: clean(cv.name) + " – CV", author: clean(cv.name), subject: opts.subject || "CV" });
    return { bytes: doc.output("arraybuffer"), fit: f };
  }

  /* ---------- DOCX ---------- */
  function docxLib() {
    if (root.docx) return root.docx;
    if (typeof require === "function") return require("docx");
    throw new Error("docx not loaded");
  }
  /* settings: the fitted settings from the PDF so both files have the same look. */
  function buildDocx(cv, lang, settings) {
    var D = docxLib();
    var s = settings || LY.BASE;
    var H = LY.HEADINGS[lang] || LY.HEADINGS.en;
    var mmTw = function (mm) { return Math.round(mm * 56.6929); };
    var hp = function (pt) { return Math.round(pt * 2); };
    var font = "Calibri";
    var lineRule = Math.round(240 * Math.min(1.15, s.lf || 1.15) / 1.15);
    var kids = [];
    var rightTab = [{ type: D.TabStopType.RIGHT, position: mmTw(210 - 2 * s.margin) }];
    function run(t, o) { return new D.TextRun(Object.assign({ text: t, font: font, size: hp(s.body), color: "000000" }, o || {})); }
    function p(children, o) { kids.push(new D.Paragraph(Object.assign({ children: children, spacing: { after: 20, line: lineRule } }, o || {}))); }
    p([run(clean(cv.name), { bold: true, size: hp(s.name) })], { spacing: { after: 40 } });
    if (clean(cv.headline)) p([run(clean(cv.headline), { size: hp(s.headline) })]);
    var c = cv.contact || {};
    var items = [c.phone, c.email, c.location, c.linkedin, c.portfolio].map(clean).filter(Boolean);
    if (items.length) p([run(items.join(" | "))], { spacing: { after: 60 } });
    function heading(key) {
      p([run(H[key], { bold: true, size: hp(s.head) })], { spacing: { before: Math.round(s.secGap * 40), after: 60 }, border: { bottom: { color: "6E6E6E", space: 1, style: D.BorderStyle.SINGLE, size: 4 } }, keepNext: true });
    }
    function entry(left, right) { p([run(clean(left), { bold: true })].concat(right ? [run("\t" + clean(right))] : []), { tabStops: rightTab, keepNext: true, spacing: { before: 60, after: 0 } }); }
    function sub(t) { p([run(clean(t))], { keepNext: true, spacing: { after: 20 } }); }
    function bullet(t) { p([run(clean(t))], { bullet: { level: 0 }, spacing: { after: 20 } }); }
    LY.sectionOrder(cv).forEach(function (key) {
      heading(key);
      if (key === "summary") p([run(clean(cv.summary))]);
      if (key === "skills") cv.skills.forEach(function (g) { p([run(clean(g.label) + ": ", { bold: true }), run(clean(g.items))]); });
      if (key === "experience") cv.experience.forEach(function (r) {
        entry(r.title, r.dates);
        var st = [r.company, r.location].map(clean).filter(Boolean).join(", ");
        if (st) sub(st);
        r.bullets.forEach(bullet);
      });
      if (key === "projects") cv.projects.forEach(function (pr) { entry(pr.name, pr.dates); if (clean(pr.tech)) sub(pr.tech); pr.bullets.forEach(bullet); });
      if (key === "education") cv.education.forEach(function (e) {
        entry(e.degree, e.dates);
        var st = [e.school, e.location].map(clean).filter(Boolean).join(", ");
        if (st) sub(st);
        if (clean(e.details)) p([run(clean(e.details))]);
      });
      if (key === "certifications") cv.certifications.forEach(bullet);
      if (key === "languages") p([run(cv.languages.map(function (l) { return clean(l.language) + (clean(l.level) ? " (" + clean(l.level) + ")" : ""); }).join(", "))]);
    });
    var doc = new D.Document({
      creator: "Tailr", title: clean(cv.name) + " – CV",
      styles: { default: { document: { run: { font: font, size: hp(s.body), color: "000000" } } } },
      sections: [{ properties: { page: { size: { width: mmTw(210), height: mmTw(297) }, margin: { top: mmTw(s.margin), bottom: mmTw(s.margin), left: mmTw(s.margin), right: mmTw(s.margin) } } }, children: kids }]
    });
    return D.Packer.toBlob ? D.Packer.toBlob(doc) : D.Packer.toBuffer(doc);
  }

  /* File name: Firstname_Lastname_<Company>_<Role> */
  function fileBase(cv, target) {
    function part(s) {
      return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\((?:h\/f|f\/h|m\/f|f\/m)\)/ig, "")
        .replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean)
        .map(function (w) { return w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) && w.length > 4 ? w.charAt(0) + w.slice(1).toLowerCase() : w; }).join("_");
    }
    var name = part(cv.name).split("_").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join("_");
    var role = part(target && target.role).split("_").slice(0, 6).join("_");
    return [name || "CV", part(target && target.company), role].filter(Boolean).join("_").slice(0, 110);
  }

  var api = { loadFonts: loadFonts, createDoc: createDoc, drawLayout: drawLayout, buildPdf: buildPdf, buildDocx: buildDocx, fileBase: fileBase, bufToBinary: bufToBinary,
    _setFonts: function (f) { fontCache = f; } };
  root.TailrRender = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
