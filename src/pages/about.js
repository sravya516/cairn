// About: content disclaimer, sources, privacy and limits, stated plainly.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { loadContent } from '../services/content.js';
import { CALCULATORS } from '../calculators/registry.js';

export async function aboutPage() {
  const c = await loadContent();
  const m = c.meta;
  return h('div', null,
    h('a', { class: 'back', href: '#/' }, icon('back'), 'Home'),
    h('h1', { tabindex: '-1', id: 'page-title' }, 'About, sources and disclaimer'),
    h('div', { class: 'card' }, h('h2', null, 'Disclaimer'), h('ul', null, m.disclaimer.map((d) => h('li', null, d)))),
    h('div', { class: 'notice' }, h('strong', null, 'Review status: '), m.reviewStatus),
    h('div', { class: 'card' }, h('h2', null, 'Sources'),
      h('p', { class: 'small muted' }, 'Guides are original explanations written from public guidance published by these organizations. Web addresses are optional extras and are never needed to use this app. Every guide lists the sources it relies on.'),
      h('ul', null, Object.values(m.sources).map((s) => h('li', null, `${s.name} — ${s.url.replace(/^https?:\/\//, '')}`)))),
    h('div', { class: 'card' }, h('h2', null, 'Your privacy'),
      h('ul', null,
        h('li', null, 'No account, no login, no analytics, no tracking, no ads.'),
        h('li', null, 'Everything you enter stays on this device. Cairn sends nothing anywhere.'),
        h('li', null, 'After the first visit, the app runs from files saved on your phone and needs no internet.'),
        h('li', null, 'Backups you export are not encrypted. Keep them private.'))),
    h('div', { class: 'card' }, h('h2', null, 'What is on this device'),
      h('ul', null,
        h('li', null, `${c.guides.length} guides in ${m.categories.length} topics`),
        h('li', null, `${c.emergency.length} Emergency Now cards`),
        h('li', null, `${c.checklists.length} checklists`),
        h('li', null, `${CALCULATORS.length} calculators`),
        h('li', null, `Content version ${m.contentVersion}, dated ${m.contentDate}`))),
    h('div', { class: 'card' }, h('h2', null, 'Limits to be aware of'),
      h('ul', null,
        h('li', null, 'Information changes. Review your plan and supplies at least twice a year, and check official sources when you are online.'),
        h('li', null, 'Local conditions vary. Instructions from local officials always come first.'),
        h('li', null, 'Cairn cannot call for help for you. Call 911 for life-threatening emergencies.'),
        h('li', null, 'Calculators give planning estimates, not guarantees.'))),
    h('a', { class: 'btn secondary block', href: '#/install' }, icon('download'), 'Install Cairn on your phone'),
    h('a', { class: 'btn secondary block', href: '#/storage' }, icon('wifi'), 'Offline and storage status'));
}
