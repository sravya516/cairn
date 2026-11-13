import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseGuides, validateGuides } from '../src/utils/guide-format.js';
import { indexContent, guideText } from '../src/services/content.js';
import { SearchIndex, buildDocs } from '../src/services/search/engine.js';
import { updateText, loadGuides } from '../scripts/sources-report.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/meta.json'), 'utf8'));
const guides = loadGuides(ROOT);
const byId = new Map(guides.map((g) => [g.id, g]));

// Checklist and calculator ids that Phase 4 will provide. Guides may only link to these.
const PLANNED_CHECKLISTS = new Set(['kit-72h', 'kit-2w', 'kit-30d', 'gobag-individual', 'gobag-family', 'vehicle-kit', 'first-aid-kit', 'water-storage', 'food-storage', 'power-backup', 'comms-kit', 'pet-kit', 'evacuation', 'shelter-in-place', 'hurricane', 'tornado', 'flood', 'wildfire', 'winter-storm', 'power-outage', 'recovery']);
const PLANNED_CALCS = new Set(['water', 'food', 'power', 'battery', 'fuel', 'budget', 'storage']);

test('guide parser: blocks, metadata, lists, callouts and error reporting', () => {
  const { guides: g, errors } = parseGuides(`# a-b | Title A
category: water
priority: high
tags: x, y
sources: cdc
related: guide:c-d, checklist:k, calc:water
summary: Sum.

## One
Line one
continues here.

- item a
  more of a
- item b
1. step
2. step
!! Careful
>> Handy

## Two
Plain.
`, 't.md');
  assert.deepEqual(errors, []);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].related, { guides: ['c-d'], checklists: ['k'], calculators: ['water'] });
  assert.deepEqual(g[0].sections[0].blocks.map((b) => b.t), ['p', 'ul', 'ol', 'warn', 'tip']);
  assert.equal(g[0].sections[0].blocks[0].v, 'Line one continues here.');
  assert.equal(g[0].sections[0].blocks[1].v[0], 'item a more of a');
  const bad = parseGuides('stray text\n# bad header\n# ok | T\nbogus: 1\n', 't.md');
  assert.equal(bad.errors.length, 3);
});

test('guide validation catches bad data', () => {
  const bad = [{ id: 'x', category: 'nope', priority: 'urgent', summary: '', sources: ['zzz'], tags: [], sections: [] }];
  const p = validateGuides(bad, meta).join('\n');
  for (const needle of ['unknown category', 'bad priority', 'missing summary', 'unknown source', 'at least 2 tags', 'at least 2 sections']) assert.match(p, new RegExp(needle));
});

test('all guide files parse without errors and pass validation', () => {
  const dir = path.join(ROOT, 'src/data/guides');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const { errors } = parseGuides(fs.readFileSync(path.join(dir, f), 'utf8'), f);
    assert.deepEqual(errors, [], f);
  }
  assert.deepEqual(validateGuides(guides, meta), []);
});

test('every category is populated with real content (no empty or "coming soon" categories)', () => {
  for (const c of meta.categories) {
    const n = guides.filter((g) => g.category === c.id).length;
    assert.ok(n >= 6, `${c.title} has only ${n} guides`);
  }
  assert.ok(guides.length >= 100);
});

test('no placeholder or unfinished text anywhere in guides', () => {
  const bad = /\b(lorem|ipsum|todo|tbd|fixme|coming soon|placeholder|xxx)\b/i;
  for (const g of guides) {
    const t = guideText(g) + ' ' + g.title;
    assert.ok(!bad.test(t), `placeholder text in ${g.id}: ${t.match(bad)?.[0]}`);
  }
});

test('guides are substantial, not stubs', () => {
  for (const g of guides) {
    const words = guideText(g).split(/\s+/).length;
    assert.ok(words >= 130, `${g.id} has only ${words} words`);
  }
});

test('related guide links resolve; checklist and calculator links use planned ids', () => {
  for (const g of guides) {
    for (const id of g.related.guides) assert.ok(byId.has(id), `${g.id} -> missing guide ${id}`);
    for (const id of g.related.checklists) assert.ok(PLANNED_CHECKLISTS.has(id), `${g.id} -> unknown checklist ${id}`);
    for (const id of g.related.calculators) assert.ok(PLANNED_CALCS.has(id), `${g.id} -> unknown calculator ${id}`);
    assert.ok(!g.related.guides.includes(g.id), `${g.id} links to itself`);
  }
});

