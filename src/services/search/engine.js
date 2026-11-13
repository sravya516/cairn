// Offline full-text search. In-memory inverted index; no dependencies, no network.
// Features: field weighting, light stemming, synonyms, prefix matching for the word being typed,
// typo tolerance (edit distance 1), category filtering, snippets and suggestions.

const STOP = new Set(('a an and are as at be by for from has have how i in is it its of on or that the to was what when where which will with you your do does can should my our we').split(' '));

export function stem(w) {
  if (w.length <= 3) return w;
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) w = w.slice(0, -1);
  if (/ing$/.test(w) && w.length > 5) {
    w = w.slice(0, -3);
    if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  } else if (/ed$/.test(w) && w.length > 5) {
    w = w.slice(0, -2);
    if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  }
  // Drop a trailing "e" so store / storing / stored share one stem.
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function tokenize(s, { keepStop = false } = {}) {
  const raw = normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
  return raw.filter((w) => keepStop || !STOP.has(w) || w.length === 0).map(stem);
}

// Query-time synonyms (keys and values are already in stemmed form).
const SYN_PAIRS = [
  ['cpr', 'resuscitation', 'compression'], ['blackout', 'outage'], ['twister', 'tornado'],
  ['hemorrhage', 'bleed', 'bleeding'], ['bleed', 'bleeding'], ['gas', 'fuel', 'gasoline'],
  ['quake', 'earthquake'], ['aed', 'defibrillator'], ['epipen', 'epinephrine', 'anaphylaxis'],
  ['purify', 'purification', 'disinfect', 'treat'], ['bug out', 'evacuate', 'evacuation'],
  ['bugout', 'evacuate', 'evacuation', 'go-bag'], ['toilet', 'sanitation', 'latrine'],
  ['hypothermia', 'cold'], ['heatstroke', 'heat'], ['generator', 'genset'],
  ['co', 'carbon monoxide'], ['radio', 'noaa'], ['flashlight', 'torch', 'light'],
  ['battery', 'power station', 'powerbank'], ['hurricane', 'cyclone', 'typhoon'],
  ['wildfire', 'fire'], ['snow', 'winter'], ['kit', 'supply', 'supplies'],
].map((g) => g.map((x) => tokenize(x, { keepStop: true }).join(' ')));

const SYNONYMS = new Map();
for (const group of SYN_PAIRS) {
  for (const a of group) {
    if (!SYNONYMS.has(a)) SYNONYMS.set(a, new Set());
    for (const b of group) if (a !== b) SYNONYMS.get(a).add(b);
  }
}

function editDistanceLE1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

const FIELD_WEIGHT = { title: 10, tags: 6, heading: 4, body: 1 };

export class SearchIndex {
  /**
   * docs: [{ id, type, title, text, tags?, headings?, category?, href, parent?, boost? }]
   */
  constructor(docs) {
    this.docs = new Map();
    this.postings = new Map(); // term -> Map(docId -> score)
    this.suggestPool = [];
    for (const d of docs) this.add(d);
  }

  add(doc) {
    this.docs.set(doc.id, doc);
    const put = (field, text) => {
      const counts = new Map();
      for (const t of tokenize(text)) counts.set(t, (counts.get(t) || 0) + 1);
      for (const [t, n] of counts) {
        let m = this.postings.get(t);
        if (!m) this.postings.set(t, (m = new Map()));
        m.set(doc.id, (m.get(doc.id) || 0) + FIELD_WEIGHT[field] * (1 + Math.log(n)));
      }
    };
    put('title', doc.title);
    put('tags', (doc.tags || []).join(' '));
    put('heading', (doc.headings || []).join(' '));
    put('body', doc.text || '');
    if (doc.type === 'guide' || doc.type === 'calculator' || doc.type === 'checklist' || doc.type === 'emergency') {
      this.suggestPool.push({ label: doc.title, norm: normalize(doc.title), id: doc.id });
      for (const t of doc.tags || []) this.suggestPool.push({ label: t, norm: normalize(t), id: null });
    }
  }

  get size() { return this.docs.size; }

  /** Postings for a query token, with exact, prefix and fuzzy expansion. */
  _matches(token, { prefix }) {
    const out = new Map(); // docId -> score
    const addAll = (term, factor) => {
      const m = this.postings.get(term);
      if (!m) return;
      for (const [id, s] of m) out.set(id, Math.max(out.get(id) || 0, s * factor));
    };
    addAll(token, 1);
    for (const alt of SYNONYMS.get(token) || []) for (const t of alt.split(' ')) addAll(t, 0.6);
    if (token.length >= 3 && (prefix || token.length >= 4)) {
      for (const term of this.postings.keys()) {
        if (term !== token && term.startsWith(token) && (prefix || term.length - token.length <= 3)) addAll(term, prefix ? 0.7 : 0.35);
      }
    }
    if (out.size === 0 && token.length >= 5) {
      for (const term of this.postings.keys()) if (editDistanceLE1(token, term)) addAll(term, 0.4);
    }
    return out;
  }

