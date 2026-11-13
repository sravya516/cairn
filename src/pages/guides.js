// Guides: category hub, category lists and the guide reader.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { loadContent } from '../services/content.js';
import { getStore } from '../services/storage/index.js';
import { getBookmarks, toggleBookmark, getRecents, addRecent, resolveGuides } from '../services/library.js';
import { calculatorIds, getCalculator } from '../calculators/registry.js';
import { cardLink } from '../components/ui.js';
import { inlineParts } from '../utils/text.js';

const PRIORITY_LABEL = { critical: 'Critical', high: 'Important' };

function guideRow(g, catById) {
  return h('a', { class: 'card guide-row', href: `#/guide/${g.id}` },
    h('span', { class: 'row-top' },
      PRIORITY_LABEL[g.priority] ? h('span', { class: 'tag ' + g.priority }, PRIORITY_LABEL[g.priority]) : null,
      catById ? h('span', { class: 'rtype' }, catById.get(g.category)?.title || '') : null),
    h('strong', null, g.title),
    h('span', { class: 'muted small' }, g.summary));
}

export async function guidesHome() {
  const c = await loadContent();
  const store = await getStore();
  const bookmarks = resolveGuides(await getBookmarks(store), c.guideById);
  const recents = resolveGuides(await getRecents(store), c.guideById).slice(0, 5);
  const counts = new Map();
  for (const g of c.guides) counts.set(g.category, (counts.get(g.category) || 0) + 1);
  const critical = c.guides.filter((g) => g.priority === 'critical');

  return h('div', null,
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Guides'),
    h('a', { class: 'search-link', href: '#/search' }, icon('search'), 'Search all guides'),
    bookmarks.length ? h('div', null, h('div', { class: 'section-title' }, h('h2', null, 'Bookmarked')), ...bookmarks.map((g) => guideRow(g, c.categoryById))) : null,
    recents.length ? h('div', null, h('div', { class: 'section-title' }, h('h2', null, 'Recently viewed')), ...recents.map((g) => guideRow(g, c.categoryById))) : null,
    h('div', { class: 'section-title' }, h('h2', null, 'Browse by topic')),
    ...c.meta.categories.map((cat) => cardLink({
      href: `#/guides/${cat.id}`, iconName: cat.icon, title: `${cat.title}`, subtitle: `${counts.get(cat.id) || 0} guides · ${cat.description}`,
    })),
    h('div', { class: 'section-title' }, h('h2', null, 'Critical guides')),
    ...critical.map((g) => guideRow(g, c.categoryById)),
    h('p', { class: 'muted small' }, `${c.guides.length} guides · ${c.meta.reviewStatus}`));
}

export async function guidesCategory({ cat }) {
  const c = await loadContent();
  const meta = c.categoryById.get(cat);
  if (!meta) return h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, 'Topic not found'), h('a', { class: 'btn', href: '#/guides' }, 'All guides'));
  const rank = { critical: 0, high: 1, normal: 2 };
  const guides = c.guides.filter((g) => g.category === cat).sort((a, b) => rank[a.priority] - rank[b.priority]);
  return h('div', null,
    h('a', { class: 'back', href: '#/guides' }, icon('back'), 'All guides'),
    h('h1', { tabindex: '-1', id: 'page-title' }, meta.title),
    h('p', { class: 'muted' }, meta.description),
    ...guides.map((g) => guideRow(g)));
}

const rich = (s) => inlineParts(s).map((p) => (p.b ? h('strong', null, p.v) : p.v));

function renderBlock(b) {
  switch (b.t) {
    case 'p': return h('p', null, rich(b.v));
    case 'ul': return h('ul', null, b.v.map((x) => h('li', null, rich(x))));
    case 'ol': return h('ol', { class: 'steps' }, b.v.map((x) => h('li', null, rich(x))));
    case 'warn': return h('div', { class: 'callout warn', role: 'note' }, h('strong', null, 'Warning: '), rich(b.v));
    case 'tip': return h('div', { class: 'callout tip' }, h('strong', null, 'Tip: '), rich(b.v));
    default: return null;
  }
}

const CATEGORY_NOTICE = {
  medical: 'First-aid information is education, not a substitute for hands-on training or professional care. For any life-threatening situation, call 911 (U.S.) first.',
  disasters: 'Follow instructions from local emergency officials first. They know current local conditions; this guide is general.',
  power: 'Fuel-burning equipment and electricity can kill. Follow manufacturer instructions and local codes.',
};

