import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, createMemoryBackend } from '../src/services/storage/db.js';
import {
  buildBackup, validateBackup, restoreBackup, undoLastRestore, hasUndo, eraseAll, collectData, canonical, checksumOf,
  FORMAT, MAX_BYTES, mergeData,
} from '../src/services/backup/backup.js';
import { emptyPlan, newId } from '../src/services/plan.js';
import { emptyState, setDone, setNote, addCustom, makeCustomItem } from '../src/services/checklists.js';

const fresh = () => new Store(createMemoryBackend());

async function populated() {
  const s = fresh();
  const plan = emptyPlan();
  plan.members.push({ id: 'm1', name: 'Ana', age: '34', medical: 'Asthma', allergies: 'Penicillin', medications: 'Inhaler', notes: '' });
  plan.contacts.push({ id: 'c1', name: 'Sam', relationship: 'Neighbor', phone: '555-123-4567', email: '', notes: '' });
  plan.outOfArea = { name: 'Aunt Lee', phone: '555-999-0000', email: '', notes: '' };
  await s.set('household', plan);
  let cl = setDone(emptyState(), { key: 'drinking-water' }, true);
  cl = setNote(cl, { key: 'drinking-water' }, 'Garage shelf');
  cl = addCustom(cl, makeCustomItem({ name: 'Spare glasses', priority: 'high' }, () => 'g1').item);
  await s.set('checklist:kit-72h', cl);
  await s.set('checklist:flood', setDone(emptyState(), { key: 'x' }, true));
  await s.set('bookmarks', ['water-boiling', 'cpr-aed']);
  await s.set('recents', ['hurricanes']);
  await s.set('calc:water', { adults: '3', days: '5' });
  return s;
}

test('canonical JSON is key-order independent and checksum is stable', async () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
  assert.equal(await checksumOf({ a: 1 }), await checksumOf({ a: 1 }));
  assert.notEqual(await checksumOf({ a: 1 }), await checksumOf({ a: 2 }));
});

test('export -> validate -> restore into an empty store reproduces everything', async () => {
  const src = await populated();
  const backup = await buildBackup(src, { appVersion: 't', now: new Date('2026-11-13T12:00:00Z') });
  assert.equal(backup.app, 'Cairn');
  assert.equal(backup.format, FORMAT);
  assert.equal(backup.exportedAt, '2026-11-13T12:00:00.000Z');
  const text = JSON.stringify(backup, null, 2);
  const v = await validateBackup(text);
  assert.ok(v.ok, v.errors.join());
  assert.deepEqual(v.warnings, []);
  assert.equal(v.summary.members, 1);
  assert.equal(v.summary.checklists, 2);
  assert.equal(v.summary.customItems, 1);
  assert.equal(v.summary.bookmarks, 2);

  const dest = fresh();
  await restoreBackup(dest, v);
  assert.deepEqual(await collectData(dest), await collectData(src));
  assert.deepEqual(await dest.get('calc:water'), { adults: '3', days: '5' });
});

test('survives a JSON round trip through a file (key order changes do not matter)', async () => {
  const backup = await buildBackup(await populated());
  const reordered = JSON.parse(JSON.stringify(backup, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)));
  assert.ok((await validateBackup(reordered)).ok);
});