  search(query, { category = null, type = null, limit = 40 } = {}) {
    const raw = String(query || '').trim();
    const tokens = tokenize(raw);
    if (tokens.length === 0) return [];
    const typingLast = !/\s$/.test(String(query || '')) ; // the final word may be partially typed
    const perToken = tokens.map((t, i) => this._matches(t, { prefix: typingLast && i === tokens.length - 1 }));

    // Documents must match every token; if none do, fall back to docs matching most tokens.
    const scores = new Map();
    for (const m of perToken) for (const [id, s] of m) {
      const e = scores.get(id) || { score: 0, hits: 0 };
      e.score += s; e.hits++; scores.set(id, e);
    }
    let best = 0;
    for (const e of scores.values()) best = Math.max(best, e.hits);
    const needed = best === tokens.length ? tokens.length : Math.max(1, best);

    const normQuery = normalize(raw);
    const results = [];
    for (const [id, e] of scores) {
      if (e.hits < needed) continue;
      const doc = this.docs.get(id);
      if (category && doc.category !== category) continue;
      if (type && doc.type !== type) continue;
      let score = e.score;
      const nt = normalize(doc.title);
      if (nt.includes(normQuery) && normQuery.length > 2) score += 25;
      if (nt === normQuery) score += 25;
      // A title that starts with what you typed is almost always what you want ("stroke" -> Stroke or Heart Attack).
      else if (normQuery.length > 2 && nt.startsWith(normQuery)) score += 14;
      score *= doc.boost || 1;
      results.push({ doc, score });
    }
    results.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return results.slice(0, limit).map(({ doc, score }) => ({
      id: doc.id, type: doc.type, title: doc.title, category: doc.category || null,
      href: doc.href, parent: doc.parent || null, score,
      snippet: makeSnippet(doc.text || doc.title, tokens),
    }));
  }

  suggest(prefix, limit = 6) {
    const q = normalize(prefix).trim();
    if (q.length < 2) return [];
    const seen = new Set();
    const starts = [], contains = [];
    for (const s of this.suggestPool) {
      if (seen.has(s.norm)) continue;
      if (s.norm.startsWith(q)) { seen.add(s.norm); starts.push(s.label); }
      else if (s.norm.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) { seen.add(s.norm); contains.push(s.label); }
    }
    return [...starts, ...contains].slice(0, limit);
  }
}

export function makeSnippet(text, queryTokens, width = 140) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const lower = normalize(clean);
  let at = -1;
  for (const t of queryTokens) {
    const i = lower.indexOf(t.length > 4 ? t.slice(0, t.length - 1) : t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return clean.length > width ? clean.slice(0, width).trimEnd() + '…' : clean;
  const start = Math.max(0, at - 40);
  const end = Math.min(clean.length, start + width);
  return (start > 0 ? '…' : '') + clean.slice(start, end).trim() + (end < clean.length ? '…' : '');
}

/** Builds search documents from loaded content (+ optional extra docs, e.g. calculators). */
export function buildDocs(content, guideTextFn, extra = []) {
  const docs = [];
  const catTitle = (id) => (content.categoryById && content.categoryById.get(id)?.title) || id;
  for (const g of content.guides) {
    docs.push({
      id: 'guide:' + g.id, type: 'guide', title: g.title, category: g.category, href: `#/guide/${g.id}`,
      text: guideTextFn(g), tags: [...(g.tags || []), catTitle(g.category)],
      headings: (g.sections || []).map((s) => s.h || '').filter(Boolean),
      boost: g.priority === 'critical' ? 1.25 : 1,
    });
  }
  for (const c of content.checklists) {
    docs.push({
      id: 'checklist:' + c.id, type: 'checklist', title: c.title, category: 'checklists', href: `#/checklist/${c.id}`,
      text: (c.description || '') + ' ' + (c.items || []).map((i) => i[0]).join('. '), tags: c.tags || [],
    });
    for (const [i, it] of (c.items || []).entries()) {
      docs.push({
        id: `item:${c.id}:${i}`, type: 'item', title: it[0], category: 'checklists',
        href: `#/checklist/${c.id}`, parent: c.title, text: `${it[1] || ''} ${it[2] || ''}`, tags: [c.title],
      });
    }
  }
  for (const e of content.emergency) {
    docs.push({
      id: 'emergency:' + e.id, type: 'emergency', title: e.title, category: 'emergency', href: `#/emergency/${e.id}`,
      text: [...(e.steps || []), ...(e.dont || []), ...(e.warn || [])].join('. '), tags: e.tags || [], boost: 1.7,
    });
  }
  return [...docs, ...extra];
}
