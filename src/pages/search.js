import { h } from '../utils/dom.js';
import { loadContent, guideText } from '../services/content.js';
import { SearchIndex, buildDocs } from '../services/search/engine.js';
import { calculatorDocs } from '../calculators/registry.js';

let indexPromise = null;
function getIndex() {
  if (!indexPromise) {
    indexPromise = loadContent().then((c) => ({ content: c, index: new SearchIndex(buildDocs(c, guideText, calculatorDocs())) }));
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}

const TYPE_LABEL = { guide: 'Guide', checklist: 'Checklist', item: 'Checklist item', emergency: 'Emergency', calculator: 'Calculator' };

function highlight(text, query) {
  const words = [...new Set(String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))];
  if (!words.length) return text;
  const re = new RegExp('(' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return text.split(re).map((part, i) => (i % 2 ? h('mark', null, part) : part));
}

export async function searchPage(_params, ctx) {
  const root = h('div', null);
  const input = h('input', {
    type: 'search', id: 'q', class: 'search-input', placeholder: 'Search guides, checklists, emergencies…',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', 'aria-label': 'Search all content',
    value: (ctx && ctx.query.q) || '',
  });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const suggest = h('div', { class: 'chips suggest', 'aria-label': 'Suggestions' });
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { class: 'results' });

  root.append(h('h1', { tabindex: '-1', id: 'page-title' }, 'Search'), input, suggest, chips, status, list);

  let data;
  try { data = await getIndex(); } catch (e) {
    root.append(h('div', { class: 'notice' }, 'Search data could not be loaded from this device. ', h('a', { href: '#/storage' }, 'Check offline status')));
    return root;
  }
  const { content, index } = data;
  let category = (ctx && ctx.query.cat) || '';

  const filters = [['', 'All'], ['emergency', 'Emergency'], ...content.meta.categories.map((c) => [c.id, c.title]), ['checklists', 'Checklists'], ['calculators', 'Calculators']];
  const paintChips = () => {
    chips.replaceChildren(...filters.map(([id, label]) => h('button', {
      type: 'button', class: 'chip' + (category === id ? ' on' : ''), 'aria-pressed': category === id ? 'true' : 'false',
      onclick: () => { category = id; paintChips(); run(); },
    }, label)));
  };

  const run = () => {
    const q = input.value;
    const url = '#/search' + (q || category ? '?' + new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { cat: category } : {}) }) : '');
    history.replaceState(null, '', url);
    suggest.replaceChildren();
    list.replaceChildren();
    if (index.size === 0) { status.textContent = 'No content is bundled in this build yet.'; return; }
    if (!q.trim()) { status.textContent = 'Type a topic such as “boil water”, “CPR”, “generator” or “flood”.'; return; }
    const results = index.search(q, { category: category || null });
    for (const s of index.suggest(q)) {
      if (s.toLowerCase() !== q.trim().toLowerCase()) suggest.append(h('button', { type: 'button', class: 'chip', onclick: () => { input.value = s; run(); } }, s));
    }
    status.textContent = results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No results. Try a simpler word, or remove the category filter.';
    for (const r of results) {
      list.append(h('li', null, h('a', { class: 'card result', href: r.href },
        h('span', { class: 'rtype' }, TYPE_LABEL[r.type] || r.type, r.parent ? ` · ${r.parent}` : ''),
        h('strong', null, highlight(r.title, q)),
        r.snippet ? h('span', { class: 'snip' }, highlight(r.snippet, q)) : null)));
    }
  };

  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 100); });
  paintChips();
  run();
  return root;
}
