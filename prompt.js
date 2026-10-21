/* Tailr AI prompts and output schema.
   Used by the browser (on-device AI, validation) and by the Cloudflare function, which keeps an
   exact copy in functions/_lib/prompt.js (plus one export line). A unit test checks they match. */
(function (root) {
"use strict";

var TAILOR_SYSTEM = `You are an expert recruiter and ATS specialist. You tailor a candidate's CV to one specific job
description. You receive:
  <master_cv> the candidate's confirmed CV as JSON </master_cv>
  <job_description> the full job posting text </job_description>

Return ONLY valid JSON matching the output schema. No commentary outside the JSON.

STEP 1 - ANALYSE THE JOB
Extract: company name, exact job title, contract type (internship / graduate / permanent), start
date, duration, location, and keywords in three buckets:
  - must_have: listed as required/minimum, in the title, or repeated 2+ times
  - nice_to_have: "a plus", "preferred", "ideally"
  - context: domain terms, tools, methods and soft-skill phrases the posting uses
Keep the posting's exact spelling (e.g. "Power BI", "KPI", "omni-channel").
Also extract hard eligibility requirements: work authorization, visa, language levels, degree,
availability, relocation, weekend work.

STEP 2 - MAP AGAINST THE CV
For each keyword, classify it:
  - present: the CV already shows it
  - reword: the CV shows the same thing in different words -> use the job's wording
  - adjacent: related but not the same (e.g. AWS vs Azure) -> do NOT claim it; report it
  - missing: no evidence -> do NOT add it; report it
For each eligibility requirement, mark met / not_met / unknown from the CV.

STEP 3 - REWRITE
  - headline: mirrors the job family truthfully, plus 3-5 of the candidate's real matching skills.
  - summary: 3-4 sentences. Who they are (degree/years), what they are applying for at THIS
    company (correct contract type, start date and duration from THIS posting), 4-6 must-have
    keywords they truly have, 1-2 soft skills in the posting's own words.
  - skills: 3-5 grouped lines (e.g. "Data & Reporting: ..."), most relevant first, JD spelling.
    Only real skills. Never list the company name, programme name, or language levels here.
  - experience: keep every role, employer, title, location and date exactly as in the master.
    Reorder bullets so the most relevant come first. Each bullet = action verb + what + tool/keyword
    + result. Reword only when the underlying fact stays true. 3-5 bullets for relevant roles,
    1-3 for others.
  - projects: keep every project; most relevant first; 1-2 bullets each.
  - education, certifications: copy exactly; reorder only.
  - languages: keep every language and level from the master.
  - Each bullet and paragraph is ONE string with no line breaks.
  - Fit one page: total roughly 450-600 words for students/graduates.

HARD RULES - NEVER BREAK
  1. Never invent employers, titles, dates, degrees, grades, certifications, tools, languages,
     metrics or projects. If the master has no number, do not add one.
  2. Never claim experience the master does not show (e.g. "experience in recruitment").
  3. Never paste keywords into the middle of existing sentences or as a keyword list.
  4. Use any single keyword at most 3-4 times across the whole CV.
  5. Use only information from THIS job description. Never mention another company or job.
  6. Write in the language of the posting unless told otherwise; keep it plain, clear and
     readable for a human recruiter in 10 seconds.

OUTPUT SCHEMA
{
  "target": {"company": "", "role": "", "contract": "", "start": "", "duration": "", "location": ""},
  "cv": {
    "name": "", "headline": "",
    "contact": {"phone": "", "email": "", "location": "", "linkedin": "", "portfolio": ""},
    "summary": "",
    "skills": [{"label": "", "items": ""}],
    "experience": [{"title": "", "company": "", "location": "", "dates": "", "bullets": [""]}],
    "projects": [{"name": "", "tech": "", "dates": "", "bullets": [""]}],
    "education": [{"degree": "", "school": "", "location": "", "dates": "", "details": ""}],
    "certifications": [""],
    "languages": [{"language": "", "level": ""}]
  },
  "report": {
    "keywords": {"must_have": [], "nice_to_have": [], "context": []},
    "match_before_pct": 0, "match_after_pct": 0,
    "added_keywords": [], "missing_must_haves": [], "adjacent_skills": [],
    "eligibility": [{"requirement": "", "status": "met|not_met|unknown", "note": ""}],
    "changes": [""],
    "honest_suggestions": [""],
    "fit": "strong|medium|low", "recommendation": ""
  }
}
Match % = (matched must-haves x 2 + matched nice-to-haves) / (all must-haves x 2 + all
nice-to-haves) x 100, counting only keywords the candidate truly has.`;

var PARSE_SYSTEM = `You convert the text of a CV into JSON. Copy every value exactly as written in the CV text:
same words, same spelling, same dates, same numbers. Never invent, translate, summarise or correct anything.
Rules:
  - Each bullet is ONE string with no line breaks. Remove bullet symbols at the start.
  - "dates" is copied exactly as written (e.g. "Jun–Aug 2026", "2024 – present").
  - Put spoken languages and their levels in "languages", not in "skills".
  - Put grades, majors and honours of a degree in that education entry's "details".
  - Put interests, hobbies and anything that fits no field in "other" as plain lines.
  - Leave a field as "" or [] when the CV has nothing for it.
Return ONLY valid JSON with this shape:
{"name":"","headline":"","contact":{"phone":"","email":"","location":"","linkedin":"","portfolio":""},
 "summary":"","skills":[""],
 "experience":[{"title":"","company":"","location":"","dates":"","bullets":[""]}],
 "projects":[{"name":"","tech":"","dates":"","bullets":[""]}],
 "education":[{"degree":"","school":"","location":"","dates":"","details":""}],
 "certifications":[""],"languages":[{"language":"","level":""}],"other":[""]}`;

var SHORTEN_SYSTEM = `You shorten CV bullet points so a CV fits on one page.
For each bullet, return a shorter version that keeps the same facts, the same numbers, the same tools
and the same meaning. Start with an action verb. Never add a fact, number, tool or claim that is not
in the original bullet. Never end a bullet with a dangling word such as "and", "to", "by", "from" or "the".
Keep the language of the original bullet. Each bullet is ONE string with no line breaks.
Return ONLY valid JSON: {"bullets":[{"id":"","text":""}]} with the same ids you received.`;

var str = { type: "string" };
var strArr = { type: "array", items: str };

var OUTPUT_SCHEMA = {
  type: "object",
  required: ["target", "cv", "report"],
  properties: {
    target: {
      type: "object",
      required: ["company", "role", "contract", "start", "duration", "location"],
      properties: { company: str, role: str, contract: str, start: str, duration: str, location: str }
    },
    cv: {
      type: "object",
      required: ["name", "headline", "contact", "summary", "skills", "experience", "projects", "education", "certifications", "languages"],
      properties: {
        name: str, headline: str,
        contact: {
          type: "object",
          required: ["phone", "email", "location", "linkedin", "portfolio"],
          properties: { phone: str, email: str, location: str, linkedin: str, portfolio: str }
        },
        summary: str,
        skills: { type: "array", items: { type: "object", required: ["label", "items"], properties: { label: str, items: str } } },
        experience: { type: "array", items: { type: "object", required: ["title", "company", "location", "dates", "bullets"], properties: { title: str, company: str, location: str, dates: str, bullets: strArr } } },
        projects: { type: "array", items: { type: "object", required: ["name", "tech", "dates", "bullets"], properties: { name: str, tech: str, dates: str, bullets: strArr } } },
        education: { type: "array", items: { type: "object", required: ["degree", "school", "location", "dates", "details"], properties: { degree: str, school: str, location: str, dates: str, details: str } } },
        certifications: strArr,
        languages: { type: "array", items: { type: "object", required: ["language", "level"], properties: { language: str, level: str } } }
      }
    },
    report: {
      type: "object",
      required: ["keywords", "match_before_pct", "match_after_pct", "added_keywords", "missing_must_haves", "adjacent_skills", "eligibility", "changes", "honest_suggestions", "fit", "recommendation"],
      properties: {
        keywords: { type: "object", required: ["must_have", "nice_to_have", "context"], properties: { must_have: strArr, nice_to_have: strArr, context: strArr } },
        match_before_pct: { type: "number" }, match_after_pct: { type: "number" },
        added_keywords: strArr, missing_must_haves: strArr, adjacent_skills: strArr,
        eligibility: { type: "array", items: { type: "object", required: ["requirement", "status", "note"], properties: { requirement: str, status: { type: "string", enum: ["met", "not_met", "unknown"] }, note: str } } },
        changes: strArr, honest_suggestions: strArr,
        fit: { type: "string", enum: ["strong", "medium", "low"] },
        recommendation: str
      }
    }
  }
};

var MASTER_SCHEMA = {
  type: "object",
  required: ["name", "contact", "experience", "education", "skills", "languages"],
  properties: {
    name: str, headline: str,
    contact: { type: "object", properties: { phone: str, email: str, location: str, linkedin: str, portfolio: str } },
    summary: str, skills: strArr,
    experience: { type: "array", items: { type: "object", properties: { title: str, company: str, location: str, dates: str, bullets: strArr } } },
    projects: { type: "array", items: { type: "object", properties: { name: str, tech: str, dates: str, bullets: strArr } } },
    education: { type: "array", items: { type: "object", properties: { degree: str, school: str, location: str, dates: str, details: str } } },
    certifications: strArr,
    languages: { type: "array", items: { type: "object", properties: { language: str, level: str } } },
    other: strArr
  }
};

var SHORTEN_SCHEMA = {
  type: "object", required: ["bullets"],
  properties: { bullets: { type: "array", items: { type: "object", required: ["id", "text"], properties: { id: str, text: str } } } }
};

/* Builds the user message for each task. Keeping this here means the browser and the server send
   exactly the same thing. */
function buildUserMessage(task, payload) {
  var fb = (payload.feedback || []).slice(0, 20).map((s) => "- " + String(s).slice(0, 300)).join("\n");
  var fix = fb ? `\n<fix_these_errors_from_your_previous_answer>\n${fb}\n</fix_these_errors_from_your_previous_answer>` : "";
  if (task === "tailor") {
    return `<master_cv>${JSON.stringify(payload.master)}</master_cv>\n<job_description>${payload.jd}</job_description>${fix}`;
  }
  if (task === "parse") return `<cv_text>\n${payload.text}\n</cv_text>${fix}`;
  if (task === "shorten") return `<bullets>${JSON.stringify(payload.bullets)}</bullets>\nShorten each bullet to at most ${payload.maxChars || 110} characters.`;
  throw new Error("unknown task");
}

var TASKS = {
  tailor: { system: TAILOR_SYSTEM, schema: OUTPUT_SCHEMA, maxTokens: 3500 },
  parse: { system: PARSE_SYSTEM, schema: MASTER_SCHEMA, maxTokens: 3500 },
  shorten: { system: SHORTEN_SYSTEM, schema: SHORTEN_SCHEMA, maxTokens: 1200 }
};

var api = { TAILOR_SYSTEM: TAILOR_SYSTEM, PARSE_SYSTEM: PARSE_SYSTEM, SHORTEN_SYSTEM: SHORTEN_SYSTEM, OUTPUT_SCHEMA: OUTPUT_SCHEMA,
  MASTER_SCHEMA: MASTER_SCHEMA, SHORTEN_SCHEMA: SHORTEN_SCHEMA, buildUserMessage: buildUserMessage, TASKS: TASKS };
root.TailrPrompt = api;
if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
