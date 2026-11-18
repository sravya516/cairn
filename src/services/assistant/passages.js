// Turns the bundled content into "passages" the assistant can quote.
// A passage block is one paragraph, one list (steps, bullets), a warning or a tip, with the guide, section and sources it came from.
// The assistant NEVER writes its own text: it only returns these blocks exactly as they appear in the content.
import { tokenize } from '../search/engine.js';
import { stripInline } from '../../utils/text.js';

// Words that carry no topic in a question ("how long", "tell me about"). The base search stop list already removes how/what/do.
const ASK_STOP = new Set(['long', 'much', 'many', 'often', 'tell', 'explain', 'please', 'know', 'best', 'way', 'thing', 'get', 'got', 'make', 'want', 'like', 'would', 'could', 'just', 'really',
  'also', 'some', 'any', 'there', 'here', 'this', 'these', 'those', 'about', 'tip', 'info', 'information', 'guide', 'app', 'cairn', 'im', 'ive', 'don', 'isn', 'doesn', 'didn', 'wasn', 'won', 'can', 'ca',
  'if', 'not', 'then', 'so', 'am', 'been', 'being', 's', 't', 're', 'll', 've', 'm', 'd', 'let', 'say', 'need', 'someone', 'something', 'anyone', 'me', 'us', 'they', 'them',
  'he', 'she', 'his', 'her', 'their', 'him', 'myself', 'maneuver', 'technique', 'method', 'kind', 'type', 'thing', 'stuff']);

/** Content words of a question or passage, stemmed. */
export function terms(text) {
  return tokenize(stripInline(text)).filter((t) => t.length > 1 && !ASK_STOP.has(t));
}

const BLOCK_LABEL = { p: 'text', ul: 'list', ol: 'steps', warn: 'warning', tip: 'tip', summary: 'summary', steps: 'steps', dont: 'warning', checklist: 'list' };

/**
 * Builds { blocks }. Each block: { id, kind: 'guide'|'card'|'checklist', type, title, heading, items[], href, guideHref, sources[], updated, boost,
 *   titleTerms:Set, headingTerms:Set, tagTerms:Set, units:[{ text, tf:Map, len }] }.
 */
export function buildPassages(content) {
  const blocks = [];
  const srcName = (ids) => ids.map((id) => (content.meta.sources[id] ? content.meta.sources[id].name : id));

  const add = (b) => {
    const items = b.items.map((s) => stripInline(String(s)).trim()).filter(Boolean);
    if (!items.length) return;
    const units = items.map((text) => {
      const tf = new Map();
      for (const t of terms(text)) tf.set(t, (tf.get(t) || 0) + 1);
      return { text, tf, len: [...tf.values()].reduce((a, c) => a + c, 0) };
    });
    blocks.push({
      ...b, id: blocks.length, items, units,
      label: BLOCK_LABEL[b.type] || 'text',
      titleTerms: new Set(terms(b.title)), headingTerms: new Set(terms(b.heading || '')), tagTerms: new Set(terms((b.tags || []).join(' '))),
    });
  };

  for (const g of content.guides) {
    const base = { kind: 'guide', title: g.title, tags: [...(g.tags || []), content.categoryById?.get(g.category)?.title || ''], href: `#/guide/${g.id}`, guideHref: `#/guide/${g.id}`,
      sources: srcName(g.sources), updated: g.updated || '', boost: g.priority === 'critical' ? 1.15 : g.priority === 'high' ? 1.05 : 1, category: g.category };
    add({ ...base, type: 'summary', heading: 'Summary', items: [g.summary] });
    for (const s of g.sections) {
      for (const b of s.blocks) {
        const items = Array.isArray(b.v) ? b.v : [b.v];
        add({ ...base, type: b.t, heading: s.h, items });
      }
    }
  }

  for (const e of content.emergency) {
    const base = { kind: 'card', title: `Emergency Now: ${e.title}`, tags: e.tags || [], href: `#/emergency/${e.id}`, guideHref: e.guide ? `#/guide/${e.guide}` : null,
      sources: srcName(e.sources || []), updated: content.meta.contentDate || '', boost: 1.25, category: 'emergency', severity: e.severity, cardId: e.id };
    add({ ...base, type: 'summary', heading: 'Summary', items: [e.summary] });
    add({ ...base, type: 'steps', heading: 'Steps', items: e.steps });
    if (e.dont && e.dont.length) add({ ...base, type: 'dont', heading: 'Do not', items: e.dont });
    for (const w of e.warn || []) add({ ...base, type: 'warn', heading: 'Warning', items: [w] });
  }

  for (const c of content.checklists) {
    add({ kind: 'checklist', type: 'checklist', title: `Checklist: ${c.title}`, heading: 'Items', tags: c.tags || [], href: `#/checklist/${c.id}`, guideHref: null, sources: [], updated: content.meta.contentDate || '', boost: 0.8, category: 'checklists',
      items: c.items.map((it) => `${it[0]}${it[1] ? ' — ' + it[1] : ''}${it[2] ? ` (${it[2]})` : ''}`) });
  }
  return blocks;
}
