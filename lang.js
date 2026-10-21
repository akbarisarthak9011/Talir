/* Language switch shared by every page. Loaded in <head> so the page never flashes the wrong language. */
(function () {
  var saved = null;
  try { saved = localStorage.getItem("tailr-lang"); } catch (e) {}
  var nav = (navigator.language || "en").toLowerCase();
  var lang = saved === "fr" || saved === "en" ? saved : (nav.indexOf("fr") === 0 ? "fr" : "en");
  document.documentElement.lang = lang;

  function apply(l) {
    document.documentElement.lang = l;
    try { localStorage.setItem("tailr-lang", l); } catch (e) {}
    document.querySelectorAll("[data-setlang]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-setlang") === l ? "true" : "false"); });
    document.querySelectorAll("[data-ph-en]").forEach(function (el) { el.placeholder = el.getAttribute("data-ph-" + l) || ""; });
    var t = document.querySelector('meta[name="tailr-title-' + l + '"]');
    if (t) document.title = t.content;
    document.dispatchEvent(new CustomEvent("tailr:lang", { detail: l }));
  }
  window.TailrLang = { get: function () { return document.documentElement.lang === "fr" ? "fr" : "en"; }, set: apply };
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-setlang]").forEach(function (b) { b.addEventListener("click", function () { apply(b.getAttribute("data-setlang")); }); });
    apply(document.documentElement.lang);
    // fill owner details on legal pages
    var c = window.TAILR_CONFIG || {};
    document.querySelectorAll("[data-cfg]").forEach(function (el) { var v = c[el.getAttribute("data-cfg")]; if (v) el.textContent = v; });
  });
})();
