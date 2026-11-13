import { round, ceil, num, defaultsFor, makeCompute, LB_TO_KG } from './common.js';

export const fields = [
  { key: 'adults', label: 'Adults', type: 'number', integer: true, min: 0, max: 50, default: 2 },
  { key: 'children', label: 'Children (2–12 years)', type: 'number', integer: true, min: 0, max: 50, default: 0 },
  { key: 'infants', label: 'Infants (under 2)', type: 'number', integer: true, min: 0, max: 20, default: 0, help: 'Not counted in calories. They need formula or breast milk, planned separately.' },
  { key: 'days', label: 'Number of days', type: 'number', integer: true, min: 1, max: 365, default: 14 },
  { key: 'adultKcal', label: 'Calories per adult per day', unit: 'kcal', type: 'number', min: 1200, max: 4500, default: 2000, help: 'A common planning figure is about 2,000. Adjust for your household.' },
  { key: 'childKcal', label: 'Calories per child per day', unit: 'kcal', type: 'number', min: 800, max: 3500, default: 1400 },
  { key: 'activity', label: 'Conditions', type: 'select', default: '1', options: [{ value: '1', label: 'Normal activity' }, { value: '1.25', label: 'Cold weather or heavy physical work (+25%)' }] },
  { key: 'breastfeeding', label: 'Breastfeeding adults', type: 'number', integer: true, min: 0, max: 20, default: 0, help: 'Adds about 400 kcal per day each (planning estimate).' },
  { key: 'pregnant', label: 'Pregnant adults (2nd or 3rd trimester)', type: 'number', integer: true, min: 0, max: 20, default: 0, help: 'Adds about 350 kcal per day each (planning estimate).' },
  { key: 'staplesShare', label: 'Share of calories from dry staples', unit: '%', type: 'number', min: 0, max: 100, default: 60, help: 'Rice, beans, pasta, oats. The rest comes from ready-to-eat canned or pouch foods.' },
  { key: 'allergies', label: 'Food allergies in the household', type: 'checkbox', default: false },
  { key: 'diabetes', label: 'Diabetes or other medical diet', type: 'checkbox', default: false },
  { key: 'glutenFree', label: 'Gluten-free or other restricted diet', type: 'checkbox', default: false },
];

export const KCAL_PER_LB_STAPLES = 1600; // white rice ~1,650, dry beans ~1,500, pasta ~1,600, rolled oats ~1,700
export const KCAL_PER_READY_ITEM = 400;  // a typical ready-to-eat can or pouch meal
export const BREASTFEEDING_EXTRA = 400;
export const PREGNANT_EXTRA = 350;

export const compute = makeCompute(fields, (v) => {
  const eaters = v.adults + v.children;
  if (eaters + v.infants === 0) return { errors: { adults: 'Add at least one person.' } };
  if (v.breastfeeding + v.pregnant > v.adults) return { errors: { breastfeeding: 'Breastfeeding plus pregnant adults cannot exceed the number of adults.' } };

  const mult = Number(v.activity);
  const baseDaily = (v.adults * v.adultKcal + v.children * v.childKcal) * mult;
  const extraDaily = v.breastfeeding * BREASTFEEDING_EXTRA + v.pregnant * PREGNANT_EXTRA;
  const daily = baseDaily + extraDaily;
  const total = daily * v.days;
  const meals = eaters * 3 * v.days;

  const stapleKcal = total * (v.staplesShare / 100);
  const readyKcal = total - stapleKcal;
  const stapleLb = stapleKcal / KCAL_PER_LB_STAPLES;
  const readyItems = readyKcal / KCAL_PER_READY_ITEM;

  const notes = [
    `Dry staples are estimated at ${KCAL_PER_LB_STAPLES.toLocaleString()} kcal per pound and ready-to-eat items at ${KCAL_PER_READY_ITEM} kcal each. Check your actual labels.`,
    'Dry staples need water and cooking fuel. Count that water in the Water Calculator.',
  ];
  if (v.infants) notes.push('Infants are not included in the calories. Plan formula or breast milk separately, and never stretch formula by diluting it.');
  if (v.allergies) notes.push('Allergies: store allergen-free foods separately, read every label, and keep epinephrine and an allergy action plan if prescribed.');
  if (v.diabetes) notes.push('Medical diets: ask your clinician how to manage meals, medications and low-blood-sugar treatment during a disruption.');
  if (v.glutenFree) notes.push('Restricted diets: favor naturally compliant staples such as rice, canned vegetables, beans and tuna, and check labels.');
  if (v.breastfeeding || v.pregnant) notes.push('Extra calories for pregnancy and breastfeeding are rough estimates. Follow your clinician’s advice.');

  return {
    results: [
      { label: 'Total calories needed', value: `${Math.round(total).toLocaleString()} kcal`, primary: true },
      { label: 'Calories per day (household)', value: `${Math.round(daily).toLocaleString()} kcal` },
      { label: 'Meals to plan', value: `${meals.toLocaleString()} meals`, note: '3 meals per person per day, plus snacks' },
      { label: 'Dry staples to store', value: `${num(stapleLb)} lb`, note: `${num(stapleLb * LB_TO_KG)} kg` },
      { label: 'Ready-to-eat cans or pouches', value: `${ceil(readyItems).toLocaleString()}`, note: `about ${KCAL_PER_READY_ITEM} kcal each` },
    ],
    notes,
    raw: { totalKcal: Math.round(total), dailyKcal: Math.round(daily), meals, stapleLb: round(stapleLb, 2), readyItems: ceil(readyItems) },
  };
});

export default {
  id: 'food', title: 'Food Calculator', icon: 'food',
  summary: 'Estimate calories, meals and quantities of staples and canned food.',
  tags: ['food', 'calories', 'meals', 'pantry', 'staples'],
  fields, defaults: () => defaultsFor(fields), compute,
  assumptions: [
    'Adults about 2,000 kcal per day and children about 1,400 kcal per day by default. You can change both.',
    'Cold weather or heavy work adds 25% to the base calories.',
    'Breastfeeding adds about 400 kcal and pregnancy about 350 kcal per day per person (rough planning estimates).',
    'Dry staples about 1,600 kcal per pound; ready-to-eat can or pouch about 400 kcal.',
  ],
  limitations: [
    'This is a calorie estimate, not a nutrition plan. It does not balance protein, vitamins or fiber.',
    'Individual needs vary a lot with age, size, health and activity.',
    'It does not cover infant feeding, medical diets or allergies beyond reminders.',
  ],
  related: ['food-storage-basics', 'emergency-meal-planning', 'pantry-staples'],
};
