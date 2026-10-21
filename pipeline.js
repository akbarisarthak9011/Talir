/* Tailr pipeline: tailor -> validate (retry once, then repair) -> fit the page -> PDF -> ATS check.
   Shared by the website and the unit tests. */
(function (root) {
  "use strict";
  var req = function (n) { return typeof require === "function" ? require(n) : null; };
  var E = root.TailrEngine || req("./engine.js");
  var PA = root.TailrParse || req("./parse.js");
  var T = root.TailrTailor || req("./tailor.js");
  var V = root.TailrValidate || req("./validate.js");
  var LY = root.TailrLayout || req("./layout.js");
  var R = root.TailrRender || req("./render.js");
  var A = root.TailrAts || req("./atscheck.js");
  var norm = E.norm, clean = E.clean;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Keywords the candidate truly has, as they are written in the final CV (for the ATS check). */
  function keywordsInCv(cv, kws) {
    var text = norm(V.cvStrings(cv).filter(function (s) { return !/\.label$/.test(s.path); }).map(function (s) { return s.text; }).join("\n"));
    var out = [];
    kws.forEach(function (k) {
      if (!T.truly(k) || k.bucket !== "must" || k.t === "l") return;
      for (var i = 0; i < k.a.length; i++) {
        var re = E.aliasRe(k.a[i]); re.lastIndex = 0;
        var m = re.exec(text);
        if (m) { out.push(m[0]); return; }
      }
    });
    return out;
  }
  function headingsFor(cv, lang) {
    var H = LY.HEADINGS[lang] || LY.HEADINGS.en;
    return LY.sectionOrder(cv).map(function (k) { return H[k]; });
  }

  /* Ask the AI, validate, retry once with the errors, then repair what is still wrong. */
  function aiTailor(ai, master, job, rules, ctx) {
    var vopts = { job: job, keywords: rules.meta.keywords, previousCompanies: ctx.previousCompanies };
    var log = [];
    return ai.tailor(master, job, []).then(function (out) {
      var v = V.validateOutput(out, master, vopts);
      log.push({ attempt: 1, errors: v.errors.length });
      if (v.ok) return { out: out, v: v, log: log };
      var feedback = v.errors.slice(0, 15).map(function (e) { return e.path + ": " + e.msg; });
      return ai.tailor(master, job, feedback).then(function (out2) {
        var v2 = V.validateOutput(out2, master, vopts);
        log.push({ attempt: 2, errors: v2.errors.length });
        if (v2.ok) return { out: out2, v: v2, log: log };
        var base = v2.errors.some(function (e) { return e.code === "E_SCHEMA"; }) && !v.errors.some(function (e) { return e.code === "E_SCHEMA"; }) ? { o: out, e: v.errors } : { o: out2, e: v2.errors };
        var rep = V.repairOutput(base.o, master, rules, base.e);
        var v3 = V.validateOutput(rep.output, master, vopts);
        log.push({ attempt: "repair", errors: v3.errors.length, repaired: rep.repaired });
        if (v3.ok) return { out: rep.output, v: v3, log: log, repaired: rep.repaired };
        throw Object.assign(new Error("AI output failed validation"), { code: "invalid", log: log });
      }, function (e2) {
        var rep = V.repairOutput(out, master, rules, v.errors);
        var v3 = V.validateOutput(rep.output, master, vopts);
        log.push({ attempt: "repair", errors: v3.errors.length });
        if (v3.ok) return { out: rep.output, v: v3, log: log, repaired: rep.repaired };
        throw e2;
      });
    });
  }

  /* AI shortening of the lowest-priority bullets; every shortened bullet is checked. */
  function aiShorten(ai, cv, master, kws, max) {
    var cands = [];
    ["experience", "projects"].forEach(function (sec) { cv[sec].forEach(function (r, i) { r.bullets.forEach(function (b, j) { if (b.length > 80) cands.push({ id: sec + ":" + i + ":" + j, text: b, p: T.bulletPriority(b, kws) }); }); }); });
    cands.sort(function (a, b) { return a.p - b.p || b.text.length - a.text.length; });
    cands = cands.slice(0, max || 6);
    if (!cands.length) return Promise.resolve(null);
    return ai.shorten(cands.map(function (c) { return { id: c.id, text: c.text }; })).then(function (res) {
      var next = clone(cv), changed = 0;
      var mNums = {}; E.numbersIn(PA.masterText(master)).forEach(function (n) { mNums[n] = 1; });
      (res && res.bullets || []).forEach(function (b) {
        var c = cands.filter(function (x) { return x.id === b.id; })[0];
        if (!c) return;
        var t = clean(b.text);
        var origNums = {}; E.numbersIn(c.text).forEach(function (n) { origNums[n] = 1; });
        var ok = t && t.length < c.text.length && !E.endsDangling(t) && E.numbersIn(t).every(function (n) { return origNums[n]; })
          && (root.TAILR_SKILLS || req("./skills.js").skills).every(function (sk) { return !E.hasSkill(norm(t), sk) || E.hasSkill(norm(c.text), sk); });
        if (!ok) return;
        var p = c.id.split(":");
        next[p[0]][+p[1]].bullets[+p[2]] = t; changed++;
      });
      return changed ? next : null;
    }).catch(function () { return null; });
  }

  /* ctx: { master, baseMaster, job, ai (or null), fonts, pdfjs, now, uiLang, outLang, previousCompanies } */
  function run(ctx) {
    var now = ctx.now || new Date();
    var master = PA.normalizeMaster(clone(ctx.master));
    var job = ctx.job;
    var outLang = ctx.outLang || job.lang;
    var rules = T.tailorRules(master, job, { lang: outLang, uiLang: ctx.uiLang, now: now, baseMaster: ctx.baseMaster });
    var notes = [];
    var engineUsed = "rules";
    var step = ctx.ai ? aiTailor(ctx.ai, master, job, rules, ctx).then(function (r) {
      engineUsed = ctx.ai.name;
      if (r.repaired && r.repaired.length) notes.push("repaired");
      return r.out;
    }, function (e) { notes.push("ai_failed:" + (e && (e.code || e.message) || "error")); return rules.output; }) : Promise.resolve(rules.output);

    return step.then(function (out) {
      out = clone(out);
      out.target = clone(rules.output.target);
      // the report is always computed in code from the final CV; the AI's own figures are not trusted
      out.report = clone(rules.output.report);
      var years = PA.yearsOfExperience(master, now);
      var limit = LY.pageLimit(years);
      var kws = rules.meta.keywords;
      var phrases = kws.map(function (k) { return T.jdLabel(k, outLang); }).concat(kws.map(function (k) { return k.spelled || ""; }));
      var measure = R.createDoc(ctx.fonts);
      var opts = { pageLimit: limit, lang: outLang, phrases: phrases };
      var f = LY.fit(measure, out.cv, opts);
      var afterAi = f.fits || !ctx.ai || !ctx.ai.shorten ? Promise.resolve(null) : aiShorten(ctx.ai, out.cv, master, kws, 6);
      return afterAi.then(function (shorter) {
        if (shorter) { out.cv = shorter; notes.push("ai_shortened"); }
        opts.shorten = function (cv) { return LY.dropLowestBullet(cv, function (b) { return T.bulletPriority(b, kws); }); };
        f = LY.fit(measure, out.cv, opts);
        var dropped = (f.cv._dropped || []).map(function (d) { return d.text; });
        delete f.cv._dropped;
        out.cv = f.cv;
        var v = V.validateOutput(out, master, { job: job, keywords: kws, previousCompanies: ctx.previousCompanies });
        var doc = R.createDoc(ctx.fonts);
        R.drawLayout(doc, f.layout, { title: clean(out.cv.name) + " – CV", author: clean(out.cv.name), subject: [job.target.role, job.target.company].filter(Boolean).join(" – ") });
        var bytes = doc.output("arraybuffer");
        var forbidden = (ctx.previousCompanies || []).filter(function (c) { return c && norm(c) !== norm(job.target.company) && norm(PA.masterText(master)).indexOf(norm(c)) < 0; });
        var expect = { pageLimit: limit, headings: headingsFor(out.cv, outLang), name: out.cv.name, email: out.cv.contact.email, phone: out.cv.contact.phone, keywords: keywordsInCv(out.cv, kws), forbidden: forbidden };
        return A.check(ctx.pdfjs, bytes, expect).then(function (ats) {
          return { output: out, meta: rules.meta, validation: v, fit: f, pdfBytes: bytes, ats: ats, engineUsed: engineUsed, notes: notes, pageLimit: limit, droppedByFit: dropped, lang: outLang };
        });
      });
    });
  }

  var api = { run: run, aiTailor: aiTailor, aiShorten: aiShorten, keywordsInCv: keywordsInCv, headingsFor: headingsFor };
  root.TailrPipeline = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
