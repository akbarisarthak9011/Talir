/* Tailr job analysis: one job description -> target, keyword buckets, eligibility, warnings.
   newJob() always builds a brand-new object from the given text only, so nothing from a previous
   job can leak into the next one. */
(function (root) {
  "use strict";
  var E = root.TailrEngine || (typeof require === "function" ? require("./engine.js") : null);
  var SK = function () { return root.TAILR_SKILLS || (typeof require === "function" ? require("./skills.js").skills : []); };
  var norm = E.norm, clean = E.clean;

  var FREE_MAIL = ["gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "yahoo.co.uk", "ymail.com", "hotmail.com", "hotmail.fr", "hotmail.co.uk", "outlook.com", "outlook.fr", "live.com", "live.fr", "msn.com", "aol.com", "aol.fr", "icloud.com", "me.com", "mac.com", "gmx.com", "gmx.fr", "gmx.de", "mail.com", "proton.me", "protonmail.com", "yandex.com", "yandex.ru", "laposte.net", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "bbox.fr", "zoho.com", "rediffmail.com", "qq.com", "163.com"];
  var NICE_RE = /\b(a plus|is a plus|would be a plus|un plus|un atout|serait un plus|est un plus|preferred|preferably|ideally|id[eé]alement|nice to have|nice-to-have|bonus|appreciated|appr[eé]ci[eé]e?s?|souhait[eé]e?s?|advantage|advantageous|desirable|optional|pr[eé]f[eé]rablement|de pr[eé]f[eé]rence)\b/i;
  var MUST_RE = /\b(required|requirements?|must|minimum|mandatory|essential|you have|you are|you will need|we(?:'re| are) looking for|qualifications|requis|requise|exig[eé]e?s?|indispensable|obligatoire|imp[eé]ratif|ma[iî]trise|vous avez|vous [eê]tes|vous poss[eé]dez|profil recherch[eé]|comp[eé]tences requises|strong|solid|solide|proficient|proficiency|fluent|courant|excellent|excellente|expertise|expert)\b/i;
  var REQ_HEAD_RE = /^(requirements?|qualifications|profile|your profile|who you are|what you(?:'ll)? bring|what we(?:'re| are) looking for|must[- ]haves?|skills|key skills|minimum qualifications|basic qualifications|profil(?: recherch[eé])?|votre profil|comp[eé]tences(?: requises)?|qualit[eé]s requises|pr[eé]requis|ce que nous recherchons)\s*:?$/i;
  var NICE_HEAD_RE = /^(nice to have|preferred qualifications|bonus points|pluses|a plus|atouts|les plus|id[eé]alement)\s*:?$/i;
  var ANY_HEAD_RE = /^[A-ZÀ-Ýa-zà-ÿ' &/-]{3,45}:?$/;

  /* ---------- target ---------- */
  function jobTitle(jd) {
    var lines = String(jd).split(/\n/).map(clean).filter(Boolean);
    for (var i = 0; i < Math.min(lines.length, 5); i++) {
      var l = lines[i];
      var lab = l.match(/^(?:job title|title|poste|intitul[eé] du poste|position|role)\s*:\s*(.+)$/i);
      if (lab) l = lab[1];
      else if (/^(job description|about|description du poste|a propos|à propos|offre d'emploi|we are hiring|nous recrutons|company|entreprise|location|lieu)\b/i.test(l)) continue;
      l = l.replace(/\((?:h\/f|f\/h|m\/f|f\/m|m\/w|w\/m|hf|fh|m\/f\/d|f\/h\/x|h\/f\/x)\)/ig, "").replace(/\b(?:h\/f|f\/h|m\/f|f\/m)\b/ig, "");
      l = l.split(/\s[—–|-]\s|\s(?:at|chez|@)\s|,\s/)[0].replace(/\s+/g, " ").trim();
      if (l.length >= 3 && l.length <= 70 && !/[.!?]$/.test(l)) return l;
    }
    return "";
  }
  /* Company name: collect candidates from several patterns, then keep the one the posting repeats most. */
  var NOT_COMPANY = /^(the|our|us|we|you|nous|notre|vous|la|le|les|this|ce|cette|a|an|un|une|team|equipe|role|poste|job|position|paris|london|lyon|remote|cdi|cdd|stage|internship|full[- ]time|part[- ]time|responsibilities|missions?|profile|profil)$/i;
  function companyName(jd, emails) {
    var t = String(jd);
    var m = t.match(/^\s*(?:company|entreprise|soci[eé]t[eé]|employer|employeur|organisation|organization)\s*:\s*(.+)$/im);
    if (m) return clean(m[1]).replace(/[.,;]$/, "");
    var cands = [];
    function addC(x, w) {
      x = clean(x).replace(/^(?:chez|at|@|about|join|rejoignez)\s+/i, "").replace(/\s*\((?:sample company|fictional|exemple)\)\s*$/i, "").replace(/[.,;:!]+$/, "");
      if (!x || x.length > 40 || NOT_COMPANY.test(x) || SK().some(function (sk) { return sk.a.indexOf(norm(x)) >= 0; }) || /\b(intern|internship|stage|manager|analyst|programme|program|graduate|cdi|cdd|h\/f)\b/i.test(x) && w < 3) return;
      cands.push({ name: x, w: w });
    }
    var lines = t.split(/\n/).map(clean).filter(Boolean);
    lines.slice(0, 3).forEach(function (line, i) {
      var mm = line.match(/\s(?:at|chez|@)\s+([^,|–—(]+)/i); if (mm) addC(mm[1], 2);
      line.split(/\s[—–|-]\s/).forEach(function (part, j) { if (j > 0 || i > 0) addC(part.split(/,\s/)[0], 1); });
    });
    var re = /(?:\b[Aa]bout|[Àà] propos de|\b[Aa] propos de|\b[Jj]oin|\b[Rr]ejoigne[zr]|\b[Rr]ejoindre|\b[Cc]hez|\bat)[ \t]+([A-Z][\w&'’.-]*(?:[ \t]+[A-Z][\w&'’.-]*){0,3})/g;
    while ((m = re.exec(t))) addC(m[1], 2);
    re = /\b([A-Z][\w&'’.-]*(?:[ \t]+[A-Z][\w&'’.-]*){0,2})[ \t]+(?:is hiring|is looking|recrute|recherche|is an?\b(?! plus)|est une?\b(?! plus))/g;
    while ((m = re.exec(t))) addC(m[1], 2);
    emails.forEach(function (e) {
      var dom = e.split("@")[1].toLowerCase();
      if (FREE_MAIL.indexOf(dom) < 0) { var base = dom.split(".").slice(-2, -1)[0] || ""; if (base.length > 1) addC(base.charAt(0).toUpperCase() + base.slice(1), 1); }
    });
    if (!cands.length) return "";
    cands.forEach(function (c) {
      var first = c.name.split(/\s+/)[0];
      var reps = (t.match(new RegExp("(?<![\\w])" + E.esc(first) + "(?![\\w])", "gi")) || []).length;
      c.score = c.w + reps * 1.5 - (c.name.split(/\s+/).length > 2 ? 1 : 0);
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    // prefer the short brand ("UNIQLO") over a longer variant ("UNIQLO France") when both are candidates
    var best = cands[0].name;
    var short = cands.filter(function (c) { return best.indexOf(c.name) === 0 && c.name.length < best.length; })[0];
    return short ? short.name : best;
  }
  function contractType(jd, lang) {
    var n = norm(jd);
    var map = [
      [/\b(internship|intern|stage|stagiaire|convention de stage)\b/, "internship", "stage"],
      [/\b(alternance|apprenticeship|apprentissage|apprenti|work[- ]study|contrat de professionnalisation)\b/, "apprenticeship", "alternance"],
      [/\b(graduate (?:program|programme|scheme)|v\.?i\.?e\b|volontariat international|management trainee|leadership program)\b/, "graduate programme", "programme graduate"],
      [/\b(cdi|permanent|contrat a duree indeterminee|full[- ]time permanent)\b/, "permanent", "CDI"],
      [/\b(cdd|fixed[- ]term|temporary|contrat a duree determinee|interim)\b/, "fixed-term", "CDD"],
      [/\b(freelance|contractor|independant|mission)\b/, "freelance", "freelance"]
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(n)) return lang === "fr" ? map[i][2] : map[i][1];
    return "";
  }
  function startDate(jd) {
    var t = String(jd);
    var pats = [
      /\b(?:start(?:ing)?(?: date)?|starts?|from|beginning|d[eé]but(?:\s+du\s+(?:stage|contrat|poste))?|date de d[eé]but|[àa] partir d[eu']?|d[eè]s)\s*:?\s*((?:early |mid[- ]|late |début |mi-|fin )?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(?:19|20)\d{2})/i,
      /\b(?:start(?:ing)?(?: date)?|d[eé]but|date de d[eé]but|[àa] partir d[eu']?|d[eè]s)\s*:?\s*(asap|as soon as possible|immediately|d[eè]s que possible|imm[eé]diatement|\d{1,2}[/.]\d{1,2}[/.](?:19|20)?\d{2})/i,
      /\b(asap|as soon as possible|d[eè]s que possible)\b/i
    ];
    for (var i = 0; i < pats.length; i++) { var m = t.match(pats[i]); if (m) return clean(m[1]); }
    return "";
  }
  function duration(jd) {
    var m = String(jd).match(/\b(\d{1,2})(?:\s*(?:to|à|-|–)\s*\d{1,2})?[- ]?(months?|mois|weeks?|semaines?|years?|ans?)\b/i);
    if (!m) return "";
    // ignore "2 years of experience" style requirements
    var after = String(jd).slice(m.index, m.index + m[0].length + 25);
    if (/\b(experience|expérience|exp[eé]rience)\b/i.test(after)) return "";
    return clean(m[0]);
  }
  var CITIES = /\b(Paris|Lyon|Marseille|Lille|Toulouse|Bordeaux|Nantes|Nice|Strasbourg|Montpellier|Rennes|Grenoble|La Défense|Luxembourg|Brussels|Bruxelles|Geneva|Genève|Lausanne|Zurich|London|Dublin|Amsterdam|Berlin|Munich|Madrid|Barcelona|Milan|Lisbon|Lisbonne|Montréal|Montreal|New York|Remote|Télétravail|Hybrid|Hybride)\b/;
  function locationOf(jd) {
    var t = String(jd);
    var m = t.match(/^\s*(?:location|lieu|localisation|based in|bas[eé] [àa]|ville|workplace|lieu de travail)\s*:?\s*(.+)$/im);
    if (m) return clean(m[1]).replace(/[.;]$/, "").slice(0, 60);
    var first = t.split(/\n/).slice(0, 3).join(" ");
    var c = first.match(CITIES) || t.match(CITIES);
    return c ? c[0] : "";
  }

  /* ---------- keyword buckets ---------- */
  var INLINE_MUST = /^\W*(?:basic |minimum |required |key |essential )?(?:qualifications?|requirements?|profile|profil(?: recherch[eé])?|pr[eé]requis|must[- ]haves?)\s*:/i;
  var INLINE_NICE = /^\W*(?:preferred(?: qualifications?)?|nice[- ]to[- ]haves?|bonus|a plus|atouts?|id[eé]alement|pluses)\s*:/i;
  function sectionOfLines(jd) {
    var lines = String(jd).split(/\n/), cur = "", out = [];
    lines.forEach(function (l) {
      var c = clean(l);
      if (INLINE_MUST.test(c) && c.length > 30) { out.push({ text: c, section: "must" }); return; }
      if (INLINE_NICE.test(c) && c.length > 20) { out.push({ text: c, section: "nice" }); return; }
      if (REQ_HEAD_RE.test(c)) cur = "must"; else if (NICE_HEAD_RE.test(c)) cur = "nice"; else if (ANY_HEAD_RE.test(c) && !E.BULLET_RE.test(c) && c.split(" ").length <= 5 && /:$|^[A-ZÀ-Ý][^.]*$/.test(c) && c.length < 40) cur = "";
      out.push({ text: c, section: cur });
    });
    return out;
  }
  function bucketKeywords(jd, kws, title) {
    var lines = sectionOfLines(jd);
    var nTitle = norm(title);
    kws.forEach(function (k) {
      var inTitle = E.hasSkill(nTitle, k);
      var must = inTitle, nice = false;
      lines.forEach(function (l) {
        var n = norm(l.text);
        if (!E.hasSkill(n, k)) return;
        // look at the clause around the keyword so "Excel; SQL or Power BI is a plus" marks only SQL/Power BI
        var clauses = l.text.split(/[;.]\s+|\s+(?:and|et)\s+(?=[A-ZÀ-Ý])/);
        clauses.forEach(function (cl) {
          if (!E.hasSkill(norm(cl), k)) return;
          if (NICE_RE.test(cl) || l.section === "nice") nice = true;
          else if (MUST_RE.test(cl) || l.section === "must") must = true;
        });
      });
      if (k.count >= 2 && !nice) must = true;
      k.bucket = must && !nice ? "must" : (nice ? "nice" : "context");
      if (inTitle) k.bucket = "must";
    });
    return kws;
  }

  /* ---------- eligibility ---------- */
  var LEVELS = [
    [/\b(native|natif|native speaker|langue maternelle|maternelle|mother tongue|bilingual|bilingue|c2)\b/i, 6],
    [/\b(c1|fluent|fluency|courant|advanced|avanc[eé]|full professional|professional proficiency|excellent|parfait|parfaite|fluide)\b/i, 5],
    [/\b(b2|upper[- ]intermediate|professional working|business level|working proficiency|op[eé]rationnel|op[eé]rationnelle|good command|bon niveau|professional|professionnel)\b/i, 4],
    [/\b(b1|intermediate|interm[eé]diaire|conversational|scolaire)\b/i, 3],
    [/\b(a2|elementary|[eé]l[eé]mentaire)\b/i, 2],
    [/\b(a1|basic|basique|notions?|beginner|d[eé]butant)\b/i, 1]
  ];
  function levelOf(s) { s = String(s || ""); for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i][0].test(s)) return LEVELS[i][1]; return 0; }
  var LANGS = [["english", "anglais"], ["french", "francais", "français"], ["spanish", "espagnol"], ["german", "allemand"], ["italian", "italien"], ["portuguese", "portugais"], ["arabic", "arabe"], ["mandarin", "chinese", "chinois"], ["japanese", "japonais"], ["dutch", "neerlandais"], ["russian", "russe"], ["hindi"], ["korean", "coreen"]];
  function langKey(s) { var n = norm(s).trim(); for (var i = 0; i < LANGS.length; i++) if (LANGS[i].map(norm).indexOf(n) >= 0) return LANGS[i][0]; return n; }

  function eligibility(jd, target, lang) {
    var out = [];
    var sents = E.sentences(jd);
    function add(key, requirement, extra) { out.push(Object.assign({ key: key, requirement: clean(requirement).slice(0, 160), status: "unknown", note: "" }, extra || {})); }
    sents.forEach(function (s) {
      if (/\b(authori[sz]ed to work|right to work|work permit|work authori[sz]ation|eligible to work|legally (?:able|allowed) to work|autorisation de travail|titre de s[eé]jour|permis de travail|eu (?:citizen|national|passport)|ressortissant|nationalit[eé] (?:fran[cç]aise|europ[eé]enne)|visa sponsorship|sponsor(?:ship)?|no sponsorship)\b/i.test(s)) add("workauth", s);
      if (/\b(relocat\w*|willing to move|mobilit[eé] g[eé]ographique|d[eé]m[eé]nag\w*)\b/i.test(s)) add("relocation", s);
      if (/\b(weekends?|week-ends?|saturdays?|sundays?|samedis?|dimanches?|evening shifts?|night shifts?|horaires d[eé]cal[eé]s|travail en soir[eé]e)\b/i.test(s)) add("weekend", s);
      if (/\b(driving licen[cs]e|driver'?s licen[cs]e|permis b|permis de conduire)\b/i.test(s)) add("driving", s);
      if (/\b(bachelor|master'?s?|msc|mba|phd|bac\s*\+\s*\d|licence|degree|dipl[oô]me|grande [eé]cole|business school|[eé]cole de commerce|engineering school|[eé]cole d'ing[eé]nieurs?|currently enrolled|enrolled in|student in|[eé]tudiant)\b/i.test(s) && (/\b(required|must|minimum|you are|you have|currently|en cours|vous [eê]tes|requis|de formation|issu|issue|pursuing|enrolled|[eé]tudiant|graduating|dipl[oô]m[eé])\b/i.test(s) || /^\W*(bachelor|master|msc|mba|licence|bac|degree|dipl[oô]me|[eé]tudiant|student)/i.test(s))) add("degree", s);
      LANGS.forEach(function (names) {
        var hit = names.some(function (nm) { return new RegExp("\\b" + E.esc(nm) + "\\b", "i").test(norm(s)); });
        if (!hit) return;
        var req = levelOf(s);
        if (!req) {
          if (!/\b(speak|speaking|written|spoken|language|langue|parl[eé]|[eé]crit|ma[iî]trise|is a plus|un plus|required|requis)\b/i.test(s)) return;
          req = /\b(is a plus|un plus|un atout|nice)\b/i.test(s) ? 0 : 4;
        }
        if (/\b(a plus|un plus|un atout|nice to have|preferred|id[eé]alement|souhait)/i.test(s)) req = Math.min(req, 0);
        if (out.some(function (o) { return o.key === "language" && o.lang === names[0]; })) return;
        add("language", s, { lang: names[0], level: req });
      });
    });
    if (target.start) add("start", (lang === "fr" ? "Début : " : "Start: ") + target.start);
    if (target.duration) add("duration", (lang === "fr" ? "Durée : " : "Duration: ") + target.duration);
    if (target.location) add("location", (lang === "fr" ? "Lieu : " : "Location: ") + target.location);
    // keep the first match of each key except languages
    var seen = {};
    return out.filter(function (o) { var k = o.key === "language" ? o.key + o.lang : o.key; if (seen[k]) return false; seen[k] = 1; return true; });
  }

  /* Mark each eligibility requirement as met / not_met / unknown from the master CV. */
  function checkEligibility(items, master, masterTextStr) {
    var mt = norm(masterTextStr);
    return items.map(function (e) {
      var o = Object.assign({}, e);
      if (e.key === "language") {
        var have = (master.languages || []).filter(function (l) { return langKey(l.language) === e.lang; })[0];
        if (!e.level) { o.status = have ? "met" : "unknown"; o.note = have ? have.language + (have.level ? " (" + have.level + ")" : "") : ""; return o; }
        if (!have) { o.status = "not_met"; o.note = "missing"; return o; }
        var lv = levelOf(have.level);
        o.status = !lv ? "unknown" : (lv >= e.level ? "met" : "not_met");
        o.note = have.language + (have.level ? " (" + have.level + ")" : "");
        return o;
      }
      if (e.key === "degree") {
        var deg = (master.education || []).map(function (d) { return d.degree + " " + d.school; }).join(" ");
        var needMaster = /\b(master|msc|mba|bac\s*\+\s*5|grande [eé]cole)\b/i.test(e.requirement), needBachelor = /\b(bachelor|licence|bac\s*\+\s*3|degree)\b/i.test(e.requirement);
        var hasMaster = /\b(master|msc|m\.sc|mba|mast[eè]re|grande [eé]cole|pge)\b/i.test(deg), hasBachelor = hasMaster || /\b(bachelor|licence|bsc|b\.sc|ba|b\.tech|btech|bcom|degree)\b/i.test(deg);
        o.status = (needMaster && hasMaster) || (!needMaster && needBachelor && hasBachelor) || (!needMaster && !needBachelor && (master.education || []).length) ? "met" : "unknown";
        return o;
      }
      if (e.key === "driving") { o.status = /\b(driving licen[cs]e|permis b|permis de conduire)\b/.test(mt) ? "met" : "unknown"; return o; }
      if (e.key === "location") {
        var loc = norm(master.contact && master.contact.location);
        var tl = norm(e.requirement.split(":").slice(1).join(":"));
        o.status = loc && tl && (tl.indexOf(loc.split(",")[0].trim()) >= 0 || loc.indexOf(tl.trim()) >= 0) ? "met" : "unknown";
        return o;
      }
      if (e.key === "workauth") { o.status = /\b(eu citizen|eu national|work permit|titre de sejour|autorisation de travail|right to work)\b/.test(mt) ? "met" : "unknown"; return o; }
      return o;
    });
  }

  /* ---------- the job object ---------- */
  function newJob(text) {
    var jd = String(text || "").normalize("NFC");
    var lang = E.detectLang(jd);
    var emails = (jd.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(function (e) { return e.toLowerCase(); });
    var target = {
      company: companyName(jd, emails), role: jobTitle(jd), contract: contractType(jd, lang),
      start: startDate(jd), duration: duration(jd), location: locationOf(jd)
    };
    var nameN = norm(target.company);
    var progs = (target.role.match(/\(([A-Z][A-Z0-9&]{1,6})\)/g) || []).map(function (x) { return norm(x.replace(/[()]/g, "")); });
    var kws = E.extractJobKeywords(jd, SK()).filter(function (k) {
      if (k.t !== "d") return true;
      var a = k.a[0];
      return !(nameN && (nameN === a || nameN.split(/\s+/).indexOf(a) >= 0)) && progs.indexOf(a) < 0;
    });
    kws = bucketKeywords(jd, kws, target.role);
    var freeMail = emails.filter(function (e) { return FREE_MAIL.indexOf(e.split("@")[1]) >= 0; });
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text: jd, lang: lang, target: target, keywords: kws,
      eligibility: eligibility(jd, target, lang),
      emails: emails, freeMail: freeMail, programmes: progs
    };
  }

  var api = { newJob: newJob, jobTitle: jobTitle, companyName: companyName, contractType: contractType, startDate: startDate, duration: duration, locationOf: locationOf,
    bucketKeywords: bucketKeywords, eligibility: eligibility, checkEligibility: checkEligibility, levelOf: levelOf, langKey: langKey, FREE_MAIL: FREE_MAIL };
  root.TailrJob = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
