# SEO implementation report — Rosetta (languagetransalator.com)

Implemented 2026-10-04 on branch `claude/seo-toolkit`.

## What was added

| File | Purpose |
|---|---|
| `scripts/seo-validate.mjs` | Zero-dependency validator for the build output: titles, descriptions, duplicates, canonicals, robots/googlebot directives, headings, Open Graph/Twitter, images without `alt`, JSON-LD validity and pitfalls, sitemap consistency (noindex pages, missing files, wrong host, collapse), broken internal links, orphan pages, `robots.txt`, `ads.txt`, important pages being indexable. Exit code 1 on errors. |
| `scripts/gsc-analyze.mjs` | Reads Search Console CSV exports and writes `reports/gsc-opportunities.md`: branded vs non-branded, low-CTR, positions 5–20, zero-click, question and long-tail queries, declining pages (with a previous export), cannibalisation and intent mismatches (with `QueryPage.csv`). |
| `scripts/seo-report.mjs` | Builds a self-contained local dashboard `reports/seo-dashboard.html` from the two reports. No server, no credentials, not deployed. |
| `seo.config.json` | Origin, build folder, important pages, sitemap floor, brand terms. |
| `.github/workflows/seo.yml` | Runs the validator in CI on every PR and on `main`. |
| `SEO_*.md` | These four documents. |
| `.gitignore` | `reports/` and `seo-data/` (generated output and private exports) are not committed. |

## Site changes in this pass

- `english-to-japanese-translation.html`, `english-to-portuguese-translation.html`: `<title>` shortened (brand suffix dropped).

## Validation

Command: `node scripts/seo-validate.mjs`

- 23 pages scanned (23 indexable, 0 noindex), 23 sitemap URLs.
- **0 errors**, 1 warnings, 4 notes (full list in `SEO_AUDIT_REPORT.md`).
- Production build passes.
- Lighthouse (local baseline) is recorded in `SEO_AUDIT_REPORT.md`; no improvement is claimed from this PR because it does not change performance.

## Remaining technical issues

- `/contact` has ~46 words of text; fine for a contact page.
- About/Contact/Privacy/Terms have no JSON-LD (informational only; `Organization` is already on the home page).
- The 16 language-pair pages share one template. Make sure each has unique example phrases and language-specific notes (script, formality, common pitfalls) or consolidate the weakest ones.

## Search Console setup

1. Open <https://search.google.com/search-console> and add a **Domain** property for `languagetransalator.com` (DNS TXT verification) so http/https/www variants are all covered. A URL-prefix property for `https://languagetransalator.com/` also works.
2. **Sitemaps** → submit `https://languagetransalator.com/sitemap.xml`. Status should read "Success"; compare "Discovered URLs" with the sitemap count above.
3. **Settings → Users and permissions**: add any tool/service account that needs read access.
4. **Pages (Indexing)**: for each excluded reason, compare with the intended `noindex` pages. "Crawled – currently not indexed" on a page you care about is a content-quality signal; improve the page, then use **URL Inspection → Request indexing** (about 10 per day).
5. Export data for the analyser: **Performance → Search results**, date range last 3–6 months, **Export → Download CSV**; unzip into `seo-data/current/`. For a decline comparison export the previous equal period into `seo-data/previous/`.
6. Run `npm run seo:gsc` (or `node scripts/gsc-analyze.mjs`), then `npm run seo:report` and open `reports/seo-dashboard.html`.
7. Optional: **Links**, **Core Web Vitals** and **Enhancements** (breadcrumbs, FAQ, etc.) should show no errors; fix any that appear.

## Recommended next steps

See `SEO_ACTION_PLAN_90_DAYS.md`.
