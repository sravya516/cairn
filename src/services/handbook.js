// Printable offline handbook, generated from the bundled content. No network, no PDF service.
// Produces one self-contained HTML document (inline CSS, no scripts) that can be previewed in an iframe,
// printed / saved as PDF with the browser, or downloaded as a file. Pure functions: easy to test in Node.
//
// SECURITY: every piece of text goes through esc(). The output never contains <script>, event handlers or links.

import { itemsWithState, emptyState, PREPAREDNESS_GROUPS } from './checklists.js';

export const ESSENTIAL_GUIDE_IDS = [
  'prepare-72-hours', 'family-emergency-plan', 'contact-planning', 'shelter-in-place-planning', 'evacuation-planning', 'go-bag',
  'water-storage', 'water-treatment-overview', 'water-boiling', 'water-disinfection', 'unsafe-water-sources',
  'food-storage-basics', 'food-safety-outage', 'cooking-no-power',
  'first-aid-kit', 'bleeding-control', 'wounds-dressing', 'burns', 'sprains-fractures', 'shock', 'dehydration', 'heat-illness', 'hypothermia',
  'anaphylaxis', 'choking', 'cpr-aed', 'stroke-heart-attack', 'poisoning', 'infection-prevention-hygiene',
  'emergency-toilets-waste', 'ventilation-co-safety', 'power-outage-planning', 'generator-safety', 'refrigeration-outages',
  'weather-radio', 'family-comms-plan', 'fire-prevention-escape',
  'nuclear-explosion-fallout', 'radiological-incidents', 'hazardous-materials', 'gas-leak', 'tsunamis', 'active-violence', 'structural-collapse',
  'drowning-water-rescue', 'asthma-attack', 'diabetic-emergency', 'seizures', 'head-injury-concussion',
  'electric-shock-lightning-injury', 'wildfire-smoke-air-quality',
];

export const SCOPES = {
  essential: { label: 'Essentials (about 65 guides)', note: 'Water, food, first aid, power, communication, evacuation, every disaster guide, and the nuclear, chemical, gas, tsunami and violence guides.' },
  all: { label: 'Everything (all guides)', note: 'The complete encyclopedia. This is long.' },
};

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Escapes, then turns **bold** into <strong>. */
export const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** Which guides, cards and checklists go in. Missing ids are ignored so content edits never break the handbook. */
export function handbookPlan(content, options = {}) {
  const scope = options.scope === 'all' ? 'all' : 'essential';
  const byCat = new Map(content.meta.categories.map((c, i) => [c.id, i]));
  let guides = content.guides.filter((g) => scope === 'all' || g.category === 'disasters' || ESSENTIAL_GUIDE_IDS.includes(g.id));
  guides = [...guides].sort((a, b) => (byCat.get(a.category) - byCat.get(b.category)) || (scope === 'all' ? 0 : ESSENTIAL_GUIDE_IDS.indexOf(a.id) - ESSENTIAL_GUIDE_IDS.indexOf(b.id)));
  return {
    scope,
    guides,
    cards: content.emergency,
    checklists: options.includeChecklists === false ? [] : content.checklists,
  };
}

const blank = (rows, cols) => Array.from({ length: rows }, () => `<tr>${'<td></td>'.repeat(cols)}</tr>`).join('');
const val = (v) => (v ? esc(v) : '');

function blocks(sec) {
  return sec.blocks.map((b) => {
    switch (b.t) {
      case 'p': return `<p>${inline(b.v)}</p>`;
      case 'ul': return `<ul>${b.v.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`;
      case 'ol': return `<ol>${b.v.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`;
      case 'warn': return `<p class="warn"><strong>Warning:</strong> ${inline(b.v)}</p>`;
      case 'tip': return `<p class="tip"><strong>Tip:</strong> ${inline(b.v)}</p>`;
      default: return '';
    }
  }).join('');
}

function cardHTML(e) {
  return `<section class="card sev-${esc(e.severity)}"><h3>${esc(e.title)}</h3><p class="sum">${esc(e.summary)}</p>
<ol>${e.steps.map((s) => `<li>${inline(s)}</li>`).join('')}</ol>
${e.dont && e.dont.length ? `<p class="dont"><strong>Do not:</strong> ${e.dont.map(inline).join(' · ')}</p>` : ''}
${(e.warn || []).map((w) => `<p class="warn"><strong>Warning:</strong> ${inline(w)}</p>`).join('')}</section>`;
}

