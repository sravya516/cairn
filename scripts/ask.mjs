// Try the offline assistant from the command line. Reads the built content (run `npm run build` first).
// Usage: npm run ask -- "How long do I boil water?"      (several questions allowed; none = a short demo)
import fs from 'node:fs';
import path from 'node:path';
import { createAssistant } from '../src/services/assistant/answer.js';
import { CALCULATORS } from '../src/calculators/registry.js';

const file = path.resolve('dist', 'data', 'content.json');
if (!fs.existsSync(file)) { console.error('dist/data/content.json not found. Run: npm run build'); process.exit(1); }
const c = JSON.parse(fs.readFileSync(file, 'utf8'));
c.guideById = new Map(c.guides.map((g) => [g.id, g]));
c.categoryById = new Map(c.meta.categories.map((x) => [x.id, x]));
c.emergencyById = new Map(c.emergency.map((e) => [e.id, e]));
c.checklistById = new Map(c.checklists.map((x) => [x.id, x]));

const assistant = createAssistant({ content: c, calculators: CALCULATORS });
const questions = process.argv.slice(2).length ? process.argv.slice(2) : [
  'How long do I boil water?', 'What do I do in an earthquake?', 'How much water for 4 people for 5 days?', 'my dad is not breathing',
  'how much ibuprofen can I give my child', 'how long will a 500 Wh battery run a 50 W fridge', 'what is the capital of France',
];

for (const q of questions) {
  const t0 = performance.now();
  const r = assistant.ask(q);
  const ms = (performance.now() - t0).toFixed(1);
  console.log(`\nQ: ${q}\n=> ${r.type} (${ms} ms)`);
  if (r.type === 'passages') {
    for (const p of r.results) {
      console.log(`  [${p.score} | cov ${p.coverage}] ${p.title} > ${p.heading}  ${p.href}`);
      console.log('     ' + p.items.slice(0, 2).map((x) => x.slice(0, 140)).join('\n     '));
    }
  } else if (r.type === 'emergency') r.cards.forEach((x) => console.log(`  CARD ${x.title}: ${x.steps[0].slice(0, 100)}`));
  else if (r.type === 'calc') { console.log(`  ${r.title}${r.assumed.length ? ' (assumed: ' + r.assumed.join(', ') + ')' : ''}`); r.lines.forEach((l) => console.log(`   - ${l.label}: ${l.value} ${l.note}`)); }
  else if (r.type === 'none') console.log('  no answer. suggestions: ' + (r.suggestions || []).map((s) => s.title).join(' | '));
  else if (r.type === 'guard') console.log('  medicine guard -> ' + r.links.map((l) => l.title).join(' | '));
}
