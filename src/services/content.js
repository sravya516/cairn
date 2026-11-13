// Loads the bundled content (guides, checklists, emergency cards) from the local cache.
// Pure helpers (validate / flatten) are exported for tests and the search indexer.

import { stripInline } from '../utils/text.js';

let cached = null;
let pending = null;

export function validateContent(c) {
  const problems = [];
  if (!c || typeof c !== 'object') return ['content is not an object'];
  if (!c.meta || !Array.isArray(c.meta.categories)) problems.push('meta.categories missing');
  for (const key of ['guides', 'checklists', 'emergency']) {
    if (!Array.isArray(c[key])) problems.push(`${key} is not an array`);
  }
  return problems;
}

export async function loadContent(fetchImpl = globalThis.fetch) {
  if (cached) return cached;
  if (!pending) {
    pending = (async () => {
      const res = await fetchImpl('./data/content.json');
      if (!res.ok) throw new Error(`content.json responded ${res.status}`);
      const data = await res.json();
      const problems = validateContent(data);
      if (problems.length) throw new Error('Content is damaged: ' + problems.join('; '));
      cached = indexContent(data);
      return cached;
    })().catch((e) => { pending = null; throw e; });
  }
  return pending;
}

export function indexContent(data) {
  const guideById = new Map(data.guides.map((g) => [g.id, g]));
  const checklistById = new Map(data.checklists.map((c) => [c.id, c]));
  const emergencyById = new Map(data.emergency.map((e) => [e.id, e]));
  const categoryById = new Map(data.meta.categories.map((c) => [c.id, c]));
  return { ...data, guideById, checklistById, emergencyById, categoryById };
}

/** Flattens every string in a guide's sections into one searchable text block. */
export function guideText(guide) {
  const parts = [guide.summary || ''];
  for (const s of guide.sections || []) {
    parts.push(s.h || '');
    for (const b of s.blocks || []) {
      if (Array.isArray(b.v)) parts.push(...b.v.map(String));
      else if (typeof b.v === 'string') parts.push(b.v);
    }
  }
  return stripInline(parts.join('\n'));
}

export function guideHeadings(guide) {
  return (guide.sections || []).map((s) => s.h || '').filter(Boolean);
}
