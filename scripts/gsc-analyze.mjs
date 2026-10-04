#!/usr/bin/env node
/**
 * Search Console CSV analyser. Zero dependencies, no API credentials.
 *
 * 1. In Search Console → Performance → Search results, set the date range
 *    (3 or 6 months is best) and click EXPORT → Download CSV.
 * 2. Unzip into  seo-data/current/  (files: Queries.csv, Pages.csv, ...).
 *    For a "declining pages" comparison, export the previous equal period into
 *    seo-data/previous/.
 * 3. Optional: seo-data/current/QueryPage.csv with columns
 *    query,page,clicks,impressions,ctr,position (from the Search Console API or
 *    Looker Studio). It enables the cannibalisation and intent-mismatch checks.
 *
 *   node scripts/gsc-analyze.mjs                       # writes reports/gsc-opportunities.md
 *   node scripts/gsc-analyze.mjs --dir seo-data --out reports/gsc-opportunities.md --json reports/gsc.json
 *
 * Settings come from seo.config.json → "gsc": { brandTerms: [...], minImpressions: 20 }.
 *
 * Query analysis tells you WHAT people searched and where you appear. It does
 * not change a single page. Every row in the report is a hypothesis to act on
 * by improving the page (title, content, internal links) — see
 * SEO_REGEX_TOOLKIT.md for how to slice the same data inside Search Console.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const cfg = existsSync('seo.config.json') ? JSON.parse(readFileSync('seo.config.json', 'utf8')) : {};
const g = cfg.gsc ?? {};
const DIR = opt('--dir', 'seo-data');
const OUT = opt('--out', 'reports/gsc-opportunities.md');
const JSON_OUT = opt('--json', null);
const MIN_IMPR = g.minImpressions ?? 20;
const brand = new RegExp((g.brandTerms ?? []).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^', 'i');

/* ---------- CSV ---------- */
const parseCsv = (text) => {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0]);
};
const num = (s) => { const n = parseFloat(String(s ?? '').replace(/[%,]/g, '')); return Number.isFinite(n) ? n : 0; };
const load = (dir, file) => {
  const p = join(dir, file);
  if (!existsSync(p)) return null;
  const [head, ...rest] = parseCsv(readFileSync(p, 'utf8').replace(/^﻿/, ''));
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (...names) => h.findIndex((x) => names.some((n) => x.includes(n)));
  const iKey = col('top queries', 'query', 'top pages', 'page');
  const iC = col('clicks'), iI = col('impressions'), iCtr = col('ctr'), iP = col('position');
  return rest.map((r) => ({
    key: r[iKey], clicks: num(r[iC]), impressions: num(r[iI]),
    ctr: iCtr >= 0 ? num(r[iCtr]) : (num(r[iI]) ? (100 * num(r[iC])) / num(r[iI]) : 0),
    position: num(r[iP]),
  }));
};
const loadQP = (dir) => {
  const p = join(dir, 'QueryPage.csv');
  if (!existsSync(p)) return null;
  const [head, ...rest] = parseCsv(readFileSync(p, 'utf8').replace(/^﻿/, ''));
  const h = head.map((x) => x.trim().toLowerCase());
  const ix = (n) => h.findIndex((x) => x.includes(n));
  return rest.map((r) => ({
    query: r[ix('query')], page: r[ix('page')], clicks: num(r[ix('clicks')]),
    impressions: num(r[ix('impressions')]), position: num(r[ix('position')]),
  }));
};

const cur = join(DIR, 'current'), prev = join(DIR, 'previous');
const baseDir = existsSync(cur) ? cur : DIR;
const queries = load(baseDir, 'Queries.csv');
const pages = load(baseDir, 'Pages.csv');
const qp = loadQP(baseDir);
if (!queries && !pages) {
  console.error(`No Queries.csv / Pages.csv found in ${baseDir}.\nSee the header of scripts/gsc-analyze.mjs for how to export them.`);
  process.exit(2);
}
const prevPages = existsSync(prev) ? load(prev, 'Pages.csv') : null;

