#!/usr/bin/env node
/**
 * Static SEO validator. Zero dependencies.
 *
 * Reads the BUILT output (the folder you deploy, e.g. dist/) and checks what a
 * crawler that does not run JavaScript would see: titles, descriptions,
 * canonicals, robots directives, headings, images, structured data, sitemap
 * consistency, internal links and robots.txt.
 *
 *   node scripts/seo-validate.mjs                 # human summary, exit 1 on errors
 *   node scripts/seo-validate.mjs --json reports/seo-validate.json
 *   node scripts/seo-validate.mjs --md   reports/seo-validate.md
 *   node scripts/seo-validate.mjs --no-fail       # never exit 1 (reporting only)
 *
 * Configuration lives in seo.config.json at the repo root:
 *   origin          canonical origin, e.g. "https://example.com"   (required)
 *   distDir         folder to scan, default "dist"
 *   important       paths that MUST be indexable, e.g. ["/", "/about"]
 *   ignore          path prefixes to skip entirely (verification files, 404 ...)
 *   minSitemapUrls  fail if the sitemap has fewer URLs than this (regression guard)
 *
 * What this cannot tell you: whether Google indexed a page, how it ranks, or
 * how fast it loads. Those come from Search Console and a real Lighthouse run.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, posix, sep } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const cfg = JSON.parse(readFileSync('seo.config.json', 'utf8'));
const ORIGIN = cfg.origin.replace(/\/$/, '');
const DIST = cfg.distDir ?? 'dist';
const IMPORTANT = cfg.important ?? ['/'];
const IGNORE = [...(cfg.ignore ?? []), '/google', '/yandex', '/404'];

if (!existsSync(DIST)) {
  console.error(`seo-validate: "${DIST}" does not exist. Run the production build first.`);
  process.exit(2);
}

/* ---------- helpers ---------- */
const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
const norm = (u) => {
  let p = u.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return p.length > 1 ? p.replace(/\/$/, '') : '/';
};
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory()
    ? (f === 'node_modules' || f.startsWith('.') ? [] : walk(p)) : [p];
});
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decode(m[2] ?? m[3]) : null;
};
const metaTag = (head, key, by = 'name') => {
  for (const t of head.match(/<meta\b[^>]*>/gi) ?? []) {
    if ((attr(t, by) ?? '').toLowerCase() === key.toLowerCase()) return attr(t, 'content');
  }
  return null;
};
const linkHref = (head, rel) => {
  for (const t of head.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(t, 'rel') ?? '').toLowerCase() === rel) return attr(t, 'href');
  }
  return null;
};

/* ---------- load pages ---------- */
const files = walk(DIST);
const pages = new Map(); // normalised path -> { file, html }
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const rel = relative(DIST, f).split(sep).join('/');
  const url = norm(rel);
  if (IGNORE.some((p) => url === p || url.startsWith(p))) continue;
  const html = readFileSync(f, 'utf8');
  // Google site-verification stubs are not pages.
  if (/^\s*google-site-verification:/i.test(html) || !/<html|<head|<title/i.test(html)) continue;
  pages.set(url, { file: rel, html });
}

const findings = []; // { sev, rule, url, detail }
const add = (sev, rule, url, detail = '') => findings.push({ sev, rule, url, detail });

