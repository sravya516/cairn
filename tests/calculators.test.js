import test from 'node:test';
import assert from 'node:assert/strict';
import { CALCULATORS, getCalculator, calculatorIds, calculatorDocs } from '../src/calculators/registry.js';
import { validateFields, hoursToText, round, ceil } from '../src/calculators/common.js';
import { loadGuides } from '../scripts/sources-report.mjs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const close = (a, b, tol = 0.01, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
const calc = (id, over = {}) => { const c = getCalculator(id); return c.compute({ ...c.defaults(), ...over }); };

// ---------------------------------------------------------------------------------------------------
test('registry: all seven calculators with assumptions, limitations and unique ids', () => {
  assert.deepEqual(CALCULATORS.map((c) => c.id).sort(), ['battery', 'budget', 'food', 'fuel', 'power', 'storage', 'water']);
  for (const c of CALCULATORS) {
    assert.ok(c.assumptions.length >= 3, `${c.id} assumptions`);
    assert.ok(c.limitations.length >= 2, `${c.id} limitations`);
    assert.ok(c.title && c.summary && c.fields.length);
    assert.ok(c.compute(c.defaults()).ok, `${c.id} defaults must compute`);
  }
  assert.equal(calculatorDocs().length, 7);
});

test('every calculator a guide links to is registered', () => {
  const ids = calculatorIds();
  for (const g of loadGuides(ROOT)) for (const id of g.related.calculators) assert.ok(ids.has(id), `${g.id} -> ${id}`);
});

test('helpers', () => {
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(ceil(2.0000000001), 2);
  assert.equal(ceil(2.1), 3);
  assert.equal(hoursToText(1.5), '1 h 30 min');
  assert.equal(hoursToText(0.25), '15 min');
  assert.equal(hoursToText(72), '3 days');
});

// ---- Water ---------------------------------------------------------------------------------------
test('water: 2 adults + 1 child for 3 days = 9 gallons = 34.07 liters', () => {
  const r = calc('water', { adults: 2, children: 1, days: 3 });
  assert.ok(r.ok);
  close(r.raw.gallons, 9, 0.001);
  close(r.raw.liters, 34.07, 0.01);
  assert.match(r.results[5].value, /^2$/); // 5-gallon containers
});

test('water: pets use 1 oz per lb per day', () => {
  const r = calc('water', { adults: 0, children: 0, pets: 2, petWeight: 64, days: 2 });
  assert.ok(r.ok);
  close(r.raw.gallons, 2 * (64 / 128) * 2, 0.001); // 2 pets x 0.5 gal x 2 days = 2
});

test('water: hot climate (+50%) and higher-needs people and extras add correctly', () => {
  const hot = calc('water', { adults: 2, days: 3, climate: 'hot' });
  close(hot.raw.gallons, 6 * 1.5, 0.001);
  const el = calc('water', { adults: 2, days: 3, elevated: 1 });
  close(el.raw.gallons, 6 + 1.5, 0.001);
  const ex = calc('water', { adults: 1, days: 2, extras: 0.5 });
  close(ex.raw.gallons, 2 + 1, 0.001);
});

test('water: validation errors', () => {
  assert.deepEqual(Object.keys(calc('water', { adults: -1 }).errors), ['adults']);
  assert.ok(calc('water', { adults: 0, children: 0, pets: 0 }).errors.adults);
  assert.ok(calc('water', { adults: 1, elevated: 3 }).errors.elevated);
  assert.ok(calc('water', { days: 0 }).errors.days);
  assert.ok(calc('water', { days: 400 }).errors.days);
  assert.ok(calc('water', { adults: 'abc' }).errors.adults);
  assert.ok(calc('water', { adults: '1.5' }).errors.adults, 'people must be whole numbers');
  assert.ok(calc('water', { adults: '' }).errors.adults);
  assert.ok(calc('water', { perPerson: 0.1 }).errors.perPerson);
  assert.equal(calc('water', { adults: '2', days: '3' }).raw.gallons, 6, 'numeric strings from form fields are accepted');
});

