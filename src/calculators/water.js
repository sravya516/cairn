import { GAL_TO_L, round, ceil, num, defaultsFor, makeCompute } from './common.js';

export const fields = [
  { key: 'adults', label: 'Adults', type: 'number', integer: true, min: 0, max: 50, default: 2 },
  { key: 'children', label: 'Children', type: 'number', integer: true, min: 0, max: 50, default: 0 },
  { key: 'pets', label: 'Pets', type: 'number', integer: true, min: 0, max: 50, default: 0 },
  { key: 'petWeight', label: 'Average pet weight', unit: 'lb', type: 'number', min: 1, max: 300, default: 30, help: 'Used with the rule of thumb of about 1 ounce of water per pound of body weight per day.' },
  { key: 'days', label: 'Number of days', type: 'number', integer: true, min: 1, max: 365, default: 3, help: '3 days is the minimum plan. Two weeks is recommended where practical.' },
  { key: 'perPerson', label: 'Water per person per day', unit: 'gal', type: 'number', min: 0.5, max: 5, default: 1, help: 'FEMA and Ready.gov plan 1 gallon (3.8 L) per person per day for drinking and basic hygiene.' },
  { key: 'climate', label: 'Climate', type: 'select', default: 'normal', options: [{ value: 'normal', label: 'Temperate' }, { value: 'hot', label: 'Hot or strenuous activity (+50%)' }] },
  { key: 'elevated', label: 'People with higher needs', type: 'number', integer: true, min: 0, max: 50, default: 0, help: 'Nursing, pregnant or ill people. Adds 0.5 gallon per day each.' },
  { key: 'extras', label: 'Extra household water for cooking and cleaning', unit: 'gal/day', type: 'number', min: 0, max: 50, default: 0, help: 'Rehydrating freeze-dried food, dishes, laundry. Optional.' },
];

export const PET_OZ_PER_LB = 1;
export const HOT_FACTOR = 1.5;
export const ELEVATED_EXTRA_GAL = 0.5;

export const compute = makeCompute(fields, (v) => {
  const people = v.adults + v.children;
  if (people + v.pets === 0) return { errors: { adults: 'Add at least one person or pet.' } };
  if (v.elevated > people) return { errors: { elevated: 'Cannot be more than the number of people.' } };

  const base = people * v.days * v.perPerson;
  const hotExtra = v.climate === 'hot' ? base * (HOT_FACTOR - 1) : 0;
  const elevatedExtra = v.elevated * v.days * ELEVATED_EXTRA_GAL;
  const petBase = v.pets * (v.petWeight * PET_OZ_PER_LB / 128) * v.days;
  const petGal = v.climate === 'hot' ? petBase * HOT_FACTOR : petBase;
  const extras = v.extras * v.days;
  const total = base + hotExtra + elevatedExtra + petGal + extras;
  const liters = total * GAL_TO_L;

  const notes = [];
  if (v.days >= 14) notes.push('For two weeks or more, storing everything is bulky. Combine stored water with a tested way to filter and disinfect more.');
  if (total > 0) notes.push(`A full 5-gallon container weighs about 42 lb (19 kg). You would need about ${ceil(total / 5)} of them.`);
  notes.push('Water heater tanks, ice and clean toilet tanks are backup sources and must be treated before drinking. Do not count them in this total.');

  return {
    results: [
      { label: 'Total water to store', value: `${num(total)} gallons`, note: `${num(liters)} liters`, primary: true },
      { label: 'Drinking and hygiene for people', value: `${num(base + hotExtra + elevatedExtra)} gal` },
      { label: 'Pets', value: `${num(petGal, 2)} gal` },
      { label: 'Cooking and cleaning extras', value: `${num(extras)} gal` },
      { label: 'Per day', value: `${num(total / v.days)} gal`, note: `${num(liters / v.days)} L` },
      { label: '5-gallon containers needed', value: String(ceil(total / 5)) },
      { label: '0.5 L bottles (24-packs)', value: `${ceil(liters / 0.5)} bottles (${ceil(liters / 12)} cases)` },
    ],
    notes,
    raw: { gallons: round(total, 2), liters: round(liters, 2) },
  };
});

export default {
  id: 'water', title: 'Water Calculator', icon: 'drop',
  summary: 'How much drinking and hygiene water to store for people and pets.',
  tags: ['water', 'gallons', 'liters', 'storage', 'how much water'],
  fields, defaults: () => defaultsFor(fields), compute,
  assumptions: [
    '1 gallon (3.8 L) per person per day covers drinking plus minimal hygiene. It is a planning figure, not a guarantee.',
    'Pets: about 1 ounce of water per pound of body weight per day (a common rule of thumb; actual needs vary).',
    'Hot weather or hard work adds 50% to drinking needs here. Real needs can be higher.',
    'People with higher needs (nursing, pregnant, ill) add 0.5 gallon per day each.',
  ],
  limitations: [
    'Does not include water for bathing, laundry or sanitation beyond the basic allowance.',
    'Children, older adults and sick people can need more or less. Ask a clinician about special conditions.',
    'Stored water must be rotated about every six months unless commercially sealed with an expiry date.',
  ],
  related: ['water-storage', 'water-needs-calculation'],
};