/* ---------- per-page checks ---------- */
const info = new Map();
for (const [url, { html }] of pages) {
  const head = html.split(/<\/head>/i)[0];
  const body = html.slice(head.length);
  const title = decode(((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ?? '').trim());
  const desc = metaTag(head, 'description');
  const robots = (metaTag(head, 'robots') ?? '').toLowerCase();
  const googlebot = (metaTag(head, 'googlebot') ?? '').toLowerCase();
  const canonical = linkHref(head, 'canonical');
  const noindex = robots.includes('noindex');
  const visible = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, '');
  const text = decode(visible.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  const h1s = body.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) ?? [];
  const headings = [...visible.matchAll(/<h([1-6])\b/gi)].map((m) => +m[1]);
  info.set(url, { title, desc, robots, canonical, noindex, words, h1s, headings, head, visible });

  if (!title) add('error', 'title-missing', url);
  else if (title.length < 15 || title.length > 65) add('warn', 'title-length', url, `${title.length} chars: "${title.slice(0, 70)}"`);
  if (desc == null) { if (!noindex) add('error', 'description-missing', url); }
  else if (desc.length < 70 || desc.length > 160) add('warn', 'description-length', url, `${desc.length} chars`);
  if (!/<html[^>]*\blang=/i.test(html)) add('warn', 'html-lang-missing', url);
  if (!metaTag(head, 'viewport')) add('error', 'viewport-missing', url);

  if (!noindex) {
    if (!canonical) add('error', 'canonical-missing', url);
    else {
      let c;
      try { c = new URL(canonical, ORIGIN + url); } catch { add('error', 'canonical-invalid', url, canonical); }
      if (c) {
        if (c.origin !== ORIGIN) add('error', 'canonical-other-origin', url, canonical);
        else if (norm(c.pathname) !== url) add('error', 'canonical-other-page', url, `→ ${c.pathname}`);
      }
    }
    if (h1s.length !== 1) add('warn', 'h1-count', url, `${h1s.length} <h1> in the static HTML`);
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] > headings[i - 1] + 1) { add('warn', 'heading-skip', url, `h${headings[i - 1]} → h${headings[i]}`); break; }
    }
    for (const k of ['og:title', 'og:description', 'og:image', 'og:url']) {
      if (!metaTag(head, k, 'property')) add('warn', `${k}-missing`, url);
    }
    if (!metaTag(head, 'twitter:card') && !metaTag(head, 'twitter:card', 'property')) add('warn', 'twitter-card-missing', url);
    if (words < 150) add('warn', 'thin-static-content', url, `${words} visible words in static HTML`);
    if (url.split('/').filter(Boolean).length > 3) add('warn', 'url-too-deep', url);
  }
  if (googlebot && robots) {
    // Only the indexing directives matter; snippet-size hints may differ harmlessly.
    const core = (v) => ['noindex', 'nofollow', 'none'].filter((d) => v.includes(d)).join(',');
    if (core(googlebot) !== core(robots)) {
      add('warn', 'robots-vs-googlebot-conflict', url, `robots="${robots}" googlebot="${googlebot}"`);
    }
  }
  if (/x-robots-tag/i.test(head)) add('info', 'x-robots-in-html', url);

  for (const t of visible.match(/<img\b[^>]*>/gi) ?? []) {
    if (attr(t, 'alt') === null) add('warn', 'img-alt-missing', url, (attr(t, 'src') ?? '').slice(0, 80));
  }

  // JSON-LD
  const blobs = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  if (!noindex && blobs.length === 0) add('info', 'jsonld-missing', url);
  for (const b of blobs) {
    let d;
    try { d = JSON.parse(b); } catch (e) { add('error', 'jsonld-invalid', url, e.message); continue; }
    const nodes = Array.isArray(d) ? d : d['@graph'] ?? [d];
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      const types = [].concat(n['@type'] ?? []);
      if (types.includes('BreadcrumbList') && (n.itemListElement ?? []).length < 2) add('warn', 'breadcrumb-lt-2', url);
      if (types.some((t) => ['AggregateRating', 'Review'].includes(t)) || n.aggregateRating || n.review) {
        add('warn', 'rating-markup-verify', url, 'review/rating markup present: confirm it reflects real, visible reviews');
      }
      if (types.includes('SoftwareApplication') && !n.aggregateRating && !n.review) {
        add('info', 'softwareapp-no-rating', url, 'not eligible for the app rich result (needs genuine rating/review)');
      }
      if (types.includes('Article') && !n.headline) add('warn', 'article-no-headline', url);
    }
  }
}

