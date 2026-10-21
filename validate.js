/* Tailr output validation. The AI is never trusted: every tailored CV (AI or rules) goes through
   validateOutput() before it is shown, and repairOutput() replaces anything that breaks a rule with
   facts from the master CV. */
(function (root) {
  "use strict";
  var E = root.TailrEngine || (typeof require === "function" ? require("./engine.js") : null);
  var PA = root.TailrParse || (typeof require === "function" ? require("./parse.js") : null);
  var T = root.TailrTailor || (typeof require === "function" ? require("./tailor.js") : null);
  var V = root.TailrSchemaValidate || (typeof require === "function" ? require("./schema-validate.js") : null);
  var PH = root.TailrPhone || (typeof require === "function" ? require("./phone.js") : null);
  var SKM = function () { return root.TAILR_SKILLS || require("./skills.js").skills; };
  var norm = E.norm, clean = E.clean;
  var MAX_KEYWORD_USES = 4;

  function same(a, b) { return clean(a) === clean(b); }
  function err(list, code, path, msg, extra) { list.push(Object.assign({ code: code, path: path, msg: msg }, extra || {})); }

  /* Every string in the CV part of the output, with its path. */
  function cvStrings(cv) {
    var out = [];
    function walk(v, p) {
      if (typeof v === "string") out.push({ path: p, text: v });
      else if (Array.isArray(v)) v.forEach(function (x, i) { walk(x, p + "[" + i + "]"); });
      else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { walk(v[k], p ? p + "." + k : k); });
    }
    walk(cv, "cv");
    return out;
  }

  /* Count how often each job keyword is used across the CV (skills items count once each). */
  function keywordUses(cv, keywords) {
    var text = norm(cvStrings(cv).filter(function (s) { return !/\.contact\.|^cv\.name$|\.label$|\.dates$/.test(s.path); }).map(function (s) { return s.text; }).join("\n"));
    var uses = {};
    keywords.forEach(function (k) { if (k.t !== "l") uses[k.key] = E.countSkill(text, k); });
    return uses;
  }

  function masterSupports(item, master, extraSkills) {
    var n = norm(item).trim();
    if (!n) return false;
    var mt = norm(PA.masterText(master));
    if ((master.skills || []).some(function (s) { return norm(s).trim() === n; })) return true;
    if ((extraSkills || []).some(function (s) { return norm(s).trim() === n; })) return true;
    if (mt.indexOf(n) >= 0) return true;
    // a dictionary skill whose aliases match the item and which the master shows anywhere
    var sks = SKM().filter(function (sk) { return E.hasSkill(n, sk); });
    return sks.length > 0 && sks.some(function (sk) { return E.hasSkill(mt, sk); });
  }

  /* opts: { job, keywords (classified), extraSkills } */
  function validateOutput(out, master, opts) {
    opts = opts || {};
    var job = opts.job || { text: "", target: {} };
    var errors = [], warnings = [];
    if (!out || typeof out !== "object") { err(errors, "E_SCHEMA", "", "Output is not an object"); return { ok: false, errors: errors, warnings: warnings }; }
    if (V && !V.output(out)) {
      (V.output.errors || []).slice(0, 12).forEach(function (e) { err(errors, "E_SCHEMA", e.instancePath, e.message); });
      return { ok: false, errors: errors, warnings: warnings };
    }
    var cv = out.cv, m = master;

    // strings: one line, no empty bullets, no dangling endings
    cvStrings(cv).forEach(function (s) {
      if (/[\r\n]/.test(s.text)) err(errors, "E_NEWLINE", s.path, "contains a line break");
    });
    ["experience", "projects"].forEach(function (sec) {
      (cv[sec] || []).forEach(function (r, i) {
        (r.bullets || []).forEach(function (b, j) {
          if (!clean(b)) err(errors, "E_EMPTY_BULLET", "cv." + sec + "[" + i + "].bullets[" + j + "]", "empty bullet");
          else if (E.endsDangling(b)) err(errors, "E_DANGLING", "cv." + sec + "[" + i + "].bullets[" + j + "]", "ends with a dangling word", { text: b });
        });
      });
    });
    if (cv.summary && E.endsDangling(cv.summary)) err(errors, "E_DANGLING", "cv.summary", "ends with a dangling word");

    // identity and contact
    if (!same(cv.name, m.name)) err(errors, "E_FACT", "cv.name", "name differs from your CV");
    if (!same(cv.contact.email, m.contact.email)) err(errors, "E_FACT", "cv.contact.email", "email differs from your CV");
    var mPhone = PH ? PH.normalizePhone(m.contact.phone, m.contact.location).phone : m.contact.phone;
    if (clean(cv.contact.phone).replace(/\D/g, "") !== clean(mPhone).replace(/\D/g, "")) err(errors, "E_FACT", "cv.contact.phone", "phone differs from your CV");

    // experience: every role kept, every fact exact
    (cv.experience || []).forEach(function (r, i) {
      var hit = m.experience.filter(function (x) { return same(x.company, r.company) && same(x.title, r.title); })[0];
      if (!hit) { err(errors, "E_FACT", "cv.experience[" + i + "]", "role not in your CV: " + r.title + " / " + r.company); return; }
      ["location", "dates"].forEach(function (f) { if (!same(hit[f], r[f])) err(errors, "E_FACT", "cv.experience[" + i + "]." + f, f + " differs from your CV"); });
    });
    m.experience.forEach(function (x) {
      if (!(cv.experience || []).some(function (r) { return same(x.company, r.company) && same(x.title, r.title); })) err(errors, "E_ROLE_MISSING", "cv.experience", "role missing: " + x.title + " / " + x.company);
    });
    (cv.education || []).forEach(function (r, i) {
      var hit = m.education.filter(function (x) { return same(x.degree, r.degree) && same(x.school, r.school); })[0];
      if (!hit) { err(errors, "E_FACT", "cv.education[" + i + "]", "degree not in your CV: " + r.degree); return; }
      ["location", "dates", "details"].forEach(function (f) { if (!same(hit[f], r[f])) err(errors, "E_FACT", "cv.education[" + i + "]." + f, f + " differs from your CV"); });
    });
    m.education.forEach(function (x) { if (!(cv.education || []).some(function (r) { return same(x.degree, r.degree) && same(x.school, r.school); })) err(errors, "E_EDU_MISSING", "cv.education", "degree missing: " + x.degree); });
    (cv.projects || []).forEach(function (r, i) {
      var hit = m.projects.filter(function (x) { return same(x.name, r.name); })[0];
      if (!hit) { err(errors, "E_FACT", "cv.projects[" + i + "]", "project not in your CV: " + r.name); return; }
      ["dates", "tech"].forEach(function (f) { if (!same(hit[f], r[f])) err(errors, "E_FACT", "cv.projects[" + i + "]." + f, f + " differs from your CV"); });
    });
    m.projects.forEach(function (x) { if (!(cv.projects || []).some(function (r) { return same(x.name, r.name); })) err(errors, "E_PROJECT_MISSING", "cv.projects", "project missing: " + x.name); });
    (cv.certifications || []).forEach(function (c, i) { if (!m.certifications.some(function (x) { return same(x, c); })) err(errors, "E_FACT", "cv.certifications[" + i + "]", "certification not in your CV: " + c); });
    m.certifications.forEach(function (x) { if (!(cv.certifications || []).some(function (c) { return same(x, c); })) err(errors, "E_CERT_MISSING", "cv.certifications", "certification missing: " + x); });
    // languages: all kept with their level
    m.languages.forEach(function (l) {
      var hit = (cv.languages || []).filter(function (x) { return norm(x.language) === norm(l.language); })[0];
      if (!hit) err(errors, "E_LANGUAGE_MISSING", "cv.languages", "language missing: " + l.language);
      else if (!same(hit.level, l.level)) err(errors, "E_LANGUAGE_LEVEL", "cv.languages", "level changed for " + l.language);
    });
    (cv.languages || []).forEach(function (x) { if (!m.languages.some(function (l) { return norm(l.language) === norm(x.language); })) err(errors, "E_FACT", "cv.languages", "language not in your CV: " + x.language); });

    // numbers: every number must come from the master (start date and duration of THIS job are allowed in headline/summary)
    var mNums = {}; E.numbersIn(PA.masterText(m) + " " + m.contact.phone).forEach(function (n) { mNums[n] = 1; });
    var tNums = {}; E.numbersIn([job.target.start, job.target.duration, job.target.role].join(" ")).forEach(function (n) { tNums[n] = 1; });
    cvStrings(cv).forEach(function (s) {
      if (/\.contact\./.test(s.path)) return;
      E.numbersIn(s.text).forEach(function (n) {
        if (mNums[n]) return;
        if ((s.path === "cv.summary" || s.path === "cv.headline") && tNums[n]) return;
        err(errors, "E_NEW_NUMBER", s.path, "number not in your CV: " + n, { number: n });
      });
    });

    // skills: real, supported by the master, no company or programme names, no languages or levels
    var comp = norm(job.target.company || "").trim();
    (cv.skills || []).forEach(function (g, i) {
      String(g.items || "").split(/\s*[,;•·|]\s*/).map(clean).filter(Boolean).forEach(function (it) {
        var n = norm(it).trim();
        if (comp && (n === comp || n.indexOf(comp) >= 0)) err(errors, "E_SKILL_COMPANY", "cv.skills[" + i + "]", "company name in skills: " + it, { item: it });
        else if ((job.programmes || []).indexOf(n) >= 0) err(errors, "E_SKILL_PROGRAMME", "cv.skills[" + i + "]", "programme name in skills: " + it, { item: it });
        else if (T.LEVEL_TOKEN.test(n) || PA.isLanguageName(it.replace(/\s*\(.*\)\s*$/, ""))) err(errors, "E_SKILL_LEVEL", "cv.skills[" + i + "]", "language or level in skills: " + it, { item: it });
        else if (!masterSupports(it, m, opts.extraSkills)) err(errors, "E_SKILL_UNSUPPORTED", "cv.skills[" + i + "]", "skill not shown in your CV: " + it, { item: it });
      });
    });

    // keyword stuffing: at most 4 uses per keyword. Uses inside the candidate's own unchanged
    // bullets only raise a warning; uses added by the generated text are an error.
    if (opts.keywords) {
      var uses = keywordUses(cv, opts.keywords);
      var mtRaw = PA.masterText(m);
      Object.keys(uses).forEach(function (k) {
        if (uses[k] <= MAX_KEYWORD_USES) return;
        var kw = opts.keywords.filter(function (x) { return x.key === k; })[0];
        var gen = E.countSkill(norm([cv.headline, cv.summary].join(" ")), kw), rewritten = 0;
        (cv.experience || []).concat(cv.projects || []).forEach(function (r) { (r.bullets || []).forEach(function (b) { if (mtRaw.indexOf(b) < 0) rewritten += E.countSkill(norm(b), kw); }); });
        if (gen > 0 || rewritten > 0) err(errors, "E_KEYWORD_OVERUSE", "cv", k + " used " + uses[k] + " times", { keyword: k, uses: uses[k] });
        else warnings.push({ code: "W_KEYWORD_OWN", path: "cv", msg: k + " appears " + uses[k] + " times in your own bullets", keyword: k });
      });
    }

    // target must come from THIS job description (catches stale data from an earlier job)
    var jn = norm(job.text || "");
    if (out.target.company && jn && jn.indexOf(norm(out.target.company).trim()) < 0) err(errors, "E_STALE_TARGET", "target.company", "company not in this job description: " + out.target.company);
    if (out.target.role && jn) {
      var words = norm(out.target.role).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; });
      var found = words.filter(function (w) { return jn.indexOf(w) >= 0; }).length;
      if (words.length && found / words.length < 0.6) err(errors, "E_STALE_TARGET", "target.role", "role not in this job description: " + out.target.role);
    }
    // the generated text may only name the target company, never another one from a previous job
    if (opts.previousCompanies) {
      var gen = norm([cv.headline, cv.summary].join(" "));
      opts.previousCompanies.forEach(function (pc) { if (pc && norm(pc) !== comp && gen.indexOf(norm(pc)) >= 0 && norm(PA.masterText(m)).indexOf(norm(pc)) < 0) err(errors, "E_STALE_TARGET", "cv.summary", "mentions another job's company: " + pc); });
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  /* Replace every broken part with checked content: facts from the master, the rest from the rules
     engine output (which is built only from the master). Returns { output, repaired: [codes] }. */
  function repairOutput(out, master, rules, errors) {
    var o = JSON.parse(JSON.stringify(out || {}));
    var r = rules.output;
    var fixed = {};
    if (!o.target || errors.some(function (e) { return e.code === "E_SCHEMA" || e.code === "E_STALE_TARGET"; })) o.target = JSON.parse(JSON.stringify(r.target));
    if (!o.cv || errors.some(function (e) { return e.code === "E_SCHEMA"; })) return { output: JSON.parse(JSON.stringify(r)), repaired: ["all"] };
    var cv = o.cv;
    cv.name = r.cv.name; cv.contact = JSON.parse(JSON.stringify(r.cv.contact));
    cv.education = JSON.parse(JSON.stringify(r.cv.education));
    cv.certifications = r.cv.certifications.slice();
    cv.languages = JSON.parse(JSON.stringify(r.cv.languages));
    // roles: keep AI bullet order/wording only for roles that exist; fix facts; add missing roles
    var roles = master.experience.map(function (mr) {
      var ai = (cv.experience || []).filter(function (x) { return same(x.company, mr.company) && same(x.title, mr.title); })[0];
      var rr = r.cv.experience.filter(function (x) { return same(x.company, mr.company) && same(x.title, mr.title); })[0];
      var bullets = ai ? (ai.bullets || []).map(clean).filter(Boolean) : rr.bullets;
      bullets = bullets.map(function (b) { return checkBullet(b, mr.bullets, master); });
      return { title: mr.title, company: mr.company, location: mr.location, dates: mr.dates, bullets: dedupe(bullets) };
    });
    cv.experience = roles;
    cv.projects = master.projects.map(function (mp) {
      var ai = (cv.projects || []).filter(function (x) { return same(x.name, mp.name); })[0];
      var rp = r.cv.projects.filter(function (x) { return same(x.name, mp.name); })[0];
      var bullets = (ai ? (ai.bullets || []).map(clean).filter(Boolean) : rp.bullets).map(function (b) { return checkBullet(b, mp.bullets, master); });
      return { name: mp.name, tech: mp.tech, dates: mp.dates, bullets: dedupe(bullets).slice(0, 2) };
    });
    var codes = errors.map(function (e) { return e.code; });
    if (codes.some(function (c) { return /^E_SKILL|E_KEYWORD_OVERUSE/.test(c); }) || !Array.isArray(cv.skills)) { cv.skills = JSON.parse(JSON.stringify(r.cv.skills)); fixed.skills = 1; }
    var badSummary = errors.some(function (e) { return (e.path === "cv.summary" || e.path === "cv.headline") || e.code === "E_KEYWORD_OVERUSE" || e.code === "E_STALE_TARGET"; });
    if (badSummary || /[\r\n]/.test(cv.summary || "") || E.endsDangling(cv.summary || "")) { cv.summary = r.cv.summary; cv.headline = r.cv.headline; fixed.summary = 1; }
    o.cv = cv;
    return { output: o, repaired: Object.keys(fixed).concat(errors.map(function (e) { return e.code; })) };
  }
  /* An AI bullet is kept only if it adds no number, no tool and no line break; otherwise the closest
     original bullet is used. */
  function checkBullet(b, originals, master) {
    b = clean(b);
    var mNums = {}; E.numbersIn(PA.masterText(master)).forEach(function (n) { mNums[n] = 1; });
    var newNum = E.numbersIn(b).some(function (n) { return !mNums[n]; });
    var mt = norm(PA.masterText(master));
    var newTool = SKM().some(function (sk) { return sk.t === "h" && E.hasSkill(norm(b), sk) && !E.hasSkill(mt, sk); });
    if (!b || newNum || newTool || E.endsDangling(b)) return closest(b, originals) || b;
    return b;
  }
  function closest(b, originals) {
    var wb = norm(b).split(/[^a-z0-9]+/).filter(Boolean), best = null, bs = -1;
    originals.forEach(function (o) {
      var wo = norm(o).split(/[^a-z0-9]+/).filter(Boolean);
      var inter = wb.filter(function (w) { return wo.indexOf(w) >= 0; }).length;
      var s = inter / (wb.length + wo.length - inter || 1);
      if (s > bs) { bs = s; best = o; }
    });
    return best;
  }
  function dedupe(arr) { var seen = {}; return arr.filter(function (x) { var k = norm(x); if (seen[k]) return false; seen[k] = 1; return true; }); }

  /* An AI reading of the CV is accepted only if every value it returns is found in the CV text. */
  function validateParsed(parsed, sourceText) {
    var src = norm(sourceText).replace(/[^a-z0-9@.+]+/g, "");
    var bad = [];
    function walk(v, p) {
      if (typeof v === "string") {
        if (!v.trim() || /^other/.test(p)) return;
        var n = norm(v).replace(/^[-•*]\s*/, "").replace(/[^a-z0-9@.+]+/g, "");
        if (n && src.indexOf(n) < 0) bad.push(p);
      } else if (Array.isArray(v)) v.forEach(function (x, i) { walk(x, p + "[" + i + "]"); });
      else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { if (k !== "other") walk(v[k], p ? p + "." + k : k); });
    }
    walk(parsed, "");
    return { ok: bad.length === 0, bad: bad };
  }

  var api = { validateParsed: validateParsed, validateOutput: validateOutput, repairOutput: repairOutput, keywordUses: keywordUses, cvStrings: cvStrings, masterSupports: masterSupports, MAX_KEYWORD_USES: MAX_KEYWORD_USES };
  root.TailrValidate = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
