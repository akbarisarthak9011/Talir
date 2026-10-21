/* Tailr rules-based tailoring and report.
   Produces the same JSON shape as the AI (target, cv, report) using only facts from the master CV.
   Never splices keywords into existing sentences: keywords appear only as whole skill items or in
   the newly written headline and summary, and only when the master CV supports them. */
(function (root) {
  "use strict";
  var E = root.TailrEngine || (typeof require === "function" ? require("./engine.js") : null);
  var PA = root.TailrParse || (typeof require === "function" ? require("./parse.js") : null);
  var J = root.TailrJob || (typeof require === "function" ? require("./job.js") : null);
  var PH = root.TailrPhone || (typeof require === "function" ? require("./phone.js") : null);
  var SKM = function () { return root.TAILR_SKILLS || require("./skills.js").skills; };
  var ADJ = function () { return root.TAILR_ADJACENT || require("./skills.js").adjacent; };
  var norm = E.norm, clean = E.clean;
  var W = { must: 3, nice: 2, context: 1 };

  var LEVEL_TOKEN = /^(?:[abc][12]|native|natif|native speaker|fluent|courant|bilingual|bilingue|intermediate|interm[eé]diaire|advanced|avanc[eé]|basic|notions?|beginner|d[eé]butant|langue maternelle|mother tongue|toeic.*|toefl.*|ielts.*|dele.*|delf.*|dalf.*|goethe.*)$/i;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function joinList(arr, lang) {
    if (arr.length <= 1) return arr.join("");
    return arr.slice(0, -1).join(", ") + (lang === "fr" ? " et " : " and ") + arr[arr.length - 1];
  }

  /* Label for a keyword, in the posting's own spelling when that spelling is a clean noun phrase. */
  function jdLabel(k, lang) {
    var dict = lang === "fr" ? k.fr : k.en;
    if (k.t === "d") return k.en;
    var sp = clean(k.spelled || "");
    if (!sp) return dict;
    var ns = norm(sp), nd = norm(dict), ne = norm(k.en), nf = norm(k.fr);
    var same = [nd, ne, nf].some(function (x) { return ns === x || ns === x + "s" || ns + "s" === x || ns === x + "es"; });
    if (same) return sp === sp.toLowerCase() ? cap(sp) : sp;
    if (sp !== sp.toLowerCase() && sp.length <= 25 && sp.split(" ").length <= 3) return sp;
    return dict;
  }
  /* The keyword as written inside a sentence: brands keep their capitals, common nouns go lower case. */
  var PROPER = /^(excel|canva|python|java|javascript|typescript|figma|notion|jira|trello|sap|tableau|looker|hubspot|salesforce|shopify|wordpress|docker|kubernetes|linux|git|react|angular|swift|kotlin|flutter|matlab|autocad|solidworks|photoshop|illustrator|indesign|bloomberg|stata|spss|powerpoint|word|vba|r|go|rust|php|ruby|terraform|airflow|agile|scrum|lean|six sigma|prince2)$/i;
  function inSentence(k, lang) {
    var l = jdLabel(k, lang);
    if (k.t === "d" || PROPER.test(l) || /[A-Z].*[A-Z]/.test(l) || /\d/.test(l)) return l;
    return l.charAt(0).toLowerCase() + l.slice(1);
  }

  /* ---------- classify the job's keywords against the master CV ---------- */
  function classify(master, job) {
    var mt = norm(PA.masterText(master));
    var jn = norm(job.text);
    var adj = ADJ(), dict = SKM();
    return job.keywords.map(function (k0) {
      var k = Object.assign({}, k0);
      if (k.t === "d") { k.status = E.hasAlias(mt, k.a[0]) ? "present" : "missing"; return k; }
      var aJD = E.matchedAlias(jn, k);
      if (aJD && E.hasAlias(mt, aJD)) k.status = "present";
      else if (E.hasSkill(mt, k)) { k.status = "reword"; k.cvAlias = E.matchedAlias(mt, k); }
      else {
        var sib = [];
        adj.forEach(function (grp) {
          if (grp.indexOf(k.key) < 0) return;
          grp.forEach(function (name) {
            if (name === k.key) return;
            var sk = dict.filter(function (d) { return d.en === name; })[0];
            if (sk && E.hasSkill(mt, sk) && sib.indexOf(name) < 0) sib.push(name);
          });
        });
        k.status = sib.length ? "adjacent" : "missing";
        k.siblings = sib;
      }
      return k;
    });
  }
  function truly(k) { return k.status === "present" || k.status === "reword"; }

  /* Spec formula: (must x 2 + nice) / (all must x 2 + all nice) x 100, only keywords truly held. */
  function matchPct(kws, holds) {
    var tot = 0, got = 0;
    kws.forEach(function (k) {
      var w = k.bucket === "must" ? 2 : k.bucket === "nice" ? 1 : 0;
      tot += w; if (holds(k)) got += w;
    });
    return tot ? Math.round(100 * got / tot) : 0;
  }

  /* ---------- skills ---------- */
  function bestDictMatch(item) {
    var n = norm(item), best = null, bestLen = 0;
    SKM().forEach(function (sk) {
      sk.a.forEach(function (a) { if (a.length > bestLen && E.hasAlias(n, a)) { best = sk; bestLen = a.length; } });
    });
    return best && bestLen >= Math.min(n.length * 0.5, 4) ? best : null;
  }
  function isBlockedSkill(item, job) {
    var n = norm(item).trim();
    if (!n) return true;
    if (LEVEL_TOKEN.test(n) || PA.isLanguageName(item) || PA.isLanguageName(item.replace(/\s*\(.*\)\s*$/, ""))) return true;
    var comp = norm(job.target.company || "").trim();
    if (comp && (n === comp || n.indexOf(comp) >= 0 || comp.split(/\s+/).indexOf(n) >= 0)) return true;
    if ((job.programmes || []).indexOf(n) >= 0) return true;
    return false;
  }
  function buildSkills(master, job, kws, lang) {
    var mt = norm(PA.masterText(master));
    var byKey = {}; kws.forEach(function (k) { if (k.t !== "d") byKey[k.key] = k; });
    var items = [], seen = {};
    function push(label, sk, k) {
      var id = sk ? sk.en : "x:" + norm(label);
      if (seen[id] || seen["l:" + norm(label)]) return;
      if (isBlockedSkill(label, job)) return;
      seen[id] = 1; seen["l:" + norm(label)] = 1;
      items.push({ label: label, g: sk ? (sk.t === "s" ? "Soft skills" : sk.g) : "", gen: sk ? sk.gen : "Other skills", gfr: sk ? sk.gfr : "Autres compétences",
        soft: !!(sk && sk.t === "s"), score: k ? W[k.bucket] || 0 : 0, order: items.length });
    }
    // 1. the candidate's own skills list
    (master.skills || []).forEach(function (s) {
      var sk = bestDictMatch(s);
      if (sk && sk.t === "l") return;
      var k = sk && byKey[sk.en];
      push(k && truly(k) ? jdLabel(k, lang) : s, sk, k);
    });
    // 2. job keywords the CV proves elsewhere (in bullets, projects, education) and detected tools
    kws.forEach(function (k) {
      if (!truly(k) || k.t === "l") return;
      if (k.t === "d") { push(k.en, null, k); return; }
      var sk = SKM().filter(function (d) { return d.en === k.key; })[0];
      if (sk && E.hasSkill(mt, sk)) push(jdLabel(k, lang), sk, k);
    });
    // group
    var groups = {};
    items.forEach(function (it) {
      var key = it.soft ? "~soft" : (it.g || "~other");
      if (!groups[key]) groups[key] = { key: key, label: it.soft ? (lang === "fr" ? "Savoir-être" : "Soft skills") : (lang === "fr" ? it.gfr : it.gen), items: [], score: 0 };
      groups[key].items.push(it); groups[key].score += it.score;
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; });
    var soft = list.filter(function (g) { return g.key === "~soft"; });
    var hard = list.filter(function (g) { return g.key !== "~soft"; }).sort(function (a, b) { return b.score - a.score || b.items.length - a.items.length; });
    // single-item groups read badly: pool them into one "Tools & other skills" line
    var singles = hard.filter(function (g) { return g.items.length === 1; });
    if (singles.length >= 2 && hard.length > 3) {
      var pool = { key: "~other", label: lang === "fr" ? "Outils & autres compétences" : "Tools & other skills", items: [], score: 0 };
      singles.forEach(function (g) { pool.items = pool.items.concat(g.items); pool.score += g.score; });
      hard = hard.filter(function (g) { return g.items.length > 1 && g.key !== "~other"; }).concat(hard.filter(function (g) { return g.key === "~other" && g.items.length > 1; }).map(function (g) { pool.items = pool.items.concat(g.items); pool.score += g.score; return null; }).filter(Boolean), [pool]);
      hard.sort(function (a, b) { return b.score - a.score || b.items.length - a.items.length; });
    }
    // merge small, unscored groups into "Other skills" so we end with 3-5 lines
    var maxHard = soft.length ? 4 : 5;
    var keep = [], rest = [];
    hard.forEach(function (g) { (keep.length < maxHard - 1 || (keep.length < maxHard && hard.length <= maxHard) ? keep : rest).push(g); });
    if (rest.length) {
      var other = keep.filter(function (g) { return g.key === "~other"; })[0];
      if (!other) { other = { key: "~other", label: lang === "fr" ? "Autres compétences" : "Other skills", items: [], score: 0 }; keep.push(other); }
      rest.forEach(function (g) { other.items = other.items.concat(g.items); other.score += g.score; });
    }
    var dropped = [];
    var lines = keep.concat(soft).filter(function (g) { return g.items.length; }).map(function (g) {
      var its = g.items.slice().sort(function (a, b) { return b.score - a.score || a.order - b.order; });
      var shown = its.filter(function (it, i) { return i < 10 || it.score > 0; });
      its.forEach(function (it) { if (shown.indexOf(it) < 0) dropped.push(it.label); });
      return { label: g.label, items: shown.map(function (it) { return it.label; }).join(", ") };
    });
    return { lines: lines, dropped: dropped };
  }

  /* ---------- bullets ---------- */
  function scoreText(text, kws) {
    var n = norm(text), s = 0;
    kws.forEach(function (k) { if (k.t !== "l" && E.hasSkill(n, k)) s += W[k.bucket] || 0; });
    return s;
  }
  function orderBullets(bullets, kws, max) {
    var sc = bullets.map(function (b, i) { return { b: b, i: i, s: scoreText(b, kws) }; });
    var sorted = sc.slice().sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    var kept = sorted.slice(0, max), dropped = sorted.slice(max);
    return { bullets: kept.map(function (x) { return x.b; }), dropped: dropped.map(function (x) { return x.b; }), moved: kept.some(function (x, j) { return x.i !== j; }), score: sc.reduce(function (t, x) { return t + x.s; }, 0) };
  }

  /* ---------- headline and summary ---------- */
  var ROLE_NOISE = /\((?:h\/f|f\/h|m\/f|f\/m|m\/w|hf|fh|m\/f\/d)\)|\b(?:19|20)\d{2}\b|\b(?:h\/f|f\/h)\b/gi;
  function cleanRole(job) {
    var role = clean(String(job.target.role || "").replace(ROLE_NOISE, "")).replace(/\s*\([A-Z0-9&]{2,7}\)\s*/g, " ").trim();
    var comp = job.target.company;
    if (comp) role = clean(role.replace(new RegExp("\\b" + E.esc(comp) + "\\b", "ig"), ""));
    var words = role.split(/\s+/).filter(Boolean);
    var generic = words.filter(function (w) { return !/^(manager|candidate|candidat|intern|internship|stagiaire|stage|trainee|graduate|junior|programme|program|h\/f)$/i.test(w); });
    if (generic.length === 0) {
      var first = clean(String(job.text).split(/\n/).filter(function (l) { return clean(l); })[0] || "");
      var seg = first.split(/\s[—–|-]\s/)[1] || "";
      if (seg.split(/\s+/).length >= 2 && seg.length < 40 && !(comp && seg.indexOf(comp) >= 0)) return seg;
    }
    return role;
  }
  function durationPhrase(d, lang) {
    var m = String(d || "").match(/(\d{1,2})(?:\s*(?:to|à|-|–)\s*(\d{1,2}))?[- ]?(month|mois|week|semaine|year|an)/i);
    if (!m) return clean(d);
    var n = m[2] ? m[1] + "–" + m[2] : m[1], u = m[3].toLowerCase();
    var plural = Number(m[2] || m[1]) > 1;
    var en = { month: "month", week: "week", year: "year", mois: "month", semaine: "week", an: "year" }[u];
    var fr = { month: "mois", week: "semaine", year: "an", mois: "mois", semaine: "semaine", an: "an" }[u];
    return lang === "fr" ? n + " " + fr + (plural && fr !== "mois" ? "s" : "") : n + " " + en + (plural ? "s" : "");
  }
  var EN_M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var FR_M = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  /* "March 2027" <-> "mars 2027" so a date copied from the posting matches the CV's language. */
  function localDate(s, lang) {
    var out = String(s || "");
    var from = lang === "fr" ? EN_M : FR_M, to = lang === "fr" ? FR_M : EN_M;
    from.forEach(function (m, i) { out = out.replace(new RegExp("\\b" + m + "\\b", "i"), to[i]); });
    if (lang === "fr") out = out.replace(/\b(asap|as soon as possible)\b/i, "dès que possible");
    else out = out.replace(/\bd[eè]s que possible\b/i, "as soon as possible");
    return out;
  }
  function isCurrent(ed, now) {
    var r = PA.parseRange(ed.dates || "", now);
    return !ed.dates || (r && Math.floor(r.end / 12) >= now.getFullYear());
  }
  function buildSummary(master, job, kws, lang, now, exclude) {
    exclude = exclude || {};
    var t = job.target, s = [];
    var ed = (master.education || [])[0];
    var exp = (master.experience || [])[0];
    var years = PA.yearsOfExperience(master, now);
    if (ed && ed.degree) {
      if (isCurrent(ed, now)) s.push(lang === "fr" ? "Étudiant(e) en " + ed.degree + (ed.school ? " à " + ed.school : "") + "." : ed.degree + " student" + (ed.school ? " at " + ed.school : "") + ".");
      else s.push(lang === "fr" ? "Diplômé(e) : " + ed.degree + (ed.school ? ", " + ed.school : "") + (years >= 1 && exp ? ", avec une expérience de " + exp.title + "." : ".") : "Graduate with a " + ed.degree + (ed.school ? " from " + ed.school : "") + (years >= 1 && exp ? " and experience as " + exp.title + "." : "."));
    } else if (exp) {
      s.push(lang === "fr" ? "Expérience en tant que " + exp.title + (exp.company ? " chez " + exp.company : "") + "." : "Experience as " + exp.title + (exp.company ? " at " + exp.company : "") + ".");
    }
    var role = clean(String(t.role || "").replace(ROLE_NOISE, ""));
    if (role || t.company) {
      var internRole = /\b(intern|internship|stagiaire|stage)\b/i.test(role), progRole = /\b(programme|program|candidate|candidat)\b/i.test(role);
      var c = t.contract;
      var sent;
      if (lang === "fr") {
        var what = c === "stage" && !internRole ? "au stage de " : c === "alternance" ? "à l'alternance de " : "au poste de ";
        sent = "Candidat(e) " + (role ? what + role : "à ce poste") + (t.company && norm(role).indexOf(norm(t.company)) < 0 ? " chez " + t.company : "");
        if (t.start) sent += ", à partir de " + localDate(t.start, "fr");
        if (t.duration) sent += ", pour une durée de " + durationPhrase(t.duration, "fr");
      } else {
        var noun = /\b(programme|program|position|role|internship|apprenticeship)$/i.test(role) ? "" : internRole ? " position" : c === "internship" ? " internship" : c === "graduate programme" ? " programme" : c === "apprenticeship" ? " apprenticeship" : " position";
        var atCo = t.company && norm(role).indexOf(norm(t.company)) < 0 ? " at " + t.company : "";
        sent = "Applying for the " + (role ? role + noun : "position") + atCo;
        if (t.start) sent += ", starting " + localDate(t.start, "en");
        if (t.duration) sent += ", for " + durationPhrase(t.duration, "en");
      }
      s.push(sent + ".");
    }
    var held = kws.filter(function (k) { return truly(k) && k.t !== "s" && k.t !== "l" && !exclude[k.key]; });
    var pick = held.filter(function (k) { return k.bucket === "must"; }).sort(function (a, b) { return b.count - a.count; });
    if (pick.length < 4) pick = pick.concat(held.filter(function (k) { return k.bucket === "nice"; }), held.filter(function (k) { return k.bucket === "context"; }));
    pick = pick.slice(0, 6);
    if (pick.length >= 2) {
      var list = joinList(pick.map(function (k) { return inSentence(k, lang); }), lang);
      s.push(lang === "fr" ? "Expérience concrète en " + list + "." : "Hands-on experience with " + list + ".");
    }
    var soft = kws.filter(function (k) { return k.t === "s" && truly(k) && !exclude[k.key]; }).slice(0, 2).map(function (k) { return inSentence(k, lang); });
    if (soft.length) s.push(lang === "fr" ? "Qualités : " + joinList(soft, lang) + "." : "Known for " + joinList(soft, lang) + ".");
    return { text: clean(s.join(" ")), keywords: pick };
  }

  /* ---------- main ---------- */
  /* opts: { lang (CV output language), uiLang, now, baseMaster (master before confirmed skills) } */
  function tailorRules(master, job, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var lang = opts.lang || job.lang;
    var ui = opts.uiLang || lang;
    master = PA.normalizeMaster(clone(master));
    var kws = classify(master, job);
    var base = opts.baseMaster ? classify(PA.normalizeMaster(clone(opts.baseMaster)), job) : kws;
    var baseByKey = {}; base.forEach(function (k) { baseByKey[k.key] = k; });

    var skills = buildSkills(master, job, kws, lang);
    var role = cleanRole(job);
    function makeHeadline(exclude) {
      var ok = function (k) { return truly(k) && k.t !== "s" && k.t !== "l" && !exclude[k.key]; };
      var hs = kws.filter(function (k) { return ok(k) && k.bucket !== "context"; })
        .sort(function (a, b) { return (W[b.bucket] - W[a.bucket]) || b.count - a.count; }).slice(0, 4).map(function (k) { return jdLabel(k, lang); });
      if (hs.length < 3) hs = hs.concat(kws.filter(function (k) { return ok(k) && hs.indexOf(jdLabel(k, lang)) < 0; }).slice(0, 3 - hs.length).map(function (k) { return jdLabel(k, lang); }));
      return clean((role || master.headline || "") + (hs.length >= 2 ? " | " + hs.join(" · ") : ""));
    }
    var exclude = {}, sum, headline;

    var changes = [], dropped = [], movedRoles = 0;
    var experience = master.experience.map(function (r) {
      var rel = scoreText(r.title, kws) * 2 + r.bullets.reduce(function (t, b) { return t + scoreText(b, kws); }, 0);
      var o = orderBullets(r.bullets, kws, rel > 0 ? 5 : 3);
      if (o.moved) movedRoles++;
      o.dropped.forEach(function (b) { dropped.push({ where: r.title + (r.company ? ", " + r.company : ""), text: b }); });
      return { title: r.title, company: r.company, location: r.location, dates: r.dates, bullets: o.bullets };
    });
    var projects = master.projects.map(function (p, i) {
      var o = orderBullets(p.bullets, kws, 2);
      o.dropped.forEach(function (b) { dropped.push({ where: p.name, text: b }); });
      return { p: { name: p.name, tech: p.tech, dates: p.dates, bullets: o.bullets }, s: scoreText(p.name + " " + p.tech, kws) * 2 + o.score, i: i };
    }).sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return x.p; });

    var phone = master.contact.phone && PH ? PH.normalizePhone(master.contact.phone, master.contact.location).phone : master.contact.phone;
    var cv;
    // write headline and summary; if a keyword would be used more than 4 times, leave it out of them
    for (var pass = 0; pass < 3; pass++) {
      sum = buildSummary(master, job, kws, lang, now, exclude);
      headline = makeHeadline(exclude);
      cv = {
        name: master.name, headline: headline,
        contact: { phone: phone, email: master.contact.email, location: master.contact.location, linkedin: master.contact.linkedin, portfolio: master.contact.portfolio },
        summary: sum.text, skills: skills.lines, experience: experience, projects: projects,
        education: clone(master.education), certifications: master.certifications.slice(), languages: clone(master.languages)
      };
      var over = overused(cv, kws);
      if (!over.length) break;
      over.forEach(function (k) { exclude[k] = 1; });
    }

    // report
    var labels = function (b) { return kws.filter(function (k) { return k.bucket === b; }).map(function (k) { return jdLabel(k, lang); }); };
    var before = matchPct(base, function (k) { return k.status === "present"; });
    var after = matchPct(kws, truly);
    var added = kws.filter(function (k) { return truly(k) && (!baseByKey[k.key] || baseByKey[k.key].status !== "present") && k.t !== "l"; });
    var missing = kws.filter(function (k) { return k.bucket === "must" && !truly(k); });
    var adjacent = kws.filter(function (k) { return k.status === "adjacent"; });
    var elig = J.checkEligibility(job.eligibility, master, PA.masterText(master));
    var KL = ui === "fr" ? { workauth: "Autorisation de travail", relocation: "Mobilité", weekend: "Travail le week-end", driving: "Permis de conduire", degree: "Diplôme", language: "Langue", start: "Date de début", duration: "Durée", location: "Lieu" }
      : { workauth: "Work authorisation", relocation: "Relocation", weekend: "Weekend work", driving: "Driving licence", degree: "Degree", language: "Language", start: "Start date", duration: "Duration", location: "Location" };
    elig.forEach(function (e) {
      var head = e.key === "language" ? cap(e.lang) + (e.level ? "" : (ui === "fr" ? " (un plus)" : " (a plus)")) : KL[e.key];
      e.label = head;
      if (["start", "duration", "location"].indexOf(e.key) < 0) e.requirement = head + " — " + e.requirement;
    });
    var notMet = elig.filter(function (e) { return e.status === "not_met"; });
    var fit = after >= 70 && !notMet.length ? "strong" : (after < 40 || notMet.some(function (e) { return e.key === "language" || e.key === "workauth"; }) ? "low" : "medium");

    var T = ui === "fr" ? {
      headline: "Titre et résumé écrits pour ce poste uniquement",
      skills: "Compétences regroupées en " + skills.lines.length + " lignes, les plus utiles en premier",
      moved: "Points les plus pertinents placés en premier dans " + movedRoles + " expérience(s)",
      trimmed: dropped.length + " point(s) moins pertinent(s) retiré(s) pour tenir sur une page",
      reword: "Vocabulaire de l'offre utilisé pour : ",
      miss: function (l) { return l + " : absent de votre CV. Si vous l'avez déjà utilisé, ajoutez un exemple réel à l'étape 2. Sinon, expliquez dans votre lettre comment vous l'apprenez."; },
      adj: function (a, h) { return a + " : vous maîtrisez " + h + ". Expliquez dans votre lettre comment cela se transpose, sans ajouter " + a + " à vos compétences."; },
      elig: function (e) { return e.requirement + " : votre CV indique « " + (e.note === "missing" ? "rien" : e.note) + " ». Vérifiez cette exigence avant de postuler."; },
      rec: { strong: "Bonne correspondance. Relisez le CV et postulez.", medium: "Correspondance moyenne. Ajoutez des exemples réels pour les compétences manquantes que vous avez, puis postulez.", low: "Correspondance faible. Postulez seulement si vous pouvez répondre aux exigences signalées." },
      langNote: "Votre CV est rédigé dans une autre langue que l'offre : le texte ajouté suit la langue de votre CV."
    } : {
      headline: "Headline and summary written for this job only",
      skills: "Skills grouped into " + skills.lines.length + " lines, most relevant first",
      moved: "Most relevant bullets moved to the top in " + movedRoles + " role(s)",
      trimmed: dropped.length + " less relevant bullet(s) removed to keep the CV short",
      reword: "Used the posting's wording for: ",
      miss: function (l) { return l + ": not in your CV. If you have used it, add a real example in step 2. If not, say in your cover letter how you are learning it."; },
      adj: function (a, h) { return a + ": you know " + h + ". Explain in your cover letter how it transfers; don't list " + a + " as a skill."; },
      elig: function (e) { return e.requirement + ": your CV shows “" + (e.note === "missing" ? "nothing" : e.note) + "”. Check this requirement before applying."; },
      rec: { strong: "Strong match. Review the CV and apply.", medium: "Medium match. Add real examples for missing skills you do have, then apply.", low: "Low match. Apply only if you can meet the flagged requirements." },
      langNote: "Your CV is written in a different language from the posting: the new text follows your CV's language."
    };
    changes.push(T.headline, T.skills);
    if (movedRoles) changes.push(T.moved);
    if (dropped.length) changes.push(T.trimmed);
    var rew = kws.filter(function (k) { return k.status === "reword"; }).map(function (k) { return jdLabel(k, lang); });
    if (rew.length) changes.push(T.reword + rew.join(", "));
    if (lang !== job.lang) changes.push(T.langNote);
    var suggestions = missing.filter(function (k) { return k.status === "missing"; }).map(function (k) { return T.miss(jdLabel(k, lang)); })
      .concat(adjacent.map(function (k) { return T.adj(jdLabel(k, lang), k.siblings.join(", ")); }))
      .concat(notMet.map(T.elig));

    var report = {
      keywords: { must_have: labels("must"), nice_to_have: labels("nice"), context: labels("context") },
      match_before_pct: before, match_after_pct: after,
      added_keywords: added.map(function (k) { return jdLabel(k, lang); }),
      missing_must_haves: missing.map(function (k) { return jdLabel(k, lang); }),
      adjacent_skills: adjacent.map(function (k) { return jdLabel(k, lang) + " (" + k.siblings.join(", ") + ")"; }),
      eligibility: elig.map(function (e) { return { requirement: e.requirement, status: e.status, note: e.note === "missing" ? "" : e.note }; }),
      changes: changes, honest_suggestions: suggestions, fit: fit, recommendation: T.rec[fit]
    };
    var target = { company: job.target.company, role: job.target.role, contract: job.target.contract, start: job.target.start, duration: job.target.duration, location: job.target.location };
    return {
      output: { target: target, cv: PA.sanitize(cv), report: report },
      meta: { keywords: kws, base: base, dropped: dropped, eligibility: elig, droppedSkills: skills.dropped, lang: lang, engine: "rules" }
    };
  }

  function overused(cv, kws) {
    var text = norm([cv.headline, cv.summary].concat(cv.skills.map(function (g) { return g.items; }))
      .concat(cv.experience.reduce(function (a, r) { return a.concat(r.bullets); }, []), cv.projects.reduce(function (a, r) { return a.concat(r.bullets); }, [])).join("\n"));
    var gen = norm([cv.headline, cv.summary].join(" "));
    return kws.filter(function (k) { return k.t !== "l" && E.countSkill(text, k) > 4 && E.countSkill(gen, k) > 0; }).map(function (k) { return k.key; });
  }

  /* Bullet priority for page-fit shortening: lower = cut first. */
  function bulletPriority(text, kws) { return scoreText(text, kws); }

  var api = { tailorRules: tailorRules, classify: classify, matchPct: matchPct, jdLabel: jdLabel, inSentence: inSentence, buildSkills: buildSkills,
    buildSummary: buildSummary, cleanRole: cleanRole, scoreText: scoreText, bulletPriority: bulletPriority, isBlockedSkill: isBlockedSkill, truly: truly, durationPhrase: durationPhrase, LEVEL_TOKEN: LEVEL_TOKEN };
  root.TailrTailor = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
