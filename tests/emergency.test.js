import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadGuides, loadCards, updateText } from '../scripts/sources-report.mjs';
import { indexContent, guideText } from '../src/services/content.js';
import { SearchIndex, buildDocs } from '../src/services/search/engine.js';
import { emptyState, setDone, nextSteps } from '../src/services/checklists.js';
import { telHref } from '../src/utils/text.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/meta.json'), 'utf8'));
const guides = loadGuides(ROOT);
const cards = loadCards(ROOT);
const byId = new Map(cards.map((c) => [c.id, c]));
const guideById = new Map(guides.map((g) => [g.id, g]));
const cardText = (c) => [c.title, c.summary, ...c.steps, ...(c.dont || []), ...(c.warn || [])].join(' ');

test('every required emergency scenario has a card', () => {
  for (const id of ['call-911', 'bleeding', 'cpr', 'choking', 'anaphylaxis', 'stroke-heart', 'burns', 'poisoning', 'carbon-monoxide', 'house-fire', 'tornado', 'lightning', 'flood', 'earthquake', 'wildfire', 'hurricane', 'heat', 'cold', 'power-outage', 'evacuate', 'communication',
    'nuclear', 'hazmat', 'gas-leak', 'tsunami', 'volcano', 'active-violence', 'explosion', 'collapse', 'drowning', 'asthma', 'diabetic', 'seizure', 'head-injury', 'bites', 'childbirth', 'smoke', 'boating', 'electric-shock', 'abroad']) {
    assert.ok(byId.has(id), `missing card ${id}`);
  }
  assert.equal(cards.length, new Set(cards.map((c) => c.id)).size);
});

test('cards are short and fast to read: few, brief steps', () => {
  for (const c of cards) {
    assert.ok(c.steps.length >= 4 && c.steps.length <= 7, `${c.id}: ${c.steps.length} steps`);
    for (const s of c.steps) assert.ok(s.length <= 240, `${c.id}: step too long (${s.length}): ${s.slice(0, 40)}`);
    assert.ok(c.summary.length <= 150, `${c.id}: summary ${c.summary.length}`);
    assert.ok(['life', 'urgent', 'info'].includes(c.severity));
    assert.ok(c.title && c.group && c.icon && c.tags.length >= 3, c.id);
    assert.ok((c.dont || []).length <= 4 && (c.warn || []).length <= 2, `${c.id} keep it brief`);
  }
});

test('cards link to real guides and cite real sources', () => {
  for (const c of cards) {
    assert.ok(guideById.has(c.guide), `${c.id} -> missing guide ${c.guide}`);
    assert.ok(c.sources.length >= 1);
    for (const s of c.sources) assert.ok(meta.sources[s], `${c.id}: unknown source ${s}`);
  }
});

test('life-threatening cards tell people to call 911 or Poison Help', () => {
  for (const c of cards.filter((x) => x.severity === 'life' && !['earthquake', 'tornado', 'flood', 'wildfire', 'house-fire', 'carbon-monoxide', 'tsunami'].includes(x.id))) {
    assert.match(cardText(c), /911|Poison Help/, c.id);
  }
  for (const id of ['house-fire', 'carbon-monoxide']) assert.match(cardText(byId.get(id)), /911/);
  assert.match(cardText(byId.get('call-911')), /text/i);
  assert.match(cardText(byId.get('call-911')), /WHERE/);
});

test('no medication doses or placeholder text on cards', () => {
  const all = cards.map(cardText).join(' ');
  assert.ok(!/\b\d+(\.\d+)?\s?(mg|mcg|ml|mL|units?|tablets?|pills?)\b/.test(all));
  assert.ok(!/\b(lorem|todo|tbd|placeholder|coming soon)\b/i.test(all));
});

test('safety numbers on cards agree with the full guides', () => {
  const g = (id) => guideText(guideById.get(id));
  const pairs = [
    ['cpr', /100 to 120/, 'cpr-aed', /100 to 120/],
    ['cpr', /2 inches/, 'cpr-aed', /2 inches/],
    ['bleeding', /2–3 inches/, 'bleeding-control', /2–3 inches/],
    ['burns', /10 minutes/, 'burns', /10 minutes/],
    ['burns', /20 minutes/, 'burns', /20 minutes/],
    ['poisoning', /1-800-222-1222/, 'poisoning', /1-800-222-1222/],
    ['flood', /Six inches/, 'flooding', /6 inches/],
    ['lightning', /30 minutes/, 'lightning', /30 minutes/],
    ['earthquake', /20 seconds/, 'earthquakes', /20 seconds/],
    ['power-outage', /20 feet/, 'generator-safety', /20 feet/],
    ['power-outage', /35 feet/, 'electrical-safety', /35 feet/],
    ['power-outage', /48 hours/, 'food-safety-outage', /48 hours/],
    ['power-outage', /40°F/, 'food-safety-outage', /40°F/],
    ['heat', /103°F/, 'heat-illness', /103°F/],
    ['wildfire', /N95/, 'wildfires', /N95/],
    ['choking', /5 back blows/, 'choking', /5 back blows/],
    ['nuclear', /24 hours/, 'nuclear-explosion-fallout', /24 hours/],
    ['nuclear', /potassium iodide/i, 'nuclear-explosion-fallout', /potassium iodide/i],
    ['tsunami', /20 seconds/, 'tsunamis', /20 seconds/],
    ['tsunami', /100 feet/, 'tsunamis', /100 feet/],
    ['hazmat', /15 minutes/, 'hazardous-materials', /15 minutes/],
    ['hazmat', /1-800-222-1222/, 'hazardous-materials', /1-800-222-1222/],
    ['active-violence', /RUN/, 'active-violence', /Run, Hide, Fight/],
    ['diabetic', /15 grams/, 'diabetic-emergency', /15 grams/],
    ['seizure', /5 minutes/, 'seizures', /5 minutes/],
    ['drowning', /rescue breaths/i, 'drowning-water-rescue', /rescue breaths/i],
    ['gas-leak', /rotten eggs/, 'gas-leak', /rotten egg/],
    ['smoke', /N95/, 'wildfire-smoke-air-quality', /N95/],
    ['smoke', /101+/, 'wildfire-smoke-air-quality', /101–150/],
    ['boating', /channel 16/, 'boating-marine-emergencies', /channel 16/],
    ['boating', /Mayday/, 'boating-marine-emergencies', /Mayday/],
    ['electric-shock', /35 feet/, 'electric-shock-lightning-injury', /35 feet/],
    ['electric-shock', /no charge/, 'electric-shock-lightning-injury', /do not carry an electrical charge/],
    ['abroad', /112/, 'traveling-abroad-emergencies', /112/],
    ['abroad', /119/, 'traveling-abroad-emergencies', /119/],
  ];
  for (const [card, cre, guide, gre] of pairs) {
    assert.match(cardText(byId.get(card)), cre, `card ${card}`);
    assert.match(g(guide), gre, `guide ${guide}`);
  }
});

