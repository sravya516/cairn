import { CUFT_PER_GAL, WATER_LB_PER_GAL, LB_TO_KG, GAL_TO_L, round, ceil, num, defaultsFor, makeCompute } from './common.js';

export const fields = [
  { key: 'people', label: 'People', type: 'number', integer: true, min: 1, max: 100, default: 4 },
  { key: 'days', label: 'Days of supplies', type: 'number', integer: true, min: 1, max: 365, default: 14 },
  { key: 'waterGal', label: 'Water per person per day', unit: 'gal', type: 'number', min: 0, max: 10, default: 1 },
  { key: 'foodLb', label: 'Food per person per day', unit: 'lb', type: 'number', min: 0, max: 10, default: 1.7, help: 'Packed weight including cans and packaging. Dry staples weigh less; canned food weighs more.' },
  { key: 'foodCuFtPerLb', label: 'Food volume', unit: 'cu ft per lb', type: 'number', min: 0.005, max: 0.2, default: 0.035, help: 'Dry rice is about 0.022; mixed cans, boxes and bags are about 0.035–0.045.' },
  { key: 'waterOverhead', label: 'Container and spacing overhead for water', unit: '%', type: 'number', min: 0, max: 100, default: 15 },
  { key: 'otherPct', label: 'Other supplies (kits, fuel, gear)', unit: '% of water + food volume', type: 'number', min: 0, max: 300, default: 20 },
];

export const TOTE_CU_FT = 3.6;   // a 27-gallon storage tote, usable interior volume
export const DRUM_GAL = 55;
export const DRUM_FOOTPRINT_SQFT = 3; // 23 in. diameter barrel, rounded up
export const JUG_FOOTPRINT_SQFT = 0.85; // 5-gal jug about 11 x 11 in.
export const SHELF_LEVEL_CU_FT = 4.5; // 36 in. x 18 in. x 12 in. clearance

export const compute = makeCompute(fields, (v) => {
  const waterGal = v.people * v.days * v.waterGal;
  const waterCuFt = waterGal * CUFT_PER_GAL * (1 + v.waterOverhead / 100);
  const waterLb = waterGal * WATER_LB_PER_GAL;
  const foodLb = v.people * v.days * v.foodLb;
  const foodCuFt = foodLb * v.foodCuFtPerLb;
  const otherCuFt = (waterCuFt + foodCuFt) * (v.otherPct / 100);
  const totalCuFt = waterCuFt + foodCuFt + otherCuFt;
  const totalLb = waterLb + foodLb;

  const jugs = ceil(waterGal / 5);
  const drums = waterGal / DRUM_GAL;
  const totes = ceil(foodCuFt / TOTE_CU_FT);
  const shelfLevels = ceil(foodCuFt / (SHELF_LEVEL_CU_FT * 0.7));

  return {
    results: [
      { label: 'Total storage volume', value: `${num(totalCuFt)} cu ft`, note: `${num(totalCuFt * 28.3168, 0)} liters`, primary: true },
      { label: 'Water volume', value: `${num(waterCuFt)} cu ft`, note: `${num(waterGal)} gal (${num(waterGal * GAL_TO_L, 0)} L)` },
      { label: 'Food volume', value: `${num(foodCuFt)} cu ft`, note: `${num(foodLb, 0)} lb of food` },
      { label: 'Other supplies', value: `${num(otherCuFt)} cu ft` },
      { label: 'Water containers', value: `${jugs} five-gallon jugs`, note: `floor space about ${num(jugs * JUG_FOOTPRINT_SQFT)} sq ft, or ${num(drums, 1)} of a 55-gallon drum` },
      { label: 'Food storage', value: `${totes} totes (27 gal)`, note: `or about ${shelfLevels} shelf levels (36 × 18 in)` },
      { label: 'Weight of water and food', value: `${num(totalLb, 0)} lb`, note: `${num(totalLb * LB_TO_KG, 0)} kg` },
    ],
    notes: [
      'Water is heavy: 8.3 lb per gallon. Store large amounts on a ground floor or strong shelving, never on weak shelves.',
      'Keep stored water and food cool, dry, dark and off the floor where practical.',
      'Spread supplies across rooms so one leak, fire or collapse does not take everything.',
    ],
    raw: { waterGal: round(waterGal, 2), waterCuFt: round(waterCuFt, 3), foodCuFt: round(foodCuFt, 3), totalCuFt: round(totalCuFt, 3), totalLb: round(totalLb, 2), jugs, totes },
  };
});

export default {
  id: 'storage', title: 'Storage Space Calculator', icon: 'shelter',
  summary: 'How much room your water, food and supplies need, and how heavy they are.',
  tags: ['storage', 'space', 'volume', 'weight', 'shelves', 'closet'],
  fields, defaults: () => defaultsFor(fields), compute,
  assumptions: [
    'One gallon of water occupies 0.1337 cubic feet and weighs about 8.3 pounds.',
    'Containers add 15% to water volume by default.',
    'Food is estimated at 1.7 pounds and 0.035 cubic feet per pound per person-day.',
    'A 27-gallon tote holds about 3.6 cubic feet; shelf levels count 70% usable volume.',
  ],
  limitations: [
    'Packaging, shapes and stacking waste vary. Use this as a first estimate, then measure your space.',
    'Does not check floor load limits. Large water stores can exceed what some shelves or floors can hold.',
  ],
  related: ['water-storage-containers', 'food-storage-basics', 'prepare-30-days'],
};
