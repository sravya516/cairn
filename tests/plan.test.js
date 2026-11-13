import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, createMemoryBackend } from '../src/services/storage/db.js';
import {
  SECTIONS, validateField, emptyPlan, sanitizePlan, loadPlan, savePlan, completeness, sectionCount, mergePlans, MAX_ITEMS, newId, isValidPlan,
} from '../src/services/plan.js';

const field = (section, key) => SECTIONS.find((s) => s.id === section).fields.find((f) => f.key === key);

test('all required household sections exist', () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ['members', 'contacts', 'outOfArea', 'meeting', 'evacuation', 'pets', 'addresses', 'vehicles', 'notes']);
  const members = SECTIONS[0].fields.map((f) => f.key);
  for (const k of ['name', 'age', 'medical', 'allergies', 'medications']) assert.ok(members.includes(k));
});

test('phone validation', () => {
  const f = field('contacts', 'phone');
  for (const ok of ['555-123-4567', '(555) 123 4567', '+1 555 123 4567', '555.123.4567 x22', '911', '']) assert.equal(validateField(f, ok).ok, true, ok);
  for (const bad of ['abc', '12', '555-123-4567; DROP TABLE', '<script>', '1'.repeat(31), '++']) assert.equal(validateField(f, bad).ok, false, bad);
  assert.equal(validateField(f, '  555-111-2222  ').value, '555-111-2222');
});

test('email and age validation', () => {
  const e = field('contacts', 'email'), a = field('members', 'age');
  assert.equal(validateField(e, 'a@b.co').ok, true);
  assert.equal(validateField(e, '').ok, true);
  for (const bad of ['a@b', 'no at sign', '@b.com', 'a b@c.com']) assert.equal(validateField(e, bad).ok, false, bad);
  assert.equal(validateField(a, '0').ok, true);
  assert.equal(validateField(a, '007').value, '7');
  for (const bad of ['-1', '121', '3.5', 'ten', '1e2']) assert.equal(validateField(a, bad).ok, false, bad);
  assert.equal(validateField(a, '').ok, true);
});

test('text validation: required, length limits, control characters stripped', () => {
  const n = field('members', 'name');
  assert.equal(validateField(n, '   ').ok, false);
  assert.equal(validateField(n, 'x'.repeat(81)).ok, false);
  assert.equal(validateField(n, 'A\u0000\u0007B').value, 'AB');
  assert.equal(validateField(n, ' Maria ').value, 'Maria');
});

test('emptyPlan is a valid plan and sanitizePlan of nothing equals it', () => {
  const p = emptyPlan();
  assert.ok(isValidPlan(p));
  assert.deepEqual(sanitizePlan(undefined).plan, p);
  assert.deepEqual(sanitizePlan('garbage').plan, p);
  assert.deepEqual(sanitizePlan([1, 2]).plan, p);
});

test('sanitizePlan keeps good data, drops bad values, trims long text, ignores unknown keys', () => {
  const { plan, dropped } = sanitizePlan({
    members: [{ id: 'm1', name: 'Ana', age: '34', medical: 'Asthma', evil: 'x' }, { name: 'Bob', age: 'abc' }, null, 5],
    contacts: [{ id: 'c1', name: 'Neighbor', phone: 'call me maybe', email: 'x@y.org' }],
    outOfArea: { name: 'Aunt', phone: '555-000-1111', extra: 'ignored' },
    notes: { text: 'n'.repeat(9000) },
    unknownSection: [1],
  });
  assert.equal(plan.members.length, 2);
  assert.equal(plan.members[0].id, 'm1');
  assert.ok(!('evil' in plan.members[0]));
  assert.equal(plan.members[1].age, '');
  assert.equal(plan.contacts[0].phone, '');
  assert.equal(plan.contacts[0].email, 'x@y.org');
  assert.equal(plan.outOfArea.phone, '555-000-1111');
  assert.equal(plan.notes.text.length, 4000);
  assert.ok(!('unknownSection' in plan));
  assert.ok(dropped >= 4);
});