test('Emergency Now and CONTENT_SOURCES.md: cards are registered and the register is current', () => {
  const text = fs.readFileSync(path.join(ROOT, 'CONTENT_SOURCES.md'), 'utf8');
  assert.equal(updateText(text, guides, cards), text, 'run `npm run sources`');
  for (const c of cards) assert.ok(text.includes('`' + c.id + '`'), `card ${c.id} missing from register`);
});

test('search finds emergency cards for panicked, natural queries', () => {
  const content = indexContent({ meta, guides, checklists: [], emergency: cards });
  const index = new SearchIndex(buildDocs(content, guideText));
  const top = (q) => index.search(q, { limit: 3 }).map((r) => r.id);
  for (const [q, id] of [['bleeding', 'bleeding'], ['cpr', 'cpr'], ['choking', 'choking'], ['house fire', 'house-fire'], ['tornado warning', 'tornado'], ['carbon monoxide', 'carbon-monoxide'], ['heat stroke', 'heat'], ['no cell service', 'communication'], ['stroke', 'stroke-heart'], ['power outage', 'power-outage'], ['nuclear', 'nuclear'], ['radiation', 'nuclear'], ['chemical spill', 'hazmat'], ['gas leak', 'gas-leak'], ['tsunami', 'tsunami'], ['shooter', 'active-violence'], ['drowning', 'drowning'], ['asthma', 'asthma'], ['seizure', 'seizure'], ['snake bite', 'bites'], ['baby is coming', 'childbirth'], ['wildfire smoke', 'smoke'], ['air quality', 'smoke'], ['mayday', 'boating'], ['electric shock', 'electric-shock'], ['emergency number abroad', 'abroad']]) {
    assert.ok(top(q).includes('emergency:' + id), `"${q}" -> ${top(q)}`);
  }
  assert.equal(index.search('bleeding')[0].type, 'emergency', 'quick cards outrank long guides');
});

// ---- Dashboard helpers --------------------------------------------------------------------------------
test('nextSteps returns unchecked critical items from preparedness lists only', () => {
  const lists = [
    { id: 'a', group: 'Kits & bags', items: [['Water', '', '1', 'critical'], ['Radio', '', '1', 'high'], ['Light', '', '1', 'critical']] },
    { id: 'h', group: 'Plans & hazards', items: [['Evacuate', '', '1', 'critical']] },
    { id: 'b', group: 'Supplies', items: [['Medications', '', '1', 'critical']] },
  ];
  const states = { a: setDone(emptyState(), { key: 'water' }, true) };
  assert.deepEqual(nextSteps(lists, states, 5).map((s) => s.name), ['Light', 'Medications']);
  assert.equal(nextSteps(lists, states, 1).length, 1);
  assert.deepEqual(nextSteps([], {}), []);
});

test('telHref only produces dialable links', () => {
  assert.equal(telHref('(555) 123-4567'), 'tel:5551234567');
  assert.equal(telHref('+1 555 123 4567'), 'tel:+15551234567');
  assert.equal(telHref('911'), 'tel:911');
  assert.equal(telHref('1-800-222-1222'), 'tel:18002221222');
  for (const bad of ['', null, 'abc', '12', 'javascript:alert(1)', '555-1234; rm', '1'.repeat(20)]) assert.equal(telHref(bad), null, String(bad));
});

test('home quick-guide shortcuts all exist', async () => {
  const { HOME_QUICK } = await import('../src/pages/home.js');
  assert.ok(HOME_QUICK.length >= 6);
  for (const id of HOME_QUICK) assert.ok(guideById.has(id), id);
});

test('telHref ignores extensions instead of dialing them', () => {
  assert.equal(telHref('555-123-4567 x22'), 'tel:5551234567');
  assert.equal(telHref('555-123-4567 ext. 9'), 'tel:5551234567');
  assert.equal(telHref('x22'), null);
});
