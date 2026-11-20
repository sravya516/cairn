// Emergency Now: quick-reference mode. Large text, short steps, one tap from anywhere.
// The 911 block is static so it is shown even if content fails to load.
import { h, appendAll } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { loadContent } from '../services/content.js';
import { inlineParts } from '../utils/text.js';

const call911 = () => h('a', { class: 'call-911', href: 'tel:911' }, icon('phone'), 'Call 911');
const SEV_LABEL = { life: 'Life-threatening', urgent: 'Urgent', info: 'Important' };

export async function emergencyPage() {
  const root = h('div', { class: 'emergency' },
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Emergency Now'),
    call911(),
    h('p', { class: 'lead-911' }, 'In the United States, call 911 when available for any life-threatening emergency. Official instructions from emergency officials come first.'));
  let c;
  try { c = await loadContent(); } catch (_) {
    appendAll(root, h('div', { class: 'card' },
      h('h2', null, 'If you cannot reach 911'),
      h('ol', null, h('li', null, 'Try again, or move to a spot with better signal.'), h('li', null, 'Send a text to 911 where supported.'), h('li', null, 'Get to a safe place and ask people nearby for help.')),
      h('p', { class: 'muted small' }, 'The quick-reference cards could not be loaded. ', h('a', { href: '#/storage' }, 'Check offline status'))));
    return root;
  }
  const groups = [...new Set(c.emergency.map((e) => e.group))];
  for (const g of groups) {
    appendAll(root, h('h2', { class: 'em-group' }, g),
      ...c.emergency.filter((e) => e.group === g).map((e) => h('a', { class: `em-btn sev-${e.severity}`, href: `#/emergency/${e.id}` },
        h('span', { class: 'em-ico' }, icon(e.icon || 'alert')),
        h('span', { class: 'em-text' }, h('strong', null, e.title), h('span', null, e.summary)),
        icon('chevron', 'width="22" height="22"'))));
  }
  appendAll(root, h('p', { class: 'muted small' }, 'These cards are short summaries. Full guides, with more detail, are linked from each card. They are education, not a substitute for training or professional care.'));
  return root;
}

const rich = (s) => inlineParts(s).map((p) => (p.b ? h('strong', null, p.v) : p.v));

export async function emergencyCardPage({ id }) {
  const c = await loadContent();
  const e = c.emergencyById.get(id);
  if (!e) return h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, 'Card not found'), h('a', { class: 'btn', href: '#/emergency' }, 'Emergency Now'));
  const idx = c.emergency.findIndex((x) => x.id === id);
  const guide = e.guide && c.guideById.get(e.guide);
  return h('article', { class: 'emergency em-card' },
    h('a', { class: 'back', href: '#/emergency' }, icon('back'), 'Emergency Now'),
    h('span', { class: `tag sev-tag-${e.severity}` }, SEV_LABEL[e.severity] || ''),
    h('h1', { tabindex: '-1', id: 'page-title' }, e.title),
    e.id !== 'call-911' && e.severity === 'life' ? call911() : null,
    h('p', { class: 'em-summary' }, e.summary),
    h('ol', { class: 'em-steps' }, e.steps.map((s) => h('li', null, rich(s)))),
    e.dont && e.dont.length ? h('div', { class: 'em-dont' }, h('h2', null, 'Do not'), h('ul', null, e.dont.map((s) => h('li', null, rich(s))))) : null,
    ...(e.warn || []).map((w) => h('div', { class: 'callout warn', role: 'note' }, h('strong', null, 'Warning: '), rich(w))),
    guide ? h('a', { class: 'btn secondary block', href: `#/guide/${guide.id}` }, icon('book'), `Full guide: ${guide.title}`) : null,
    h('p', { class: 'muted small' }, 'First-aid and safety information is education, not a substitute for training or professional care. Last updated ' + (c.meta.contentDate || '') + '.'),
    h('div', { class: 'pager' },
      idx > 0 ? h('a', { class: 'btn secondary', href: `#/emergency/${c.emergency[idx - 1].id}` }, icon('back'), c.emergency[idx - 1].title) : h('span'),
      idx < c.emergency.length - 1 ? h('a', { class: 'btn secondary', href: `#/emergency/${c.emergency[idx + 1].id}` }, c.emergency[idx + 1].title, icon('chevron')) : h('span')));
}
