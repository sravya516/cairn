import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, matchRoute, buildHash } from '../src/navigation/router.js';

test('parseHash handles empty, root and nested paths', () => {
  assert.deepEqual(parseHash('').path, []);
  assert.deepEqual(parseHash('#/').path, []);
  assert.deepEqual(parseHash('#/guide/water-storage').path, ['guide', 'water-storage']);
});

test('parseHash parses and decodes query strings', () => {
  const r = parseHash('#/search?q=boil%20water&cat=water');
  assert.deepEqual(r.path, ['search']);
  assert.equal(r.query.q, 'boil water');
  assert.equal(r.query.cat, 'water');
});

test('parseHash tolerates malformed encoding', () => {
  assert.doesNotThrow(() => parseHash('#/guide/%E0%A4%A'));
});

test('matchRoute extracts params and rejects non-matches', () => {
  const routes = [{ pattern: '' }, { pattern: 'guide/:id' }, { pattern: 'guides' }];
  assert.equal(matchRoute(routes, []).route.pattern, '');
  const m = matchRoute(routes, ['guide', 'x']);
  assert.equal(m.params.id, 'x');
  assert.equal(matchRoute(routes, ['guide']), null);
  assert.equal(matchRoute(routes, ['nope']), null);
});

test('buildHash round-trips with parseHash', () => {
  const h = buildHash(['search'], { q: 'a b&c', empty: '' });
  const r = parseHash(h);
  assert.equal(r.query.q, 'a b&c');
  assert.equal('empty' in r.query, false);
});
