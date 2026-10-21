/* Tailr CV parser: CV text -> master CV JSON.
   The user reviews and corrects the result before tailoring; the confirmed JSON is the only
   source of truth for everything that follows. */
(function (root) {
  "use strict";
  var E = root.TailrEngine || (typeof require === "function" ? require("./engine.js") : null);
  var P = root.TailrPhone || (typeof require === "function" ? require("./phone.js") : null);
  var norm = E.norm, clean = E.clean;

  /* ---------- empty master ---------- */
  function emptyMaster() {
    return { name: "", headline: "", contact: { phone: "", email: "", location: "", linkedin: "", portfolio: "" }, summary: "",
      skills: [], experience: [], projects: [], education: [], certifications: [], languages: [], other: [] };
  }
  function emptyRole() { return { title: "", company: "", location: "", dates: "", bullets: [] }; }
  function emptyProject() { return { name: "", tech: "", dates: "", bullets: [] }; }
  function emptyEducation() { return { degree: "", school: "", location: "", dates: "", details: "" }; }

  /* Make every string one line, trim arrays, drop empty bullets. Used on every master and output. */
  function sanitize(obj) {
    if (Array.isArray(obj)) return obj.map(sanitize).filter(function (v) { return !(typeof v === "string" && !v); });
    if (obj && typeof obj === "object") { var o = {}; Object.keys(obj).forEach(function (k) { o[k] = sanitize(obj[k]); }); return o; }
    if (typeof obj === "string") return clean(obj);
    return obj;
  }
  function normalizeMaster(m) {
    var b = emptyMaster();
    m = m || {};
    Object.keys(b).forEach(function (k) { if (m[k] !== undefined) b[k] = m[k]; });
    b.contact = Object.assign(emptyMaster().contact, m.contact || {});
    b.experience = (b.experience || []).map(function (r) { return Object.assign(emptyRole(), r, { bullets: (r.bullets || []).map(stripBullet) }); });
    b.projects = (b.projects || []).map(function (r) { return Object.assign(emptyProject(), r, { bullets: (r.bullets || []).map(stripBullet) }); });
    b.education = (b.education || []).map(function (r) { return Object.assign(emptyEducation(), r); });
    b.languages = (b.languages || []).map(function (l) { return { language: l.language || "", level: l.level || "" }; });
    b = sanitize(b);
    b.experience = b.experience.filter(function (r) { return r.title || r.company || r.bullets.length; });
    b.projects = b.projects.filter(function (r) { return r.name || r.bullets.length; });
    b.education = b.education.filter(function (r) { return r.degree || r.school; });
    b.languages = b.languages.filter(function (l) { return l.language; });
    return b;
  }
  function stripBullet(s) { return clean(String(s || "").replace(E.BULLET_RE, "")); }

  /* ---------- dates ---------- */
  var MONTH = "(?:jan(?:uary|v(?:ier)?)?|feb(?:ruary)?|f[eé]v(?:r(?:ier)?)?|mar(?:ch|s)?|apr(?:il)?|avr(?:il)?|may|mai|jun(?:e)?|juin|jul(?:y)?|juil(?:let)?|aug(?:ust)?|ao[uû]t|sep(?:t(?:ember|embre)?)?|oct(?:ober|obre)?|nov(?:ember|embre)?|dec(?:ember)?|d[eé]c(?:embre)?)\\.?";
  var YEAR = "(?:19|20)\\d{2}";
  var DATE = "(?:" + MONTH + "\\s+" + YEAR + "|\\d{1,2}[/.]" + YEAR + "|" + YEAR + "|" + MONTH + ")";
  var NOW = "(?:present|current|now|today|ongoing|aujourd'hui|aujourd’hui|pr[eé]sent|actuel(?:lement)?|en cours|[aà] ce jour|maintenant)";
  var SEP = "\\s*(?:–|—|-|to|à|au|until|jusqu'(?:à|en)|›|>)\\s*";
  var RANGE_RE = new RegExp("(?:(?:since|depuis|from|de)\\s+)?" + DATE + "(?:" + SEP + "(?:" + DATE + "|" + NOW + "))?", "i");
  var HAS_YEAR_RE = new RegExp("(?<![0-9])" + YEAR + "(?![0-9])|" + NOW, "i");
  function findDates(line) {
    var re = new RegExp(RANGE_RE.source, "gi"), m, best = null;
    while ((m = re.exec(line))) {
      if (!m[0].trim()) { re.lastIndex++; continue; }
      if (!HAS_YEAR_RE.test(m[0]) && !/[–—-]|to|à/.test(m[0])) continue; // a bare month name is not a date
      if (!HAS_YEAR_RE.test(m[0])) continue;
      var pre = line.slice(0, m.index);
      // keep a leading month range like "Jun–Aug 2026": the regex already handles MONTH - MONTH YEAR
      if (!best || m[0].length > best[0].length) best = { 0: m[0], index: m.index };
    }
    if (!best) return null;
    return { text: best[0].trim().replace(/^[(\[]|[)\]]$/g, ""), index: best.index, length: best[0].length };
  }
  function hasDate(line) { return !!findDates(line); }

  /* Years of experience: rough sum of role durations (overlaps counted once). */
  var MONTHS = { jan: 0, janv: 0, feb: 1, fev: 1, fevr: 1, mar: 2, mars: 2, apr: 3, avr: 3, may: 4, mai: 4, jun: 5, juin: 5, jul: 6, juil: 6, aug: 7, aou: 7, aout: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  function monthIndex(w) { w = norm(w).replace(/[^a-z]/g, ""); for (var k = 5; k >= 3; k--) { if (MONTHS[w.slice(0, k)] !== undefined) return MONTHS[w.slice(0, k)]; } return null; }
  function parseRange(dates, now) {
    now = now || new Date();
    var n = norm(dates);
    var years = (n.match(/(?:19|20)\d{2}/g) || []).map(Number);
    var months = (n.match(new RegExp(MONTH, "gi")) || []).map(monthIndex).filter(function (x) { return x !== null; });
    var slash = n.match(/(\d{1,2})[/.]((?:19|20)\d{2})/g) || [];
    var isNow = new RegExp(NOW, "i").test(n);
    if (!years.length) return null;
    var sy = years[0], ey = isNow ? now.getFullYear() : years[years.length - 1];
    var sm = 0, em = 11;
    if (slash.length) { sm = Number(slash[0].split(/[/.]/)[0]) - 1; if (slash.length > 1) em = Number(slash[1].split(/[/.]/)[0]) - 1; }
    else if (months.length) { sm = months[0]; em = months.length > 1 ? months[months.length - 1] : (years.length > 1 || isNow ? 11 : months[0]); }
    if (isNow) em = now.getMonth();
    var start = sy * 12 + sm, end = ey * 12 + em;
    if (end < start) end = start;
    return { start: start, end: end };
  }
  function yearsOfExperience(master, now) {
    var spans = (master.experience || []).map(function (r) { return parseRange(r.dates, now); }).filter(Boolean).sort(function (a, b) { return a.start - b.start; });
    var total = 0, cs = -1, ce = -1;
    spans.forEach(function (s) { if (s.start > ce) { if (ce >= 0) total += ce - cs + 1; cs = s.start; ce = s.end; } else ce = Math.max(ce, s.end); });
    if (ce >= 0) total += ce - cs + 1;
    return total / 12;
  }

  /* ---------- sections ---------- */
  var HEAD = [
    ["profile", /^(profile|profil|summary|professional summary|executive summary|about me|a propos(?: de moi)?|objective|objectif|career objective|resume|presentation|personal statement)$/],
    ["experience", /^(experience|experiences|work experience|professional experience|employment(?: history)?|work history|experience professionnelle|experiences professionnelles|parcours professionnel|career history|internships?|stages?|relevant experience|experiences? (?:en entreprise|significatives)|emplois?|volunteering|volunteer experience|benevolat|vie associative|associative experience|engagements? associatifs?|leadership(?: experience)?|activities|activites|extracurricular activities|experiences? associatives?)$/],
    ["education", /^(education|formation|formations|diplomes?|academic background|academic qualifications|parcours (?:academique|scolaire)|etudes|cursus|qualifications)$/],
    ["skills", /^(skills|technical skills|key skills|core skills|hard skills|soft skills|skills & tools|skills and tools|tools|outils|competences|competences techniques|competences cles|savoir-faire|expertise|it skills|computer skills|informatique|logiciels|software|technologies|tech stack|skills & interests|competences & langues|skills & languages)$/],
    ["languages", /^(languages?|langues?|language skills|competences linguistiques)$/],
    ["projects", /^(projects?|projets?|academic projects|personal projects|projets? academiques|projets? personnels|key projects|realisations)$/],
    ["certifications", /^(certifications?|certificates?|licenses? (?:&|and) certifications|certifications? (?:&|et) formations|awards?|honou?rs|prix|distinctions|achievements)$/],
    ["other", /^(interests|hobbies|centres? d'interets?|loisirs|passions|references|referees|personal information|informations personnelles|additional information|informations complementaires|divers|other|autres|publications)$/]
  ];
  function headerKind(line) {
    var t = clean(line);
    if (!t || t.length > 48 || E.BULLET_RE.test(t)) return null;
    var n = norm(t).replace(/[:\s]+$/, "").replace(/\s*&\s*/g, " & ").replace(/[^a-z&' -]/g, "").trim();
    for (var i = 0; i < HEAD.length; i++) if (HEAD[i][1].test(n)) return HEAD[i][0];
    return null;
  }
  function isHeader(line) { return !!headerKind(line); }

  /* ---------- contact ---------- */
  var EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  var PHONE_RE = /(?:\+|00)?\d[\d .\-() ]{7,}\d/;
  var LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s|,·•]+/i;
  var URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|behance\.net|dribbble\.com|[a-z0-9-]+\.(?:dev|io|me|page|site|com|fr|net|org|app))(?:\/[^\s|,·•]*)?/i;

  function looksLikeName(t) {
    if (!t || t.length > 48 || /[@\d:|]/.test(t) || isHeader(t)) return false;
    var w = t.split(/\s+/);
    return w.length >= 1 && w.length <= 5 && w.every(function (x) { return /^[A-Za-zÀ-ÿ'’.-]+$/.test(x); });
  }

  /* ---------- entry headers ---------- */
  var TITLE_WORDS = /\b(assistant|intern|internship|stagiaire|stage|trainee|apprenti|alternant|alternance|manager|analyst|analyste|developer|developpeur|développeur|engineer|ingenieur|ingénieur|consultant|ambassador|ambassadeur|ambassadrice|charge|chargé|chargée|responsable|coordinator|coordinateur|coordinatrice|associate|officer|executive|lead|head|director|directeur|directrice|specialist|spécialiste|designer|advisor|conseiller|conseillère|representative|vendeur|vendeuse|cashier|caissier|caissière|serveur|serveuse|waiter|waitress|barista|teacher|tutor|tuteur|professeur|president|président|présidente|vice|treasurer|trésorier|secretary|secrétaire|member|membre|volunteer|bénévole|benevole|founder|fondateur|fondatrice|co-founder|cofondateur|freelance|accountant|comptable|auditor|auditeur|controller|contrôleur|contrôleuse|recruiter|recruteur|marketer|editor|writer|rédacteur|rédactrice|researcher|chercheur|technician|technicien|operator|opérateur|agent|clerk|supervisor|superviseur|team leader|chef|employee|employé|employée|sales|commercial|commerciale|buyer|acheteur|acheteuse|planner|scientist|architect|architecte|product owner|scrum master|business developer|community manager|growth|data|marketing|finance|hr|rh)\b/i;
  var DEGREE_WORDS = /\b(bachelor|master|msc|m\.sc|mba|bsc|b\.sc|ba|ma|licence|license|bts|dut|but|bac|baccalaur[eé]at|diploma|dipl[oô]me|degree|phd|doctorat|doctorate|grande [eé]cole|programme grande [eé]cole|pge|engineering degree|dipl[oô]me d'ing[eé]nieur|high school|lyc[eé]e|certificate|certificat|associate degree|a-levels|gcse|mast[eè]re|mastère|bachelier|prépa|cpge|classe pr[eé]paratoire|b\.tech|btech|m\.tech|mtech|b\.e\.|bcom|b\.com)\b/i;
  var SCHOOL_WORDS = /\b(university|université|universite|universidad|universität|school|école|ecole|college|collège|institute|institut|iae|business school|academy|académie|lyc[eé]e|polytechnique|sciences po|insa|ensae|essec|hec|escp|edhec|emlyon|skema|neoma|kedge|audencia|psb|iscp|inseec|ieseg|tbs|grenoble em|montpellier bs|rennes sb|iit|nit|iim)\b/i;
  var CITY_LIKE = /^(remote|hybrid|t[eé]l[eé]travail|[A-ZÀ-Ý][\wÀ-ÿ'’.-]*(?:[ -][A-ZÀ-Ý][\wÀ-ÿ'’.-]*){0,2}(?:,\s*[A-ZÀ-Ý][\wÀ-ÿ'’.-]*(?:\s[A-ZÀ-Ý][\wÀ-ÿ'’.-]*)?)?)$/;
  var CORP_SUFFIX = /^(inc\.?|ltd\.?|llc|sa|sas|sarl|gmbh|plc|corp\.?|co\.?|ag|bv|nv|spa|srl|limited)$/i;

  function splitParts(s) {
    return clean(s).split(/\s+[—–|·•]\s+|\s+-\s+|\s*\|\s*|\s+at\s+|\s+chez\s+|\s+@\s+/).map(function (p) { return clean(p).replace(/^[,;:·•|–—-]+|[,;:·•|–—-]+$/g, "").trim(); }).filter(Boolean);
  }
  function splitCompanyLocation(s) {
    var parts = s.split(/,\s*/);
    if (parts.length >= 2) {
      var last = parts[parts.length - 1].trim();
      if (!CORP_SUFFIX.test(last) && CITY_LIKE.test(last) && last.split(/\s+/).length <= 3 && !TITLE_WORDS.test(last)) {
        return { company: parts.slice(0, -1).join(", ").trim(), location: last };
      }
    }
    var paren = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (paren && CITY_LIKE.test(paren[2].trim()) && !TITLE_WORDS.test(paren[2])) return { company: paren[1].trim(), location: paren[2].trim() };
    return { company: s.trim(), location: "" };
  }

  /* Header lines of an entry -> fields */
  function entryFromHeader(lines, kind) {
    var dates = "", rest = [];
    lines.forEach(function (l) {
      var d = !dates && findDates(l);
      if (d) { dates = d.text; l = (l.slice(0, d.index) + " " + l.slice(d.index + d.length)); }
      l = clean(l).replace(/^[,;:·•|–—()\-\s]+|[,;:·•|–—(\-\s]+$/g, "").replace(/\(\s*\)/g, "").trim();
      if (l) rest.push(l);
    });
    var parts = [];
    rest.forEach(function (l) { splitParts(l).forEach(function (p) { parts.push(p); }); });
    if (kind === "education") {
      var e = { degree: "", school: "", location: "", dates: dates, details: "" }, extra = [];
      parts.forEach(function (p) {
        if (!e.degree && DEGREE_WORDS.test(p) && !(SCHOOL_WORDS.test(p) && !/\b(bachelor|master|licence|mba|msc|bts|dut|phd|diploma|dipl[oô]me|degree)\b/i.test(p))) e.degree = p;
        else if (!e.school && SCHOOL_WORDS.test(p)) { var sl = splitCompanyLocation(p); e.school = sl.company; e.location = sl.location; }
        else extra.push(p);
      });
      if (!e.degree && extra.length) e.degree = extra.shift();
      if (!e.school && extra.length) { var sl2 = splitCompanyLocation(extra.shift()); e.school = sl2.company; e.location = e.location || sl2.location; }
      if (!e.location && extra.length && CITY_LIKE.test(extra[0]) && extra[0].split(/\s+/).length <= 3) e.location = extra.shift();
      e.details = extra.join("; ");
      return e;
    }
    if (kind === "projects") {
      var pr = { name: parts[0] || "", tech: "", dates: dates, bullets: [] };
      var techPart = parts.slice(1).join(" | ");
      var tm = (parts[0] || "").match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      if (tm && /[,/]|\b(python|sql|excel|react|java|figma|power bi|tableau|r)\b/i.test(tm[2])) { pr.name = tm[1]; pr.tech = tm[2]; }
      if (techPart) pr.tech = clean((pr.tech ? pr.tech + ", " : "") + techPart.replace(/^(tech(?:nologies|nologies used)?|tools|outils|stack)\s*:\s*/i, ""));
      return pr;
    }
    // experience
    var r = { title: "", company: "", location: "", dates: dates, bullets: [] };
    if (parts.length === 1) { r.title = parts[0]; return r; }
    var ti = 0;
    if (!TITLE_WORDS.test(parts[0]) && parts[1] && TITLE_WORDS.test(parts[1])) ti = 1;
    r.title = parts[ti];
    var others = parts.filter(function (_, i) { return i !== ti; });
    var cl = splitCompanyLocation(others[0] || "");
    r.company = cl.company; r.location = cl.location;
    if (others.length > 1) {
      var loc = others[others.length - 1];
      if (!r.location && CITY_LIKE.test(loc) && loc.split(/\s+/).length <= 3) { r.location = loc; others = others.slice(0, -1); }
      if (others.length > 1) r.company = clean(others.join(", "));
      if (!r.location) { var cl2 = splitCompanyLocation(r.company); r.company = cl2.company; r.location = cl2.location; }
    }
    return r;
  }

  /* Group the lines of an entry section into entries. */
  function groupEntries(lines, kind) {
    var entries = [], cur = null, state = "header";
    function close() { if (cur && (cur.header.length || cur.body.length)) entries.push(cur); cur = null; state = "header"; }
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      if (!clean(line)) { if (cur && cur.body.length) close(); return; }
      var bullet = E.BULLET_RE.test(line);
      if (bullet) { if (!cur) cur = { header: [], body: [] }; cur.body.push(line.replace(E.BULLET_RE, "")); state = "body"; return; }
      var dated = hasDate(line);
      if (state === "body") {
        // a lower-case line right after a bullet continues it (a wrapped PDF line)
        if (!dated && cur.body.length && /^[a-zà-ÿ(]/.test(clean(line))) { cur.body[cur.body.length - 1] += " " + clean(line); return; }
        // entries written without bullet symbols: plain lines stay in the body until a blank line or a new date
        if (!dated && cur.plain) { cur.body.push(line); return; }
        close();
      }
      if (!cur) { cur = { header: [line], body: [] }; return; }
      var headerHasDate = cur.header.some(hasDate);
      if (headerHasDate && dated) { close(); cur = { header: [line], body: [] }; return; }
      if (headerHasDate && !dated && (clean(line).length > 70 || cur.header.length >= 2)) { cur.body.push(line); cur.plain = true; state = "body"; return; }
      if (cur.header.length >= 3) { close(); cur = { header: [line], body: [] }; return; }
      cur.header.push(line);
    });
    close();
    return entries.map(function (en) {
      var e = entryFromHeader(en.header, kind);
      var body = en.body.map(stripBullet).filter(Boolean);
      if (kind === "education") e.details = clean([e.details].concat(body).filter(Boolean).join("; "));
      else e.bullets = body;
      return e;
    });
  }

  /* ---------- skills and languages ---------- */
  var LANG_NAMES = /^(english|anglais|french|fran[cç]ais|spanish|espagnol|german|allemand|italian|italien|portuguese|portugais|arabic|arabe|mandarin|chinese|chinois|japanese|japonais|hindi|russian|russe|dutch|n[eé]erlandais|korean|cor[eé]en|turkish|turc|polish|polonais|swedish|su[eé]dois|greek|grec|hebrew|h[eé]breu|bengali|urdu|ourdou|punjabi|tamil|telugu|marathi|gujarati|persian|persan|farsi|vietnamese|vietnamien|thai|tha[iï]|indonesian|indon[eé]sien|malay|romanian|roumain|ukrainian|ukrainien|czech|tch[eè]que|hungarian|hongrois|catalan|basque|breton|wolof|swahili|lingala|berber|berb[eè]re|tamazight|kabyle|cantonese|cantonais|danish|danois|norwegian|norv[eé]gien|finnish|finnois)$/i;
  function isLanguageName(s) { return LANG_NAMES.test(norm(s).trim()) || LANG_NAMES.test(String(s).trim()); }
  function splitItems(s) {
    return String(s).split(/\s*[,;•·|]\s*|\s+\/\s+|\s+-\s+(?=[A-ZÀ-Ý])/).map(function (x) { return clean(x).replace(/^[-–—*]\s*/, "").replace(/[.;]$/, ""); }).filter(Boolean);
  }
  function parseLanguages(text) {
    var out = [];
    var s = String(text).replace(/^(languages?|langues?)\s*:\s*/i, "");
    // split on commas/semicolons/bullets that are not inside parentheses
    var items = [], depth = 0, buf = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === "(") depth++; if (ch === ")") depth = Math.max(0, depth - 1);
      if (depth === 0 && /[,;•·|\n]/.test(ch)) { items.push(buf); buf = ""; } else buf += ch;
    }
    items.push(buf);
    items.map(clean).filter(Boolean).forEach(function (it) {
      it = it.replace(E.BULLET_RE, "");
      var m = it.match(/^([A-Za-zÀ-ÿ'’ -]+?)\s*(?:\(([^)]+)\)|[:–—-]\s*(.+)|\s+((?:native|natif|native speaker|langue maternelle|maternelle|bilingual|bilingue|fluent|courant|advanced|avancé|intermediate|interm[eé]diaire|basic|notions|professional|professionnel|business|elementary|[ABC][12]).*))?$/i);
      if (m && (isLanguageName(m[1]) || m[2] || m[3] || m[4])) out.push({ language: clean(m[1]), level: clean(m[2] || m[3] || m[4] || "") });
      else if (isLanguageName(it)) out.push({ language: it, level: "" });
    });
    return out;
  }

  /* ---------- main parser ---------- */
  function parseCv(text, opts) {
    opts = opts || {};
    var m = emptyMaster();
    var lines = String(text || "").normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, " ").split("\n").map(function (l) { return l.replace(/\s+$/, ""); });
    var firstHeader = lines.findIndex(isHeader);
    if (firstHeader < 0) firstHeader = Math.min(lines.length, 8);
    var top = lines.slice(0, firstHeader).map(clean).filter(Boolean);

    // name, headline, contact
    var topRest = [];
    top.forEach(function (l, i) {
      var pieces = l.split(/\s*[|·•]\s*|\s{3,}/).map(clean).filter(Boolean);
      pieces.forEach(function (p) {
        var em = p.match(EMAIL_RE), li = p.match(LINKEDIN_RE), ph = p.match(PHONE_RE);
        if (em && !m.contact.email) { m.contact.email = em[0]; p = clean(p.replace(em[0], "")); }
        if (li && !m.contact.linkedin) { m.contact.linkedin = li[0].replace(/^https?:\/\/(www\.)?/, ""); p = clean(p.replace(li[0], "")); }
        if (ph && !m.contact.phone && ph[0].replace(/\D/g, "").length >= 8) { m.contact.phone = clean(ph[0]); p = clean(p.replace(ph[0], "")); }
        var url = p.match(URL_RE);
        if (url && !m.contact.portfolio && !EMAIL_RE.test(p)) { m.contact.portfolio = url[0].replace(/^https?:\/\/(www\.)?/, ""); p = clean(p.replace(url[0], "")); }
        p = p.replace(/^(e-?mail|t[eé]l(?:[eé]phone)?|phone|mobile|portable|adresse|address|linkedin)\s*:?\s*/i, "").replace(/^[,;:·•|–—-]+|[,;:·•|–—-]+$/g, "").trim();
        if (p) topRest.push(p);
      });
    });
    if (topRest.length && looksLikeName(topRest[0])) m.name = topRest.shift();
    else if (topRest.length && topRest[0].split(/\s+/).length <= 5 && !/\d/.test(topRest[0])) m.name = topRest.shift();
    var summaryBits = [];
    topRest.forEach(function (p) {
      var pc = p.match(/\b\d{4,5}\s+([A-ZÀ-Ý][\wÀ-ÿ' -]+)$/);
      if (!m.contact.location && pc) { m.contact.location = clean(pc[1]); return; }
      if (!m.contact.location && CITY_LIKE.test(p) && p.split(/\s+/).length <= 4 && !TITLE_WORDS.test(p)) { m.contact.location = p; return; }
      if (!m.headline && p.length <= 90 && p.split(/\s+/).length <= 12 && !/[.!?]$/.test(p)) { m.headline = p; return; }
      summaryBits.push(p);
    });
    if (summaryBits.length) m.summary = clean(summaryBits.join(" "));

    // sections
    var sections = [], cur = null;
    lines.slice(firstHeader).forEach(function (l) {
      var k = headerKind(l);
      if (k) { cur = { kind: k, title: clean(l), lines: [] }; sections.push(cur); return; }
      if (!cur) { cur = { kind: "other", title: "", lines: [] }; sections.push(cur); }
      cur.lines.push(l);
    });
    sections.forEach(function (sec) {
      var body = sec.lines;
      var textLines = body.map(clean).filter(Boolean);
      if (sec.kind === "profile") { m.summary = clean((m.summary ? m.summary + " " : "") + textLines.map(stripBullet).join(" ")); return; }
      if (sec.kind === "experience") { groupEntries(body, "experience").forEach(function (r) { m.experience.push(r); }); return; }
      if (sec.kind === "education") { groupEntries(body, "education").forEach(function (r) { m.education.push(r); }); return; }
      if (sec.kind === "projects") { groupEntries(body, "projects").forEach(function (r) { m.projects.push(r); }); return; }
      if (sec.kind === "languages") { parseLanguages(textLines.join("\n")).forEach(function (l) { m.languages.push(l); }); return; }
      if (sec.kind === "certifications") { textLines.forEach(function (l) { m.certifications.push(stripBullet(l)); }); return; }
      if (sec.kind === "skills") {
        textLines.forEach(function (l) {
          l = stripBullet(l);
          var lab = l.match(/^([A-Za-zÀ-ÿ&' /-]{2,40})\s*:\s*(.+)$/);
          if (lab && /^(languages?|langues?)$/i.test(lab[1].trim())) { parseLanguages(lab[2]).forEach(function (x) { m.languages.push(x); }); return; }
          var items = splitItems(lab ? lab[2] : l);
          items.forEach(function (it) {
            if (isLanguageName(it.replace(/\s*\(.*\)$/, ""))) { parseLanguages(it).forEach(function (x) { m.languages.push(x); }); return; }
            m.skills.push(it);
          });
        });
        return;
      }
      textLines.forEach(function (l) { m.other.push((sec.title ? sec.title + ": " : "") + stripBullet(l)); });
    });

    // phone format
    if (m.contact.phone && P) m.contact.phone = P.normalizePhone(m.contact.phone, m.contact.location, opts.defaultCountry).phone;
    // dedupe skills and languages
    var seen = {};
    m.skills = m.skills.filter(function (s) { var k = norm(s); if (seen[k] || s.length > 80) return false; seen[k] = 1; return true; });
    var seenL = {};
    m.languages = m.languages.filter(function (l) { var k = norm(l.language); if (seenL[k]) return false; seenL[k] = 1; return true; });
    return normalizeMaster(m);
  }

  /* Plain text of a master CV, used to check what the candidate really has. */
  function masterText(m) {
    var parts = [m.name, m.headline, m.summary].concat(m.skills || []);
    (m.experience || []).forEach(function (r) { parts.push(r.title, r.company, r.location, r.dates); parts = parts.concat(r.bullets); });
    (m.projects || []).forEach(function (r) { parts.push(r.name, r.tech, r.dates); parts = parts.concat(r.bullets); });
    (m.education || []).forEach(function (r) { parts.push(r.degree, r.school, r.location, r.dates, r.details); });
    parts = parts.concat(m.certifications || []);
    (m.languages || []).forEach(function (l) { parts.push(l.language + " " + l.level); });
    return parts.filter(Boolean).join("\n");
  }

  var api = {
    parseCv: parseCv, normalizeMaster: normalizeMaster, sanitize: sanitize, emptyMaster: emptyMaster, emptyRole: emptyRole, emptyProject: emptyProject, emptyEducation: emptyEducation,
    findDates: findDates, parseRange: parseRange, yearsOfExperience: yearsOfExperience, headerKind: headerKind, isHeader: isHeader,
    parseLanguages: parseLanguages, isLanguageName: isLanguageName, masterText: masterText, EMAIL_RE: EMAIL_RE, stripBullet: stripBullet
  };
  root.TailrParse = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