test('rejects tampered, truncated, wrong-app, empty and newer-format files without throwing', async () => {
  const backup = await buildBackup(await populated());
  const tampered = structuredClone(backup);
  tampered.data.household.members[0].name = 'Mallory';
  const t = await validateBackup(JSON.stringify(tampered));
  assert.equal(t.ok, false);
  assert.equal(t.checksumMismatch, true);
  assert.match(t.errors[0], /checksum/i);
  assert.equal((await validateBackup(JSON.stringify(tampered), { ignoreChecksum: true })).ok, true, 'explicit override still sanitises');

  const text = JSON.stringify(backup);
  for (const [name, input, pattern] of [
    ['truncated', text.slice(0, text.length / 2), /not a valid backup|JSON/i],
    ['empty string', '', /not a valid backup|JSON/i],
    ['not json', 'hello world', /JSON/i],
    ['array', '[1,2,3]', /not a Cairn backup/],
    ['null', 'null', /not a Cairn backup/],
    ['wrong app', JSON.stringify({ app: 'Other', format: 1, data: {} }), /not created by Cairn/],
    ['no format', JSON.stringify({ app: 'Cairn', data: {} }), /format/i],
    ['newer format', JSON.stringify({ app: 'Cairn', format: FORMAT + 1, data: {} }), /newer version/],
    ['no data', JSON.stringify({ app: 'Cairn', format: 1 }), /no data/i],
  ]) {
    const r = await validateBackup(input);
    assert.equal(r.ok, false, name);
    assert.match(r.errors[0], pattern, name);
  }
  assert.equal((await validateBackup('x'.repeat(MAX_BYTES + 1))).ok, false);
});

test('a backup without a checksum is accepted with a warning', async () => {
  const b = await buildBackup(await populated());
  delete b.checksum;
  const v = await validateBackup(b);
  assert.ok(v.ok);
  assert.match(v.warnings.join(), /no checksum/);
});

test('damaged pieces are skipped with warnings while good pieces are kept', async () => {
  const b = await buildBackup(await populated());
  b.data.checklists['kit-72h'] = { checked: 'nope' };
  b.data.checklists['bad id!'] = emptyState();
  b.data.bookmarks = 'broken';
  b.data.household.members.push({ name: 'Zed', phone: 'bad' });
  delete b.checksum; // we edited it on purpose
  const v = await validateBackup(b);
  assert.ok(v.ok);
  assert.ok('flood' in v.data.checklists);
  assert.ok(!('kit-72h' in v.data.checklists));
  assert.deepEqual(v.data.bookmarks, []);
  const w = v.warnings.join(' | ');
  assert.match(w, /damaged checklist "kit-72h"/);
  assert.match(w, /invalid id/);
  assert.match(w, /bookmarks/);
});

test('hostile content cannot pollute prototypes or smuggle unknown keys into the store', async () => {
  const text = '{"app":"Cairn","format":1,"data":{"__proto__":{"polluted":1},"household":{"__proto__":{"polluted":1},"members":[{"name":"A","__proto__":{"polluted":1}}]},"checklists":{"__proto__":{"a":1},"constructor":{"b":1}},"calculators":{"__proto__":{"x":1}},"extra":"ignored"}}';
  const v = await validateBackup(text);
  assert.ok(v.ok);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(v.data).sort(), ['bookmarks', 'calculators', 'checklists', 'household', 'recents']);
  const s = fresh();
  await restoreBackup(s, v);
  assert.equal({}.polluted, undefined);
  assert.ok(!(await s.keys()).some((k) => k.includes('proto') || k.includes('constructor')));
});

test('replace mode swaps all user data and keeps a snapshot that undo restores', async () => {
  const target = await populated();
  const other = fresh();
  const p = emptyPlan(); p.members.push({ id: 'x', name: 'Other person', age: '9', medical: '', allergies: '', medications: '', notes: '' });
  await other.set('household', p);
  await other.set('bookmarks', ['drought']);
  const incoming = await validateBackup(await buildBackup(other));

  const before = await collectData(target);
  assert.equal(await hasUndo(target), false);
  const r = await restoreBackup(target, incoming, { mode: 'replace' });
  assert.equal(r.summary.members, 1);
  const after = await collectData(target);
  assert.equal(after.household.members[0].name, 'Other person');
  assert.deepEqual(after.bookmarks, ['drought']);
  assert.deepEqual(after.checklists, {}, 'checklists absent from the backup are removed in replace mode');
  assert.equal(await target.get('calc:water', null), null);

  assert.equal(await hasUndo(target), true);
  await undoLastRestore(target);
  assert.deepEqual(await collectData(target), before, 'undo returns exactly the earlier data');
  assert.equal(await hasUndo(target), false);
  await assert.rejects(() => undoLastRestore(target), /nothing to undo/);
});