/* ---------- duplicates across pages ---------- */
const dup = (field, rule) => {
  const by = new Map();
  for (const [u, i] of info) {
    if (i.noindex || !i[field]) continue;
    const k = i[field].trim().toLowerCase();
    by.set(k, [...(by.get(k) ?? []), u]);
  }
  for (const [, urls] of by) if (urls.length > 1) for (const u of urls) add('warn', rule, u, `shared with ${urls.length - 1} other page(s), e.g. ${urls.find((x) => x !== u)}`);
};
dup('title', 'title-duplicate');
dup('desc', 'description-duplicate');

/* ---------- sitemap ---------- */
const smFile = join(DIST, 'sitemap.xml');
const sitemapUrls = new Set();
let sitemapCount = 0;
if (!existsSync(smFile)) add('error', 'sitemap-missing', '/sitemap.xml');
else {
  let xml = readFileSync(smFile, 'utf8');
  const isIndex = /<sitemapindex/i.test(xml);
  if (isIndex) add('info', 'sitemap-index', '/sitemap.xml', 'sitemap index: child sitemaps not followed');
  if (!/<urlset|<sitemapindex/i.test(xml)) add('error', 'sitemap-invalid-xml', '/sitemap.xml');
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => decode(m[1]));
  sitemapCount = locs.length;
  const seen = new Set();
  for (const l of locs) {
    let u;
    try { u = new URL(l); } catch { add('error', 'sitemap-bad-url', l); continue; }
    if (u.origin !== ORIGIN) { add('error', 'sitemap-other-origin', l); continue; }
    const p = norm(u.pathname);
    if (seen.has(p)) add('warn', 'sitemap-duplicate-entry', l);
    seen.add(p);
    sitemapUrls.add(p);
    const i = info.get(p);
    if (!i) {
      const asset = existsSync(join(DIST, u.pathname.replace(/^\//, '')));
      if (!asset) add('error', 'sitemap-url-no-file', l, 'no built page for this URL (SPA-only route or 404?)');
    } else if (i.noindex) add('error', 'sitemap-url-noindex', l, 'noindex page must not be in the sitemap');
  }
  if (cfg.minSitemapUrls && locs.length < cfg.minSitemapUrls) {
    add('error', 'sitemap-collapsed', '/sitemap.xml', `${locs.length} URLs < expected ${cfg.minSitemapUrls}`);
  }
  if (!/<lastmod>/.test(xml)) add('info', 'sitemap-no-lastmod', '/sitemap.xml');
  for (const [u, i] of info) {
    if (!i.noindex && u !== '/404' && !sitemapUrls.has(u)) add('warn', 'indexable-not-in-sitemap', u);
  }
}

/* ---------- internal links ---------- */
const exists = (p) => pages.has(norm(p)) ||
  existsSync(join(DIST, p.replace(/^\//, '').split('?')[0].split('#')[0])) ||
  existsSync(join(DIST, p.replace(/^\//, '').split('?')[0].split('#')[0] + '.html'));
const inbound = new Map();
for (const [url, { html }] of pages) {
  const body = html.split(/<\/head>/i)[1] ?? '';
  for (const t of body.match(/<a\b[^>]*>/gi) ?? []) {
    let h = attr(t, 'href');
    if (!h || /^(mailto:|tel:|javascript:|data:|#)/i.test(h)) continue;
    if (/^https?:|^\/\//.test(h)) { if (h.startsWith(ORIGIN)) h = h.slice(ORIGIN.length) || '/'; else continue; }
    if (!h.startsWith('/')) h = posix.join(url.endsWith('/') ? url : posix.dirname(url), h);
    const n = norm(h);
    if (!inbound.has(n)) inbound.set(n, new Set());
    inbound.get(n).add(url);
    if (!exists(h)) add('error', 'broken-internal-link', url, h);
  }
}
for (const [u, i] of info) {
  if (u === '/' || i.noindex) continue;
  const from = [...(inbound.get(u) ?? [])].filter((x) => x !== u);
  if (from.length === 0) add('warn', 'orphan-page', u, 'no incoming link in the static HTML');
  else if (from.length === 1) add('info', 'one-inbound-link', u, `only linked from ${from[0]}`);
}

/* ---------- robots.txt ---------- */
const rb = join(DIST, 'robots.txt');
if (!existsSync(rb)) add('error', 'robots-txt-missing', '/robots.txt');
else {
  const t = readFileSync(rb, 'utf8');
  if (!/^sitemap:/im.test(t)) add('warn', 'robots-no-sitemap-line', '/robots.txt');
  if (/^disallow:\s*\/\s*$/im.test(t) && /^user-agent:\s*\*/im.test(t)) add('error', 'robots-disallow-all', '/robots.txt');
}
if (!existsSync(join(DIST, 'ads.txt')) && cfg.adsense) add('warn', 'ads-txt-missing', '/ads.txt');

/* ---------- important pages ---------- */
for (const p of IMPORTANT) {
  const i = info.get(norm(p));
  if (!i) add('error', 'important-page-missing', p, 'not found in build output');
  else if (i.noindex) add('error', 'important-page-noindex', p);
  else if (sitemapUrls.size && !sitemapUrls.has(norm(p))) add('error', 'important-page-not-in-sitemap', p);
}

/* ---------- report ---------- */
const sev = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => sev[a.sev] - sev[b.sev] || a.rule.localeCompare(b.rule));
const counts = { error: 0, warn: 0, info: 0 };
for (const f of findings) counts[f.sev]++;
const byRule = new Map();
for (const f of findings) {
  const k = `${f.sev}|${f.rule}`;
  byRule.set(k, [...(byRule.get(k) ?? []), f]);
}
const summary = {
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  pages: pages.size,
  indexable: [...info.values()].filter((i) => !i.noindex).length,
  noindex: [...info.values()].filter((i) => i.noindex).length,
  sitemapUrls: sitemapCount,
  counts,
};

console.log(`\nSEO validate: ${ORIGIN}`);
console.log(`  ${summary.pages} pages (${summary.indexable} indexable, ${summary.noindex} noindex), ${sitemapCount} sitemap URLs`);
console.log(`  ${counts.error} errors, ${counts.warn} warnings, ${counts.info} notes\n`);
for (const [k, list] of byRule) {
  const [s, rule] = k.split('|');
  console.log(`  [${s.toUpperCase().padEnd(5)}] ${rule} ×${list.length}`);
  for (const f of list.slice(0, 3)) console.log(`          ${f.url}${f.detail ? '  ' + f.detail : ''}`);
  if (list.length > 3) console.log(`          … +${list.length - 3} more`);
}

const jsonOut = opt('--json');
if (jsonOut) {
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify({ summary, findings }, null, 2));
}
const mdOut = opt('--md');
if (mdOut) {
  mkdirSync(dirname(mdOut), { recursive: true });
  let md = `# SEO validation — ${ORIGIN}\n\nGenerated ${summary.generatedAt}\n\n` +
    `| Pages | Indexable | noindex | Sitemap URLs | Errors | Warnings | Notes |\n|---|---|---|---|---|---|---|\n` +
    `| ${summary.pages} | ${summary.indexable} | ${summary.noindex} | ${sitemapCount} | ${counts.error} | ${counts.warn} | ${counts.info} |\n\n`;
  for (const [k, list] of byRule) {
    const [s, rule] = k.split('|');
    md += `## ${s.toUpperCase()}: ${rule} (${list.length})\n\n`;
    for (const f of list.slice(0, 25)) md += `- \`${f.url}\`${f.detail ? ' — ' + f.detail : ''}\n`;
    if (list.length > 25) md += `- … +${list.length - 25} more\n`;
    md += '\n';
  }
  writeFileSync(mdOut, md);
}
process.exit(counts.error > 0 && !flag('--no-fail') ? 1 : 0);