// ---- Food -----------------------------------------------------------------------------------------------
test('food: 2 adults, 3 days at 2,000 kcal = 12,000 kcal, 18 meals, 60/40 split', () => {
  const r = calc('food', { adults: 2, children: 0, days: 3 });
  assert.ok(r.ok);
  assert.equal(r.raw.totalKcal, 12000);
  assert.equal(r.raw.dailyKcal, 4000);
  assert.equal(r.raw.meals, 18);
  close(r.raw.stapleLb, (12000 * 0.6) / 1600, 0.001); // 4.5 lb
  assert.equal(r.raw.readyItems, (12000 * 0.4) / 400); // 12
});

test('food: children, cold weather, breastfeeding and pregnancy adjustments', () => {
  assert.equal(calc('food', { adults: 1, children: 2, days: 1 }).raw.dailyKcal, 2000 + 2800);
  assert.equal(calc('food', { adults: 2, days: 1, activity: '1.25' }).raw.dailyKcal, 5000);
  assert.equal(calc('food', { adults: 2, days: 1, breastfeeding: 1, pregnant: 1 }).raw.dailyKcal, 4000 + 400 + 350);
  assert.ok(calc('food', { adults: 1, breastfeeding: 1, pregnant: 1 }).errors.breastfeeding);
});

test('food: infants alone are allowed but produce a formula note; dietary flags add notes', () => {
  const r = calc('food', { adults: 0, children: 0, infants: 1, days: 3, allergies: true, diabetes: true, glutenFree: true });
  assert.ok(r.ok);
  assert.equal(r.raw.totalKcal, 0);
  const joined = r.notes.join(' ');
  assert.match(joined, /formula/i);
  assert.match(joined, /Allergies/);
  assert.match(joined, /Medical diets/);
  assert.match(joined, /Restricted diets/);
  assert.ok(calc('food', { adults: 0, children: 0, infants: 0 }).errors.adults);
});

// ---- Power ------------------------------------------------------------------------------------------------
test('power: 2 x 100 W for 5 h = 1,000 Wh/day; capacity includes inverter, usable depth and reserve', () => {
  const dev = [{ name: 'Heater fan', watts: 100, hours: 5, qty: 2 }];
  const r = calc('power', { devices: dev, days: 1, reserve: 25, inverterEff: 90, dod: 90, useInverter: true });
  assert.ok(r.ok);
  assert.equal(r.raw.whDay, 1000);
  assert.equal(r.raw.peakW, 200);
  close(r.raw.capacityWh, (1000 / 0.9 / 0.9) * 1.25, 0.01); // 1543.21
  const dc = calc('power', { devices: dev, days: 1, reserve: 25, dod: 90, useInverter: false });
  close(dc.raw.capacityWh, (1000 / 0.9) * 1.25, 0.01);
  const days = calc('power', { devices: dev, days: 3, reserve: 0, dod: 100, useInverter: false });
  assert.equal(days.raw.whTotal, 3000);
  close(days.results[4].value.replace(/[^0-9.]/g, '') * 1, 3000 / 12, 1); // Ah at 12 V
});

test('power: validation of devices', () => {
  const d = (over) => calc('power', { devices: [{ name: 'x', watts: 10, hours: 1, qty: 1, ...over }] });
  assert.ok(d({ hours: 25 }).errors.devices);
  assert.ok(d({ watts: -5 }).errors.devices);
  assert.ok(d({ qty: 0 }).errors.devices);
  assert.ok(d({ qty: 1.5 }).errors.devices);
  assert.ok(d({ watts: 'abc' }).errors.devices);
  assert.ok(d({ watts: 0 }).errors.devices, 'zero energy is not a plan');
  assert.ok(calc('power', { devices: [] }).errors.devices);
  assert.ok(calc('power', { devices: 'nope' }).errors.devices);
  assert.ok(calc('power', { devices: [{ name: 'x', watts: '15', hours: '2', qty: '1' }] }).ok, 'string inputs from the form are fine');
});

