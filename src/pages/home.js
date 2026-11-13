// Home dashboard: status, Emergency Now, search, progress, household summary, quick guides, contacts.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { cardLink, statusPill, emergencyNotice } from '../components/ui.js';
import { themeButton } from '../components/shell.js';
import { loadContent } from '../services/content.js';
import { getStore } from '../services/storage/index.js';
import { loadAllStates, overallProgress, nextSteps, PREPAREDNESS_GROUPS } from '../services/checklists.js';
import { loadPlan, completeness } from '../services/plan.js';
import { getBookmarks, getRecents, resolveGuides } from '../services/library.js';
import { telHref } from '../utils/text.js';
import { progressBar } from './checklists.js';

/** Guides most useful under stress, shown as shortcuts. Ids that do not exist are skipped. */
export const HOME_QUICK = ['water-treatment-overview', 'cpr-aed', 'bleeding-control', 'extended-power-outages', 'water-storage', 'evacuation-planning', 'ventilation-co-safety', 'family-emergency-plan'];

const STATIC_CONTACTS = [
  { name: 'Emergency services (U.S.)', phone: '911', note: 'Life-threatening emergencies' },
  { name: 'Poison Help (U.S.)', phone: '1-800-222-1222', note: 'Free, 24 hours' },
  { name: '988 Suicide & Crisis Lifeline (U.S.)', phone: '988', note: 'Call or text, 24 hours' },
];

function isStandalone() {
  return (typeof navigator !== 'undefined' && navigator.standalone === true) || (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches);
}
const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

function contactRow(c) {
  const href = telHref(c.phone);
  return h('li', { class: 'contact' },
    h('span', null, h('strong', null, c.name), c.note ? h('span', { class: 'muted small' }, ' · ' + c.note) : null),
    href ? h('a', { class: 'btn small-btn', href, 'aria-label': `Call ${c.name} at ${c.phone}` }, icon('phone'), c.phone) : h('span', { class: 'muted' }, c.phone || ''));
}

