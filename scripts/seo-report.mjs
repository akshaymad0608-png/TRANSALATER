#!/usr/bin/env node
/**
 * Static SEO dashboard. Zero dependencies, no server, no credentials.
 *
 * Combines the output of the other two scripts into one self-contained HTML
 * file you open locally (reports/seo-dashboard.html):
 *
 *   node scripts/seo-validate.mjs --json reports/seo-validate.json --no-fail
 *   node scripts/gsc-analyze.mjs  --json reports/gsc.json          # optional
 *   node scripts/seo-report.mjs
 *
 * The file is generated and git-ignored; nothing here is deployed with the site.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const v = read('reports/seo-validate.json');
const g = read('reports/gsc.json');
if (!v) { console.error('Run scripts/seo-validate.mjs --json reports/seo-validate.json first.'); process.exit(2); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byRule = {};
for (const f of v.findings) (byRule[`${f.sev}|${f.rule}`] ??= []).push(f);
const card = (label, val, cls = '') => `<div class="card ${cls}"><b>${val}</b><span>${label}</span></div>`;
const rows = (list, cols) => list?.length
  ? `<table><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr>${list.slice(0, 15).map((r) => `<tr>${cols.map((c) => `<td>${esc(c[1](r))}</td>`).join('')}</tr>`).join('')}</table>`
  : '<p class="muted">No rows.</p>';

const checks = Object.entries(byRule).map(([k, list]) => {
  const [sev, rule] = k.split('|');
  return `<details><summary><span class="pill ${sev}">${sev}</span> ${esc(rule)} <em>×${list.length}</em></summary><ul>` +
    list.slice(0, 40).map((f) => `<li><code>${esc(f.url)}</code> ${esc(f.detail)}</li>`).join('') +
    (list.length > 40 ? `<li>… +${list.length - 40} more</li>` : '') + '</ul></details>';
}).join('');

const q = (r) => [['Query', (x) => x.key], ['Impr.', (x) => x.impressions], ['Clicks', (x) => x.clicks], ['CTR %', (x) => x.ctr.toFixed(1)], ['Pos.', (x) => x.position.toFixed(1)]];
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEO dashboard — ${esc(v.summary.origin)}</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e2e2e2;--card:#f6f7f9}
@media(prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8e8e8;--mut:#9aa0a6;--line:#2b2f36;--card:#1d2026}}
body{font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:960px;margin:0 auto;padding:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.card b{display:block;font-size:26px}.card span{color:var(--mut);font-size:13px}
.card.bad b{color:#d93025}.card.ok b{color:#188038}.card.warn b{color:#b06000}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 18px}th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left}
details{border-bottom:1px solid var(--line);padding:6px 0}summary{cursor:pointer}ul{margin:6px 0 6px 18px;font-size:13px}
.pill{font-size:11px;padding:1px 7px;border-radius:99px;text-transform:uppercase;color:#fff}.pill.error{background:#d93025}.pill.warn{background:#b06000}.pill.info{background:#5f6368}
.muted{color:var(--mut)}code{font-size:12px}h2{margin-top:28px}
</style>
<h1>SEO dashboard</h1>
<p class="muted">${esc(v.summary.origin)} · validated ${esc(v.summary.generatedAt)}${g ? ` · GSC data ${esc(g.generatedAt)}` : ' · no Search Console data loaded'}</p>
<div class="grid">
${card('pages built', v.summary.pages)}${card('indexable', v.summary.indexable)}${card('noindex', v.summary.noindex)}${card('sitemap URLs', v.summary.sitemapUrls)}
${card('errors', v.summary.counts.error, v.summary.counts.error ? 'bad' : 'ok')}${card('warnings', v.summary.counts.warn, v.summary.counts.warn ? 'warn' : 'ok')}
</div>
<h2>Technical checks</h2>${checks || '<p class="muted">No findings.</p>'}
<h2>Search Console</h2>
${g ? `<div class="grid">${card('clicks', g.totals.all.c)}${card('impressions', g.totals.all.i)}${card('non-branded impr.', g.totals.nonBranded.i)}${card('branded impr.', g.totals.branded.i)}</div>
<h3>High impressions, low CTR</h3>${rows(g.lowCtr, q())}
<h3>Positions 5–20</h3>${rows(g.striking, q())}
<h3>Question queries</h3>${rows(g.questions, q())}
<h3>Declining pages</h3>${rows(g.declining, [['Page', (x) => x.key], ['Clicks', (x) => x.clicks], ['Previous', (x) => x.prev.clicks]])}`
  : '<p class="muted">Export Search Console CSVs to <code>seo-data/current/</code> and run <code>node scripts/gsc-analyze.mjs --json reports/gsc.json</code>.</p>'}
`;
mkdirSync('reports', { recursive: true });
writeFileSync('reports/seo-dashboard.html', html);
console.log('Dashboard written to reports/seo-dashboard.html');