test('sanitizePlan caps list sizes, repairs ids and names, drops empty entries', () => {
  const many = Array.from({ length: MAX_ITEMS + 10 }, (_, i) => ({ name: 'P' + i }));
  assert.equal(sanitizePlan({ pets: many }).plan.pets.length, MAX_ITEMS);
  const { plan } = sanitizePlan({ members: [{ id: '../../etc', name: 'X' }, { id: 'ok_1', age: '5' }, { id: 'z' }] });
  assert.equal(plan.members.length, 2, 'fully empty entries are dropped');
  assert.match(plan.members[0].id, /^[a-z0-9_-]+$/i);
  assert.notEqual(plan.members[0].id, '../../etc');
  assert.equal(plan.members[1].name, '(unnamed)');
});

test('sanitizePlan is not vulnerable to prototype pollution', () => {
  const evil = JSON.parse('{"__proto__":{"polluted":true},"members":[{"name":"A","__proto__":{"polluted":true},"constructor":{"x":1}}]}');
  const { plan } = sanitizePlan(evil);
  assert.equal({}.polluted, undefined);
  assert.equal(plan.polluted, undefined);
  assert.equal(plan.members[0].polluted, undefined);
});

test('save and load round trip stamps an updated time; damaged stored data is healed', async () => {
  const store = new Store(createMemoryBackend());
  const p = emptyPlan();
  p.members.push({ id: newId(), name: 'Ana', age: '30', medical: '', allergies: 'Penicillin', medications: '', notes: '' });
  const saved = await savePlan(store, p);
  assert.ok(saved.updated);
  const loaded = await loadPlan(store);
  assert.equal(loaded.members[0].allergies, 'Penicillin');
  await store.set('household', { members: 'broken', outOfArea: 7 });
  const healed = await loadPlan(store);
  assert.ok(isValidPlan(healed));
  assert.deepEqual(healed.members, []);
  assert.ok(isValidPlan(await loadPlan(new Store(createMemoryBackend()))), 'empty store gives an empty plan');
});

test('completeness scoring', () => {
  const p = emptyPlan();
  assert.equal(completeness(p).pct, 0);
  p.members.push({ id: 'a', name: 'A', age: '', medical: 'x', allergies: '', medications: '', notes: '' });
  p.contacts.push({ id: 'b', name: 'B', relationship: '', phone: '555-111-2222', email: '', notes: '' });
  p.outOfArea = { name: 'Aunt', phone: '555-222-3333', email: '', notes: '' };
  p.meeting.near = 'Mailbox'; p.meeting.neighborhood = 'Library';
  p.evacuation.destination = 'Cousin';
  p.addresses.push({ id: 'c', name: 'Work', address: '', phone: '' });
  p.pets.push({ id: 'd', name: 'Rex', type: '', notes: '' });
  p.notes.text = 'Gas shutoff behind garage';
  const c = completeness(p);
  assert.equal(c.pct, 100);
  assert.deepEqual(c.missing, []);
  p.notes.text = '';
  assert.equal(completeness(p).missing.length, 1);
});

test('sectionCount reports list sizes and whether a single section is filled', () => {
  const p = emptyPlan();
  const [members, , outOfArea] = SECTIONS;
  assert.equal(sectionCount(p, members), 0);
  assert.equal(sectionCount(p, outOfArea), 0);
  p.members.push({ id: 'a', name: 'A' }); p.outOfArea.name = 'X';
  assert.equal(sectionCount(p, members), 1);
  assert.equal(sectionCount(p, outOfArea), 1);
});

test('mergePlans unions lists by id and fills only blank single fields', () => {
  const a = emptyPlan(), b = emptyPlan();
  a.members.push({ id: 'm1', name: 'Mine', age: '5' });
  b.members.push({ id: 'm1', name: 'Theirs', age: '6' }, { id: 'm2', name: 'New', age: '7' });
  a.meeting.near = 'My tree'; b.meeting.near = 'Their tree'; b.meeting.neighborhood = 'Library';
  const m = mergePlans(a, b);
  assert.deepEqual(m.members.map((x) => [x.id, x.name]), [['m1', 'Mine'], ['m2', 'New']]);
  assert.equal(m.meeting.near, 'My tree');
  assert.equal(m.meeting.neighborhood, 'Library');
  assert.equal(a.members.length, 1, 'inputs are not mutated');
});
