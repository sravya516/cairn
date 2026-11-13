import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, createMemoryBackend } from '../src/services/storage/db.js';
import { getBookmarks, toggleBookmark, isBookmarked, addRecent, getRecents, resolveGuides } from '../src/services/library.js';

const fresh = () => new Store(createMemoryBackend());

test('bookmarks toggle on and off and newest comes first', async () => {
  const s = fresh();
  assert.equal(await toggleBookmark(s, 'a'), true);
  assert.equal(await toggleBookmark(s, 'b'), true);
  assert.deepEqual(await getBookmarks(s), ['b', 'a']);
  assert.equal(await isBookmarked(s, 'a'), true);
  assert.equal(await toggleBookmark(s, 'a'), false);
  assert.deepEqual(await getBookmarks(s), ['b']);
});

test('recents are de-duplicated, ordered newest first and capped', async () => {
  const s = fresh();
  for (const id of ['a', 'b', 'c', 'a']) await addRecent(s, id, 3);
  assert.deepEqual(await getRecents(s), ['a', 'c', 'b']);
  await addRecent(s, 'd', 3);
  assert.deepEqual(await getRecents(s), ['d', 'a', 'c']);
});

test('corrupted bookmark data falls back to an empty list instead of crashing', async () => {
  const s = fresh();
  await s.set('bookmarks', { not: 'a list' });
  await s.set('recents', [1, 2, 3]);
  assert.deepEqual(await getBookmarks(s), []);
  assert.deepEqual(await getRecents(s), []);
  assert.equal(await toggleBookmark(s, 'x'), true);
  assert.deepEqual(await getBookmarks(s), ['x']);
});

test('resolveGuides drops ids that no longer exist', () => {
  const map = new Map([['a', { id: 'a' }]]);
  assert.deepEqual(resolveGuides(['a', 'gone'], map), [{ id: 'a' }]);
});

import { inlineParts, stripInline } from '../src/utils/text.js';
import { guideText } from '../src/services/content.js';

test('inline bold parsing is safe and never produces HTML', () => {
  assert.deepEqual(inlineParts('Use **regular** bleach.'), [{ b: false, v: 'Use ' }, { b: true, v: 'regular' }, { b: false, v: ' bleach.' }]);
  assert.deepEqual(inlineParts('no markup <b>x</b>'), [{ b: false, v: 'no markup <b>x</b>' }]);
  assert.deepEqual(inlineParts('unclosed **bold'), [{ b: false, v: 'unclosed **bold' }]);
  assert.equal(stripInline('a **b** c'), 'a b c');
});

test('search text has bold markers removed', () => {
  const g = { summary: 's', sections: [{ h: 'H', blocks: [{ t: 'p', v: 'Run **outdoors only**.' }] }] };
  assert.ok(!guideText(g).includes('*'));
});

// Regression: the native replaceChildren() renders null as the text "null"; fill() must skip it.
import { fill } from '../src/utils/dom.js';
test('fill() skips null, undefined and false and flattens arrays', () => {
  const calls = [];
  const el = { replaceChildren: (...kids) => calls.push(kids) };
  fill(el, 'a', null, [undefined, 'b', [false, 'c']], 0);
  assert.deepEqual(calls[0], ['a', 'b', 'c', 0]);
});
