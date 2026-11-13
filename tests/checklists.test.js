import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Store, createMemoryBackend } from '../src/services/storage/db.js';
import {
  slug, baseItems, itemsWithState, emptyState, isValidState, makeCustomItem, setDone, setNote, addCustom, removeCustom,
  resetChecks, progress, overallProgress, loadState, saveState, loadAllStates, PREPAREDNESS_GROUPS, LIMITS,
} from '../src/services/checklists.js';
import { loadGuides } from '../scripts/sources-report.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const dir = path.join(ROOT, 'src/data/checklists');
const checklists = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

const REQUIRED = ['kit-72h', 'kit-2w', 'kit-30d', 'gobag-individual', 'gobag-family', 'vehicle-kit', 'first-aid-kit', 'water-storage', 'food-storage', 'power-backup', 'comms-kit', 'pet-kit', 'evacuation', 'shelter-in-place', 'hurricane', 'tornado', 'flood', 'wildfire', 'winter-storm', 'power-outage', 'recovery'];

test('all 21 required checklists exist', () => {
  assert.deepEqual(checklists.map((c) => c.id).sort(), [...REQUIRED].sort());
});

test('every item has a name, description-or-empty, quantity and valid priority; no duplicates', () => {
  for (const c of checklists) {
    assert.ok(c.title && c.description && c.group && c.tags.length, c.id);
    assert.ok(c.items.length >= 10, `${c.id} has only ${c.items.length} items`);
    const keys = new Set();
    for (const it of c.items) {
      assert.equal(it.length, 4, `${c.id}: item shape`);
      const [name, desc, qty, pri] = it;
      assert.ok(typeof name === 'string' && name.length > 2 && name.length <= LIMITS.name, `${c.id}: bad name`);
      assert.equal(typeof desc, 'string');
      assert.ok(qty && qty.length <= LIMITS.qty + 20, `${c.id}/${name}: quantity needed`);
      assert.ok(['critical', 'high', 'normal'].includes(pri), `${c.id}/${name}: priority`);
      const k = slug(name);
      assert.ok(k && !keys.has(k), `${c.id}: duplicate or empty item key "${k}"`);
      keys.add(k);
    }
    assert.ok(c.items.some((i) => i[3] === 'critical'), `${c.id} should flag at least one critical item`);
  }
});

test('no placeholder text and no medication doses in checklists', () => {
  const text = JSON.stringify(checklists);
  assert.ok(!/\b(lorem|todo|tbd|coming soon|placeholder)\b/i.test(text));
  assert.ok(!/\b\d+(\.\d+)?\s?(mg|mcg|ml|mL|units?)\b/.test(text));
});

test('every checklist or calculator a guide links to actually exists', () => {
  const ids = new Set(checklists.map((c) => c.id));
  for (const g of loadGuides(ROOT)) for (const id of g.related.checklists) assert.ok(ids.has(id), `${g.id} -> ${id}`);
});

test('slug is stable and safe', () => {
  assert.equal(slug('Drinking water!'), 'drinking-water');
  assert.equal(slug('  Radio (NOAA)  '), 'radio-noaa');
  assert.equal(slug('Café Crème'), 'cafe-creme');
  assert.ok(slug('x'.repeat(200)).length <= 60);
});

const kit = { id: 't', group: 'Kits & bags', items: [['Water', 'd', '3 gal', 'critical'], ['Radio', '', '1', 'high'], ['Games', '', '1', 'normal']] };

test('toggling items updates progress and never mutates the old state', () => {
  const s0 = emptyState();
  const water = baseItems(kit)[0];
  const s1 = setDone(s0, water, true);
  assert.deepEqual(s0.checked, {});
  assert.equal(progress(kit, s1).done, 1);
  assert.equal(progress(kit, s1).pct, 33);
  assert.deepEqual([progress(kit, s1).criticalDone, progress(kit, s1).criticalTotal], [1, 1]);
  assert.equal(progress(kit, setDone(s1, water, false)).done, 0);
});

test('notes: set, trim to limit, clear', () => {
  const radio = baseItems(kit)[1];
  let s = setNote(emptyState(), radio, 'Spare batteries in drawer');
  assert.equal(itemsWithState(kit, s)[1].note, 'Spare batteries in drawer');
  s = setNote(s, radio, 'x'.repeat(LIMITS.note + 50));
  assert.equal(s.notes[radio.key].length, LIMITS.note);
  s = setNote(s, radio, '');
  assert.ok(!(radio.key in s.notes));
});