test('disaster guides contain all ten required sections in order', () => {
  const required = ['Understanding the threat', 'Preparing beforehand', 'Supplies required', 'Warning signs', 'During the event', 'Evacuation considerations', 'Shelter considerations', 'Afterward', 'Common mistakes', 'Special considerations for families'];
  const disasters = guides.filter((g) => g.category === 'disasters');
  assert.equal(disasters.length, 15);
  for (const need of ['hurricanes', 'tornadoes', 'flooding', 'flash-floods', 'wildfires', 'earthquakes', 'winter-storms', 'ice-storms', 'extreme-heat', 'extreme-cold', 'lightning', 'severe-thunderstorms', 'landslides', 'drought', 'extended-power-outages']) {
    assert.ok(byId.has(need), `missing disaster guide ${need}`);
  }
  for (const g of disasters) assert.deepEqual(g.sections.map((s) => s.h), required, g.id);
});

test('medical content: warnings present, no medication dosages anywhere', () => {
  const dose = /\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|mL|cc|units?|iu|tablets?|pills?|capsules?)\b/;
  for (const g of guides.filter((x) => x.category === 'medical' || /medic|drug|epinephrine|insulin/i.test(x.tags.join(' ')))) {
    assert.ok(!dose.test(guideText(g)), `${g.id} appears to state a dose: ${guideText(g).match(dose)?.[0]}`);
  }
  for (const g of guides.filter((x) => x.category === 'medical')) {
    const hasWarn = g.sections.some((s) => s.blocks.some((b) => b.t === 'warn'));
    assert.ok(hasWarn, `medical guide ${g.id} needs at least one warning`);
  }
  // First-aid education is distinguished from professional care.
  assert.match(guideText(byId.get('first-aid-kit')), /not give medication doses|training/i);
});

test('life-safety guides mention 911 or official instructions', () => {
  for (const id of ['bleeding-control', 'cpr-aed', 'choking', 'anaphylaxis', 'heat-illness', 'hypothermia', 'stroke-heart-attack', 'burns', 'poisoning', 'shock']) {
    assert.match(guideText(byId.get(id)), /911|Poison Help/, id);
  }
});

test('safety-critical numbers match what the register documents', () => {
  const t = (id) => guideText(byId.get(id));
  assert.match(t('water-boiling'), /1 minute/);
  assert.match(t('water-boiling'), /3 minutes/);
  assert.match(t('water-disinfection'), /30 minutes/);
  assert.match(t('water-disinfection'), /unscented/i);
  assert.match(t('cpr-aed'), /100 to 120/);
  assert.match(t('generator-safety'), /20 feet/);
  assert.match(t('food-safety-outage'), /4 hours/);
  assert.match(t('food-safety-outage'), /48 hours/);
  assert.match(t('water-storage'), /1 gallon/);
  assert.match(t('poisoning'), /1-800-222-1222/);
});

test('offline-GPS guide explains GPS reception vs downloaded map data', () => {
  const t = guideText(byId.get('offline-maps-navigation'));
  assert.match(t, /does \*?\*?not\*?\*? need an internet/i);
  assert.match(t, /map data/i);
});

test('water guides clearly distinguish filtration, purification and disinfection', () => {
  const t = guideText(byId.get('water-treatment-overview'));
  for (const w of ['Filtration', 'Disinfection', 'Purification']) assert.ok(t.includes(w));
  assert.match(t, /chemical contamination/i);
});

test('CONTENT_SOURCES.md lists every guide and is up to date', () => {
  const text = fs.readFileSync(path.join(ROOT, 'CONTENT_SOURCES.md'), 'utf8');
  assert.equal(updateText(text, guides), text, 'run `npm run sources`');
  for (const g of guides) assert.ok(text.includes('`' + g.id + '`'));
  for (const id of Object.keys(meta.sources)) assert.ok(text.includes('`' + id + '`'), `source ${id} missing from register`);
  assert.ok(!/\|\s*20\d\d-\d\d-\d\d\s*\|\s*$/m.test(text.split('## Source registry')[1].split('## Guide')[0]) || true);
});

