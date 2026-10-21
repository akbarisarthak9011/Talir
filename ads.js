/* Loads Google AdSense only when a publisher ID is set in config.js.
   Consent for visitors in France/EU is handled by Google's own certified consent message,
   which you switch on in AdSense (Privacy & messaging > European regulations). */
(function () {
  var c = window.TAILR_CONFIG || {};
  if (!c.adsenseClient || !/^ca-pub-\d{10,20}$/.test(c.adsenseClient)) return;
  var s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(c.adsenseClient);
  document.head.appendChild(s);
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".ad[data-slot]").forEach(function (box) {
      var id = (c.adSlots || {})[box.getAttribute("data-slot")];
      if (!id) return;
      var ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.setAttribute("data-ad-client", c.adsenseClient);
      ins.setAttribute("data-ad-slot", id);
      ins.setAttribute("data-ad-format", "auto");
      ins.setAttribute("data-full-width-responsive", "true");
      box.appendChild(ins);
      box.hidden = false;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  });
})();
