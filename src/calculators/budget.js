import { round, money, defaultsFor, makeCompute } from './common.js';

export const fields = [
  { key: 'adults', label: 'Adults', type: 'number', integer: true, min: 0, max: 50, default: 2 },
  { key: 'children', label: 'Children', type: 'number', integer: true, min: 0, max: 50, default: 0 },
  { key: 'pets', label: 'Pets', type: 'number', integer: true, min: 0, max: 50, default: 0 },
  { key: 'days', label: 'Days to prepare for', type: 'number', integer: true, min: 1, max: 365, default: 14 },
  { key: 'owned', label: 'Already own', unit: '%', type: 'number', min: 0, max: 100, default: 0, help: 'Estimate of what you already have. Reduces the total.' },
  { key: 'waterPrice', label: 'Water price', unit: '$ per gallon', type: 'number', min: 0, max: 100, default: 1.25, help: 'Placeholder estimates. Replace every price with what you see locally.' },
  { key: 'foodPrice', label: 'Food cost per person per day', unit: '$', type: 'number', min: 0, max: 200, default: 6 },
  { key: 'petFoodPrice', label: 'Pet food per pet per day', unit: '$', type: 'number', min: 0, max: 100, default: 1.5 },
  { key: 'firstAid', label: 'First-aid kit and supplies', unit: '$ per household', type: 'number', min: 0, max: 5000, default: 60 },
  { key: 'medPerPerson', label: 'Extra medical and hygiene supplies', unit: '$ per person', type: 'number', min: 0, max: 5000, default: 20 },
  { key: 'powerEquipment', label: 'Power and light equipment', unit: '$', type: 'number', min: 0, max: 20000, default: 120, help: 'Lanterns, radio, power bank. A portable power station can cost several hundred dollars or more.' },
  { key: 'sanitation', label: 'Sanitation supplies', unit: '$', type: 'number', min: 0, max: 5000, default: 45 },
  { key: 'misc', label: 'Documents, cash, tools and other', unit: '$', type: 'number', min: 0, max: 20000, default: 50 },
  { key: 'months', label: 'Months to spread the cost over', type: 'number', integer: true, min: 1, max: 120, default: 12 },
];

export const compute = makeCompute(fields, (v) => {
  const people = v.adults + v.children;
  if (people + v.pets === 0) return { errors: { adults: 'Add at least one person or pet.' } };

  const water = people * v.days * 1 * v.waterPrice; // 1 gallon per person per day
  const food = people * v.days * v.foodPrice;
  const pets = v.pets * v.days * v.petFoodPrice;
  const medical = v.firstAid + v.medPerPerson * people;
  const power = v.powerEquipment;
  const sanitation = v.sanitation;
  const misc = v.misc;
  const subtotal = water + food + pets + medical + power + sanitation + misc;
  const net = subtotal * (1 - v.owned / 100);
  const monthly = net / v.months;

  return {
    results: [
      { label: 'Estimated total to buy', value: money(net), primary: true, note: v.owned ? `after ${v.owned}% already owned (full cost ${money(subtotal)})` : 'full cost' },
      { label: 'Water', value: money(water), note: `${people * v.days} gallons at ${money(v.waterPrice)}` },
      { label: 'Food', value: money(food) },
      { label: 'Pet food', value: money(pets) },
      { label: 'Medical and hygiene supplies', value: money(medical) },
      { label: 'Power and light equipment', value: money(power) },
      { label: 'Sanitation', value: money(sanitation) },
      { label: 'Documents, cash and other', value: money(misc) },
      { label: 'Per month', value: money(monthly), note: `over ${v.months} months` },
      { label: 'Per person', value: people ? money(net / people) : '—' },
    ],
    notes: [
      'Default prices are rough placeholders, not market data. Change every price to match your local stores.',
      'Spread purchases over time: buy a few extra shelf-stable items each shopping trip and use sales.',
      'Prioritize water, medications, food, light and communications before comfort items.',
    ],
    raw: { water: round(water, 2), food: round(food, 2), pets: round(pets, 2), medical: round(medical, 2), power: round(power, 2), sanitation: round(sanitation, 2), misc: round(misc, 2), subtotal: round(subtotal, 2), net: round(net, 2), monthly: round(monthly, 2) },
  };
});

export default {
  id: 'budget', title: 'Emergency Budget Calculator', icon: 'plan',
  summary: 'Estimate the cost of supplies and spread it over months.',
  tags: ['budget', 'cost', 'prices', 'money', 'supplies', 'afford'],
  fields, defaults: () => defaultsFor(fields), compute,
  assumptions: [
    'Water: 1 gallon per person per day at the price you enter.',
    'Food and pet food: a flat daily cost per person or pet that you set.',
    'Other categories are one-time amounts that you can edit.',
    'The "already own" percentage reduces the total proportionally.',
  ],
  limitations: [
    'All default prices are placeholder estimates. They are not current market prices.',
    'Does not include shelves, storage containers, taxes, delivery or replacement over time.',
    'Not financial advice.',
  ],
  related: ['emergency-budgeting', 'prepare-30-days'],
};
