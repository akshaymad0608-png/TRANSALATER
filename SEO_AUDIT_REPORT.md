# SEO audit report — Rosetta (languagetransalator.com)

Audited 2026-10-04. Origin: https://languagetransalator.com

## Scope and method

- **Stack:** Plain static HTML (one file per page, no build step) with `sitemap.xml`, `llms.txt`, an IndexNow workflow and Vercel hosting.
- **Static validation:** `scripts/seo-validate.mjs` over the production build (what a crawler sees without running JavaScript).
- **Lab performance:** Lighthouse 12 (mobile preset, simulated throttling), Chromium headless, against a plain local static server serving the build. A plain `python3 -m http.server` does **not** gzip/brotli, so the "enable text compression" findings and the absolute LCP are pessimistic compared with production hosting. Treat the numbers as a baseline to compare against after changes, not as field data.
- **Not verified here:** indexing status, rankings and Core Web Vitals field data (INP is only measurable in the field). Those come from Search Console.
- Search Console data for this property is not available to the tooling in this environment; use the CSV workflow.

## Results at a glance

| Pages built | Indexable | `noindex` | Sitemap URLs | Errors | Warnings | Notes |
|---|---|---|---|---|---|---|
| 23 | 23 | 0 | 23 | 0 | 1 | 4 |

### Validator findings (after this PR's fixes)

| Severity | Check | Count | Example |
|---|---|---|---|
| warn | `thin-static-content` | 1 | `/contact — 46 visible words in static HTML` |
| info | `jsonld-missing` | 4 | `/about` |

### Lighthouse (mobile, local baseline)

| Category | Score |
|---|---|
| Performance | 96 |
| Accessibility | 91 |
| Best practices | 96 |
| SEO | 100 |

Lab metrics (home page): LCP **1.9 s**, FCP 1.9 s, TBT 0 ms, CLS 0.

## Issues found and fixed so far

- Earlier work (PR #17): 16 meta descriptions rewritten to 134–156 characters, Open Graph/Twitter tags added to About/Contact/Privacy/Terms and six older language pages, sitemap `lastmod` refreshed, IndexNow workflow added.
- This pass: the English→Japanese and English→Portuguese titles were 66 and 68 characters; both are now under 65.

## Issues still open

- `/contact` has ~46 words of text; fine for a contact page.
- About/Contact/Privacy/Terms have no JSON-LD (informational only; `Organization` is already on the home page).
- The 16 language-pair pages share one template. Make sure each has unique example phrases and language-specific notes (script, formality, common pitfalls) or consolidate the weakest ones.

## What this audit deliberately does not claim

- No ranking, traffic or indexing improvement is promised. Rankings depend on content quality, links and competition.
- Structured data uses only facts visible on the site; no review/rating markup is emitted without real reviews.