function guideHTML(g, sourcesMap) {
  const src = g.sources.map((s) => (sourcesMap[s] ? sourcesMap[s].name : s)).join('; ');
  return `<article class="guide"><h3>${esc(g.title)}</h3><p class="sum">${esc(g.summary)}</p>
${g.sections.map((s) => `<h4>${esc(s.h)}</h4>${blocks(s)}`).join('')}
<p class="src">Sources: ${esc(src)}. Last updated ${esc(g.updated || '')}.</p></article>`;
}

function checklistHTML(c, state) {
  const items = itemsWithState(c, state || emptyState());
  return `<section class="cl"><h3>${esc(c.title)}</h3><p class="sum">${esc(c.description)}</p><ul class="chk">${items.map((it) => `<li><span class="box">${it.done ? '&#9745;' : '&#9744;'}</span> <strong>${esc(it.name)}</strong>${it.desc ? ` &mdash; ${esc(it.desc)}` : ''}${it.qty ? ` <em>(${esc(it.qty)})</em>` : ''}${it.priority === 'critical' ? ' <span class="pri">CRITICAL</span>' : ''}${it.note ? ` <span class="note">Note: ${esc(it.note)}</span>` : ''}</li>`).join('')}</ul></section>`;
}

function formsHTML(plan, include) {
  const p = include && plan ? plan : null;
  const members = p && p.members.length
    ? p.members.map((m) => `<tr><td>${val(m.name)}</td><td>${val(m.age)}</td><td>${[m.medical, m.allergies && 'Allergies: ' + m.allergies, m.medications && 'Medications: ' + m.medications].filter(Boolean).map(esc).join('<br>')}</td><td></td></tr>`).join('') + blank(Math.max(0, 4 - p.members.length), 4)
    : blank(6, 4);
  const contacts = p && p.contacts.length
    ? p.contacts.map((c) => `<tr><td>${val(c.name)}</td><td>${val(c.relationship)}</td><td>${val(c.phone)}</td><td>${val(c.email || c.notes)}</td></tr>`).join('') + blank(Math.max(0, 4 - p.contacts.length), 4)
    : blank(8, 4);
  const line = (label, v) => `<p class="fl"><span>${esc(label)}</span><span class="fill">${val(v)}</span></p>`;
  return `
<section class="pb"><h2 id="contacts">Emergency Contact Sheet</h2>
<p class="sum">Fill in by hand and keep copies in each go-bag, car and at work. Phones die: paper does not.</p>
<table class="grid"><thead><tr><th>Name</th><th>Relationship or role</th><th>Phone</th><th>Email or notes</th></tr></thead><tbody>
<tr class="fixed"><td>Emergency services</td><td>U.S.</td><td>911</td><td>Life-threatening emergencies</td></tr>
<tr class="fixed"><td>Poison Help</td><td>U.S., free, 24 h</td><td>1-800-222-1222</td><td></td></tr>
<tr class="fixed"><td>988 Suicide &amp; Crisis Lifeline</td><td>U.S., call or text</td><td>988</td><td></td></tr>
${contacts}</tbody></table>
${line('Out-of-area contact (everyone checks in with this person)', p && p.outOfArea.name ? `${p.outOfArea.name} ${p.outOfArea.phone}` : '')}
${line('Doctor / pharmacy', '')}${line('Insurance (company, policy number, phone)', '')}${line('Utilities and landlord', '')}
</section>
<section class="pb"><h2 id="plan">Family Emergency Plan</h2>
<p class="sum">Review together twice a year and after any move, birth or change in health.</p>
<h3>Household members</h3>
<table class="grid"><thead><tr><th>Name</th><th>Age</th><th>Medical needs, allergies, medications</th><th>Phone</th></tr></thead><tbody>${members}</tbody></table>
<h3>Meeting places</h3>
${line('1. Right outside the home', p && p.meeting.near)}${line('2. Outside the neighborhood', p && p.meeting.neighborhood)}${line('3. Out of town', p && p.meeting.outOfTown)}
<h3>Evacuation</h3>
${line('Primary destination', p && p.evacuation.destination)}${line('Address', p && p.evacuation.address)}${line('Primary route', p && p.evacuation.route)}${line('Backup destination and route', p && p.evacuation.backup)}
<h3>Home</h3>
${line('Water shutoff location', '')}${line('Gas shutoff location (only if you smell gas or are told to)', '')}${line('Electrical panel location', '')}${line('Two exits from every room? Escape-plan meeting place', '')}
<h3>Pets and vehicles</h3>
${line('Pets (name, vet, microchip)', p && p.pets.map((x) => x.name).join(', '))}${line('Vehicles (description, plate)', p && p.vehicles.map((x) => `${x.name} ${x.plate}`).join('; '))}
${line('Special needs, equipment, other notes', p && p.notes.text ? p.notes.text.slice(0, 300) : '')}
</section>`;
}

