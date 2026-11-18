// Ask Cairn: type a question, get the matching passage from Cairn's own guides.
// This is NOT a generative AI. Every line shown is copied from a guide, card or checklist already on the device, with its source.
// It works offline, sends nothing anywhere, and keeps the conversation in memory only (it is gone when the app is closed).
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { loadContent } from '../services/content.js';
import { createAssistant } from '../services/assistant/answer.js';
import { CALCULATORS } from '../calculators/registry.js';
import { inlineParts } from '../utils/text.js';

let assistantPromise = null;
function getAssistant() {
  if (!assistantPromise) {
    assistantPromise = loadContent().then((content) => ({ content, assistant: createAssistant({ content, calculators: CALCULATORS }) }));
    assistantPromise.catch(() => { assistantPromise = null; });
  }
  return assistantPromise;
}

// The conversation lives here, in memory, so leaving to read a guide and coming back keeps it. Nothing is saved to disk.
const history = [];
const MAX_HISTORY = 12;

const rich = (s) => inlineParts(s).map((p) => (p.b ? h('strong', null, p.v) : p.v));

function itemsList(r) {
  if (r.blockType === 'ol' || r.blockType === 'steps') return h('ol', { class: 'ans-list' }, r.items.map((t, i) => h('li', { class: i === r.highlight ? 'hl' : null }, t)));
  if (r.items.length > 1) return h('ul', { class: 'ans-list' }, r.items.map((t, i) => h('li', { class: i === r.highlight ? 'hl' : null }, t)));
  return h('p', { class: 'ans-text' }, r.items[0] || '');
}

function passageCard(r) {
  const where = r.kind === 'card' ? 'Emergency card' : r.kind === 'checklist' ? 'Checklist' : 'Guide';
  return h('article', { class: 'card ans-card' + (r.severity === 'life' ? ' sev-life' : '') },
    h('p', { class: 'ans-where' }, h('span', { class: 'rtype' }, where), ' · ', r.title.replace(/^Emergency Now: |^Checklist: /, ''), r.heading && r.heading !== 'Summary' ? ` › ${r.heading}` : ''),
    itemsList(r),
    r.truncated ? h('p', { class: 'muted small' }, 'Shortened. The full text is in the guide.') : null,
    h('a', { class: 'btn secondary small-btn', href: r.href }, icon('book'), r.kind === 'checklist' ? 'Open checklist' : r.kind === 'card' ? 'Open card' : 'Read in the guide'),
    r.sources && r.sources.length ? h('p', { class: 'muted small ans-src' }, 'Based on: ' + r.sources.join(', ') + (r.updated ? ` · content dated ${r.updated}` : '')) : null);
}

function emergencyAnswer(a) {
  return h('div', { class: 'ans-emergency' },
    h('div', { class: 'callout warn', role: 'alert' }, h('strong', null, 'This may be an emergency. '), 'If someone is in danger, call 911 now. Official instructions come first.'),
    h('a', { class: 'call-911', href: 'tel:911' }, icon('phone'), 'Call 911'),
    ...a.cards.map((c) => h('article', { class: 'card ans-card sev-' + c.severity },
      h('h3', null, c.title),
      h('p', { class: 'ans-text' }, c.summary),
      h('ol', { class: 'ans-list' }, c.steps.map((s) => h('li', null, rich(s)))),
      c.dont.length ? h('div', { class: 'em-dont' }, h('h4', null, 'Do not'), h('ul', null, c.dont.map((s) => h('li', null, rich(s))))) : null,
      ...c.warn.map((w) => h('div', { class: 'callout warn', role: 'note' }, h('strong', null, 'Warning: '), rich(w))),
      h('a', { class: 'btn secondary small-btn', href: c.href }, icon('alert'), 'Open the full card'))));
}