test('custom items: validation, counting in progress, check, note, delete', () => {
  assert.equal(makeCustomItem({ name: '   ' }).ok, false);
  assert.equal(makeCustomItem({ name: 'x'.repeat(LIMITS.name + 1) }).ok, false);
  assert.equal(makeCustomItem({ name: 'ok', priority: 'urgent' }).ok, false);
  const r = makeCustomItem({ name: '  Spare glasses ', qty: '2 pairs', priority: 'critical' }, () => 'id1');
  assert.ok(r.ok);
  let s = addCustom(emptyState(), r.item);
  assert.equal(progress(kit, s).total, 4);
  assert.equal(progress(kit, s).criticalTotal, 2);
  const it = itemsWithState(kit, s).find((i) => i.custom);
  s = setDone(s, it, true);
  s = setNote(s, it, 'in car');
  assert.equal(progress(kit, s).done, 1);
  assert.equal(itemsWithState(kit, s).find((i) => i.custom).note, 'in car');
  assert.equal(progress(kit, removeCustom(s, 'id1')).total, 3);
});

test('custom item count is capped', () => {
  let s = emptyState();
  for (let i = 0; i < LIMITS.custom + 5; i++) s = addCustom(s, makeCustomItem({ name: 'n' + i }, () => 'i' + i).item);
  assert.equal(s.custom.length, LIMITS.custom);
});

test('resetChecks clears checks but keeps notes and custom items', () => {
  const water = baseItems(kit)[0];
  let s = setNote(setDone(emptyState(), water, true), water, 'keep me');
  s = addCustom(s, makeCustomItem({ name: 'Mine' }, () => 'm').item);
  s = setDone(s, itemsWithState(kit, s).find((i) => i.custom), true);
  const r = resetChecks(s);
  assert.equal(progress(kit, r).done, 0);
  assert.equal(r.notes[water.key], 'keep me');
  assert.equal(r.custom.length, 1);
});

test('progress survives content edits: removed items are ignored, new ones start unchecked', () => {
  const s = setDone(emptyState(), { key: 'water', custom: false }, true);
  s.checked['item-that-was-deleted'] = true;
  const p = progress(kit, s);
  assert.equal(p.done, 1);
  assert.equal(p.total, 3);
});

test('overall progress aggregates and can be limited to groups', () => {
  const a = { id: 'a', group: 'Kits & bags', items: [['A1', '', '1', 'critical'], ['A2', '', '1', 'normal']] };
  const b = { id: 'b', group: 'Plans & hazards', items: [['B1', '', '1', 'normal']] };
  const states = { a: setDone(emptyState(), { key: 'a1' }, true), b: setDone(emptyState(), { key: 'b1' }, true) };
  assert.deepEqual(overallProgress([a, b], states), { done: 2, total: 3, pct: 67, criticalDone: 1, criticalTotal: 1 });
  assert.equal(overallProgress([a, b], states, { groups: PREPAREDNESS_GROUPS }).total, 2);
  assert.equal(overallProgress([], {}).pct, 0);
});

test('state validation rejects damaged shapes', () => {
  assert.ok(isValidState(emptyState()));
  for (const bad of [null, 5, {}, { checked: [], notes: {}, custom: [] }, { checked: { a: 'yes' }, notes: {}, custom: [] },
    { checked: {}, notes: {}, custom: [{ id: 1, name: 'x', priority: 'high' }] }, { checked: {}, notes: {}, custom: [{ id: 'a', name: 'x', priority: 'huge' }] }]) {
    assert.equal(isValidState(bad), false, JSON.stringify(bad));
  }
});

test('persistence round trip and recovery from corrupted saved state', async () => {
  const store = new Store(createMemoryBackend());
  const s = setDone(emptyState(), { key: 'water' }, true);
  await saveState(store, 'kit-72h', s);
  assert.deepEqual(await loadState(store, 'kit-72h'), s);
  await store.set('checklist:flood', { checked: 'garbage' });
  assert.deepEqual(await loadState(store, 'flood'), emptyState());
  assert.equal(store.issues.length, 1);
  const all = await loadAllStates(store, [{ id: 'kit-72h' }, { id: 'flood' }, { id: 'new' }]);
  assert.equal(Object.keys(all).length, 3);
});
