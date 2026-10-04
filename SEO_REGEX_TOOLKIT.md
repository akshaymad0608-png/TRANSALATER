# Search Console regex toolkit — Rosetta (languagetransalator.com)

Patterns for **Search Console → Performance → Search results → + New → Query / Page → Custom (regex)**.

## Query analysis is not optimisation

These filters only **slice data you already have**. They tell you which searches show your site, where, and how often. They do not change rankings. Optimisation means editing the page that ranks (title, content, internal links, speed) and then watching the same filter next month. Use the filters to decide *what* to fix; use `node scripts/gsc-analyze.mjs` to turn a CSV export into the same lists automatically.

## Syntax notes (RE2)

- Search Console uses Google's **RE2** engine. There is **no look-ahead/look-behind and no back-references**.
- Matching is a *partial* match: `shoe` matches "red shoes". Anchor with `^` and `$` for a full match.
- Put `(?i)` at the start to be explicitly case-insensitive.
- Use the **"Doesn't match regex"** option instead of negative look-ahead to exclude things.
- Keep a filter under 4,096 characters. Escape literal dots: `\.`.
- `\b` (word boundary), `\s`, `\d`, `{n,m}`, `(?:...)` and `|` all work.

## Query filters

| Goal | Option | Regex |
|---|---|---|
| Branded queries | Matches regex | `(?i)(languagetransalator\|language translator\|rosetta)` |
| Non-branded queries | **Doesn't** match regex | `(?i)(languagetransalator\|language translator\|rosetta)` |
| Questions | Matches regex | `(?i)^(who\|what\|when\|where\|why\|how\|which\|can\|does\|do\|is\|are\|should\|kaise\|kya\|kab\|kitna\|kitni)\b` |
| Long-tail (4+ words) | Matches regex | `^(\S+\s+){3,}\S+$` |
| Very long-tail (6+ words) | Matches regex | `^(\S+\s+){5,}\S+$` |
| Single-word queries | Matches regex | `^\S+$` |
| Comparison / alternatives intent | Matches regex | `(?i)\b(vs\|versus\|compare\|comparison\|alternative\|alternatives\|like\|instead of)\b` |
| Commercial / evaluation intent | Matches regex | `(?i)\b(best\|top\|review\|reviews\|price\|pricing\|cost\|cheap\|worth)\b` |
| "Free" / tool intent | Matches regex | `(?i)\b(free\|online\|calculator\|generator\|converter\|tool\|app)\b` |
| Queries with a year | Matches regex | `\b20[2-3][0-9]\b` |
| Queries with numbers | Matches regex | `\d` |
| Hindi / Hinglish phrasing | Matches regex | `(?i)\b(kaise\|kya\|kab\|kaha\|kitna\|kitni\|karna\|hindi\|india\|indian)\b` |
| Non-Latin script (other languages) | Matches regex | `[^\x00-\x7F]` |

## Page filters

Replace the host with your own where needed (`languagetransalator\.com`).

| Goal | Option | Regex |
|---|---|---|
| Homepage only | Matches regex | `^https://languagetransalator\.com/?$` |
| Everything except the homepage | Doesn't match regex | `^https://languagetransalator\.com/?$` |
| A section (example: `/blog/`) | Matches regex | `^https://languagetransalator\.com/blog(/\|$)` |
| Two sections | Matches regex | `^https://languagetransalator\.com/(english-to)(/\|$)` |
| Deep URLs (3+ path segments) | Matches regex | `^https://languagetransalator\.com(/[^/]+){3,}` |
| URLs with parameters | Matches regex | `\?` |
| Static `.html` landing pages | Matches regex | `\.html$` |
| Legal / utility pages | Matches regex | `/(about\|contact\|privacy\|terms\|cookies\|disclaimer)(/\|$)` |

## Recipes

1. **Non-branded question queries on the blog.** Query → Matches the question regex above; Page → Matches `/blog`. Each row is a heading or FAQ the matching article should answer directly.
2. **Striking distance.** Apply any query filter, sort by Position, and look at positions 5–20 with impressions ≥ 20. Improve the ranking page; do not create a new one.
3. **CTR leaks.** Filter commercial intent, compare CTR with the table in `reports/gsc-opportunities.md`, rewrite the title/description of those pages.
4. **Cannibalisation.** Pick one query, click it, switch to the **Pages** tab. If two of your URLs both show, consolidate or differentiate them and link the weaker to the stronger.
5. **Brand vs generic split.** Compare Branded and Non-branded totals; a healthy site gains non-branded clicks month over month.

## Verifying a pattern

Paste the regex into the Search Console filter and check the row count looks plausible. For offline testing, `grep -P` (PCRE) is **not** RE2-equivalent: use Go's `regexp` package or the `re2` library when a pattern is complex.