/* ---------- analysis ---------- */
// Rough average organic CTR by position (industry-wide benchmarks, not Google
// data). Used only to flag rows that are well below what their position usually
// earns; treat the result as "look at this title", never as a target.
const expectedCtr = (pos) => (pos <= 1.5 ? 28 : pos <= 2.5 ? 15 : pos <= 3.5 ? 10 : pos <= 5.5 ? 6 : pos <= 10.5 ? 2.5 : 0.8);
const Q = (queries ?? []).filter((r) => r.key);
const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const tbl = (rows, cols) =>
  rows.length
    ? `| ${cols.map((c) => c[0]).join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n` +
      rows.map((r) => `| ${cols.map((c) => c[1](r)).join(' | ')} |`).join('\n')
    : '_Nothing matched. Either the site is healthy here or there is not enough data yet._';
const qcols = [
  ['Query', (r) => r.key], ['Impr.', (r) => r.impressions], ['Clicks', (r) => r.clicks],
  ['CTR %', (r) => fmt(r.ctr)], ['Pos.', (r) => fmt(r.position)],
];

const totals = (rows) => rows.reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }), { c: 0, i: 0 });
const t = totals(Q);
const branded = Q.filter((r) => brand.test(r.key)), generic = Q.filter((r) => !brand.test(r.key));
const tb = totals(branded), tg = totals(generic);

const lowCtr = Q.filter((r) => r.impressions >= MIN_IMPR && r.position <= 10.5 && r.ctr < expectedCtr(r.position) * 0.5)
  .sort((a, b) => b.impressions - a.impressions).slice(0, 30);
const striking = Q.filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= MIN_IMPR)
  .sort((a, b) => b.impressions - a.impressions).slice(0, 30);
const questionRe = /^(who|what|when|where|why|how|which|can|does|do|is|are|should|kaise|kya|kab|kitna|kitni|kaun)\b|\?$/i;
const questions = Q.filter((r) => questionRe.test(r.key.trim())).sort((a, b) => b.impressions - a.impressions).slice(0, 30);
const longTail = Q.filter((r) => r.key.trim().split(/\s+/).length >= 4 && r.impressions >= 1)
  .sort((a, b) => b.impressions - a.impressions).slice(0, 30);
const zeroClick = Q.filter((r) => r.clicks === 0 && r.impressions >= MIN_IMPR * 2 && r.position <= 20)
  .sort((a, b) => b.impressions - a.impressions).slice(0, 20);

// Declining pages: needs a previous export.
let declining = [];
if (pages && prevPages) {
  const pm = new Map(prevPages.map((r) => [r.key, r]));
  declining = pages.map((r) => ({ ...r, prev: pm.get(r.key) })).filter((r) => r.prev && r.prev.clicks >= 5 && r.clicks < r.prev.clicks * 0.7)
    .map((r) => ({ ...r, delta: r.clicks - r.prev.clicks }))
    .sort((a, b) => a.delta - b.delta).slice(0, 25);
}

// Cannibalisation + intent: needs QueryPage.csv
let cannibal = [], intent = [];
if (qp) {
  const byQ = new Map();
  for (const r of qp) byQ.set(r.query, [...(byQ.get(r.query) ?? []), r]);
  for (const [q, rows] of byQ) {
    const tot = rows.reduce((a, r) => a + r.impressions, 0);
    const strong = rows.filter((r) => r.impressions >= tot * 0.15 && r.impressions >= 10);
    if (strong.length >= 2) cannibal.push({ query: q, tot, pages: strong.map((r) => `${r.page} (pos ${fmt(r.position)})`) });
  }
  cannibal.sort((a, b) => b.tot - a.tot); cannibal = cannibal.slice(0, 25);
  const stop = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'and', 'or', 'free', 'online', 'how', 'what', 'is', 'best']);
  for (const r of qp) {
    if (r.impressions < MIN_IMPR) continue;
    const slug = decodeURIComponent(new URL(r.page, 'https://x.test').pathname).toLowerCase();
    const toks = r.query.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
    if (toks.length && !toks.some((w) => slug.includes(w.replace(/s$/, ''))) && r.position > 8) intent.push(r);
  }
  intent = intent.sort((a, b) => b.impressions - a.impressions).slice(0, 25);
}