function answerBody(a, ask) {
  if (a.type === 'emergency') return emergencyAnswer(a);
  if (a.type === 'greeting') return h('p', { class: 'ans-text' }, 'Hello. Ask me anything the guides cover, such as “how do I make water safe to drink?” or “how long will a 500 Wh battery run a 50 W fridge?”.');
  if (a.type === 'help') {
    return h('div', null,
      h('p', { class: 'ans-text' }, 'I find the answer in Cairn’s own guides, emergency cards and checklists, and show you the exact text with its sources. I can also do the water, food and battery sums if you give me numbers.'),
      h('p', { class: 'ans-text' }, 'I am not a live AI. I can’t search the internet, I don’t know about today’s weather or news, and I can’t give medical advice or doses. If someone is in danger, call 911.'));
  }
  if (a.type === 'guard') {
    return h('div', null,
      h('div', { class: 'callout warn', role: 'note' }, h('strong', null, 'I can’t advise on medicine doses. '), 'Doses depend on age, weight, health and other medicines. Ask a pharmacist, doctor or Poison Help (1-800-222-1222, free, 24 hours). If someone has taken too much or is reacting badly, call 911.'),
      h('p', { class: 'ans-text' }, 'These guides cover what I can help with:'),
      h('ul', { class: 'ans-list' }, a.links.map((l) => h('li', null, h('a', { href: l.href }, l.title)))));
  }
  if (a.type === 'calc') {
    return h('article', { class: 'card ans-card' },
      h('h3', null, a.title),
      h('ul', { class: 'ans-list calc-lines' }, a.lines.map((l) => h('li', null, h('strong', null, l.value), ' ', l.label, l.note ? h('span', { class: 'muted small' }, ' · ' + l.note) : null))),
      a.assumed.length ? h('p', { class: 'muted small' }, 'I assumed: ' + a.assumed.join(', ') + '. Change the numbers in the calculator to match your household.') : null,
      a.notes.map((n) => h('p', { class: 'muted small' }, n)),
      h('a', { class: 'btn secondary small-btn', href: a.href }, icon('calc'), 'Open the calculator'));
  }
  if (a.type === 'passages') {
    return h('div', null,
      a.confidence === 'medium' ? h('p', { class: 'muted small ans-hedge' },
        a.missing && a.missing.length ? `I found related text but nothing that mentions ${a.missing.map((w) => '“' + w + '”').join(', ')}. This may not fully answer your question.` : 'This is the closest match I could find. It may not fully answer your question.') : null,
      ...a.results.map(passageCard));
  }
  // none
  return h('div', null,
    h('p', { class: 'ans-text' }, a.live
      ? 'I work offline from Cairn’s guides, so I can’t look up live information such as forecasts, news, prices or the date. For official alerts, use a NOAA Weather Radio or your local emergency management office.'
      : 'I couldn’t find that in Cairn’s guides. Try different words, or ask about a topic the guides cover.'),
    a.suggestions && a.suggestions.length ? h('div', null, h('p', { class: 'muted small' }, a.live ? 'This guide may help:' : 'These guides are the closest:'),
      h('ul', { class: 'ans-list' }, a.suggestions.map((s) => h('li', null, h('a', { href: s.href }, s.title))))) : null,
    h('p', { class: 'muted small' }, 'You can also ', h('a', { href: '#/search' + (a.question ? '?q=' + encodeURIComponent(a.question) : '') }, 'search the guides'), ' by keyword.'),
    ask ? h('div', { class: 'chips' }, [
      'How do I make water safe to drink?', 'What should I do during an earthquake?', 'What is in a 72-hour kit?',
    ].map((t) => h('button', { type: 'button', class: 'chip', onclick: () => ask(t) }, t))) : null);
}

export async function askPage(_params, ctx) {
  const root = h('div', { class: 'ask' });
  const input = h('input', {
    type: 'text', id: 'ask-q', class: 'search-input', placeholder: 'Ask a question, e.g. how do I treat a burn?', autocomplete: 'off',
    autocapitalize: 'sentences', spellcheck: 'true', enterkeyhint: 'send', maxlength: '300', 'aria-label': 'Your question',
  });
  const status = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const thread = h('div', { class: 'ask-thread', 'aria-label': 'Questions and answers' });
  const starters = h('div', { class: 'chips ask-starters', role: 'group', 'aria-label': 'Example questions' });
  const clearBtn = h('button', { type: 'button', class: 'btn secondary small-btn', hidden: true, onclick: () => { history.length = 0; paint(); input.focus(); } }, 'Clear conversation');

  const form = h('form', { class: 'ask-form', onsubmit: (e) => { e.preventDefault(); ask(input.value); } },
    h('label', { class: 'sr-only', for: 'ask-q' }, 'Your question'), input,
    h('button', { class: 'btn', type: 'submit' }, 'Ask'));

  root.append(
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Ask Cairn'),
    h('p', { class: 'muted small' }, 'Ask in your own words. Cairn finds the answer in its own guides and shows you the exact text. It is not a live AI, it works offline, and nothing you type leaves this device.'),
    form, status, starters, thread, clearBtn,
    h('p', { class: 'muted small' }, 'Education, not medical advice. In an emergency call 911. ', h('a', { href: '#/emergency' }, 'Emergency Now')));

  let data;
  try { data = await getAssistant(); } catch (_) {
    root.append(h('div', { class: 'notice' }, 'The guides could not be loaded from this device, so questions can’t be answered. ', h('a', { href: '#/storage' }, 'Check offline status'), ' · ', h('a', { href: '#/search' }, 'Search')));
    form.hidden = true;
    return root;
  }
  const { assistant } = data;

  function paint() {
    thread.replaceChildren(...history.map((e) => h('section', { class: 'ask-turn' },
      h('p', { class: 'ask-q' }, h('span', { class: 'sr-only' }, 'You asked: '), e.question),
      h('div', { class: 'ask-a' }, h('span', { class: 'sr-only' }, 'Answer: '), answerBody(e.answer, ask)))));
    clearBtn.hidden = history.length === 0;
    starters.replaceChildren(...(history.length ? [] : assistant.starterQuestions().map((s) => h('button', { type: 'button', class: 'chip', onclick: () => ask(s.ask) }, s.title))));
  }

  function ask(text) {
    const q = String(text || '').replace(/\s+/g, ' ').trim();
    if (!q) { status.textContent = 'Type a question first.'; input.focus(); return; }
    const answer = assistant.ask(q);
    history.unshift({ question: q, answer });
    history.length = Math.min(history.length, MAX_HISTORY);
    input.value = '';
    paint();
    status.textContent = answer.type === 'passages' ? `Found ${answer.results.length} matching ${answer.results.length === 1 ? 'passage' : 'passages'}.` : answer.type === 'emergency' ? 'This may be an emergency. Call 911.' : answer.type === 'none' ? 'No match found.' : 'Answer ready.';
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) input.blur(); // close the on-screen keyboard so the answer is visible
    const first = thread.firstElementChild;
    if (first) first.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  paint();
  const initial = ctx && ctx.query && ctx.query.q;
  if (initial && !history.some((e) => e.question === String(initial).replace(/\s+/g, ' ').trim())) ask(initial);
  return root;
}
