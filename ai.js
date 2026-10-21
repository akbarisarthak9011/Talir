/* Tailr AI providers. Two free options, tried in this order:
   1. "cloud": the site's own Cloudflare function (/api/ai) on the free Workers AI allowance.
   2. "device": Chrome's built-in on-device model (Prompt API, Gemini Nano), free and private.
   Whatever the provider returns is validated by validate.js before use. */
(function (root) {
  "use strict";
  var P = root.TailrPrompt;

  function cfg() { return root.TAILR_CONFIG || {}; }
  function endpoint() { return cfg().aiEndpoint || "api/ai"; }

  function withTimeout(ms) {
    var c = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (c) c.abort(); }, ms);
    return { signal: c && c.signal, done: function () { clearTimeout(t); } };
  }

  /* ---------- cloud ---------- */
  var cloudStatus = null;
  function detectCloud() {
    if (cfg().cloudAI === false) return Promise.resolve({ available: false });
    if (cloudStatus) return cloudStatus;
    var to = withTimeout(6000);
    cloudStatus = fetch(endpoint(), { method: "GET", signal: to.signal, cache: "no-store" }).then(function (r) {
      to.done();
      if (!r.ok) return { available: false };
      return r.json().then(function (j) { return { available: !!j.available, model: j.model || "" }; }, function () { return { available: false }; });
    }, function () { to.done(); return { available: false }; });
    return cloudStatus;
  }
  function cloudCall(task, payload) {
    var to = withTimeout(120000);
    return fetch(endpoint(), {
      method: "POST", signal: to.signal, headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ task: task }, payload))
    }).then(function (r) {
      to.done();
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 429) throw Object.assign(new Error(j.error === "rate" ? "rate" : "quota"), { code: j.error === "rate" ? "rate" : "quota" });
        if (!r.ok || !j.ok) throw Object.assign(new Error(j.error || "cloud_error"), { code: j.error || "cloud_error" });
        return j.data;
      });
    }, function (e) { to.done(); throw Object.assign(new Error("network"), { code: "network" }); });
  }
  function cloudProvider(model) {
    return {
      name: "cloud", model: model,
      tailor: function (master, job, feedback) { return cloudCall("tailor", { master: stripOther(master), jd: job.text, feedback: feedback || [] }); },
      shorten: function (bullets) { return cloudCall("shorten", { bullets: bullets, maxChars: 110 }); },
      parse: function (text) { return cloudCall("parse", { text: text }); }
    };
  }

  /* ---------- on-device (Chrome Prompt API) ---------- */
  function LM() { return root.LanguageModel || (root.ai && root.ai.languageModel) || null; }
  function deviceOptions(lang) {
    return { expectedInputs: [{ type: "text", languages: ["en", "fr"] }], expectedOutputs: [{ type: "text", languages: [lang === "fr" ? "fr" : "en"] }] };
  }
  /* -> "unavailable" | "downloadable" | "downloading" | "available" */
  function detectDevice(lang) {
    var L = LM();
    if (!L || typeof L.availability !== "function") return Promise.resolve("unavailable");
    return Promise.resolve(L.availability(deviceOptions(lang))).catch(function () { return "unavailable"; });
  }
  function devicePrompt(task, payload, lang, onProgress) {
    var L = LM();
    var c = P.TASKS[task];
    var opts = Object.assign({ initialPrompts: [{ role: "system", content: c.system }] }, deviceOptions(lang));
    if (onProgress) opts.monitor = function (m) { m.addEventListener("downloadprogress", function (e) { onProgress(e.loaded); }); };
    return L.create(opts).then(function (session) {
      var msg = P.buildUserMessage(task, payload);
      return session.prompt(msg, { responseConstraint: c.schema, omitResponseConstraintInput: true }).then(function (txt) {
        try { session.destroy(); } catch (e) {}
        var s = String(txt).replace(/```(?:json)?/g, "");
        var a = s.indexOf("{"), b = s.lastIndexOf("}");
        if (a < 0 || b <= a) throw Object.assign(new Error("bad_answer"), { code: "bad_answer" });
        return JSON.parse(s.slice(a, b + 1));
      }, function (e) { try { session.destroy(); } catch (x) {} throw Object.assign(e || new Error("device_error"), { code: e && e.name === "QuotaExceededError" ? "too_long" : "device_error" }); });
    });
  }
  function deviceProvider(lang, onProgress) {
    return {
      name: "device", model: "Gemini Nano (Chrome)",
      tailor: function (master, job, feedback) { return devicePrompt("tailor", { master: stripOther(master), jd: job.text, feedback: feedback || [] }, lang, onProgress); },
      shorten: function (bullets) { return devicePrompt("shorten", { bullets: bullets, maxChars: 110 }, lang, onProgress); },
      parse: function (text) { return devicePrompt("parse", { text: text }, lang, onProgress); }
    };
  }

  function stripOther(m) { var c = JSON.parse(JSON.stringify(m)); delete c.other; return c; }

  /* Falls back from one provider to the next when the first is out of quota or fails to answer. */
  function chain(providers) {
    var list = providers.filter(Boolean);
    if (!list.length) return null;
    function attempt(method, args, i, errs) {
      if (i >= list.length) return Promise.reject(Object.assign(new Error("all_failed"), { code: "all_failed", errors: errs }));
      return list[i][method].apply(null, args).then(function (r) { used.name = list[i].name; used.model = list[i].model; return r; }, function (e) { return attempt(method, args, i + 1, errs.concat([{ provider: list[i].name, code: e && e.code }])); });
    }
    var used = { name: list[0].name, model: list[0].model };
    return {
      get name() { return used.name; }, get model() { return used.model; },
      tailor: function () { return attempt("tailor", arguments, 0, []); },
      shorten: function () { return attempt("shorten", arguments, 0, []); },
      parse: function () { return attempt("parse", arguments, 0, []); }
    };
  }

  root.TailrAI = { detectCloud: detectCloud, detectDevice: detectDevice, cloudProvider: cloudProvider, deviceProvider: deviceProvider, chain: chain };
})(typeof globalThis !== "undefined" ? globalThis : this);
