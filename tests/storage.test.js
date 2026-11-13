import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, createMemoryBackend, createLocalStorageBackend, openBestStore } from '../src/services/storage/db.js';

function fakeLocalStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

for (const [name, make] of [
  ['memory', () => new Store(createMemoryBackend())],
  ['localStorage', () => new Store(createLocalStorageBackend(fakeLocalStorage()))],
]) {
  test(`${name} backend: set/get/delete/keys/update`, async () => {
    const s = make();
    await s.set('a:1', { x: 1 });
    await s.set('a:2', [1, 2]);
    await s.set('b:1', 'hello');
    assert.deepEqual(await s.get('a:1'), { x: 1 });
    assert.equal(await s.get('missing', 'fallback'), 'fallback');
    assert.deepEqual(await s.keys('a:'), ['a:1', 'a:2']);
    assert.deepEqual(Object.keys(await s.entries('a:')), ['a:1', 'a:2']);
    await s.update('counter', (n) => n + 1, 0);
    await s.update('counter', (n) => n + 1, 0);
    assert.equal(await s.get('counter'), 2);
    await s.delete('a:1');
    assert.equal(await s.get('a:1'), undefined);
    await s.clear();
    assert.deepEqual(await s.keys(), []);
  });

  test(`${name} backend: stored values are copies, not references`, async () => {
    const s = make();
    const obj = { list: [1] };
    await s.set('k', obj);
    obj.list.push(2);
    assert.deepEqual(await s.get('k'), { list: [1] });
  });
}

test('corrupted localStorage JSON is handled gracefully and reported', async () => {
  const s = new Store(createLocalStorageBackend(fakeLocalStorage({ 'cairn.kv.household': '{not json' })));
  assert.deepEqual(await s.get('household', { members: [] }), { members: [] });
  assert.equal(s.issues[0].problem, 'corrupt');
});

test('getValid rejects data that fails validation', async () => {
  const s = new Store(createMemoryBackend());
  await s.set('plan', { members: 'not-an-array' });
  const v = await s.getValid('plan', (x) => Array.isArray(x.members), { members: [] });
  assert.deepEqual(v, { members: [] });
  assert.equal(s.issues[0].problem, 'invalid');
  await s.set('plan', { members: [] });
  assert.deepEqual(await s.getValid('plan', (x) => Array.isArray(x.members), null), { members: [] });
});

test('backend failures never throw from get()', async () => {
  const bad = { kind: 'bad', get: async () => { throw new Error('boom'); }, set: async () => {}, delete: async () => {}, keys: async () => [], clear: async () => {} };
  const s = new Store(bad);
  assert.equal(await s.get('x', 7), 7);
});

test('selfTest passes on a working backend and fails on a lossy one', async () => {
  assert.equal(await new Store(createMemoryBackend()).selfTest(), true);
  const lossy = { kind: 'lossy', get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], clear: async () => {} };
  assert.equal(await new Store(lossy).selfTest(), false);
});

test('openBestStore falls back: no IndexedDB -> localStorage -> memory', async () => {
  const withLS = await openBestStore({ localStorage: fakeLocalStorage() });
  assert.equal(withLS.kind, 'localStorage');
  const throwing = { get localStorage() { throw new Error('SecurityError'); } };
  const mem = await openBestStore(throwing);
  assert.equal(mem.kind, 'memory');
  assert.ok(mem.fallbackReasons.length >= 1);
  assert.equal(await mem.selfTest(), true);
});

test('openBestStore skips an IndexedDB that fails to open', async () => {
  const idb = { open() { const r = {}; setTimeout(() => r.onerror && r.onerror(), 0); r.error = new Error('denied'); return r; } };
  const s = await openBestStore({ indexedDB: idb, localStorage: fakeLocalStorage() });
  assert.equal(s.kind, 'localStorage');
});