/* ---------- report ---------- */
const pct = (a, b) => (b ? `${fmt((100 * a) / b, 0)}%` : '-');
let md = `# Search Console keyword opportunity report\n\nGenerated ${new Date().toISOString().slice(0, 10)} from \`${baseDir}\`. ` +
  `Minimum impressions for a row to appear: ${MIN_IMPR}.\n\n` +
  `> Query analysis finds opportunities; it does not optimise anything by itself. ` +
  `Each table below is a to-do list for a specific page.\n\n` +
  `## Summary\n\n| | Clicks | Impressions | Share of impressions |\n|---|---|---|---|\n` +
  `| All queries | ${t.c} | ${t.i} | 100% |\n| Branded (${(g.brandTerms ?? []).join(', ') || 'no brandTerms set'}) | ${tb.c} | ${tb.i} | ${pct(tb.i, t.i)} |\n` +
  `| Non-branded | ${tg.c} | ${tg.i} | ${pct(tg.i, t.i)} |\n\n` +
  `Queries analysed: ${Q.length}${Q.length >= 1000 ? ' (Search Console exports are capped at 1,000 rows)' : ''}.\n\n` +
  `## 1. High impressions, low CTR (top 10, CTR under half the typical for the position)\n\n` +
  `**Action:** rewrite the title/description of the ranking page so it matches the query's intent; do not just add keywords.\n\n${tbl(lowCtr, qcols)}\n\n` +
  `## 2. Striking distance (positions 5–20)\n\n**Action:** strengthen the ranking page: answer the query directly under a matching heading, add internal links with descriptive anchors, add a short FAQ if the query is a question.\n\n${tbl(striking, qcols)}\n\n` +
  `## 3. Impressions but zero clicks (top 20)\n\n**Action:** the page shows up but is not chosen. Check the snippet and whether the page really answers this query.\n\n${tbl(zeroClick, qcols)}\n\n` +
  `## 4. Question queries\n\n**Action:** each is a candidate for a section, FAQ entry or new guide, only if the site can answer it better than what ranks today.\n\n${tbl(questions, qcols)}\n\n` +
  `## 5. Long-tail queries (4+ words)\n\n${tbl(longTail, qcols)}\n\n` +
  `## 6. Pages losing clicks vs the previous period\n\n` +
  (prevPages ? tbl(declining, [['Page', (r) => r.key], ['Clicks', (r) => r.clicks], ['Previous', (r) => r.prev.clicks], ['Δ', (r) => r.delta]])
    : '_Not computed. Export the previous period into `seo-data/previous/Pages.csv`._') + `\n\n` +
  `## 7. Keyword cannibalisation candidates\n\n` +
  (qp ? tbl(cannibal, [['Query', (r) => r.query], ['Impr.', (r) => r.tot], ['Competing pages', (r) => r.pages.join('<br>')]]) +
    '\n\n**Action:** pick one page per query, consolidate or differentiate the others, and link to the winner.'
    : '_Needs `QueryPage.csv` (query, page, clicks, impressions, ctr, position)._') + `\n\n` +
  `## 8. Possible search-intent mismatches\n\n` +
  (qp ? tbl(intent, [['Query', (r) => r.query], ['Page', (r) => r.page], ['Impr.', (r) => r.impressions], ['Pos.', (r) => fmt(r.position)]]) +
    '\n\nHeuristic: no meaningful query word appears in the URL and the page ranks below position 8. Review manually; some are fine.'
    : '_Needs `QueryPage.csv`._') + `\n\n` +
  `## Top pages\n\n${tbl((pages ?? []).slice(0, 20), [['Page', (r) => r.key], ['Clicks', (r) => r.clicks], ['Impr.', (r) => r.impressions], ['CTR %', (r) => fmt(r.ctr)], ['Pos.', (r) => fmt(r.position)]])}\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md);
if (JSON_OUT) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify({
    generatedAt: new Date().toISOString(), totals: { all: t, branded: tb, nonBranded: tg },
    lowCtr, striking, zeroClick, questions, longTail, declining, cannibal, intent,
  }, null, 2));
}
console.log(`GSC analysis written to ${OUT} (${Q.length} queries, ${(pages ?? []).length} pages)`);
