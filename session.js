/* Tailr session state. Job-related state is rebuilt from scratch for every job, so a new job can
   never reuse the company, role, keywords or result of the previous one. */
(function (root) {
  "use strict";
  var J = root.TailrJob || (typeof require === "function" ? require("./job.js") : null);
  var PA = root.TailrParse || (typeof require === "function" ? require("./parse.js") : null);

  function createSession() {
    var s = {
      master: null,          // confirmed master CV (the only source of truth)
      job: null,             // analysis of the current job description
      confirmed: {},         // keywords the user said they truly have, for the current job
      result: null,          // pipeline result for the current job
      companiesSeen: [],     // companies of earlier jobs, used to catch stale text
      setMaster: function (m) { this.master = PA.normalizeMaster(m); this.result = null; return this.master; },
      startJob: function (text) {
        if (this.job && this.job.target.company && this.companiesSeen.indexOf(this.job.target.company) < 0) this.companiesSeen.push(this.job.target.company);
        // everything about the previous job is dropped here
        this.job = J.newJob(text);
        this.confirmed = {};
        this.result = null;
        return this.job;
      },
      clearJob: function () {
        if (this.job && this.job.target.company && this.companiesSeen.indexOf(this.job.target.company) < 0) this.companiesSeen.push(this.job.target.company);
        this.job = null; this.confirmed = {}; this.result = null;
      },
      previousCompanies: function () {
        var cur = this.job ? this.job.target.company : "";
        return this.companiesSeen.filter(function (c) { return c && c !== cur; });
      }
    };
    return s;
  }
  var api = { createSession: createSession };
  root.TailrSession = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