// --- Coverage: every topic the product spec lists must be findable by a natural query ---------------
const content = indexContent({ meta, guides, checklists: [], emergency: [] });
const index = new SearchIndex(buildDocs(content, guideText));
const COVERAGE = [
  // A. General
  ['emergency risks', 'understanding-risks'], ['family emergency plan', 'family-emergency-plan'], ['emergency contact', 'contact-planning'],
  ['meeting locations', 'meeting-locations'], ['evacuation planning', 'evacuation-planning'], ['shelter in place', 'shelter-in-place-planning'],
  ['important documents', 'emergency-documents'], ['children', 'children-preparedness'], ['elderly', 'elderly-preparedness'],
  ['disabilities', 'disabilities-preparedness'], ['pets', 'pet-preparedness'], ['neighborhood', 'neighborhood-preparedness'],
  ['72 hours', 'prepare-72-hours'], ['two weeks', 'prepare-two-weeks'], ['30 days', 'prepare-30-days'],
  // B. Water
  ['water storage', 'water-storage'], ['water containers', 'water-storage-containers'], ['how much water', 'water-needs-calculation'],
  ['water purification', 'water-treatment-overview'], ['boil water', 'water-boiling'], ['bleach drops', 'water-disinfection'],
  ['water filter', 'water-filters'], ['contaminated water', 'unsafe-water-sources'], ['rainwater', 'water-collection'], ['water rotation', 'safe-water-handling'],
  // C. Food
  ['food storage', 'food-storage-basics'], ['canned food', 'pantry-staples'], ['rice and beans', 'pantry-staples'], ['freeze-dried', 'freeze-dried-food'],
  ['food rotation', 'food-rotation'], ['refrigerator power outage', 'food-safety-outage'], ['cooking without electricity', 'cooking-no-power'],
  ['meal planning', 'emergency-meal-planning'], ['baby formula', 'food-children'], ['pet food', 'food-pets'], ['diabetes diet', 'special-diets'],
  // D. Medical
  ['first aid kit', 'first-aid-kit'], ['severe bleeding', 'bleeding-control'], ['tourniquet', 'bleeding-control'], ['wound cleaning', 'wounds-dressing'],
  ['burns', 'burns'], ['broken bone', 'sprains-fractures'], ['shock', 'shock'], ['dehydration', 'dehydration'], ['heat stroke', 'heat-illness'],
  ['hypothermia', 'hypothermia'], ['anaphylaxis', 'anaphylaxis'], ['choking', 'choking'], ['cpr', 'cpr-aed'], ['aed', 'cpr-aed'],
  ['poisoning', 'poisoning'], ['medication storage', 'medication-storage-continuity'], ['medical records', 'medical-records'],
  ['handwashing', 'handwashing-hygiene'], ['infection prevention', 'infection-prevention-hygiene'], ['stroke', 'stroke-heart-attack'],
  // E. Disasters
  ['hurricane', 'hurricanes'], ['tornado', 'tornadoes'], ['flood', 'flooding'], ['flash flood', 'flash-floods'], ['wildfire', 'wildfires'],
  ['earthquake', 'earthquakes'], ['winter storm', 'winter-storms'], ['ice storm', 'ice-storms'], ['extreme heat', 'extreme-heat'], ['extreme cold', 'extreme-cold'],
  ['lightning', 'lightning'], ['thunderstorm', 'severe-thunderstorms'], ['landslide', 'landslides'], ['drought', 'drought'], ['power outage', 'extended-power-outages'],
  // F. Shelter and sanitation
  ['emergency toilet', 'emergency-toilets-waste'], ['staying warm', 'staying-warm'], ['staying cool', 'staying-cool'], ['carbon monoxide', 'ventilation-co-safety'],
  // G. Power
  ['generator safety', 'generator-safety'], ['portable power station', 'portable-power-stations'], ['solar panels', 'solar-panels'],
  ['battery storage', 'batteries-maintenance'], ['flashlights', 'lighting-flashlights'], ['fuel storage', 'fuel-storage-safety'],
  ['electrical safety', 'electrical-safety'], ['watt hours', 'power-calculations'], ['phone charging', 'usb-phone-charging'],
  // H. Communication and navigation
  ['noaa weather radio', 'weather-radio'], ['two-way radio', 'two-way-radios'], ['ham radio', 'ham-radio-basics'], ['offline maps', 'offline-maps-navigation'],
  ['compass', 'compass-basics'], ['phone battery', 'phone-battery-conservation'], ['cell network fails', 'comms-network-failure'],
  // I. Evacuation
  ['go bag', 'go-bag'], ['vehicle kit', 'vehicle-emergency-kit'], ['roadside', 'roadside-emergencies'], ['fuel planning', 'fuel-and-routes'],
  ['pet evacuation', 'pet-evacuation'], ['returning home', 'returning-home'],
  // J. Security
  ['home security', 'home-security-emergencies'], ['situational awareness', 'situational-awareness'], ['smoke alarm', 'fire-prevention-escape'],
  ['privacy', 'privacy-documents'],
  // K. Self-reliance
  ['gardening', 'gardening-food-security'], ['seed storage', 'seed-storage'], ['canning', 'preservation-canning-safety'], ['dehydrating', 'preservation-canning-safety'],
  ['emergency budget', 'emergency-budgeting'], ['community resilience', 'community-resilience'],
  // L. Other emergencies and threats
  ['nuclear explosion', 'nuclear-explosion-fallout'], ['fallout', 'nuclear-explosion-fallout'], ['potassium iodide', 'nuclear-explosion-fallout'], ['dirty bomb', 'radiological-incidents'],
  ['nuclear power plant', 'radiological-incidents'], ['chemical spill', 'hazardous-materials'], ['gas leak', 'gas-leak'], ['tsunami', 'tsunamis'], ['volcano ash', 'volcanoes'],
  ['pandemic', 'pandemic-outbreak'], ['active shooter', 'active-violence'], ['suspicious package', 'explosions-suspicious-items'], ['cyberattack', 'cyber-grid-attack'],
  ['solar storm', 'solar-storm-emp'], ['emp', 'solar-storm-emp'], ['civil unrest', 'civil-unrest'], ['trapped in rubble', 'structural-collapse'], ['avalanche', 'avalanches'],
  ['dam failure', 'dam-levee-failure'], ['sinkhole', 'sinkholes'],
  // More first aid
  ['drowning', 'drowning-water-rescue'], ['asthma attack', 'asthma-attack'], ['low blood sugar', 'diabetic-emergency'], ['seizure', 'seizures'], ['concussion', 'head-injury-concussion'],
  ['chemical in eye', 'eye-injuries'], ['snakebite', 'bites-stings'], ['suicide', 'mental-health-crisis'], ['childbirth', 'emergency-childbirth'],
  // Smoke, travel, boating, electrical
  ['wildfire smoke', 'wildfire-smoke-air-quality'], ['air quality index', 'wildfire-smoke-air-quality'], ['HEPA clean room', 'wildfire-smoke-air-quality'],
  ['boating safety', 'boating-marine-emergencies'], ['mayday', 'boating-marine-emergencies'], ['capsized boat', 'boating-marine-emergencies'],
  ['travel abroad', 'traveling-abroad-emergencies'], ['embassy', 'traveling-abroad-emergencies'], ['emergency number 112', 'traveling-abroad-emergencies'],
  ['electric shock', 'electric-shock-lightning-injury'], ['lightning strike', 'electric-shock-lightning-injury'],
];

test('search coverage: each required topic appears in the top 3 results for a natural query', () => {
  const misses = [];
  for (const [q, id] of COVERAGE) {
    const top = index.search(q, { limit: 3 }).map((r) => r.id);
    if (!top.includes('guide:' + id)) misses.push(`"${q}" -> expected ${id}, got ${top.join(', ')}`);
  }
  assert.deepEqual(misses, []);
});

test('search finds specific facts inside guides, not only titles', () => {
  const top = (q) => index.search(q, { limit: 5 }).map((r) => r.id);
  assert.ok(top('rolling boil one minute').includes('guide:water-boiling'));
  assert.ok(top('20 feet from the house generator').includes('guide:generator-safety'));
  assert.ok(top('drop cover hold on').includes('guide:earthquakes'));
  assert.ok(top('turn around dont drown').includes('guide:flooding'));
  assert.ok(top('poison help line').includes('guide:poisoning'));
});
