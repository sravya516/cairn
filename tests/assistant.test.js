// Tests for the offline "Ask Cairn" assistant: intents, retrieval accuracy on a realistic question set, safety behavior and robustness.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadGuides, loadCards } from '../scripts/sources-report.mjs';
import { indexContent, guideText } from '../src/services/content.js';
import { createAssistant, questionKind } from '../src/services/assistant/answer.js';
import { EMERGENCY_RULES, emergencyIntent, medicineGuard, calcIntent, metaIntent } from '../src/services/assistant/intents.js';
import { terms } from '../src/services/assistant/passages.js';
import { CALCULATORS } from '../src/calculators/registry.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/meta.json'), 'utf8'));
const guides = loadGuides(ROOT);
for (const g of guides) g.updated = meta.contentDate;
const cards = loadCards(ROOT);
const checklists = fs.readdirSync(path.join(ROOT, 'src/data/checklists')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/checklists', f), 'utf8')));
const content = indexContent({ meta, guides, checklists, emergency: cards });
const assistant = createAssistant({ content, calculators: CALCULATORS });

// ------------------------------------------------------------------------------------------------------------------
// Evaluation set. Each row: [question, expectation]. Expectation kinds:
//   { href: [..], fact: /regex/ }   passages: one of the hrefs in the top 3, and the fact somewhere in the top 3 texts
//   { type: 'emergency', card }     { type: 'guard' } { type: 'none' } { type: 'calc', calc, fact } { type: 'greeting' | 'help' }
const G = (id) => `#/guide/${id}`, C = (id) => `#/emergency/${id}`, L = (id) => `#/checklist/${id}`;
const EVAL = [
  // water
  ['How long should I boil water?', { href: [G('water-boiling')], fact: /1 minute/ }],
  ['how much bleach do I put in a gallon of water', { href: [G('water-disinfection')], fact: /8 drops/ }],
  ["what's the difference between filtering and purifying water", { href: [G('water-treatment-overview')], fact: /filter/i }],
  ['is flood water safe to drink', { href: [G('unsafe-water-sources'), G('flooding')], fact: /floodwater|flood/i }],
  ['how often should I replace stored water', { href: [G('water-storage'), G('safe-water-handling')], fact: /six months/ }],
  ['what containers can I store water in', { href: [G('water-storage-containers')], fact: /food-grade/i }],
  ['can I drink rain water', { href: [G('water-collection')], fact: /rain/i }],
  ['how do I purifiy water', { href: [G('water-treatment-overview'), G('water-disinfection'), G('water-boiling')], fact: /boil|disinfect|filter/i }],
  // food
  ['how long does food last in the fridge during a power outage', { href: [G('food-safety-outage'), G('refrigeration-outages')], fact: /4 hours/ }],
  ['can I use a camp stove indoors', { href: [G('cooking-no-power'), G('ventilation-co-safety'), C('power-outage')], fact: /outdoors|never|indoors/i }],
  ['what foods should I store for an emergency', { href: [G('food-storage-basics'), G('pantry-staples'), L('food-storage')], fact: /canned|rice|shelf-stable/i }],
  ['how long does white rice last', { href: [G('pantry-staples')], fact: /rice/i }],
  ['what can I feed my baby formula water', { href: [G('food-children')], fact: /formula/i }],
  ['how do I rotate my food supply', { href: [G('food-rotation')], fact: /rotat|oldest|first in|FIFO/i }],
  // medical
  ['How do I do CPR?', { href: [C('cpr'), G('cpr-aed')], card: 'cpr', fact: /100 to 120/ }],
  ['how deep should chest compressions be', { href: [G('cpr-aed'), C('cpr')], fact: /2 inches/ }],
  ['how long should I cool a burn', { href: [G('burns'), C('burns')], fact: /10 minutes/ }],
  ['what is anaphylaxis', { href: [G('anaphylaxis'), C('anaphylaxis')], fact: /anaphylaxis|epinephrine/i }],
  ['how do I treat hypothermia', { href: [G('hypothermia'), C('cold')], card: 'cold', fact: /warm/i }],
  ['what are the signs of dehydration', { href: [G('dehydration')], fact: /thirst|dry mouth/i }],
  ['how do I clean a wound', { href: [G('wounds-dressing')], fact: /rinse|wash/i }],
  ['what goes in a first aid kit', { href: [G('first-aid-kit'), L('first-aid-kit')], fact: /gauze|bandage/i }],
  ['what is the poison control number', { href: [G('poisoning'), C('poisoning')], fact: /1-800-222-1222/ }],
  ['symptoms of carbon monoxide poisoning', { href: [G('ventilation-co-safety'), G('poisoning'), C('carbon-monoxide')], fact: /headache/i }],
  ['how do I do the heimlich maneuver', { href: [G('choking'), C('choking')], fact: /abdominal thrusts|back blows/i }],
  ['what should I do for a sprained ankle', { href: [G('sprains-fractures')], fact: /cold|compression|rest/i }],
  ['how do I treat shock', { href: [G('shock'), C('bleeding')], fact: /legs|warm/i }],
  ['what is heat exhaustion', { href: [G('heat-illness'), C('heat')], fact: /heat/i }],
  // disasters
  ['What should I do during a tornado warning?', { href: [C('tornado'), G('tornadoes')], card: 'tornado', fact: /lowest|interior|basement/i }],
  ['how do I prepare for a hurricane', { href: [G('hurricanes'), L('hurricane')], fact: /evacuation zone/i }],
  ['when should I evacuate for a hurricane', { href: [G('hurricanes'), C('hurricane')], fact: /evacuat/i }],
  ['is it safe to drive through flood water', { href: [G('flooding'), G('flash-floods'), C('flood')], fact: /turn around|drive|6 inches|six inches/i }],
  ['how do I stay safe from lightning', { href: [G('lightning'), C('lightning')], fact: /thunder/i }],
  ['how do I stay cool in a heat wave', { href: [G('staying-cool'), G('extreme-heat')], fact: /cool|water/i }],
  ['what is a tsunami warning', { href: [G('tsunamis'), C('tsunami')], fact: /tsunami/i }],
  ['earthquack safety', { href: [G('earthquakes'), C('earthquake')], fact: /drop|cover/i }],
  ['what are the warning signs of a landslide', { href: [G('landslides')], fact: /crack/i }],
  ['tornedo warning what do i do', { href: [C('tornado'), G('tornadoes')], fact: /shelter|basement|interior|lowest/i }],
  ['how do I prepare for a wildfire', { href: [G('wildfires'), L('wildfire')], fact: /defensible|vegetation|go-bag|evacuat/i }],
  ['what is an ice storm', { href: [G('ice-storms')], fact: /ice|freezing rain/i }],
  // power and communication
  ['how far from the house should a generator be', { href: [G('generator-safety'), G('ventilation-co-safety'), C('power-outage')], fact: /20 feet/ }],
  ['how do I charge my phone without power', { href: [G('usb-phone-charging'), G('phone-battery-conservation')], fact: /power bank|solar|car/i }],
  ['what is NOAA weather radio', { href: [G('weather-radio')], fact: /weather/i }],
  ['does GPS work without internet', { href: [G('offline-maps-navigation')], fact: /GPS/ }],
  ['how do I save my phone battery', { href: [G('phone-battery-conservation')], fact: /low power|airplane|brightness/i }],
  ['what is ham radio', { href: [G('ham-radio-basics')], fact: /amateur|license/i }],
  ['how do I keep my fridge cold in a blackout', { href: [G('refrigeration-outages'), G('food-safety-outage')], fact: /closed|cooler|ice/i }],
  ['what size power station do I need', { href: [G('portable-power-stations'), G('power-calculations'), G('solar-panels')], fact: /Wh|watt/i }],
  // general and evacuation
  ['what should be in a go bag', { href: [G('go-bag'), L('gobag-individual')], fact: /water|food|documents|first-aid/i }],
  ['how do I make a family emergency plan', { href: [G('family-emergency-plan')], fact: /meeting|contact|plan/i }],
  ['what documents do I need in an emergency', { href: [G('emergency-documents')], fact: /passport|insurance|identification|ID/i }],
  ['how do I prepare my pets for a disaster', { href: [G('pet-preparedness'), L('pet-kit'), G('pet-evacuation')], fact: /pet|microchip|carrier/i }],
  ['how do I prepare for 72 hours without help', { href: [G('prepare-72-hours'), L('kit-72h')], fact: /water|food|72/i }],
  ['where should my family meet if we get separated', { href: [G('meeting-locations'), G('family-emergency-plan')], fact: /meeting|meet/i }],
  ['what to do after a flood when I go home', { href: [G('returning-home'), G('flooding')], fact: /wait|official|safe/i }],
  ['how do I build an emergency toilet', { href: [G('emergency-toilets-waste')], fact: /bucket/i }],
  ['what should be in my car emergency kit', { href: [G('vehicle-emergency-kit'), L('vehicle-kit')], fact: /jumper|blanket|water/i }],
  // threats
  ['what is fallout', { href: [G('nuclear-explosion-fallout')], fact: /fallout|radioactive/i }],
  ['should I take potassium iodide', { href: [G('nuclear-explosion-fallout'), G('radiological-incidents')], fact: /officials/i }],
  ['what is a dirty bomb', { href: [G('radiological-incidents')], fact: /dirty bomb|radiological dispersal/i }],
  ['what is a pandemic', { href: [G('pandemic-outbreak')], fact: /pandemic|outbreak/i }],
  ['how do I protect myself from wildfire smoke', { href: [G('wildfire-smoke-air-quality'), C('smoke')], fact: /N95/ }],
  ['what is the emergency number in europe', { href: [G('traveling-abroad-emergencies'), C('abroad')], fact: /112/ }],
  ['what should I do if my boat capsizes', { href: [G('boating-marine-emergencies'), C('boating')], fact: /stay with the boat/i }],
  ['what is an EMP', { href: [G('solar-storm-emp')], fact: /electromagnetic pulse/i }],
  ['what is a sinkhole', { href: [G('sinkholes')], fact: /sinkhole/i }],
  ['what is a solar storm', { href: [G('solar-storm-emp')], fact: /geomagnetic|Sun/i }],
  ['how do I avoid being a victim of scams after a disaster', { href: [G('privacy-documents'), G('cyber-grid-attack'), G('community-resilience')], fact: /scam/i }],
  ['what to do if electrocuted', { href: [G('electric-shock-lightning-injury'), C('electric-shock')], fact: /power|911/i }],
  // emergency triage (rules)
  ['my friend is unconscious and not breathing', { type: 'emergency', card: 'cpr' }],
  ['bleeding wont stop help', { type: 'emergency', card: 'bleeding' }],
  ['I think my husband is having a heart attack', { type: 'emergency', card: 'stroke-heart' }],
  ['my child swallowed bleach', { type: 'emergency', card: 'poisoning' }],
  ['the baby is not breathing', { type: 'emergency', card: 'cpr' }],
  ['theres a fire in my kitchen', { type: 'emergency', card: 'house-fire' }],
  ['i smell gas in the house', { type: 'emergency', card: 'gas-leak' }],
  ['someone is choking', { type: 'emergency', card: 'choking' }],
  ['he is having a seizure', { type: 'emergency', card: 'seizure' }],
  ['active shooter in the building', { type: 'emergency', card: 'active-violence' }],
  ['what do I do after a nuclear explosion', { type: 'emergency', card: 'nuclear' }],
  ['a chemical spill near my house', { type: 'emergency', card: 'hazmat' }],
  ['my dog was bitten by a snake', { type: 'emergency', card: 'bites' }],
  ['she is in labor and the baby is coming', { type: 'emergency', card: 'childbirth' }],
  // calculators
  ['how much water for a family of 4 for a week', { type: 'calc', calc: 'water', fact: /28 gallons/ }],
  ['how much water do I need for 2 adults and 2 kids for 3 days', { type: 'calc', calc: 'water', fact: /12 gallons/ }],
  ['how many calories for 2 adults for 3 days', { type: 'calc', calc: 'food', fact: /12,000/ }],
  ['how long will a 500 Wh battery run a 50 W fridge', { type: 'calc', calc: 'battery', fact: /8 h 6 min/ }],
  ['how long will a 100 Ah battery run a 100 W load', { type: 'calc', calc: 'battery', fact: /9 h 43 min/ }],
  // medicine guard: never answer doses
  ['how many mg of ibuprofen can I give my 5 year old', { type: 'guard' }],
  ['what is the dose of epinephrine', { type: 'guard' }],
  ['can I give my dog benadryl', { type: 'guard' }],
  ['how much aspirin should I take for a heart attack', { type: 'guard' }],
  // out of scope: say so
  ['what is the capital of France', { type: 'none' }],
  ['who won the world cup', { type: 'none' }],
  ['write me a poem about love', { type: 'none' }],
  ['asdf qwer zxcv', { type: 'none' }],
  ['what is the best pizza topping', { type: 'none' }],
  ['how do I invest in bitcoin', { type: 'none' }],
  // small talk
  ['hi', { type: 'greeting' }], ['help', { type: 'help' }], ['what can you do?', { type: 'help' }],
];

const texts = (r) => (r.results || []).flatMap((x) => x.items).join('\n');
function judge(question, exp) {
  const r = assistant.ask(question);
  if (exp.type) {
    if (r.type !== exp.type) return { ok: false, why: `type ${r.type}, expected ${exp.type}` };
    if (exp.type === 'emergency' && !r.cards.some((c) => c.id === exp.card)) return { ok: false, why: `cards ${r.cards.map((c) => c.id)}, expected ${exp.card}` };
    if (exp.type === 'calc' && (r.calcId !== exp.calc || !exp.fact.test(r.lines.map((l) => l.value + ' ' + l.note).join(' ')))) return { ok: false, why: `calc ${r.calcId}: ${r.lines.map((l) => l.value)}` };
    return { ok: true };
  }
  if (r.type === 'emergency' && exp.card && r.cards.some((c) => c.id === exp.card)) return { ok: true, hit1: true, hit3: true, fact: true, why: 'emergency card' };
  if (r.type !== 'passages') return { ok: false, why: `type ${r.type}, expected passages` };
  const top3 = r.results.map((x) => x.href);
  const hit1 = exp.href.includes(top3[0]);
  const hit3 = top3.some((h) => exp.href.includes(h));
  const fact = exp.fact.test(texts(r));
  return { ok: hit3 && fact, hit1, hit3, fact, why: `top3 ${top3.join(' ')} | hit3 ${hit3} fact ${fact}` };
}

test('evaluation set: every rule-based expectation (emergency, calc, guard, none, greeting) passes exactly', () => {
  const misses = [];
  for (const [q, exp] of EVAL.filter(([, e]) => e.type)) { const j = judge(q, exp); if (!j.ok) misses.push(`"${q}" -> ${j.why}`); }
  assert.deepEqual(misses, []);
});

test('evaluation set: retrieval accuracy on realistic natural-language questions', () => {
  const rows = EVAL.filter(([, e]) => !e.type).map(([q, e]) => ({ q, ...judge(q, e) }));
  const n = rows.length;
  const top1 = rows.filter((r) => r.hit1).length, top3 = rows.filter((r) => r.hit3).length, ok = rows.filter((r) => r.ok).length;
  console.log(`# assistant retrieval: ${n} questions | right guide first ${top1}/${n} | in top 3 ${top3}/${n} | right guide AND key fact shown ${ok}/${n}`);
  const misses = rows.filter((r) => !r.ok).map((r) => `"${r.q}" -> ${r.why}`);
  if (misses.length) console.log('# misses:\n#   ' + misses.join('\n#   '));
  assert.ok(top3 / n >= 0.9, `right guide in top 3 only ${top3}/${n}`);
  assert.ok(ok / n >= 0.85, `guide plus fact only ${ok}/${n}`);
  assert.ok(top1 / n >= 0.65, `right guide first only ${top1}/${n}`);
});

// ------------------------------------------------------------------------------------------------------------------
test('every emergency card referenced by the triage rules exists', () => {
  const ids = new Set(cards.map((c) => c.id));
  for (const r of EMERGENCY_RULES) for (const c of r.cards) assert.ok(ids.has(c), `rule references missing card ${c}`);
});

test('medicine guard blocks dose questions but not water treatment, storage or how-to questions', () => {
  for (const q of ['how many mg of tylenol can a toddler have', 'dosage for amoxicillin', 'can I take ibuprofen with aspirin', 'is it safe to give my cat pain relievers', 'how much insulin should I take', 'what dose of narcan']) assert.equal(medicineGuard(q), true, q);
  for (const q of ['how many drops of bleach per gallon', 'how do I store insulin when the power is out', 'how much water should I store', 'how do I use an epipen', 'what is in a first aid kit', 'how long do medications last in a hot car', 'what is the dose of radiation']) assert.equal(medicineGuard(q), q === 'what is the dose of radiation', q);
});

test('guard answers never include passages or numbers, and always point to safe help', () => {
  const r = assistant.ask('how many mg of ibuprofen can I give my 5 year old');
  assert.equal(r.type, 'guard');
  assert.ok(!('results' in r));
  assert.ok(r.links.length >= 2);
});

test('emergency answers lead with the matching card, including steps and a full-guide link', () => {
  const r = assistant.ask('someone is choking');
  assert.equal(r.type, 'emergency');
  assert.equal(r.cards[0].id, 'choking');
  assert.ok(r.cards[0].steps.length >= 4 && r.cards[0].guideHref);
});

test('stroke vs heat stroke are not confused', () => {
  assert.equal(emergencyIntent('heat stroke symptoms').cards.includes('stroke-heart'), false);
  assert.ok(emergencyIntent('heat stroke symptoms').cards.includes('heat'));
  assert.ok(emergencyIntent('I think he is having a stroke').cards.includes('stroke-heart'));
});

test('calculator questions parse numbers and state their assumptions', () => {
  assert.deepEqual(calcIntent('how much water for 4 people for 5 days').inputs, { adults: 4, children: 0, pets: 0, days: 5 });
  assert.deepEqual(calcIntent('how much water for a family of three for two weeks').inputs, { adults: 3, children: 0, pets: 0, days: 14 });
  assert.deepEqual(calcIntent('how much water for 2 adults 1 child and 2 dogs for 10 days').inputs, { adults: 2, children: 1, pets: 2, days: 10 });
  assert.deepEqual(calcIntent('how much water do I need for 3 days').assumed, ['1 adult']);
  assert.deepEqual(calcIntent('how much water for 3 people').assumed, ['3 days']);
  assert.equal(calcIntent('how much water should I store'), null, 'no numbers: the guides answer it');
  assert.equal(calcIntent('how many drops of bleach per gallon of water for 3 days'), null);
  const b = calcIntent('how long will a 2 kWh battery run a 100 W heater');
  assert.equal(b.inputs.capacity, 2000);
  const mah = calcIntent('how long will a 10000 mAh power bank run a 5 W light');
  assert.equal(mah.inputs.capacityUnit, 'mAh');
  assert.ok(mah.assumed.length);
});

test('calculator answers match the calculator exactly', () => {
  const r = assistant.ask('how much water for a family of 4 for a week');
  const direct = CALCULATORS.find((c) => c.id === 'water').compute({ ...CALCULATORS.find((c) => c.id === 'water').defaults(), adults: 4, days: 7 });
  assert.equal(r.lines[0].value, direct.results[0].value);
  assert.equal(r.href, '#/calc/water');
});

test('question kinds are detected', () => {
  assert.deepEqual(questionKind('What do I do in an earthquake?'), ['action']);
  assert.ok(questionKind('what is a tsunami').includes('define'));
  assert.ok(questionKind('how long to boil water').includes('quantity'));
  assert.ok(questionKind('what supplies do I need').includes('supplies'));
  assert.ok(questionKind('signs of a stroke').includes('signs'));
  assert.deepEqual(questionKind('tornado'), []);
});

test('answers are extractive: every returned line exists, word for word, in the app content', () => {
  const corpus = new Set();
  for (const g of guides) for (const s of g.sections) for (const b of s.blocks) for (const it of Array.isArray(b.v) ? b.v : [b.v]) corpus.add(it.replace(/\*\*/g, '').trim());
  for (const g of guides) corpus.add(g.summary);
  for (const c of cards) { corpus.add(c.summary); c.steps.forEach((x) => corpus.add(x)); (c.dont || []).forEach((x) => corpus.add(x)); (c.warn || []).forEach((x) => corpus.add(x)); }
  const check = (line) => corpus.has(line.replace(/ …$/, '')) || [...corpus].some((c) => line.replace(/ …$/, '').length > 20 && c.startsWith(line.replace(/ …$/, '').trim()));
  let checked = 0;
  for (const [q, e] of EVAL.filter(([, x]) => !x.type)) {
    const r = assistant.ask(q);
    if (r.type !== 'passages') continue;
    for (const p of r.results) {
      if (p.kind === 'checklist') continue; // checklist lines are composed from name, description and quantity
      for (const line of p.items) { assert.ok(check(line), `"${q}" returned text not found in the content: ${line.slice(0, 80)}`); checked++; }
    }
  }
  assert.ok(checked > 150);
});

test('results always carry their source: guide, section, link, sources and date', () => {
  const r = assistant.ask('how long should I boil water');
  const p = r.results[0];
  assert.ok(p.title && p.heading && p.href.startsWith('#/') && p.sources.length && p.updated);
  assert.deepEqual(p.sources.includes('Centers for Disease Control and Prevention'), true);
});

test('questions with no real answer say so instead of guessing, and never return passages', () => {
  for (const q of ['what is the capital of France', 'asdf qwer', '🙂🙂🙂', 'the', '...', '12345']) {
    const r = assistant.ask(q);
    assert.ok(['none', 'help', 'greeting'].includes(r.type), `${q} -> ${r.type}`);
    assert.ok(!r.results);
  }
});

test('robust to hostile and odd input: no throw, no NaN, bounded output', () => {
  const nasty = ['', '   ', null, undefined, 5, {}, [], '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', '(((([[[', '\\', '.*+?^${}()|[]\\', 'a'.repeat(100000), 'water '.repeat(5000), '\u0000\u0007', 'ñandú café', '💧 water 💧', 'javascript:alert(1)', '../../etc/passwd', 'DROP TABLE users;'];
  for (const q of nasty) {
    let r;
    assert.doesNotThrow(() => { r = assistant.ask(q); }, String(q).slice(0, 30));
    assert.ok(typeof r.type === 'string');
    const json = JSON.stringify(r);
    assert.ok(!/NaN|undefined|Infinity/.test(json), `bad value in answer to ${String(q).slice(0, 30)}`);
    assert.ok(json.length < 60000);
    if (r.results) assert.ok(r.results.length <= 3 && r.results.every((p) => p.items.length <= 8));
  }
});

test('performance: index builds quickly and questions answer in well under 50 ms', () => {
  const t0 = performance.now();
  const a = createAssistant({ content, calculators: CALCULATORS });
  const build = performance.now() - t0;
  const qs = EVAL.map(([q]) => q);
  const t1 = performance.now();
  for (const q of qs) a.ask(q);
  const avg = (performance.now() - t1) / qs.length;
  console.log(`# assistant: ${a.stats.blocks} passages, ${a.stats.terms} terms, built in ${build.toFixed(0)} ms, ${avg.toFixed(1)} ms per question`);
  assert.ok(build < 1500, `index build ${build}ms`);
  assert.ok(avg < 50, `avg ${avg}ms per question`);
});

test('terms(): content words only, stemmed', () => {
  assert.deepEqual(terms('How long do I boil the water?'), ['boil', 'water']);
  assert.ok(!terms('what should I do').length);
});

test('metaIntent', () => {
  assert.equal(metaIntent('Hello!'), 'greeting');
  assert.equal(metaIntent('hello how do I boil water'), null);
  assert.equal(metaIntent('help'), 'help');
});

test('starter questions are answerable (not "none")', () => {
  for (const s of assistant.starterQuestions()) assert.notEqual(assistant.ask(s.ask).type, 'none', s.ask);
});

test('every link the assistant can return points at a real guide, card, checklist or calculator', () => {
  const ok = (href) => {
    const m = /^#\/(guide|emergency|checklist|calc)\/([^/?]+)$/.exec(href);
    if (!m) return false;
    const [, kind, id] = m;
    return kind === 'guide' ? content.guideById.has(id) : kind === 'emergency' ? content.emergencyById.has(id) : kind === 'checklist' ? content.checklistById.has(id) : CALCULATORS.some((c) => c.id === id);
  };
  const bad = [];
  const questions = [...EVAL.map(([q]) => q), ...assistant.starterQuestions().map((s) => s.ask), 'weather tomorrow', 'how many mg of ibuprofen', 'someone is choking'];
  for (const q of questions) {
    const r = assistant.ask(q);
    const hrefs = [...(r.results || []).flatMap((x) => [x.href, x.guideHref]), ...(r.cards || []).flatMap((c) => [c.href, c.guideHref]), ...(r.links || []).map((l) => l.href), ...(r.suggestions || []).map((s) => s.href), r.href].filter(Boolean);
    for (const href of hrefs) if (!ok(href)) bad.push(`${q} -> ${href}`);
  }
  assert.deepEqual(bad, []);
});

test('live-data questions are declined with a pointer to the weather radio guide, not matched to it as an answer', () => {
  for (const q of ['what is the weather tomorrow', 'weather forecast for this weekend', 'what time is it', 'who is the president', 'latest news headlines']) {
    const r = assistant.ask(q);
    assert.equal(r.type, 'none', q);
    assert.equal(r.live, true, q);
  }
  // but preparedness questions that merely contain the word "weather" still get answers
  assert.equal(assistant.ask('how do I stay safe in cold weather').type, 'passages');
  assert.equal(assistant.ask('what is a weather radio').type, 'passages');
});

test('word forms: superlatives and compound words still find the topic', () => {
  const hrefs = (q) => (assistant.ask(q).results || []).map((x) => x.href);
  assert.ok(hrefs('safest room during a tornado').some((h) => h.includes('tornado')));
  assert.ok(hrefs('stranded in a snowstorm in my car').some((h) => /roadside|winter/.test(h)));
});

test('medium-confidence answers say which question words they could not match', () => {
  const r = assistant.ask('how do I fix my car engine');
  if (r.type === 'passages') { assert.equal(r.confidence, 'medium'); assert.ok(r.missing.length > 0); }
  for (const q of ['how do I treat a burn', 'how long to boil water']) {
    const a = assistant.ask(q);
    assert.equal(a.type, 'passages');
    assert.ok(Array.isArray(a.missing));
  }
});

test('"make water safe to drink" is understood as treating water (the first starter question must give a treatment answer)', () => {
  const r = assistant.ask('How do I make water safe to drink?');
  assert.equal(r.type, 'passages');
  const ok = /water-(treatment-overview|boiling|disinfection|filters|filtration)|unsafe-water-sources|emergency\/water/;
  assert.ok(ok.test(r.results[0].href), r.results[0].href);
});