test('power: medical device note and peak load note', () => {
  const r = calc('power', { devices: [{ name: 'CPAP', watts: 40, hours: 8, qty: 1 }, { name: 'Heater', watts: 1500, hours: 1, qty: 1 }] });
  assert.match(r.notes.join(' '), /Medical equipment/);
  assert.match(r.notes.join(' '), /1,540 W/);
});

// ---- Battery ------------------------------------------------------------------------------------------------
test('battery: 100 Ah at 12 V, 90% usable, 90% efficient, 100 W -> 9.72 h', () => {
  const r = calc('battery', { capacity: 100, capacityUnit: 'Ah', voltage: 12, loadW: 100, efficiency: 90, dod: 90 });
  assert.ok(r.ok);
  close(r.raw.capWh, 1200, 0.001);
  close(r.raw.usableWh, 1080, 0.001);
  close(r.raw.deliverableWh, 972, 0.001);
  close(r.raw.runtimeH, 9.72, 0.001);
});

test('battery: unit conversions Wh, Ah, mAh', () => {
  close(calc('battery', { capacity: 500, capacityUnit: 'Wh' }).raw.capWh, 500);
  close(calc('battery', { capacity: 10000, capacityUnit: 'mAh', voltage: 3.7 }).raw.capWh, 37, 0.001);
  close(calc('battery', { capacity: 50, capacityUnit: 'Ah', voltage: 24 }).raw.capWh, 1200);
});

test('battery: charging time and capacity needed for a target runtime', () => {
  const r = calc('battery', { capacity: 1200, capacityUnit: 'Wh', chargerW: 100, chargeEff: 85, startPct: 0, loadW: 100, efficiency: 90, dod: 90, targetHours: 24 });
  close(r.raw.chargeH, 1200 / 85, 0.001); // 14.12 h
  close(calc('battery', { capacity: 1200, capacityUnit: 'Wh', chargerW: 100, chargeEff: 85, startPct: 50 }).raw.chargeH, 600 / 85, 0.001);
  close(r.raw.needWh, 2400 / 0.9 / 0.9, 0.01); // 2962.96
  assert.match(r.results.at(-1).note, /short/);
  assert.equal(calc('battery', { targetHours: '' }).raw.needWh, null, 'target runtime is optional');
});

test('battery: validation', () => {
  assert.ok(calc('battery', { capacity: 0 }).errors.capacity);
  assert.ok(calc('battery', { loadW: 0 }).errors.loadW);
  assert.ok(calc('battery', { efficiency: 120 }).errors.efficiency);
  assert.ok(calc('battery', { capacityUnit: 'kWh' }).errors.capacityUnit);
});

// ---- Fuel -------------------------------------------------------------------------------------------------------
test('fuel (US): 150 mi at 25 mpg needs 6 gal; 14-gal tank half full with 20% reserve needs one stop', () => {
  const r = calc('fuel', { units: 'us', distance: 150, economy: 25, tank: 14, currentPct: 50, reservePct: 20 });
  assert.ok(r.ok);
  close(r.raw.needL / 3.785411784, 6, 0.001);
  close(r.raw.toAddL / 3.785411784, 1.8, 0.01, 'to add');
  assert.equal(r.raw.stops, 1);
});

test('fuel (metric): 100 km at 8 L/100 km = 8 L; heavy traffic +30%; idling adds', () => {
  const base = { units: 'metric', distance: 100, economy: 8, tank: 50, currentPct: 100, reservePct: 10 };
  const r = calc('fuel', base);
  close(r.raw.needL, 8, 0.001);
  assert.equal(r.raw.stops, 0);
  close(calc('fuel', { ...base, traffic: '1.3' }).raw.needL, 10.4, 0.001);
  close(calc('fuel', { ...base, conditions: '1.1', traffic: '1.3' }).raw.needL, 8 * 1.3 * 1.1, 0.001);
  close(calc('fuel', { ...base, idleHours: 2, idleRate: 1 }).raw.needL, 10, 0.001);
  close(calc('fuel', { ...base, idleHours: 1, idleRate: '' }).raw.idlingL, 0.3 * 3.785411784, 0.001, 'blank idle rate uses the default');
});