export async function guidePage({ id }) {
  const c = await loadContent();
  const g = c.guideById.get(id);
  if (!g) return h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, 'Guide not found'), h('p', null, 'That guide does not exist in this version.'), h('a', { class: 'btn', href: '#/guides' }, 'All guides'));
  const store = await getStore();
  addRecent(store, g.id).catch(() => {});
  const cat = c.categoryById.get(g.category);

  const bm = h('button', { class: 'icon-btn bm', type: 'button' });
  let marked = (await getBookmarks(store)).includes(g.id);
  const paintBm = () => { bm.setAttribute('aria-pressed', String(marked)); bm.setAttribute('aria-label', marked ? 'Remove bookmark' : 'Bookmark this guide'); bm.replaceChildren(icon('star'), marked ? ' Saved' : ' Save'); bm.classList.toggle('on', marked); };
  bm.addEventListener('click', async () => { marked = await toggleBookmark(store, g.id); paintBm(); });
  paintBm();

  const sections = g.sections.map((s, i) => h('section', { class: 'guide-sec', id: `sec-${i}` },
    h('h2', null, s.h), ...s.blocks.map(renderBlock)));

  const toc = g.sections.length > 3 ? h('nav', { class: 'chips toc', 'aria-label': 'On this page' },
    g.sections.map((s, i) => h('button', { type: 'button', class: 'chip', onclick: () => document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, s.h))) : null;

  const ids = calculatorIds();
  const relGuides = g.related.guides.map((x) => c.guideById.get(x)).filter(Boolean);
  const relLists = g.related.checklists.map((x) => c.checklistById.get(x)).filter(Boolean);
  const relCalcs = g.related.calculators.filter((x) => ids.has(x));
  const related = (relGuides.length || relLists.length || relCalcs.length) ? h('section', { class: 'guide-sec' },
    h('h2', null, 'Related'),
    ...relLists.map((l) => cardLink({ href: `#/checklist/${l.id}`, iconName: 'check', title: l.title, subtitle: 'Checklist' })),
    ...relCalcs.map((x) => cardLink({ href: `#/calc/${x}`, iconName: 'calc', title: getCalculator(x).title, subtitle: 'Calculator' })),
    ...relGuides.map((r) => cardLink({ href: `#/guide/${r.id}`, iconName: 'book', title: r.title, subtitle: 'Guide' }))) : null;

  const sources = h('section', { class: 'guide-sec sources' },
    h('h2', null, 'Sources'),
    h('p', { class: 'muted small' }, 'Written as original explanations of public guidance from these organizations. Links are optional extras and are not needed to use this guide.'),
    h('ul', null, g.sources.map((s) => { const m = c.meta.sources[s]; return h('li', null, m ? `${m.name} — ${m.url.replace(/^https?:\/\//, '')}` : s); })),
    h('p', { class: 'muted small' }, `Last updated ${g.updated}. ${c.meta.reviewStatus}`));

  // Previous / next within the category
  const same = c.guides.filter((x) => x.category === g.category);
  const idx = same.findIndex((x) => x.id === g.id);
  const prev = same[idx - 1], next = same[idx + 1];
  const pager = h('div', { class: 'pager' },
    prev ? h('a', { class: 'btn secondary', href: `#/guide/${prev.id}` }, icon('back'), prev.title) : h('span'),
    next ? h('a', { class: 'btn secondary', href: `#/guide/${next.id}` }, next.title, icon('chevron')) : h('span'));

  return h('article', { class: 'guide' },
    h('a', { class: 'back', href: `#/guides/${g.category}` }, icon('back'), cat ? cat.title : 'Guides'),
    h('div', { class: 'guide-head' }, h('h1', { tabindex: '-1', id: 'page-title' }, g.title), bm),
    PRIORITY_LABEL[g.priority] ? h('span', { class: 'tag ' + g.priority }, PRIORITY_LABEL[g.priority] + ' guide') : null,
    h('p', { class: 'lead' }, g.summary),
    CATEGORY_NOTICE[g.category] ? h('div', { class: 'notice' }, CATEGORY_NOTICE[g.category]) : null,
    toc, ...sections, related, sources, pager);
}
