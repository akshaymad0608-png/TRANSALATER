# 90-day SEO action plan — Rosetta (languagetransalator.com)

Baseline Search Console numbers: export once (see the implementation report) and write them here before starting.
Baseline Lighthouse (mobile, local, uncompressed): performance 96, LCP 1.9 s, TBT 0 ms, CLS 0.

Goal: more qualified organic visits through better indexing, clearer intent match and faster pages. Rankings cannot be guaranteed; progress is judged by the metrics below.

## Days 0–30: foundations and measurement

- [ ] Merge this PR; confirm the `SEO checks` workflow is green on `main`.
- [ ] Verify the Search Console property and submit the sitemap; record the baseline (clicks, impressions, indexed pages, average position).
- [ ] Export the first CSVs and run `npm run seo:gsc`; save the report.
- [ ] `/contact` has ~46 words of text; fine for a contact page.
- [ ] About/Contact/Privacy/Terms have no JSON-LD (informational only; `Organization` is already on the home page).
- [ ] Fix every **error** the validator reports; keep warnings trending down.
- [ ] Re-run Lighthouse against the deployed URL (real compression and CDN) and record LCP/TBT/CLS; read the Core Web Vitals report in Search Console for field data (including INP).

## Days 31–60: content and intent

- [ ] From `reports/gsc-opportunities.md`, take the top 10 *striking distance* queries and improve the ranking page: answer the query under a matching heading, add a short FAQ for question queries, add 2–3 descriptive internal links.
- [ ] Rewrite titles/descriptions for the top low-CTR pages (benefit first, distinct per page, no keyword stuffing).
- [ ] Resolve cannibalisation: one page per query.
- [ ] The 16 language-pair pages share one template. Make sure each has unique example phrases and language-specific notes (script, formality, common pitfalls) or consolidate the weakest ones.
- [ ] Publish at most 2–4 genuinely useful new pages/guides from the question and long-tail lists; skip topics you cannot answer better than what already ranks.
- [ ] Earn real links: directories relevant to the niche, communities where the tool is genuinely useful, a short launch post. No paid or spam links.

## Days 61–90: compounding and cleanup

- [ ] Re-export Search Console data; compare with the day-0 baseline and the `previous/` folder to find declining pages.
- [ ] Refresh the five most-visited pages (accuracy, date, examples), update `lastmod` only when content really changed.
- [ ] Prune or merge pages that stay "Crawled – currently not indexed" after improvements.
- [ ] Re-audit with `npm run seo:report`; update this plan.

## Metrics to track

| Metric | Source | 30 days | 60 days | 90 days |
|---|---|---|---|---|
| Indexed pages vs indexable pages | Search Console → Pages | ≥ 50% of indexable | ≥ 75% | ≥ 90% |
| Impressions (non-branded) | Performance, branded filter excluded | rising vs baseline | +25% vs day 30 | +50% vs day 30 |
| Clicks | Performance | first non-branded clicks | steady weekly growth | 2× baseline or better |
| Average CTR on top 10 pages | Performance | baseline recorded | +0.5 pt | +1 pt |
| Queries in positions 1–10 | Performance → Queries | baseline recorded | +20% | +40% |
| LCP / INP / CLS (field) | Core Web Vitals report | "Good" LCP and CLS | INP good | all three good |
| Validator errors / warnings | `npm run seo:validate` | 0 errors | warnings −50% | warnings −75% |
| Referring domains | Search Console → Links | +3 | +8 | +15 |

Targets are directional guides for a young site, not promises; adjust them after the baseline is known.
