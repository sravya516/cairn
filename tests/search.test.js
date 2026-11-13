import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchIndex, buildDocs, tokenize, stem, makeSnippet } from '../src/services/search/engine.js';
import { guideText, indexContent, validateContent } from '../src/services/content.js';

const content = indexContent({
  meta: { categories: [{ id: 'water', title: 'Water' }, { id: 'medical', title: 'First Aid & Medical' }, { id: 'power', title: 'Power & Electricity' }, { id: 'disasters', title: 'Natural Disasters' }] },
  guides: [
    { id: 'purify', title: 'Water Purification and Disinfection', category: 'water', summary: 'Make water safe to drink.', tags: ['boil water', 'bleach', 'filter'],
      sections: [{ h: 'Boiling', p: ['Bring water to a rolling boil for one minute.'] }, { h: 'Chemical disinfection', ul: ['Use unscented household bleach.'] }] },
    { id: 'cpr', title: 'CPR Reference', category: 'medical', summary: 'Hands-only CPR steps.', tags: ['cardiac arrest', 'resuscitation'], priority: 'critical',
      sections: [{ h: 'Steps', ol: ['Call 911.', 'Push hard and fast in the center of the chest.'] }] },
    { id: 'gen', title: 'Generator Safety', category: 'power', summary: 'Prevent carbon monoxide poisoning.', tags: ['carbon monoxide', 'generator'],
      sections: [{ h: 'Placement', p: ['Run generators outdoors, far from windows.'] }] },
    { id: 'hurr', title: 'Hurricanes', category: 'disasters', summary: 'Prepare for storm surge and wind.', tags: ['storm', 'evacuation'],
      sections: [{ h: 'Before', ul: ['Know your evacuation zone.'] }] },
    { id: 'storage', title: 'Emergency Water Storage', category: 'water', summary: 'Storing water for 72 hours and beyond.', tags: ['storage', 'containers'],
      sections: [{ h: 'Containers', p: ['Store water in food-grade containers. Rotate stored water.'] }] },
  ],
  checklists: [{ id: 'kit72', title: '72-Hour Kit', description: 'Basic kit.', tags: ['go bag'], items: [['Flashlight', 'One per person', '1', 'high'], ['Water', '1 gallon per person per day', '3 gal', 'critical']] }],
  emergency: [{ id: 'bleeding', title: 'Severe Bleeding', tags: ['hemorrhage'], steps: ['Call 911.', 'Press firmly on the wound with a clean cloth.'], warn: [] }],
});
const index = new SearchIndex(buildDocs(content, guideText));
const top = (q, opts) => index.search(q, opts)[0]?.id;

test('content validation flags malformed bundles', () => {
  assert.deepEqual(validateContent({ meta: { categories: [] }, guides: [], checklists: [], emergency: [] }), []);
  assert.ok(validateContent({ guides: 1 }).length > 0);
  assert.ok(validateContent(null).length > 0);
});

test('stemming unifies common word forms', () => {
  for (const [a, b] of [['boiling', 'boil'], ['boiled', 'boil'], ['generators', 'generator'], ['batteries', 'battery'], ['storing', 'stored'], ['store', 'storing'], ['flooding', 'floods'], ['preparing', 'prepare']]) {
    assert.equal(stem(a), stem(b), `${a} vs ${b}`);
  }
  assert.deepEqual(tokenize('How do I boil the water?'), ['boil', 'water']);
});

test('finds guides by title, heading, tag and body text', () => {
  assert.equal(top('water purification'), 'guide:purify');
  assert.equal(top('rolling boil'), 'guide:purify');
  assert.equal(top('bleach'), 'guide:purify');
  assert.equal(top('carbon monoxide'), 'guide:gen');
  assert.equal(top('evacuation zone'), 'guide:hurr');
});

test('title matches outrank body mentions', () => {
  const r = index.search('water storage');
  assert.equal(r[0].id, 'guide:storage');
});

test('synonyms and emergency vocabulary work', () => {
  assert.equal(top('cpr'), 'guide:cpr');
  assert.equal(top('heart stopped resuscitation'), 'guide:cpr');
  assert.equal(top('hemorrhage'), 'emergency:bleeding');
  assert.equal(top('bleeding'), 'emergency:bleeding');
  assert.equal(top('cyclone'), 'guide:hurr');
});

test('partial words and typos still find results', () => {
  assert.equal(top('purifi'), 'guide:purify');
  assert.equal(top('gener'), 'guide:gen');
  assert.equal(top('hurrican'), 'guide:hurr');
  assert.equal(top('generater'), 'guide:gen'); // typo, edit distance 1
});

test('checklist items are searchable and link to their checklist', () => {
  const r = index.search('flashlight');
  const item = r.find((x) => x.type === 'item');
  assert.ok(item);
  assert.equal(item.href, '#/checklist/kit72');
  assert.equal(item.parent, '72-Hour Kit');
});

test('category and type filters', () => {
  const r = index.search('water', { category: 'water' });
  assert.ok(r.length >= 2 && r.every((x) => x.category === 'water'));
  assert.ok(index.search('water', { type: 'item' }).every((x) => x.type === 'item'));
});

test('empty, stop-word-only and nonsense queries are safe', () => {
  assert.deepEqual(index.search(''), []);
  assert.deepEqual(index.search('   '), []);
  assert.deepEqual(index.search('the of and'), []);
  assert.deepEqual(index.search('zzzzqqqq'), []);
  assert.doesNotThrow(() => index.search('<script>alert(1)</script> (((['));
});

test('suggestions come from titles and tags', () => {
  assert.ok(index.suggest('gen').includes('Generator Safety'));
  assert.ok(index.suggest('boil').includes('boil water'));
  assert.deepEqual(index.suggest('x'), []);
});

test('snippets center on the match', () => {
  const text = 'a '.repeat(80) + 'Run generators outdoors far from windows ' + 'b '.repeat(80);
  const s = makeSnippet(text, tokenize('generators'));
  assert.ok(s.includes('generators') && s.startsWith('…'));
});

test('index handles a realistic volume quickly', () => {
  const docs = [];
  for (let i = 0; i < 3000; i++) docs.push({ id: 'd' + i, type: 'guide', title: 'Topic ' + i, text: 'lorem water supply emergency preparedness item ' + i, href: '#/x' });
  const big = new SearchIndex(docs);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) big.search('water suppl');
  assert.ok((performance.now() - t0) / 20 < 100, 'search should take well under 100ms');
});
