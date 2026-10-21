/* Tailr text engine: normalising, keyword matching and job keyword extraction.
   Pure functions, no DOM. Works in the browser (window.TailrEngine) and in Node (require). */
(function (root) {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[’‘`´]/g, "'").replace(/ /g, " ");
  }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }
  function clean(s) { return String(s == null ? "" : s).normalize("NFC").replace(/[\r\n\t ]+/g, " ").replace(/\s{2,}/g, " ").trim(); }

  var reCache = {};
  function aliasRe(a) {
    if (reCache[a]) return reCache[a];
    var tail = a === "tableau" ? "(?!\\s+(?:de|d'|croise|x\\b))" : "";
    var re = new RegExp("(?<![a-z0-9+#])" + esc(a) + "(?:s|es)?(?![a-z0-9+#])" + tail, "g");
    reCache[a] = re;
    return re;
  }
  function hasAlias(n, a) { var re = aliasRe(a); re.lastIndex = 0; return re.test(n); }
  function countAlias(n, a) { var re = aliasRe(a); re.lastIndex = 0; var m = n.match(re); return m ? m.length : 0; }
  function hasSkill(n, sk) { for (var i = 0; i < sk.a.length; i++) if (hasAlias(n, sk.a[i])) return true; return false; }
  function countSkill(n, sk) {
    // count non-overlapping matches across all aliases (longest alias wins at a position)
    var spans = [];
    sk.a.forEach(function (a) { var re = aliasRe(a); re.lastIndex = 0; var m; while ((m = re.exec(n))) { spans.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; } });
    spans.sort(function (x, y) { return x[0] - y[0] || y[1] - x[1]; });
    var c = 0, end = -1;
    spans.forEach(function (s) { if (s[0] >= end) { c++; end = s[1]; } });
    return c;
  }
  function matchedAlias(n, sk) { for (var i = 0; i < sk.a.length; i++) if (hasAlias(n, sk.a[i])) return sk.a[i]; return ""; }

  /* ---------- language ---------- */
  function detectLang(text) {
    var n = " " + norm(text).replace(/[^a-z']+/g, " ") + " ";
    var fr = ["le", "la", "les", "des", "et", "vous", "nous", "pour", "avec", "une", "du", "sur", "poste", "profil", "est", "dans", "votre", "nos"];
    var en = ["the", "and", "you", "we", "for", "with", "our", "will", "to", "of", "your", "is", "in", "role", "are"];
    function c(list) { return list.reduce(function (s, w) { var m = n.match(new RegExp(" " + w + " ", "g")); return s + (m ? m.length : 0); }, 0); }
    return c(fr) > c(en) ? "fr" : "en";
  }

  /* ---------- small helpers used everywhere ---------- */
  var DANGLING = ["by", "from", "to", "and", "the", "i", "a", "an", "of", "in", "on", "at", "for", "with", "or", "as", "our", "my",
    "de", "du", "des", "la", "le", "les", "l'", "d'", "et", "ou", "en", "a", "à", "au", "aux", "pour", "par", "avec", "sur", "dans", "un", "une", "je"];
  function endsDangling(s) {
    var w = norm(clean(s)).replace(/[.,;:!?)\]]+$/, "").split(" ").pop();
    return DANGLING.indexOf(w) >= 0;
  }
  // Numbers as they appear in text: 120, 7.84, 2026, 15%, 3,5 ...
  function numbersIn(s) {
    var m = String(s || "").match(/\d+(?:[.,]\d+)*/g) || [];
    return m.map(function (x) { return x.replace(/,(?=\d{3}\b)/g, "").replace(",", "."); });
  }
  function sentences(text) {
    return String(text || "").split(/\n+|(?<=[.!?;])\s+(?=[A-ZÀ-Ý•\-–])/).map(function (s) { return clean(s.replace(api.BULLET_RE, "")); }).filter(Boolean);
  }

  /* ---------- job keywords ---------- */
  var ACR_STOP = ("CV CDI CDD HR RH OK US USA UK EU UE FR EN PME TPE SA SAS SARL SASU CEO CFO CTO COO CMO VP BAC LV1 LV2 HF FH NB ETC PDF FAQ ASAP TBD IT AI IA ESN RTT TV AND THE OR ET OU JD Q1 Q2 Q3 Q4 H1 H2 N.B KPI KPIS ROI B2B B2C CA M2 M1 L3 L2 L1 BTS DUT BUT MBA PHD DE DU LE LA LES NOUS VOUS WE YOU OUR NOTRE VOTRE TO OF IN ON AT BY AN A I MY " +
    "DIY FYI CET UTC GMT ID NA N/A HQ PS RE FW TEL TÉL A1 A2 B1 B2 C1 C2 VIE V.I.E STEM EMEA APAC LATAM NYC SF EUR USD GBP CHF").split(" ");
  var PHRASE_RE = /(?:experience (?:with|in|using|of)|hands-on experience (?:with|in)|knowledge of|working knowledge of|proficiency (?:in|with)|proficient (?:in|with)|familiarity with|familiar with|expertise in|skills in|competences? en|maitrise (?:de la |de l'|des |du |de |d')|connaissances? (?:de la |de l'|des |du |de |d'|en )|experience (?:en|avec|dans|sur) )\s*((?:[^.;:\n()]|\.(?=[a-z0-9])){2,90})/g;
  var TRIG_RE = /(?:experience (?:with|in|using|of)|knowledge of|proficiency|proficient|familiarity with|familiar with|expertise in|skills in|competences? en|maitrise|connaissances?) /g;
  var ITEM_STOP = /\b(environment|environnement|team|equipe|role|company|entreprise|years?|ans?|annees?|minimum|least|similar|field|domaine|domain|poste|related|relevant|plus|bonus|ideally|idealement|good|bonne|strong|solide|excellent|excellente|first|premiere|some|une|un|least|position|industry|secteur|fast-paced|startup|start-up|environments|context|contexte|appreciated|apprecie|appreciee|apprecies|required|requis|requise|preferred|souhaite|souhaitee|welcome|nice|essential|indispensable|mandatory|obligatoire|desirable|atout|asset)\b/;
  var LEAD_ART = /^(?:and|or|et|ou|the|a|an|la|le|les|l'|des|du|de|d'|un|une|at least|au moins|tools such as|such as|including|notamment)\s+/;
  function cleanItem(s) { return s.trim().replace(LEAD_ART, "").replace(LEAD_ART, "").replace(/\s+/g, " ").replace(/[\s,.;:-]+$/, ""); }

  /* Returns keywords found in a job description. Each keyword:
     { key, en, fr, t (h|s|l|d), a (aliases), g/gen/gfr (group), count, jd (spelling used in the posting) } */
  function extractJobKeywords(jd, skills) {
    var nfc = String(jd || "").normalize("NFC").replace(/ /g, " ");
    var n = norm(nfc);
    var sameLen = nfc.length === n.length;
    var out = [];
    skills.forEach(function (sk) {
      var c = countSkill(n, sk);
      if (!c) return;
      var spelled = "";
      if (sameLen) {
        for (var i = 0; i < sk.a.length && !spelled; i++) {
          var re = aliasRe(sk.a[i]); re.lastIndex = 0; var m = re.exec(n);
          if (m) spelled = nfc.substr(m.index, m[0].length);
        }
      }
      out.push({ key: sk.en, en: sk.en, fr: sk.fr, t: sk.t, a: sk.a, g: sk.g, gen: sk.gen, gfr: sk.gfr, count: c, spelled: spelled });
    });
    var covered = function (term) { var tn = norm(term); return skills.some(function (sk) { return hasSkill(tn, sk); }); };
    var mask = n.split("");
    out.forEach(function (o) { o.a.forEach(function (a) { var re = aliasRe(a); re.lastIndex = 0; var m; while ((m = re.exec(n))) { for (var i = m.index; i < m.index + m[0].length; i++) mask[i] = " "; if (!m[0].length) re.lastIndex++; } }); });
    var nm = mask.join("");
    var om = sameLen ? nfc.split("").map(function (ch, i) { return nm[i] === " " && n[i] !== " " ? " " : ch; }).join("") : nfc;
    var detected = [];
    om.split(/\n/).forEach(function (line) {
      var letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (letters.length > 6 && letters === letters.toUpperCase()) return;
      var m, re = /(?<![A-Za-z0-9.])([A-Z][A-Z0-9&]{1,5})(?![A-Za-z0-9.])/g;
      while ((m = re.exec(line))) {
        var w = m[1];
        if (ACR_STOP.indexOf(w) >= 0 || covered(w)) continue;
        if (!detected.some(function (d) { return d.a[0] === norm(w); })) detected.push({ key: w, en: w, fr: w, t: "d", a: [norm(w)], g: "", count: 1, jd: w, spelled: w });
      }
    });
    var m2;
    PHRASE_RE.lastIndex = 0;
    while ((m2 = PHRASE_RE.exec(nm))) {
      var start = m2.index + m2[0].length - m2[1].length;
      var chunk = m2[1];
      TRIG_RE.lastIndex = 0;
      var inner = TRIG_RE.exec(chunk);
      if (inner && inner.index > 0) { chunk = chunk.slice(0, inner.index); PHRASE_RE.lastIndex = start + inner.index; }
      var orig = sameLen ? om.substr(start, chunk.length) : chunk;
      var seps = /(,| and | & | et | or | ou |\/)/;
      var partsN = chunk.split(seps), partsO = sameLen ? orig.split(seps) : partsN;
      for (var i = 0; i < partsN.length; i += 2) {
        var item = cleanItem(partsN[i]);
        var lab = cleanItem(partsO[i] || partsN[i]);
        if (!item || item.length < 2 || item.length > 32) continue;
        if (/^(?:de|du|des|et|and|or|ou|of|the|la|le|les|en|in|on|with|avec|a|an)$/.test(item)) continue;
        if (item.split(" ").length > 3 || ITEM_STOP.test(item) || covered(item)) continue;
        if (detected.some(function (d) { return d.a[0] === item; })) continue;
        lab = lab.charAt(0).toUpperCase() + lab.slice(1);
        detected.push({ key: lab, en: lab, fr: lab, t: "d", a: [item], g: "", count: 1, jd: lab, spelled: lab });
      }
    }
    return out.concat(detected.slice(0, 8));
  }

  /* Ranges of matched keywords inside a line, for highlighting. */
  function matchRanges(text, keys) {
    var nt = String(text).normalize("NFC");
    var n = norm(nt);
    if (n.length !== nt.length) return [];
    var ranges = [];
    keys.forEach(function (k) {
      k.a.forEach(function (a) {
        if (a.length < 2) return;
        var re = aliasRe(a); re.lastIndex = 0;
        var m;
        while ((m = re.exec(n))) { ranges.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; }
      });
    });
    ranges.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var merged = [];
    ranges.forEach(function (r) { var last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()); });
    return merged;
  }

  var api = {
    norm: norm, esc: esc, clean: clean, aliasRe: aliasRe, hasAlias: hasAlias, hasSkill: hasSkill, countSkill: countSkill, matchedAlias: matchedAlias,
    detectLang: detectLang, extractJobKeywords: extractJobKeywords, matchRanges: matchRanges,
    DANGLING: DANGLING, endsDangling: endsDangling, numbersIn: numbersIn, sentences: sentences,
    BULLET_RE: /^\s*[-•●▪◦‣∙·*–—▸►✓✔➢➤○■□]\s*/
  };
  root.TailrEngine = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