test('fuel: long trips need several stops, reserve of 50% still works, validation', () => {
  const r = calc('fuel', { units: 'metric', distance: 1000, economy: 8, tank: 50, currentPct: 100, reservePct: 20 });
  assert.equal(r.raw.stops, Math.ceil((80 - 40) / 40));
  assert.ok(calc('fuel', { economy: 0 }).errors.economy);
  assert.ok(calc('fuel', { distance: -5 }).errors.distance);
  assert.ok(calc('fuel', { reservePct: 80 }).errors.reservePct);
  assert.ok(calc('fuel', { units: 'imperial' }).errors.units);
});

// ---- Budget -----------------------------------------------------------------------------------------------------
test('budget: 2 adults, 14 days with defaults totals $518.00', () => {
  const r = calc('budget', {});
  assert.ok(r.ok);
  assert.equal(r.raw.water, 35);
  assert.equal(r.raw.food, 168);
  assert.equal(r.raw.medical, 100);
  assert.equal(r.raw.subtotal, 518);
  close(r.raw.monthly, 518 / 12, 0.01);
  assert.equal(calc('budget', { owned: 50 }).raw.net, 259);
  assert.equal(calc('budget', { pets: 2, days: 10, petFoodPrice: 2 }).raw.pets, 40);
});

test('budget: validation and rounding to cents', () => {
  assert.ok(calc('budget', { adults: 0, children: 0, pets: 0 }).errors.adults);
  assert.ok(calc('budget', { owned: 150 }).errors.owned);
  assert.ok(calc('budget', { waterPrice: -1 }).errors.waterPrice);
  assert.match(calc('budget', {}).results[0].value, /^\$518\.00$/);
});

// ---- Storage ----------------------------------------------------------------------------------------------------------
test('storage: 4 people, 14 days -> 56 gal water, 95.2 lb food', () => {
  const r = calc('storage', { people: 4, days: 14 });
  assert.ok(r.ok);
  close(r.raw.waterGal, 56, 0.001);
  close(r.raw.waterCuFt, 56 * 0.133680556 * 1.15, 0.001);
  close(r.raw.foodCuFt, 95.2 * 0.035, 0.001);
  close(r.raw.totalLb, 56 * 8.345 + 95.2, 0.01);
  assert.equal(r.raw.jugs, 12);
  assert.equal(r.raw.totes, 1);
  close(r.raw.totalCuFt, (r.raw.waterCuFt + r.raw.foodCuFt) * 1.2, 0.01);
  assert.ok(calc('storage', { people: 0 }).errors.people);
});

// ---- Cross-calculator properties -------------------------------------------------------------------------
test('monotonic: more people or days never needs less', () => {
  let prev = 0;
  for (let days = 1; days <= 30; days++) { const g = calc('water', { adults: 2, days }).raw.gallons; assert.ok(g > prev); prev = g; }
  prev = 0;
  for (let n = 1; n <= 10; n++) { const k = calc('food', { adults: n, days: 5 }).raw.totalKcal; assert.ok(k > prev); prev = k; }
  prev = 0;
  for (let n = 1; n <= 10; n++) { const v = calc('storage', { people: n }).raw.totalCuFt; assert.ok(v > prev); prev = v; }
});

