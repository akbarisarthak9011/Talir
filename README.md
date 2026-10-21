# Tailr

Free CV tailoring website. A visitor uploads a CV and a job description. Tailr then:

1. reads the CV into fields the visitor checks and corrects (the "master CV"),
2. analyses the job and maps every keyword against the master CV,
3. rewrites the CV for the job, using free AI when it is available,
4. validates the rewrite in code against the master CV,
5. fits it on one page and builds a PDF and a Word file,
6. reads the PDF back like an applicant tracking system (ATS) and unlocks the download only when every critical check passes.

The site is plain HTML, CSS and JavaScript, so there is nothing to build.

## How it stays free without an API key

Tailr tries three writers in order and uses the first one that works:

| Writer | Cost | Where it runs | When it is used |
|---|---|---|---|
| **Cloud AI**: `functions/api/ai.js` with Llama 3.3 70B on Cloudflare Workers AI | Free daily allowance on your Cloudflare account, no key, no card for the free plan | Cloudflare | Site hosted on Cloudflare Pages with the `AI` binding |
| **On-device AI**: Chrome's built-in Gemini Nano (Prompt API) | Free, unlimited | Visitor's computer | Desktop Chrome with a capable machine; download offered in step 4 |
| **Standard engine**: `tailor.js` | Free | Visitor's browser | Always available, and the fallback when the others are not |

The writer doesn't change how safe the result is. Every output goes through the same checks:

- facts are validated against the master CV, with a retry and then a repair;
- the layout is wrapped once and fitted to the page;
- the ATS self-check runs before any download.

The AI only improves the wording.

**Daily capacity of the free allowance.** Cloudflare gives 10,000 "neurons" a day. These are rough estimates, so check your own usage in the Cloudflare dashboard:

- **Llama 3.3 70B:** about 600–700 neurons per tailoring, so roughly **15 tailorings a day**.
- **Qwen3 30B** (`@cf/qwen/qwen3-30b-a3b-fp8`, set in `wrangler.toml`): about 100, so roughly **100 a day**. The answers are still validated.

When the allowance runs out, the site switches to the next writer by itself and tells the user.

## Put it online

### Recommended: GitHub plus Cloudflare Pages (cloud AI on)

1. Upload this folder to a GitHub repository (Add file > Upload files). Leave out `dev/node_modules`.
2. Create a free account at <https://dash.cloudflare.com>. Go to **Workers & Pages > Create > Pages > Connect to Git** and pick the repository.
3. Build settings: **Framework preset: None**. Leave **Build command** empty. Set **Build output directory** to `/`.
4. After the first deploy, open **Settings > Bindings > Add > Workers AI** and set the variable name to `AI`. Redeploy.
5. Open `https://<project>.pages.dev/api/ai`. It should show `{"available":true,...}`.

Every push to GitHub redeploys the site.

### GitHub Pages or Netlify only (no cloud AI)

The site works the same way, but without `/api/ai`. It uses Chrome's on-device AI when the visitor has it, and the standard engine otherwise.

## Before you publish

- `config.js`: your name, email and site URL. Add the AdSense IDs later.
- `legal.html`: your status (for example micro-entrepreneur + SIRET), address and host details.
- `ads.txt`: your AdSense publisher ID, once approved.
- AdSense usually needs your own domain, not `pages.dev`, `github.io` or `netlify.app`. In France you also need Google's consent message: AdSense > Privacy & messaging.

## Developers

```
cd dev
npm install
npm test                  # 45 unit tests
npm run build:validator   # after changing the schemas in prompt.js
npm run sync:function     # after changing prompt.js
```

| File | Job |
|---|---|
| `parse.js` | CV text to master CV JSON (rules) |
| `job.js` | Job description to target, keyword buckets, eligibility, free-webmail warning |
| `tailor.js` | Standard engine and report (spec match formula) |
| `prompt.js` | AI system prompts (Part B verbatim) and JSON schemas |
| `schema-validate.js` | Schema validator precompiled with Ajv (no `eval`) |
| `validate.js` | Fact checks, number checks, keyword limit, skills rules, stale-target checks, repair |
| `layout.js` | Single wrap, standard headings, page-fit ladder |
| `render.js` | jsPDF with embedded Carlito font, DOCX with the same content, file names |
| `atscheck.js` | Reads the PDF back with pdf.js and runs PASS/FAIL checks |
| `pipeline.js` | Tailor, validate, fit, PDF, ATS check |
| `session.js` | Per-job state that is rebuilt for every job |
| `ai.js` | Cloud and on-device providers with fallback |
| `functions/api/ai.js` | Cloudflare Pages Function (free Workers AI) |

Licences: pdf.js (Apache 2.0), mammoth (BSD-2), jsPDF, docx, libphonenumber-js and Ajv (MIT), Carlito, Bricolage Grotesque and IBM Plex (SIL OFL 1.1).
