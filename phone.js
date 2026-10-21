/* Phone number normalisation with libphonenumber-js.
   "+33 745574978" -> "+33 7 45 57 49 78". Numbers without a country code use a country guessed
   from the CV location, then the default country. */
(function (root) {
  "use strict";
  function lib() {
    if (root.libphonenumber) return root.libphonenumber;
    if (typeof require === "function") { try { return require("libphonenumber-js"); } catch (e) {} }
    return null;
  }
  var COUNTRY_HINTS = [
    [/\b(france|paris|lyon|marseille|lille|toulouse|bordeaux|nantes|nice|strasbourg|montpellier|rennes|grenoble|rouen|reims|dijon|angers)\b/i, "FR"],
    [/\b(belgique|belgium|bruxelles|brussels|li[eè]ge|gand|ghent|anvers|antwerp)\b/i, "BE"],
    [/\b(suisse|switzerland|gen[eè]ve|geneva|lausanne|zurich|z[uü]rich|bern|berne)\b/i, "CH"],
    [/\b(luxembourg)\b/i, "LU"],
    [/\b(canada|montr[eé]al|qu[eé]bec|toronto|vancouver)\b/i, "CA"],
    [/\b(united kingdom|uk|england|london|manchester|edinburgh)\b/i, "GB"],
    [/\b(ireland|dublin)\b/i, "IE"],
    [/\b(germany|deutschland|allemagne|berlin|munich|m[uü]nchen|hamburg|frankfurt)\b/i, "DE"],
    [/\b(spain|espagne|espa[nñ]a|madrid|barcelona|barcelone)\b/i, "ES"],
    [/\b(italy|italie|italia|milan|milano|rome|roma)\b/i, "IT"],
    [/\b(netherlands|pays-bas|amsterdam|rotterdam)\b/i, "NL"],
    [/\b(portugal|lisbon|lisbonne|porto)\b/i, "PT"],
    [/\b(maroc|morocco|casablanca|rabat)\b/i, "MA"],
    [/\b(alg[eé]rie|algeria|alger)\b/i, "DZ"],
    [/\b(tunisie|tunisia|tunis)\b/i, "TN"],
    [/\b(s[eé]n[eé]gal|dakar)\b/i, "SN"],
    [/\b(india|inde|mumbai|delhi|bangalore|bengaluru|pune|hyderabad|chennai)\b/i, "IN"],
    [/\b(usa|united states|new york|san francisco|los angeles|chicago|boston)\b/i, "US"]
  ];
  function guessCountry(location, fallback) {
    var s = String(location || "");
    for (var i = 0; i < COUNTRY_HINTS.length; i++) if (COUNTRY_HINTS[i][0].test(s)) return COUNTRY_HINTS[i][1];
    return fallback || "FR";
  }
  /* Returns { phone, valid }. phone is the international format when it parses, else the cleaned input. */
  function normalizePhone(raw, location, fallbackCountry) {
    var s = String(raw || "").replace(/[ \s]+/g, " ").trim();
    if (!s) return { phone: "", valid: false };
    s = s.replace(/^00(?=\d)/, "+").replace(/\(0\)/g, "");
    var L = lib();
    if (!L) return { phone: s, valid: false };
    try {
      var p = L.parsePhoneNumberFromString(s, guessCountry(location, fallbackCountry));
      if (p && p.isValid()) return { phone: p.formatInternational(), valid: true };
      if (p && p.isPossible && p.isPossible()) return { phone: p.formatInternational(), valid: false };
    } catch (e) {}
    return { phone: s, valid: false };
  }
  var api = { normalizePhone: normalizePhone, guessCountry: guessCountry };
  root.TailrPhone = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