test('merge mode keeps existing data and adds what is missing', async () => {
  const target = await populated();
  const other = fresh();
  const p = emptyPlan();
  p.members.push({ id: 'm1', name: 'Should not overwrite', age: '1', medical: '', allergies: '', medications: '', notes: '' }, { id: 'm2', name: 'Newcomer', age: '2', medical: '', allergies: '', medications: '', notes: '' });
  await other.set('household', p);
  await other.set('checklist:kit-72h', setDone(setDone(emptyState(), { key: 'flashlight' }, true), { key: 'drinking-water' }, false));
  await other.set('checklist:tornado', setDone(emptyState(), { key: 'helmets' }, true));
  await other.set('bookmarks', ['drought', 'cpr-aed']);
  await restoreBackup(target, await validateBackup(await buildBackup(other)), { mode: 'merge' });

  const d = await collectData(target);
  assert.deepEqual(d.household.members.map((m) => m.name), ['Ana', 'Newcomer']);
  assert.equal(d.household.outOfArea.name, 'Aunt Lee', 'untouched');
  assert.equal(d.checklists['kit-72h'].checked['drinking-water'], true, 'existing checks are kept');
  assert.equal(d.checklists['kit-72h'].checked.flashlight, true, 'new checks are added');
  assert.equal(d.checklists['kit-72h'].custom.length, 1);
  assert.ok(d.checklists.tornado);
  assert.deepEqual(d.bookmarks, ['water-boiling', 'cpr-aed', 'drought']);
});

test('mergeData does not mutate its inputs', async () => {
  const a = await collectData(await populated());
  const snapshot = JSON.stringify(a);
  mergeData(a, await collectData(fresh()));
  assert.equal(JSON.stringify(a), snapshot);
});

test('restore refuses invalid input and never writes partial data', async () => {
  const s = await populated();
  const before = await collectData(s);
  await assert.rejects(() => restoreBackup(s, { ok: false }), /invalid backup/);
  await assert.rejects(() => restoreBackup(s, null), /invalid backup/);
  assert.deepEqual(await collectData(s), before);
});

test('eraseAll removes plan, checklists, bookmarks and calculator inputs, and the undo snapshot', async () => {
  const s = await populated();
  await s.set('theme-or-other', 'keep');
  await restoreBackup(s, await validateBackup(await buildBackup(s)), { mode: 'merge' });
  assert.equal(await hasUndo(s), true);
  await eraseAll(s);
  const d = await collectData(s);
  assert.deepEqual(d.household, emptyPlan());
  assert.deepEqual([d.checklists, d.bookmarks, d.recents, d.calculators], [{}, [], [], {}]);
  assert.equal(await hasUndo(s), false);
  assert.equal(await s.get('theme-or-other'), 'keep', 'unrelated keys are untouched');
});

test('export of a completely empty store is valid and restores to empty', async () => {
  const v = await validateBackup(await buildBackup(fresh()));
  assert.ok(v.ok);
  assert.equal(v.summary.members, 0);
  const s = await populated();
  await restoreBackup(s, v, { mode: 'replace' });
  assert.deepEqual((await collectData(s)).checklists, {});
});

test('large but valid household data round-trips and stays far below the size limit', async () => {
  const s = fresh();
  const plan = emptyPlan();
  for (let i = 0; i < 40; i++) plan.members.push({ id: newId(), name: 'Person ' + i, age: String(i), medical: 'm'.repeat(600), allergies: 'a'.repeat(400), medications: 'x'.repeat(600), notes: 'n'.repeat(400) });
  plan.notes.text = 't'.repeat(4000);
  await s.set('household', plan);
  const text = JSON.stringify(await buildBackup(s));
  assert.ok(text.length < MAX_BYTES / 10);
  const v = await validateBackup(text);
  assert.ok(v.ok);
  assert.deepEqual(v.warnings, []);
  assert.equal(v.summary.members, 40);
});
