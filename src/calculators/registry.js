// Registry of calculators in this build. Guides link to calculators by id, and links to unknown ids are hidden.
import water from './water.js';
import food from './food.js';
import power from './power.js';
import battery from './battery.js';
import fuel from './fuel.js';
import budget from './budget.js';
import storage from './storage.js';

export const CALCULATORS = [water, food, power, battery, fuel, budget, storage];
export const calculatorIds = () => new Set(CALCULATORS.map((c) => c.id));
export const getCalculator = (id) => CALCULATORS.find((c) => c.id === id) || null;

/** Search documents so calculators appear in offline search. */
export const calculatorDocs = () => CALCULATORS.map((c) => ({
  id: 'calculator:' + c.id, type: 'calculator', title: c.title, category: 'calculators', href: `#/calc/${c.id}`,
  text: [c.summary, ...c.assumptions, ...c.limitations].join(' '), tags: c.tags, boost: 1.1,
}));