export async function homePage() {
  const store = await getStore();
  let c = null;
  try { c = await loadContent(); } catch (_) { /* dashboard still renders its essentials */ }

  const form = h('form', { class: 'home-search', role: 'search', onsubmit: (e) => { e.preventDefault(); const q = e.target.q.value.trim(); location.hash = '#/search' + (q ? '?q=' + encodeURIComponent(q) : ''); } },
    h('label', { class: 'sr-only', for: 'home-q' }, 'Search all guides'),
    h('input', { type: 'search', id: 'home-q', name: 'q', placeholder: 'Search all guides…', autocomplete: 'off', enterkeyhint: 'search' }),
    h('button', { class: 'btn', type: 'submit', 'aria-label': 'Search' }, icon('search')));

  const hero = h('div', { class: 'card hero' },
    h('div', { style: 'margin-bottom:10px' }, statusPill()),
    h('h1', { tabindex: '-1', id: 'page-title' }, 'CAIRN'),
    h('p', { class: 'eyebrow' }, 'YOUR COMPLETE OFFLINE EMERGENCY GUIDE'),
    h('a', { class: 'btn danger block', href: '#/emergency' }, icon('alert'), 'Emergency Now'),
    form);

  const root = h('div', { class: 'home' }, hero, emergencyNotice());

  // iPhone install tip (only in Safari tabs, not once installed)
  const tipKey = 'ui:installTipDismissed';
  if (isIOS() && !isStandalone() && !(await store.get(tipKey, false))) {
    const tip = h('div', { class: 'card install-tip' },
      h('h2', null, 'Install Cairn on your iPhone'),
      h('ol', null, h('li', null, 'Tap the Share button in Safari.'), h('li', null, 'Choose “Add to Home Screen”.'), h('li', null, 'Open Cairn from the new icon. It works with no signal.')),
      h('button', { class: 'btn secondary', type: 'button', onclick: async () => { await store.set(tipKey, true); tip.remove(); } }, 'Got it'));
    root.append(tip);
  }

  if (!c) {
    root.append(h('div', { class: 'notice' }, 'Guides could not be loaded from this device. ', h('a', { href: '#/storage' }, 'Check offline status')));
    root.append(cardLink({ href: '#/emergency', iconName: 'alert', title: 'Emergency Now', subtitle: 'Calling for help' }));
    return root;
  }

  const states = await loadAllStates(store, c.checklists);
  const plan = await loadPlan(store);
  const prog = overallProgress(c.checklists, states, { groups: PREPAREDNESS_GROUPS });
  const comp = completeness(plan);
  const steps = nextSteps(c.checklists, states, 3);

  // Progress
  root.append(
    h('div', { class: 'section-title' }, h('h2', null, 'Your preparedness')),
    h('div', { class: 'card' },
      h('div', { class: 'row-top split' }, h('strong', null, 'Supplies'), h('span', null, `${prog.pct}%`)),
      progressBar(prog.pct, 'Supplies progress'),
      h('p', { class: 'muted small' }, `${prog.done} of ${prog.total} items · ${prog.criticalDone} of ${prog.criticalTotal} critical`),
      h('div', { class: 'row-top split' }, h('strong', null, 'Household plan'), h('span', null, `${comp.pct}%`)),
      progressBar(comp.pct, 'Plan progress'),
      h('p', { class: 'muted small' }, `${comp.done} of ${comp.total} steps`),
      steps.length ? h('div', null, h('h3', null, 'Next steps'), h('ul', { class: 'next' }, steps.map((s) => h('li', null, h('a', { href: `#/checklist/${s.checklistId}` }, s.name), h('span', { class: 'muted small' }, ' · ' + s.checklistTitle))))) : h('p', null, 'All critical supplies are checked off. Review twice a year.')));

  // Household summary
  const hasPlan = plan.members.length || plan.contacts.length || plan.outOfArea.name;
  root.append(
    h('div', { class: 'section-title' }, h('h2', null, 'My household')),
    h('a', { class: 'card card-link', href: '#/plan' },
      h('span', { class: 'ico' }, icon('plan')),
      h('span', { class: 'meta' },
        h('strong', null, hasPlan ? `${plan.members.length} ${plan.members.length === 1 ? 'person' : 'people'} · ${plan.pets.length} ${plan.pets.length === 1 ? 'pet' : 'pets'} · ${plan.contacts.length} ${plan.contacts.length === 1 ? 'contact' : 'contacts'}` : 'Set up your household plan'),
        h('span', null, plan.outOfArea.name ? `Out-of-area contact: ${plan.outOfArea.name}` : hasPlan ? 'No out-of-area contact yet' : 'Members, contacts, meeting places. Stays on this device.')),
      icon('chevron', 'width="20" height="20"')));

  // Quick guides
  const quick = HOME_QUICK.map((id) => c.guideById.get(id)).filter(Boolean);
  root.append(h('div', { class: 'section-title' }, h('h2', null, 'Critical guides'), h('a', { href: '#/guides' }, 'All guides')),
    h('div', { class: 'grid-2 quick' }, quick.map((g) => h('a', { class: 'card quick-card', href: `#/guide/${g.id}` }, h('strong', null, g.title)))));

  // Bookmarks and recents
  const bm = resolveGuides(await getBookmarks(store), c.guideById).slice(0, 4);
  const rc = resolveGuides(await getRecents(store), c.guideById).filter((g) => !bm.includes(g)).slice(0, 3);
  if (bm.length) root.append(h('div', { class: 'section-title' }, h('h2', null, 'Bookmarked')), ...bm.map((g) => cardLink({ href: `#/guide/${g.id}`, iconName: 'star', title: g.title, subtitle: c.categoryById.get(g.category)?.title })));
  if (rc.length) root.append(h('div', { class: 'section-title' }, h('h2', null, 'Recently viewed')), ...rc.map((g) => cardLink({ href: `#/guide/${g.id}`, iconName: 'book', title: g.title, subtitle: c.categoryById.get(g.category)?.title })));

  // Contacts
  const mine = [];
  if (plan.outOfArea.name) mine.push({ name: plan.outOfArea.name, phone: plan.outOfArea.phone, note: 'Out-of-area contact' });
  for (const k of plan.contacts.slice(0, 4)) mine.push({ name: k.name, phone: k.phone, note: k.relationship });
  root.append(h('div', { class: 'section-title' }, h('h2', null, 'Important contacts')),
    h('ul', { class: 'card contacts' }, [...STATIC_CONTACTS, ...mine].map(contactRow)),
    mine.length ? null : h('p', { class: 'muted small' }, h('a', { href: '#/plan/contacts' }, 'Add your own emergency contacts'), ' to show them here.'));

  // Tools
  root.append(h('div', { class: 'section-title' }, h('h2', null, 'Tools')),
    cardLink({ href: '#/checklists', iconName: 'check', title: 'Checklists', subtitle: `${c.checklists.length} lists: kits, go-bags, hazards` }),
    cardLink({ href: '#/calculators', iconName: 'calc', title: 'Calculators', subtitle: 'Water, food, power, battery, fuel, budget, storage' }),
    cardLink({ href: '#/handbook', iconName: 'print', title: 'Printable handbook', subtitle: 'Save as PDF or print. Works offline.' }),
    h('p', { class: 'muted small' }, `${c.guides.length} guides and ${c.emergency.length} quick-reference cards stored on this device · `, h('a', { href: '#/about' }, 'About, sources and disclaimer')),
    h('p', null, themeButton({ labelled: true, cls: 'btn secondary block' })));
  return root;
}
