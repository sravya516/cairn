// Parser for Cairn guide files (src/data/guides/*.md). Pure JS: used by the build script, the tests and nothing at runtime.
//
// Format (see CONTRIBUTING.md):
//   # guide-id | Guide Title
//   category: water            (required; id from meta.json)
//   priority: critical|high|normal
//   tags: comma, separated
//   sources: ready-gov, cdc    (ids from meta.json)
//   related: guide:other-id, checklist:kit-72, calc:water
//   summary: One-sentence summary.
//
//   ## Section heading
//   Plain lines form a paragraph (blank line ends it).
//   - bullet            1. numbered step
//   !! Warning callout  >> Tip callout
//
// Output guide: { id, title, category, priority, tags[], sources[], related{guides,checklists,calculators}, summary, updated?, sections:[{h, blocks:[{t, v}]}] }
// Block types: p (string), ul (string[]), ol (string[]), warn (string), tip (string).

const META_KEYS = new Set(['category', 'priority', 'tags', 'sources', 'related', 'summary', 'updated']);
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function parseGuides(text, file = 'guides') {
  const guides = [], errors = [];
  let g = null, sec = null, para = [], lastList = null;
  const err = (n, msg) => errors.push(`${file}:${n}: ${msg}`);

  const flushPara = () => {
    if (para.length && sec) sec.blocks.push({ t: 'p', v: para.join(' ') });
    para = [];
  };
  const finishGuide = () => {
    if (!g) return;
    flushPara();
    guides.push(g);
    g = null; sec = null; lastList = null;
  };

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    const h1 = /^#\s+([a-z0-9][a-z0-9-]*)\s*\|\s*(.+)$/.exec(line);
    if (h1) {
      finishGuide();
      g = { id: h1[1], title: h1[2].trim(), category: '', priority: 'normal', tags: [], sources: [],
        related: { guides: [], checklists: [], calculators: [] }, summary: '', sections: [] };
      continue;
    }
    if (/^#\s/.test(line)) { err(n, 'guide header must look like "# id | Title"'); continue; }
    if (!g) { if (trimmed) err(n, 'text before the first "# id | Title" header'); continue; }

    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) { flushPara(); sec = { h: h2[1].trim(), blocks: [] }; g.sections.push(sec); lastList = null; continue; }

    if (!sec) { // metadata area
      if (!trimmed) continue;
      const m = /^([a-z]+):\s*(.*)$/.exec(trimmed);
      if (!m || !META_KEYS.has(m[1])) { err(n, `unknown metadata line "${trimmed.slice(0, 40)}"`); continue; }
      const [, k, v] = m;
      if (k === 'tags') g.tags = list(v);
      else if (k === 'sources') g.sources = list(v);
      else if (k === 'related') {
        for (const r of list(v)) {
          const [kind, id] = r.split(':');
          if (kind === 'guide') g.related.guides.push(id);
          else if (kind === 'checklist') g.related.checklists.push(id);
          else if (kind === 'calc') g.related.calculators.push(id);
          else err(n, `bad related entry "${r}" (use guide:, checklist: or calc:)`);
        }
      } else g[k] = v.trim();
      continue;
    }

    if (!trimmed) { flushPara(); lastList = null; continue; }

    let m;
    if ((m = /^[-*]\s+(.+)$/.exec(trimmed))) {
      flushPara();
      if (!lastList || lastList.t !== 'ul') { lastList = { t: 'ul', v: [] }; sec.blocks.push(lastList); }
      lastList.v.push(m[1]);
    } else if ((m = /^\d+[.)]\s+(.+)$/.exec(trimmed))) {
      flushPara();
      if (!lastList || lastList.t !== 'ol') { lastList = { t: 'ol', v: [] }; sec.blocks.push(lastList); }
      lastList.v.push(m[1]);
    } else if ((m = /^!!\s*(.+)$/.exec(trimmed))) {
      flushPara(); lastList = null; sec.blocks.push({ t: 'warn', v: m[1] });
    } else if ((m = /^>>\s*(.+)$/.exec(trimmed))) {
      flushPara(); lastList = null; sec.blocks.push({ t: 'tip', v: m[1] });
    } else if (/^\s{2,}\S/.test(line) && lastList) {
      lastList.v[lastList.v.length - 1] += ' ' + trimmed; // indented continuation of a list item
    } else {
      lastList = null; para.push(trimmed);
    }
  }
  finishGuide();
  return { guides, errors };
}

/** Structural validation of parsed guides against meta (category/source ids). Returns an array of problems. */
export function validateGuides(guides, meta) {
  const problems = [];
  const cats = new Set(meta.categories.map((c) => c.id));
  const sources = new Set(Object.keys(meta.sources));
  const seen = new Set();
  for (const g of guides) {
    const at = `guide "${g.id}"`;
    if (seen.has(g.id)) problems.push(`${at}: duplicate id`);
    seen.add(g.id);
    if (!cats.has(g.category)) problems.push(`${at}: unknown category "${g.category}"`);
    if (!['critical', 'high', 'normal'].includes(g.priority)) problems.push(`${at}: bad priority "${g.priority}"`);
    if (!g.summary) problems.push(`${at}: missing summary`);
    if (!g.sources.length) problems.push(`${at}: needs at least one source`);
    for (const s of g.sources) if (!sources.has(s)) problems.push(`${at}: unknown source "${s}"`);
    if (g.tags.length < 2) problems.push(`${at}: needs at least 2 tags`);
    if (g.sections.length < 2) problems.push(`${at}: needs at least 2 sections`);
    for (const s of g.sections) if (!s.blocks.length) problems.push(`${at}: section "${s.h}" is empty`);
  }
  return problems;
}
