# Changes: bug fixes and the new architecture

The diffs are in `changes/`. There is one `.diff` per source file against the old site, plus `series/`, which holds the three commits as patches. Third-party libraries, fonts and the generated `schema-validate.js` are left out of the diffs.

**What the old Tailr actually had.** The old site had no AI step and no "Application:" line, so bugs 1 and 5 came from a different generator. Bugs 2 and 6 did apply: it appended job keywords to the end of the CV's existing skills line, and it used a "PROFILE" heading. Bug 3 partly applied: the old PDF export wrapped text only once, but it used Helvetica without dangling-word protection. Bugs 4 and 7 also applied: there was no page fitting, and languages were not checked. Each bug is now prevented by code, and a test guards it either way.

## Bugs from the test output

| # | Bug | Fix | Where | Test |
|---|---|---|---|---|
| 1 | Stale data from a previous job, and an "Application: …" line | Each new job builds a brand-new job object, and confirmations and the result are cleared. The output target is always recomputed from the current posting. The validator rejects a company or role that isn't in this posting, and any summary that names an earlier job's company. The ATS check fails if an earlier company appears. A late result for an old job is thrown away. No "Application:" line exists anywhere. | `session.js` `startJob`, `job.js` `newJob`, `validate.js` E_STALE_TARGET (l.154–163), `atscheck.js` "stale", `app.js` `tailorNow` (job id guard) | `session.test.js` (3 tests) |
| 2 | Keyword stuffing that split "customer … segmentation" | Strings are never spliced. Skills are rebuilt as whole items, in the posting's spelling, only when the master CV shows them. The company name, programme names (e.g. "UMC"), languages and levels (e.g. "B2") are blocked. Each keyword is capped at 4 uses. | `tailor.js` `buildSkills`, `isBlockedSkill`; `validate.js` E_SKILL_*, E_KEYWORD_OVERUSE | `validate.test.js` "skills…", "keyword stuffing…"; `pipeline.test.js` "keyword stuffing bug…" |
| 3 | Double wrapping ("Computer Science. I / turn…", "CGPA / 7.84") | Every string is stored on one line (`sanitize`). Text is wrapped once with `doc.splitTextToSize`. Multi-word keywords, "word + number" pairs and short words that can't end a line are kept together. Bullets have a separate "•" and a hanging indent. | `parse.js` `sanitize`; `layout.js` `protect`, `wrap`, `buildBlocks` | `wrap.test.js` (6 tests) |
| 4 | Two pages instead of one | The fit loop steps down in this order: spacing, margins (min 12 mm), font size (min 9.5 pt), then shortening. Shortening asks the AI first, and each shortened bullet is checked. After that, the lowest-priority bullets are removed, but every role keeps at least one. The limit is 1 page, or 2 from 10 years of experience. | `layout.js` `fit`, `LADDER`, `dropLowestBullet`, `pageLimit`; `pipeline.js` `aiShorten` | `pagefit.test.js` (5 tests) |
| 5 | "+33 745574978" didn't parse | Numbers go through libphonenumber-js, with the country guessed from the CV location. This also runs when the phone field in the editor loses focus. | `phone.js` `normalizePhone` | `phone.test.js` (6 tests) |
| 6 | "PROFILE" heading | Standard headings are used: Professional Summary, Skills, Professional Experience, Projects, Education, Certifications, Languages, with French equivalents. Education comes first when there is no experience. | `layout.js` `HEADINGS`, `sectionOrder` | `pipeline.test.js` "end to end…" |
| 7 | A language (French) dropped | Languages are copied from the master CV. The validator rejects a missing language or a changed level. | `validate.js` E_LANGUAGE_MISSING / E_LANGUAGE_LEVEL | `validate.test.js` "every language…" |

## New architecture (spec steps 1–6)

1. **Parse.** `parse.js` reads the CV with rules, which is instant and free. The optional "Read again with AI" button is only accepted if every value the AI returns appears in the CV text (`validateParsed`). The user confirms the result in the step 2 editor, and that becomes the master CV.
2. **Tailor.** The Part B system prompt is used word for word (`prompt.js`) and sent with JSON-schema output. The output is validated with an Ajv-precompiled schema, and an invalid answer is retried once with the list of errors.
3. **Validate in code.** Every employer, title, date, degree, school and grade must match the master CV exactly. New numbers are flagged; only the posting's own start date and duration are allowed in the summary. Each keyword is limited to 4 uses. The company can't appear in Skills. No `\n`, no empty bullets, no dangling endings. If the retry still fails, `repairOutput` rebuilds the broken parts from master facts, and the rules engine is the last resort.
4. **Render.** The CV is single-column, with no tables, images, icons, text boxes, headers or footers. Carlito (Calibri-metric) is embedded. Body text is 10.5 pt, headings 11.5 pt, the name 18 pt, all in black. Dates are right-aligned on the title line. Bullets use "•". The DOCX has the same content and look. Files are named `Firstname_Lastname_<Company>_<Role>`.
5. **ATS self-check.** pdf.js reads the generated PDF back, and each check shows PASS or FAIL. It covers: readable text, page limit, standard headings, email, phone, no dangling words, no keyword split across lines, every must-have the candidate has present intact, and no company from an earlier job. Downloads stay disabled until every critical check passes.
6. **Report.** It shows: match before and after (spec formula, computed in code), keywords added, missing must-haves with honest suggestions, and adjacent skills. It also covers eligibility (work authorisation, language levels, degree, start, duration, location, weekends, relocation, driving licence), a free-webmail warning, the changes made, and the bullets removed to fit.

## Tests

`cd dev && npm install && npm test` runs 45 tests, all passing:

- wrapping (6)
- stale state (3)
- validation (12)
- page fit (5)
- phone (6)
- end to end with a fake AI, covering the invent → retry → repair path and the quota → fallback path (7)
- the Cloudflare function (6)

The browser flow was also checked with Playwright. It covered:

- a DOCX upload and the editor;
- the match step, the result and real PDF/DOCX downloads (1 page);
- a cloud AI that is out of quota (fallback) and one that invents facts (repaired);
- phone width with no horizontal scroll.
