/* Tailr app: the five-step journey (CV -> check -> job -> match -> tailored CV). */
(function () {
  "use strict";
  var E = window.TailrEngine, PA = window.TailrParse, T = window.TailrTailor, V = window.TailrValidate;
  var LY = window.TailrLayout, R = window.TailrRender, PL = window.TailrPipeline, AI = window.TailrAI;
  var $ = function (id) { return document.getElementById(id); };
  var L = function () { return window.TailrLang ? window.TailrLang.get() : "en"; };
  var S = window.TailrSession.createSession();
  var draft = null;           // master CV being edited in step 2
  var engineState = { cloud: null, device: "unavailable", outLangTouched: false };

  /* ---------- text ---------- */
  var TX = {
    en: {
      needCv: "Add your CV: upload a file or paste at least a few lines.",
      needJd: "Paste the full job description (at least a few lines).",
      reading: "Reading {f}…", read: "Loaded {f}. Check the text below.",
      scanned: "This PDF has no selectable text (it may be a scan). Open it in Word or Google Docs and paste the text instead.",
      badType: "This file type isn’t supported. Use PDF, Word (.docx) or .txt.",
      oldDoc: "Old .doc files aren’t supported. Save it as .docx or PDF, or paste the text.",
      tooBig: "This file is larger than 10 MB. Use a smaller file or paste the text.",
      failRead: "We couldn’t read this file. Paste the text instead.",
      needName: "Add your name.", needEmail: "Add a valid email address: recruiters and tracking software need it.",
      contact: "Name and contact", name: "Full name", headline: "Title line (optional)", phone: "Phone", email: "Email", location: "City", linkedin: "LinkedIn", portfolio: "Website or portfolio",
      summary: "Summary", summaryHint: "Optional. Tailr writes a new summary for each job from the facts below.",
      skills: "Skills", skillsHint: "One per line or separated by commas. Don’t put languages here.",
      experience: "Experience", projects: "Projects", education: "Education", certifications: "Certifications", languages: "Languages", other: "Not used in the tailored CV",
      title: "Job title", company: "Employer", dates: "Dates", bullets: "Bullet points (one per line)", pname: "Project name", tech: "Tools used",
      degree: "Degree", school: "School", details: "Grade, major or honours", language: "Language", level: "Level",
      addRole: "Add a role", addProject: "Add a project", addEdu: "Add a degree", addLang: "Add a language", remove: "Remove", up: "Move up",
      certHint: "One per line.", empty: "Nothing yet.",
      st_present: "in your CV", st_reword: "in your CV, other words", st_adjacent: "related skill only", st_missing: "not in your CV", st_confirmed: "you confirmed it",
      claim: "I have this", unclaim: "Undo",
      e_met: "Met", e_not_met: "Not met", e_unknown: "Check",
      cloudOk: "Cloud AI ready ({m}). Sends your CV and the job to Tailr’s AI on Cloudflare; not stored, not used for training.",
      cloudNo: "Cloud AI isn’t set up on this site.",
      devOk: "Chrome’s on-device AI is ready: free and private.",
      devDl: "Chrome’s on-device AI can be downloaded (several GB, desktop Chrome only).",
      devDling: "Chrome is downloading its on-device AI…",
      devNo: "On-device AI isn’t available in this browser.",
      autoCloud: "Uses cloud AI, then on-device AI, then the standard engine if needed.",
      autoDevice: "Uses Chrome’s on-device AI, then the standard engine if needed.",
      autoRules: "No AI is available here, so the standard engine is used.",
      freeMail: "Warning: this posting asks you to apply to a free webmail address ({e}). Real employers rarely do this. Check the offer on the company’s own website before sending personal data.",
      langMismatch: "This job is in {jl} and your CV is in {cl}. AI can write the new text in the job’s language; the standard engine keeps your CV’s language.",
      noKw: "We couldn’t find recognisable skills in this posting. Add keywords yourself below.",
      p_tailor: "Writing your CV for this job…", p_ai: "Asking the AI to rewrite it…", p_fit: "Fitting it on one page…", p_check: "Reading the PDF back like recruiting software…", p_device: "Downloading on-device AI: {p}%",
      eng_cloud: "Written by cloud AI ({m}), then checked line by line against your CV.",
      eng_device: "Written by Chrome’s on-device AI, then checked line by line against your CV.",
      eng_rules: "Written by Tailr’s standard engine from your CV’s facts (no AI).",
      n_repaired: "Some AI changes broke the rules (for example an added number or a skill your CV doesn’t show) and were replaced with your original text.",
      n_fallback: "The AI wasn’t available ({r}), so the standard engine wrote this version.",
      n_short: "The AI shortened some long bullets so the CV fits on one page.",
      r_quota: "daily free limit reached", r_rate: "too many requests", r_network: "no connection", r_invalid: "its answer failed the checks", r_other: "error",
      c_readable: "Software can read the text", c_pages: "Fits the page limit", c_headings: "Standard section headings found", c_email: "Email readable", c_phone: "Phone number readable",
      c_dangling: "No line ends on a dangling word", c_split: "No keyword split across lines", c_keywords: "Must-have keywords you have are all there", c_stale: "No company from a previous job",
      pass: "PASS", fail: "FAIL", warn: "CHECK",
      lock: "Download is blocked until the critical checks pass: {list}. Edit your CV (step 2) and try again.",
      dropped: "Removed to fit one page: ", none: "None",
      fit_strong: "Strong", fit_medium: "Medium", fit_low: "Low",
      copied: "Copied", selected: "Selected. Press Ctrl+C (or ⌘C) to copy.", making: "Preparing your file…", saved: "Downloaded", dlFail: "The download didn’t work. Use Copy text instead.",
      dup: "{k} is already in the list.", aiParseOk: "Read again with AI. Check the fields below.", aiParseBad: "The AI reading added text that isn’t in your CV, so the standard reading was kept.", aiParseFail: "AI reading isn’t available right now.",
      failed: "Something went wrong while building your CV. Try again, or choose Standard (no AI)."
    },
    fr: {
      needCv: "Ajoutez votre CV : importez un fichier ou collez au moins quelques lignes.",
      needJd: "Collez l’offre d’emploi complète (au moins quelques lignes).",
      reading: "Lecture de {f}…", read: "{f} importé. Vérifiez le texte ci-dessous.",
      scanned: "Ce PDF ne contient pas de texte sélectionnable (c’est peut-être un scan). Ouvrez-le dans Word ou Google Docs et collez le texte.",
      badType: "Ce type de fichier n’est pas pris en charge. Utilisez PDF, Word (.docx) ou .txt.",
      oldDoc: "Les anciens fichiers .doc ne sont pas pris en charge. Enregistrez-le en .docx ou PDF, ou collez le texte.",
      tooBig: "Ce fichier dépasse 10 Mo. Utilisez un fichier plus léger ou collez le texte.",
      failRead: "Impossible de lire ce fichier. Collez le texte à la place.",
      needName: "Ajoutez votre nom.", needEmail: "Ajoutez une adresse e-mail valide : les recruteurs et les logiciels en ont besoin.",
      contact: "Nom et coordonnées", name: "Nom complet", headline: "Titre (facultatif)", phone: "Téléphone", email: "E-mail", location: "Ville", linkedin: "LinkedIn", portfolio: "Site ou portfolio",
      summary: "Résumé", summaryHint: "Facultatif. Tailr écrit un nouveau résumé pour chaque offre à partir des faits ci-dessous.",
      skills: "Compétences", skillsHint: "Une par ligne ou séparées par des virgules. Pas de langues ici.",
      experience: "Expérience", projects: "Projets", education: "Formation", certifications: "Certifications", languages: "Langues", other: "Non utilisé dans le CV adapté",
      title: "Intitulé du poste", company: "Employeur", dates: "Dates", bullets: "Points (un par ligne)", pname: "Nom du projet", tech: "Outils utilisés",
      degree: "Diplôme", school: "École", details: "Note, spécialité ou mention", language: "Langue", level: "Niveau",
      addRole: "Ajouter une expérience", addProject: "Ajouter un projet", addEdu: "Ajouter un diplôme", addLang: "Ajouter une langue", remove: "Supprimer", up: "Monter",
      certHint: "Une par ligne.", empty: "Rien pour l’instant.",
      st_present: "dans votre CV", st_reword: "dans votre CV, autres mots", st_adjacent: "compétence proche seulement", st_missing: "absent de votre CV", st_confirmed: "vous l’avez confirmé",
      claim: "Je l’ai", unclaim: "Annuler",
      e_met: "OK", e_not_met: "Non rempli", e_unknown: "À vérifier",
      cloudOk: "IA en ligne prête ({m}). Envoie votre CV et l’offre à l’IA de Tailr chez Cloudflare ; non conservé, non utilisé pour l’entraînement.",
      cloudNo: "L’IA en ligne n’est pas configurée sur ce site.",
      devOk: "L’IA intégrée de Chrome est prête : gratuite et privée.",
      devDl: "L’IA intégrée de Chrome peut être téléchargée (plusieurs Go, Chrome sur ordinateur uniquement).",
      devDling: "Chrome télécharge son IA intégrée…",
      devNo: "L’IA intégrée n’est pas disponible dans ce navigateur.",
      autoCloud: "Utilise l’IA en ligne, puis l’IA intégrée, puis le moteur standard si besoin.",
      autoDevice: "Utilise l’IA intégrée de Chrome, puis le moteur standard si besoin.",
      autoRules: "Aucune IA n’est disponible ici : le moteur standard est utilisé.",
      freeMail: "Attention : cette offre demande de postuler à une adresse de messagerie gratuite ({e}). Les vrais employeurs le font rarement. Vérifiez l’offre sur le site de l’entreprise avant d’envoyer des données personnelles.",
      langMismatch: "Cette offre est en {jl} et votre CV en {cl}. L’IA peut écrire le nouveau texte dans la langue de l’offre ; le moteur standard garde la langue de votre CV.",
      noKw: "Aucune compétence reconnue dans cette offre. Ajoutez vous-même des mots-clés ci-dessous.",
      p_tailor: "Rédaction de votre CV pour cette offre…", p_ai: "Réécriture par l’IA…", p_fit: "Mise en page sur une page…", p_check: "Relecture du PDF comme un logiciel de recrutement…", p_device: "Téléchargement de l’IA intégrée : {p} %",
      eng_cloud: "Écrit par l’IA en ligne ({m}), puis vérifié ligne par ligne avec votre CV.",
      eng_device: "Écrit par l’IA intégrée de Chrome, puis vérifié ligne par ligne avec votre CV.",
      eng_rules: "Écrit par le moteur standard de Tailr à partir des faits de votre CV (sans IA).",
      n_repaired: "Certaines modifications de l’IA enfreignaient les règles (par exemple un chiffre ajouté ou une compétence absente de votre CV) et ont été remplacées par votre texte d’origine.",
      n_fallback: "L’IA n’était pas disponible ({r}) : le moteur standard a écrit cette version.",
      n_short: "L’IA a raccourci quelques points trop longs pour tenir sur une page.",
      r_quota: "limite gratuite du jour atteinte", r_rate: "trop de demandes", r_network: "pas de connexion", r_invalid: "sa réponse n’a pas passé les contrôles", r_other: "erreur",
      c_readable: "Le texte est lisible par un logiciel", c_pages: "Respecte la limite de pages", c_headings: "Titres de rubriques standard présents", c_email: "E-mail lisible", c_phone: "Téléphone lisible",
      c_dangling: "Aucune ligne ne finit par un mot isolé", c_split: "Aucun mot-clé coupé entre deux lignes", c_keywords: "Tous vos mots-clés indispensables sont présents", c_stale: "Aucune entreprise d’une offre précédente",
      pass: "OK", fail: "ÉCHEC", warn: "À VOIR",
      lock: "Téléchargement bloqué tant que les contrôles essentiels échouent : {list}. Modifiez votre CV (étape 2) et réessayez.",
      dropped: "Retiré pour tenir sur une page : ", none: "Aucun",
      fit_strong: "Forte", fit_medium: "Moyenne", fit_low: "Faible",
      copied: "Copié", selected: "Sélectionné. Appuyez sur Ctrl+C (ou ⌘C) pour copier.", making: "Préparation du fichier…", saved: "Téléchargé", dlFail: "Le téléchargement n’a pas fonctionné. Utilisez « Copier le texte ».",
      dup: "{k} est déjà dans la liste.", aiParseOk: "Relu avec l’IA. Vérifiez les champs ci-dessous.", aiParseBad: "La lecture par l’IA ajoutait du texte absent de votre CV : la lecture standard a été conservée.", aiParseFail: "La lecture par l’IA n’est pas disponible pour le moment.",
      failed: "Un problème est survenu pendant la création du CV. Réessayez, ou choisissez Standard (sans IA)."
    }
  };
  function t(k, v) { var s = (TX[L()] || TX.en)[k] || TX.en[k] || k; Object.keys(v || {}).forEach(function (x) { s = s.split("{" + x + "}").join(v[x]); }); return s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tl(key) { return '<span data-l="en">' + esc(TX.en[key]) + '</span><span data-l="fr">' + esc(TX.fr[key]) + "</span>"; }
  function langName(l) { return L() === "fr" ? (l === "fr" ? "français" : "anglais") : (l === "fr" ? "French" : "English"); }

  var SAMPLE_CV = "LÉA MARTIN\nParis · lea.martin@example.com · +33 6 12 34 56 78 · linkedin.com/in/lea-martin-example\n\nEDUCATION\nParis School of Business — Bachelor in Management, Year 3 (2024–2027)\nMajor: Marketing & Innovation\n\nEXPERIENCE\nMarketing Assistant (internship) — Maison Verte, Paris · Jun–Aug 2026\n- Wrote weekly Instagram and LinkedIn posts for a plant shop\n- Helped organise two in-store events with 120 guests\n- Tracked monthly sales in Excel and shared a summary with the manager\n\nStudent Ambassador — PSB Open Days · 2025–2026\n- Presented the programme to visiting families\n- Answered questions from international applicants in English and French\n\nSKILLS\nExcel, Canva, Instagram, teamwork, market research\nLanguages: French (native), English (C1)";
  var SAMPLE_JD = "Marketing Analyst Intern — Brightline (sample company), Paris\n6-month internship starting January 2027\n\nResponsibilities\n- Build weekly dashboards on campaign performance in Google Analytics and Excel\n- Run A/B testing on emails and landing pages\n- Carry out market research and competitor analysis\n- Create social media content and report on engagement\n- Work with the CRM (HubSpot) to segment customers\n\nProfile\n- Business school student in marketing or data\n- Strong Excel skills; SQL or Power BI is a plus\n- Data analysis mindset, attention to detail\n- Excellent communication and teamwork\n- Fluent English; French is a plus";

  /* ---------- navigation ---------- */
  function show(n) {
    for (var i = 1; i <= 5; i++) $("s" + i).hidden = i !== n;
    Array.prototype.forEach.call($("steps").children, function (li, i) { li.className = i + 1 === n ? "on" : i + 1 < n ? "done" : ""; });
    var h = $("s" + n).querySelector("h2"); h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true });
    var top = $("tool").getBoundingClientRect().top + window.scrollY - 12;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function err(id, msg) { var el = $(id); if (msg) { el.textContent = msg; el.hidden = false; } else el.hidden = true; }
  function status(id, msg) { var el = $(id); if (msg) { el.textContent = msg; el.hidden = false; } else el.hidden = true; }

  /* ---------- libraries loaded on demand ---------- */
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error("load " + src)); }; document.head.appendChild(s); });
    return loaded[src];
  }
  function pdfjs() { return loadScript("vendor/pdf.min.js").then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; return window.pdfjsLib; }); }

  /* ---------- file reading ---------- */
  function readBuf(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file); }); }
  function readTxt(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(file); }); }
  function pdfToText(buf) {
    return pdfjs().then(function (lib) { return lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true }).promise; }).then(function (pdf) {
      var pages = [];
      for (var p = 1; p <= pdf.numPages; p++) pages.push(pdf.getPage(p).then(function (pg) { return pg.getTextContent(); }));
      return Promise.all(pages);
    }).then(function (contents) {
      var out = [];
      contents.forEach(function (tc) {
        var rows = [];
        tc.items.forEach(function (it) {
          if (typeof it.str !== "string" || !it.str.trim()) return;
          var y = it.transform[5], h = Math.abs(it.transform[3]) || 10;
          var row = rows.filter(function (r) { return Math.abs(r.y - y) < Math.max(2, h * 0.4); })[0];
          if (!row) { row = { y: y, h: h, items: [] }; rows.push(row); }
          row.items.push({ x: it.transform[4], w: it.width || 0, s: it.str });
        });
        rows.sort(function (a, b) { return b.y - a.y; });
        var lastY = null;
        rows.forEach(function (r) {
          var its = r.items.sort(function (a, b) { return a.x - b.x; }), line = "", end = null;
          its.forEach(function (i) { if (end !== null && i.x - end > r.h * 0.15 && !/\s$/.test(line)) line += " "; line += i.s; end = i.x + i.w; });
          if (lastY !== null && lastY - r.y > r.h * 1.9) out.push("");
          out.push(line.replace(/\s+/g, " ").trim()); lastY = r.y;
        });
        out.push("");
      });
      return out.join("\n");
    });
  }
  function docxToText(buf) {
    return loadScript("vendor/mammoth.browser.min.js").then(function () { return window.mammoth.convertToHtml({ arrayBuffer: buf }); }).then(function (r) {
      var doc = new DOMParser().parseFromString("<body>" + r.value + "</body>", "text/html");
      var out = [];
      function push(l, bullet) { l = l.replace(/\s+/g, " ").trim(); if (!l) return; if (!bullet && PA.isHeader(l) && out.length) out.push(""); out.push((bullet ? "- " : "") + l); }
      doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, td").forEach(function (el) {
        if (el.closest("li") && el.tagName !== "LI") return;
        if (el.tagName === "TD" && el.querySelector("p, li")) return;
        if (el.tagName === "LI") { var c = el.cloneNode(true); c.querySelectorAll("ul, ol").forEach(function (x) { x.remove(); }); push(c.textContent, true); return; }
        push(el.textContent, false);
      });
      return out.join("\n");
    });
  }
  function handleFile(file, target, statusId, errId) {
    if (!file) return;
    err(errId);
    var name = file.name || "file", ext = (name.split(".").pop() || "").toLowerCase();
    if (file.size > 10 * 1024 * 1024) return err(errId, t("tooBig"));
    if (ext === "doc") return err(errId, t("oldDoc"));
    if (["pdf", "docx", "txt"].indexOf(ext) < 0) return err(errId, t("badType"));
    status(statusId, t("reading", { f: name }));
    var job = ext === "txt" ? readTxt(file) : readBuf(file).then(function (b) { return ext === "pdf" ? pdfToText(b) : docxToText(b); });
    job.then(function (text) {
      text = String(text).replace(/\r\n?/g, "\n").replace(/^[ \t]*[▪●•◦]\s*/gm, "- ").replace(/\n{3,}/g, "\n\n").trim();
      if (text.replace(/\s/g, "").length < 30) { status(statusId); return err(errId, ext === "pdf" ? t("scanned") : t("failRead")); }
      $(target).value = text;
      status(statusId, t("read", { f: name }));
    }).catch(function () { status(statusId); err(errId, t("failRead")); });
  }
  function wireDrop(zoneId, inputId, target, statusId, errId) {
    var input = $(inputId);
    input.addEventListener("change", function () { handleFile(input.files[0], target, statusId, errId); input.value = ""; });
    var z = zoneId && $(zoneId);
    if (!z) return;
    ["dragenter", "dragover"].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove("over"); }); });
    z.addEventListener("drop", function (e) { handleFile(e.dataTransfer && e.dataTransfer.files[0], target, statusId, errId); });
  }

  /* ---------- step 2: master CV editor ---------- */
  var SECTIONS = {
    experience: { fields: [["title", "title"], ["company", "company"], ["location", "location"], ["dates", "dates"]], bullets: true, add: "addRole", make: PA.emptyRole },
    projects: { fields: [["name", "pname"], ["tech", "tech"], ["dates", "dates"]], bullets: true, add: "addProject", make: PA.emptyProject },
    education: { fields: [["degree", "degree"], ["school", "school"], ["location", "location"], ["dates", "dates"], ["details", "details"]], add: "addEdu", make: PA.emptyEducation }
  };
  function fieldHtml(path, key, value, kind) {
    var id = "f_" + path.replace(/[^a-z0-9]/gi, "_");
    var tag = kind === "lines" || kind === "list" || kind === "long"
      ? '<textarea id="' + id + '" data-path="' + path + '" data-kind="' + (kind || "") + '" rows="' + (kind === "long" ? 3 : 4) + '">' + esc(value) + "</textarea>"
      : '<input type="text" id="' + id + '" data-path="' + path + '" value="' + esc(value) + '">';
    return '<label class="ef" for="' + id + '"><span class="el">' + tl(key) + "</span>" + tag + "</label>";
  }
  function renderEditor() {
    var m = draft, h = [];
    h.push('<section class="esec"><h3>' + tl("contact") + '</h3><div class="egrid">' +
      fieldHtml("name", "name", m.name) + fieldHtml("headline", "headline", m.headline) + fieldHtml("contact.phone", "phone", m.contact.phone) +
      fieldHtml("contact.email", "email", m.contact.email) + fieldHtml("contact.location", "location", m.contact.location) +
      fieldHtml("contact.linkedin", "linkedin", m.contact.linkedin) + fieldHtml("contact.portfolio", "portfolio", m.contact.portfolio) + "</div></section>");
    h.push('<section class="esec"><h3>' + tl("summary") + '</h3><p class="hint">' + tl("summaryHint") + "</p>" + fieldHtml("summary", "summary", m.summary, "long").replace('<span class="el">' + tl("summary") + "</span>", "") + "</section>");
    h.push('<section class="esec"><h3>' + tl("skills") + '</h3><p class="hint">' + tl("skillsHint") + "</p>" + fieldHtml("skills", "skills", m.skills.join("\n"), "list").replace('<span class="el">' + tl("skills") + "</span>", "") + "</section>");
    ["experience", "projects", "education"].forEach(function (sec) {
      var cfg = SECTIONS[sec];
      h.push('<section class="esec"><h3>' + tl(sec) + "</h3>");
      if (!m[sec].length) h.push('<p class="hint">' + tl("empty") + "</p>");
      m[sec].forEach(function (it, i) {
        h.push('<div class="ecard"><div class="egrid">');
        cfg.fields.forEach(function (f) { h.push(fieldHtml(sec + "." + i + "." + f[0], f[1], it[f[0]], f[0] === "details" ? "long" : "")); });
        h.push("</div>");
        if (cfg.bullets) h.push(fieldHtml(sec + "." + i + ".bullets", "bullets", it.bullets.join("\n"), "lines"));
        h.push('<div class="eacts">' + (i > 0 ? '<button type="button" class="link" data-act="up" data-sec="' + sec + '" data-i="' + i + '">' + tl("up") + "</button>" : "") +
          '<button type="button" class="link danger" data-act="remove" data-sec="' + sec + '" data-i="' + i + '">' + tl("remove") + "</button></div></div>");
      });
      h.push('<button type="button" data-act="add" data-sec="' + sec + '">+ ' + tl(cfg.add) + "</button></section>");
    });
    h.push('<section class="esec"><h3>' + tl("certifications") + '</h3><p class="hint">' + tl("certHint") + "</p>" + fieldHtml("certifications", "certifications", m.certifications.join("\n"), "lines").replace('<span class="el">' + tl("certifications") + "</span>", "") + "</section>");
    h.push('<section class="esec"><h3>' + tl("languages") + "</h3>");
    m.languages.forEach(function (l, i) {
      h.push('<div class="egrid lang">' + fieldHtml("languages." + i + ".language", "language", l.language) + fieldHtml("languages." + i + ".level", "level", l.level) +
        '<button type="button" class="link danger" data-act="remove" data-sec="languages" data-i="' + i + '">' + tl("remove") + "</button></div>");
    });
    h.push('<button type="button" data-act="add" data-sec="languages">+ ' + tl("addLang") + "</button></section>");
    if (m.other && m.other.length) h.push('<section class="esec muted"><h3>' + tl("other") + "</h3><ul>" + m.other.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul></section>");
    $("editor").innerHTML = h.join("");
  }
  function setPath(obj, path, value) {
    var parts = path.split("."), o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[/^\d+$/.test(parts[i]) ? +parts[i] : parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  $("editor").addEventListener("input", function (e) {
    var el = e.target, path = el.getAttribute("data-path");
    if (!path) return;
    var kind = el.getAttribute("data-kind"), v = el.value;
    if (kind === "lines") v = v.split(/\n/).map(function (x) { return PA.stripBullet(x); }).filter(Boolean);
    else if (kind === "list") v = v.split(/\n|[,;]\s*/).map(function (x) { return E.clean(x); }).filter(Boolean);
    setPath(draft, path, v);
  });
  $("editor").addEventListener("focusout", function (e) {
    if (e.target.getAttribute("data-path") === "contact.phone" && e.target.value.trim()) {
      var p = window.TailrPhone.normalizePhone(e.target.value, draft.contact.location).phone;
      e.target.value = p; draft.contact.phone = p;
    }
  });
  $("editor").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var sec = b.getAttribute("data-sec"), i = +b.getAttribute("data-i"), act = b.getAttribute("data-act");
    if (act === "add") draft[sec].push(sec === "languages" ? { language: "", level: "" } : SECTIONS[sec].make());
    if (act === "remove") draft[sec].splice(i, 1);
    if (act === "up" && i > 0) { var x = draft[sec][i]; draft[sec][i] = draft[sec][i - 1]; draft[sec][i - 1] = x; }
    renderEditor();
  });

  /* ---------- AI availability ---------- */
  function detectEngines() {
    var lang = S.job ? S.job.lang : L();
    return Promise.all([AI.detectCloud(), AI.detectDevice(lang)]).then(function (r) {
      engineState.cloud = r[0]; engineState.device = r[1];
      renderEngine();
      $("aiParseRow").hidden = !(engineState.cloud.available || engineState.device === "available");
      return engineState;
    });
  }
  function aiAvailable() { return (engineState.cloud && engineState.cloud.available) || engineState.device === "available"; }
  function renderEngine() {
    var c = engineState.cloud || { available: false }, d = engineState.device;
    var items = [];
    items.push('<li class="' + (c.available ? "ok" : "off") + '">' + esc(c.available ? t("cloudOk", { m: (c.model || "").replace(/^@cf\/[^/]+\//, "") }) : t("cloudNo")) + "</li>");
    items.push('<li class="' + (d === "available" ? "ok" : "off") + '">' + esc(d === "available" ? t("devOk") : d === "downloadable" ? t("devDl") : d === "downloading" ? t("devDling") : t("devNo")) + "</li>");
    $("engineList").innerHTML = items.join("");
    $("dlDevice").hidden = d !== "downloadable";
    $("engAutoNote").textContent = c.available ? t("autoCloud") : d === "available" ? t("autoDevice") : t("autoRules");
    if (!engineState.outLangTouched && S.job) $("outLang").value = chosenEngine() === "rules" ? cvLang() : S.job.lang;
  }
  function chosenEngine() { return $("engRules").checked || !aiAvailable() ? "rules" : "auto"; }
  function cvLang() { return S.master ? E.detectLang(PA.masterText(S.master)) : L(); }
  $("engAuto").addEventListener("change", renderEngine);
  $("engRules").addEventListener("change", renderEngine);
  $("outLang").addEventListener("change", function () { engineState.outLangTouched = true; });
  $("dlDevice").addEventListener("click", function () {
    var lang = S.job ? S.job.lang : L();
    var p = AI.deviceProvider(lang, function (x) { status("progress", t("p_device", { p: Math.round(x * 100) })); });
    $("dlDevice").disabled = true;
    // create() starts the download; a tiny prompt confirms it works
    p.shorten([{ id: "1", text: "Test" }]).catch(function () {}).then(function () { status("progress"); $("dlDevice").disabled = false; detectEngines(); });
  });
  function provider() {
    if (chosenEngine() === "rules") return null;
    var lang = $("outLang").value;
    var list = [];
    if (engineState.cloud && engineState.cloud.available) list.push(AI.cloudProvider(engineState.cloud.model));
    if (engineState.device === "available") list.push(AI.deviceProvider(lang));
    return AI.chain(list);
  }

  /* ---------- step 4: match ---------- */
  function masterForJob() {
    var m = JSON.parse(JSON.stringify(S.master));
    Object.keys(S.confirmed).forEach(function (k) { var lab = S.confirmed[k]; if (!m.skills.some(function (s) { return E.norm(s) === E.norm(lab); })) m.skills.push(lab); });
    return m;
  }
  function renderMatch() {
    var job = S.job;
    ["company", "role", "contract", "start", "duration", "location"].forEach(function (f) { $("t" + f.charAt(0).toUpperCase() + f.slice(1)).value = job.target[f] || ""; });
    var warn = [];
    if (job.freeMail.length) warn.push(t("freeMail", { e: job.freeMail.join(", ") }));
    var cl = cvLang();
    if (cl !== job.lang) warn.push(t("langMismatch", { jl: langName(job.lang), cl: langName(cl) }));
    if (!job.keywords.length) warn.push(t("noKw"));
    $("warnBox").innerHTML = warn.map(function (w) { return "<p>" + esc(w) + "</p>"; }).join("");
    $("warnBox").hidden = !warn.length;
    renderKeywords();
  }
  function renderKeywords() {
    var kws = T.classify(masterForJob(), S.job);
    var lang = $("outLang").value || S.job.lang;
    var by = { must: [], nice: [], context: [] };
    kws.forEach(function (k, i) {
      var conf = !!S.confirmed[k.key];
      var st = conf ? "confirmed" : k.status;
      var sym = { present: "✓", reword: "≈", adjacent: "~", missing: "✗", confirmed: "✓" }[st];
      var lab = T.jdLabel(k, lang);
      var tip = t("st_" + st) + (k.status === "adjacent" ? " (" + k.siblings.join(", ") + ")" : "");
      var claimable = k.t !== "l" && (k.status === "missing" || k.status === "adjacent" || conf);
      by[k.bucket].push('<span class="chip st-' + st + '" title="' + esc(tip) + '"><span aria-hidden="true">' + sym + "</span> " + esc(lab) +
        '<span class="visually-hidden"> – ' + esc(tip) + "</span>" +
        (claimable ? ' <button type="button" class="claim" data-key="' + esc(k.key) + '" data-label="' + esc(lab) + '">' + esc(conf ? t("unclaim") : t("claim")) + "</button>" : "") + "</span>");
    });
    $("kwMust").innerHTML = by.must.join("") || '<span class="hint">–</span>';
    $("kwNice").innerHTML = by.nice.join("") || '<span class="hint">–</span>';
    $("kwContext").innerHTML = by.context.join("") || '<span class="hint">–</span>';
    var elig = window.TailrJob.checkEligibility(S.job.eligibility, masterForJob(), PA.masterText(masterForJob()));
    $("eligList").innerHTML = elig.length ? elig.map(eligItem).join("") : '<li class="hint">–</li>';
  }
  function eligItem(e) {
    var st = e.status;
    return '<li><span class="pill e-' + st + '">' + esc(t("e_" + st)) + "</span> <span>" + esc(e.requirement) + (e.note && e.note !== "missing" ? ' <span class="hint">(' + esc(e.note) + ")</span>" : "") + "</span></li>";
  }
  document.querySelector(".buckets").addEventListener("click", function (e) {
    var b = e.target.closest("button.claim"); if (!b) return;
    var k = b.getAttribute("data-key");
    if (S.confirmed[k]) delete S.confirmed[k]; else S.confirmed[k] = b.getAttribute("data-label");
    renderKeywords();
  });
  document.querySelector(".tgrid").addEventListener("input", function (e) {
    var f = e.target.getAttribute("data-t"); if (!f || !S.job) return;
    S.job.target[f] = E.clean(e.target.value);
  });
  function addKeyword() {
    var v = E.clean($("kw").value);
    if (!v || !S.job) return;
    var n = E.norm(v);
    if (S.job.keywords.some(function (k) { return k.a.indexOf(n) >= 0 || E.norm(k.en) === n; })) { $("kwMsg").textContent = t("dup", { k: v }); return; }
    var dict = window.TAILR_SKILLS.filter(function (sk) { return E.hasSkill(n, sk); })[0];
    S.job.keywords.push(dict ? Object.assign({}, dict, { key: dict.en, count: 1, spelled: v, bucket: "must" }) : { key: v, en: v, fr: v, t: "d", a: [n], count: 1, spelled: v, bucket: "must" });
    $("kw").value = ""; $("kwMsg").textContent = "";
    renderKeywords();
  }
  $("addKw").addEventListener("click", addKeyword);
  $("kw").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } });

  /* ---------- step 5: tailor, check, show ---------- */
  var busy = false;
  function tailorNow() {
    if (busy || !S.job) return;
    busy = true; $("tailor").disabled = true; err("matchErr");
    S.result = null; resetResult();
    var ai = provider(), jobId = S.job.id;
    status("progress", ai ? t("p_ai") : t("p_tailor"));
    Promise.all([R.loadFonts("fonts/"), loadScript("vendor/jspdf.umd.min.js"), pdfjs()]).then(function (r) {
      var fonts = r[0], lib = r[2];
      return PL.run({ master: masterForJob(), baseMaster: S.master, job: S.job, ai: ai, fonts: fonts, pdfjs: lib, uiLang: L(), outLang: $("outLang").value, previousCompanies: S.previousCompanies() });
    }).then(function (res) {
      if (!S.job || S.job.id !== jobId) return; // the user moved on to another job: never show a stale result
      S.result = res;
      status("progress");
      renderResult();
      show(5);
    }).catch(function (e) {
      status("progress");
      err("matchErr", t("failed"));
      if (window.console) console.error(e);
    }).then(function () { busy = false; $("tailor").disabled = false; });
  }
  function resetResult() {
    ["preview", "atsList", "addedList", "missList", "suggList", "eligResult", "changeList", "engineLine", "recommend"].forEach(function (id) { $(id).innerHTML = ""; });
    $("dlPdf").disabled = true; $("dlDocx").disabled = true; $("lockMsg").hidden = true; $("toast").textContent = "";
  }
  function renderResult() {
    var r = S.result; if (!r) return;
    var rep = r.output.report;
    // engine line + notes
    var lines = [];
    if (r.engineUsed === "cloud") lines.push(t("eng_cloud", { m: (engineState.cloud && engineState.cloud.model || "").replace(/^@cf\/[^/]+\//, "") }));
    else if (r.engineUsed === "device") lines.push(t("eng_device"));
    else lines.push(t("eng_rules"));
    r.notes.forEach(function (n) {
      if (n === "repaired") lines.push(t("n_repaired"));
      if (n === "ai_shortened") lines.push(t("n_short"));
      if (n.indexOf("ai_failed") === 0) { var c = n.split(":")[1]; lines.push(t("n_fallback", { r: t({ quota: "r_quota", rate: "r_rate", network: "r_network", invalid: "r_invalid", all_failed: "r_quota" }[c] || "r_other") })); }
    });
    $("engineLine").innerHTML = lines.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join(" ");
    // ATS checks
    $("atsList").innerHTML = r.ats.checks.map(function (c) {
      var cls = c.pass ? "pass" : c.critical ? "fail" : "warn";
      return '<li class="' + cls + '"><span class="pill">' + esc(t(c.pass ? "pass" : c.critical ? "fail" : "warn")) + "</span> " + esc(t("c_" + c.id)) + (c.detail && !c.pass ? ' <span class="hint">' + esc(c.detail) + "</span>" : "") + "</li>";
    }).join("");
    var blocked = r.ats.checks.filter(function (c) { return !c.pass && c.critical; });
    $("dlPdf").disabled = $("dlDocx").disabled = !!blocked.length;
    if (blocked.length) { $("lockMsg").textContent = t("lock", { list: blocked.map(function (c) { return t("c_" + c.id); }).join(", ") }); $("lockMsg").hidden = false; }
    // match
    $("sBefore").textContent = rep.match_before_pct + "%"; $("sAfter").textContent = rep.match_after_pct + "%"; $("sFit").textContent = t("fit_" + rep.fit);
    $("markA").style.left = "calc(" + rep.match_before_pct + "% - 1px)";
    requestAnimationFrame(function () { $("markB").style.left = "calc(" + rep.match_after_pct + "% - 2px)"; });
    $("recommend").textContent = rep.recommendation;
    $("addedList").innerHTML = rep.added_keywords.length ? rep.added_keywords.map(function (k) { return '<span class="chip st-present">' + esc(k) + "</span>"; }).join("") : '<span class="hint">' + t("none") + "</span>";
    $("missList").innerHTML = rep.missing_must_haves.length ? rep.missing_must_haves.map(function (k) { return '<span class="chip st-missing">' + esc(k) + "</span>"; }).join("") : '<span class="hint">' + t("none") + "</span>";
    $("suggList").innerHTML = rep.honest_suggestions.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    $("eligResult").innerHTML = rep.eligibility.length ? rep.eligibility.map(eligItem).join("") : '<li class="hint">' + t("none") + "</li>";
    var ch = rep.changes.slice();
    var dropped = (r.meta.dropped || []).map(function (d) { return d.text; }).concat(r.droppedByFit || []);
    if (dropped.length) ch.push(t("dropped") + dropped.map(function (d) { return "“" + d + "”"; }).join("; "));
    if (S.job.freeMail.length) ch.unshift(t("freeMail", { e: S.job.freeMail.join(", ") }));
    $("changeList").innerHTML = ch.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("");
    renderPreview(r.pdfBytes);
  }
  function renderPreview(bytes) {
    var box = $("preview");
    box.innerHTML = "";
    pdfjs().then(function (lib) { return lib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise; }).then(function (pdf) {
      var chain = Promise.resolve();
      for (var p = 1; p <= pdf.numPages; p++) (function (n) {
        chain = chain.then(function () { return pdf.getPage(n); }).then(function (page) {
          var w = Math.max(280, box.clientWidth || 600);
          var v1 = page.getViewport({ scale: 1 });
          var scale = w / v1.width, dpr = window.devicePixelRatio || 1;
          var vp = page.getViewport({ scale: scale * dpr });
          var c = document.createElement("canvas");
          c.width = vp.width; c.height = vp.height; c.style.width = "100%"; c.setAttribute("role", "img");
          c.setAttribute("aria-label", "CV page " + n);
          box.appendChild(c);
          return page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        });
      })(p);
      return chain;
    }).catch(function () {});
  }
  function save(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    $("toast").textContent = t("saved");
  }
  $("dlPdf").addEventListener("click", function () {
    var r = S.result; if (!r || !r.ats.pass) return;
    save(new Blob([r.pdfBytes], { type: "application/pdf" }), R.fileBase(r.output.cv, r.output.target) + ".pdf");
  });
  $("dlDocx").addEventListener("click", function () {
    var r = S.result; if (!r || !r.ats.pass) return;
    var btn = $("dlDocx"); btn.disabled = true; $("toast").textContent = t("making");
    loadScript("vendor/docx.umd.js").then(function () { return R.buildDocx(r.output.cv, r.lang, r.fit.settings); })
      .then(function (blob) { save(blob, R.fileBase(r.output.cv, r.output.target) + ".docx"); })
      .catch(function () { $("toast").textContent = t("dlFail"); }).then(function () { btn.disabled = false; });
  });
  $("copy").addEventListener("click", function () {
    var r = S.result; if (!r) return;
    var txt = r.ats.lines.join("\n");
    var ok = function () { $("toast").textContent = t("copied"); };
    var fail = function () { var ta = document.createElement("textarea"); ta.value = txt; ta.className = "visually-hidden"; document.body.appendChild(ta); ta.select(); $("toast").textContent = t("selected"); setTimeout(function () { ta.remove(); }, 8000); };
    try { navigator.clipboard.writeText(txt).then(ok, fail); } catch (e) { fail(); }
  });

  /* ---------- wiring ---------- */
  wireDrop("dropCv", "fileCv", "cv", "cvStatus", "cvErr");
  wireDrop(null, "fileJd", "jd", "jdStatus", "jdErr");
  $("sample").addEventListener("click", function () { $("cv").value = SAMPLE_CV; $("jd").value = SAMPLE_JD; err("cvErr"); status("cvStatus"); });
  $("toEdit").addEventListener("click", function () {
    var text = $("cv").value;
    if (text.trim().length < 80) { $("cv").setAttribute("aria-invalid", "true"); return err("cvErr", t("needCv")); }
    $("cv").removeAttribute("aria-invalid"); err("cvErr");
    draft = PA.parseCv(text);
    status("parseStatus");
    renderEditor(); show(2);
    detectEngines();
  });
  $("aiParse").addEventListener("click", function () {
    var p = AI.chain([engineState.cloud && engineState.cloud.available ? AI.cloudProvider(engineState.cloud.model) : null, engineState.device === "available" ? AI.deviceProvider(L()) : null]);
    if (!p) return status("parseStatus", t("aiParseFail"));
    var b = $("aiParse"); b.disabled = true; status("parseStatus", t("reading", { f: "CV" }));
    var text = $("cv").value;
    p.parse(text).then(function (parsed) {
      var chk = V.validateParsed(parsed, text);
      if (!chk.ok) return status("parseStatus", t("aiParseBad"));
      draft = PA.normalizeMaster(parsed);
      if (draft.contact.phone) draft.contact.phone = window.TailrPhone.normalizePhone(draft.contact.phone, draft.contact.location).phone;
      renderEditor(); status("parseStatus", t("aiParseOk"));
    }, function () { status("parseStatus", t("aiParseFail")); }).then(function () { b.disabled = false; });
  });
  $("back1").addEventListener("click", function () { show(1); });
  $("toJob").addEventListener("click", function () {
    var m = PA.normalizeMaster(draft);
    if (!m.name) return err("edErr", t("needName"));
    if (!PA.EMAIL_RE.test(m.contact.email || "")) return err("edErr", t("needEmail"));
    err("edErr");
    S.setMaster(m);
    if (S.job) S.clearJob();
    show(3);
  });
  $("back2").addEventListener("click", function () { renderEditor(); show(2); });
  $("toMatch").addEventListener("click", function () {
    if ($("jd").value.trim().length < 80) { $("jd").setAttribute("aria-invalid", "true"); return err("jdErr", t("needJd")); }
    $("jd").removeAttribute("aria-invalid"); err("jdErr");
    S.startJob($("jd").value);                 // fresh job state: nothing from the previous job survives
    engineState.outLangTouched = false;
    resetResult();
    renderMatch(); show(4);
    detectEngines().then(function () { renderKeywords(); });
  });
  $("back3").addEventListener("click", function () { show(3); });
  $("tailor").addEventListener("click", tailorNow);
  $("editCv").addEventListener("click", function () { draft = JSON.parse(JSON.stringify(S.master)); renderEditor(); show(2); });
  $("another").addEventListener("click", function () { S.clearJob(); resetResult(); $("jd").value = ""; status("jdStatus"); show(3); $("jd").focus(); });

  document.addEventListener("tailr:lang", function () {
    if (!$("s2").hidden && draft) renderEditor();
    if (!$("s4").hidden && S.job) { renderMatch(); renderEngine(); }
    if (!$("s5").hidden && S.result) renderResult();
  });
})();