test('fuzz: random and hostile inputs never throw and never produce NaN or Infinity', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const junk = ['', ' ', 'abc', '1e999', '-1', '0', '1,5', null, undefined, NaN, Infinity, -Infinity, '9'.repeat(40), '<script>', {}, [], true];
  for (const c of CALCULATORS) {
    for (let i = 0; i < 300; i++) {
      const inputs = c.defaults();
      for (const f of c.fields) {
        const roll = rnd();
        if (roll < 0.25) inputs[f.key] = junk[Math.floor(rnd() * junk.length)];
        else if (f.type === 'number') inputs[f.key] = String(((f.min ?? 0) + rnd() * ((f.max ?? 100) - (f.min ?? 0))).toFixed(2));
        else if (f.type === 'select') inputs[f.key] = f.options[Math.floor(rnd() * f.options.length)].value;
        else if (f.type === 'devices') inputs[f.key] = roll < 0.4 ? junk : [{ name: 'x', watts: rnd() * 3000, hours: rnd() * 24, qty: 1 + Math.floor(rnd() * 5) }];
      }
      let out;
      assert.doesNotThrow(() => { out = c.compute(inputs); }, `${c.id} threw`);
      assert.ok(typeof out.ok === 'boolean');
      if (out.ok) {
        for (const [k, v] of Object.entries(out.raw || {})) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${c.id}.${k} = ${v} for ${JSON.stringify(inputs)}`);
        for (const r of out.results) assert.ok(!/NaN|Infinity|undefined/.test(r.value + (r.note || '')), `${c.id}: bad display "${r.value}"`);
      } else assert.ok(Object.keys(out.errors).length > 0);
    }
  }
});

test('validateFields: select options accept numbers and strings equally', () => {
  const f = [{ key: 'v', type: 'select', default: 12, options: [{ value: 12, label: '12' }, { value: 24, label: '24' }] }];
  assert.deepEqual(validateFields(f, { v: '24' }).values, { v: 24 });
  assert.equal(validateFields(f, { v: '5' }).ok, false);
});

import { restoreInputs } from '../src/calculators/common.js';

test('restoreInputs: valid saved values come back, damaged ones fall back to defaults and never throw', () => {
  const water = getCalculator('water'), power = getCalculator('power');
  assert.equal(restoreInputs(water, { adults: '3', days: 5, climate: 'hot' }).adults, '3');
  assert.equal(restoreInputs(water, { adults: '3', days: 5, climate: 'hot' }).days, 5);
  assert.deepEqual(restoreInputs(water, { adults: { x: 1 }, days: [], climate: null }), water.defaults(), 'wrong kinds are ignored');
  for (const junk of [null, undefined, 5, 'x', [], [1, 2], true]) assert.deepEqual(restoreInputs(water, junk), water.defaults());
  const p = restoreInputs(power, { devices: [null, 5, 'x'] });
  assert.deepEqual(p.devices, power.defaults().devices, 'a damaged device list is replaced by the default list');
  const ok = restoreInputs(power, { devices: [{ name: 'Fan', watts: 40, hours: '8', qty: 1, extra: 'drop me' }] });
  assert.deepEqual(ok.devices, [{ name: 'Fan', watts: 40, hours: '8', qty: 1 }]);
  assert.equal(restoreInputs(power, { devices: Array.from({ length: 41 }, () => ({})) }).devices.length, power.defaults().devices.length, 'oversized lists are ignored');
  assert.equal(restoreInputs(water, JSON.parse('{"__proto__":{"adults":"9"},"adults":"2"}')).adults, '2');
  assert.equal(restoreInputs(water, { adults: 'x'.repeat(500) }).adults.length, 40);
});

test('restoreInputs output always computes without throwing, even from hostile saved data', () => {
  const junk = [null, 5, 'x', [], {}, [null], [{}], { watts: {} }, NaN, Infinity, '<b>', true];
  for (const c of CALCULATORS) {
    for (const j of junk) {
      const saved = Object.fromEntries(c.fields.map((f) => [f.key, j]));
      assert.doesNotThrow(() => c.compute(restoreInputs(c, saved)), `${c.id} with ${JSON.stringify(j)}`);
    }
  }
});