/**
 * Builds the whole handbook as an HTML document string.
 * content: loaded content (indexed); options: { scope, includeChecklists, includeForms, includePersonal };
 * plan/states are only used when includePersonal is true.
 */
export function buildHandbookHTML({ content, options = {}, plan = null, states = {}, css = '', now = new Date() }) {
  const sel = handbookPlan(content, options);
  const personal = !!options.includePersonal;
  const date = now.toISOString().slice(0, 10);
  const m = content.meta;
  const cats = content.meta.categories.filter((c) => sel.guides.some((g) => g.category === c.id));

  const toc = [
    ['quick', 'Emergency quick reference'],
    ...(options.includeForms === false ? [] : [['contacts', 'Emergency contact sheet'], ['plan', 'Family emergency plan']]),
    ...(sel.checklists.length ? [['lists', 'Supply and planning checklists']] : []),
    ...cats.map((c) => [`cat-${c.id}`, c.title]),
    ['about', 'Sources and disclaimer'],
  ];

  const groups = [...new Set(sel.checklists.map((c) => c.group))];
  const body = `
<header class="cover"><h1>CAIRN</h1><p class="subtitle">${esc(m.tagline)}</p><h2>Emergency Handbook</h2>
<p>Generated ${esc(date)} from content version ${esc(m.contentVersion)} (${esc(m.contentDate)}).</p>
<p class="big911">Life-threatening emergency in the U.S.? Call 911.</p>
<div class="disc"><strong>Important.</strong> ${m.disclaimer.map(esc).join(' ')}</div>
<p class="rev">${esc(m.reviewStatus)}</p>
<h3>Contents</h3><ol class="toc">${toc.map(([id, t]) => `<li><a href="#${esc(id)}">${esc(t)}</a></li>`).join('')}</ol></header>

<section class="pb"><h2 id="quick">Emergency Quick Reference</h2><p class="sum">The short version. Full guides follow.</p>${sel.cards.map(cardHTML).join('')}</section>
${options.includeForms === false ? '' : formsHTML(plan, personal)}
${sel.checklists.length ? `<section class="pb"><h2 id="lists">Supply and Planning Checklists</h2>${groups.map((g) => `<h3 class="grp">${esc(g)}</h3>${sel.checklists.filter((c) => c.group === g).map((c) => checklistHTML(c, personal ? states[c.id] : null)).join('')}`).join('')}</section>` : ''}
${cats.map((c) => `<section class="pb"><h2 id="cat-${esc(c.id)}">${esc(c.title)}</h2><p class="sum">${esc(c.description)}</p>${sel.guides.filter((g) => g.category === c.id).map((g) => guideHTML(g, m.sources)).join('')}</section>`).join('')}
<section class="pb"><h2 id="about">Sources and Disclaimer</h2>
<ul>${m.disclaimer.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
<p>${esc(m.reviewStatus)}</p>
<h3>Sources</h3><p class="small">Guides are original explanations of public guidance from these organizations. Web addresses are optional extras.</p>
<ul>${Object.values(m.sources).map((s) => `<li>${esc(s.name)} &mdash; ${esc(s.url.replace(/^https?:\/\//, ''))}</li>`).join('')}</ul>
<p class="small">Cairn stores nothing outside your device. ${personal ? 'This printout contains your personal household information. Keep it private.' : 'This printout contains no personal information.'}</p></section>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cairn Emergency Handbook ${esc(date)}</title>
<style>${css}</style></head><body class="handbook">${body}</body></html>`;
}

/** Rough page count. Calibrated against Chrome printing the essentials handbook (about 90 pages, Letter). */
export function estimatePages(html) {
  const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  return Math.max(1, Math.round(text.length / 1800));
}

export function handbookFilename(now = new Date()) { return `cairn-handbook-${now.toISOString().slice(0, 10)}.html`; }
export { PREPAREDNESS_GROUPS };
