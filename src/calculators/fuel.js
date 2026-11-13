import { GAL_TO_L, MI_TO_KM, MPG_TO_L100, round, ceil, num, defaultsFor, makeCompute } from './common.js';

export const fields = [
  { key: 'units', label: 'Units', type: 'select', default: 'us', options: [{ value: 'us', label: 'Miles, miles per gallon, gallons' }, { value: 'metric', label: 'Kilometers, L/100 km, liters' }] },
  { key: 'distance', label: 'Trip distance', unit: 'mi or km', type: 'number', min: 0.1, max: 20000, default: 150 },
  { key: 'economy', label: 'Fuel economy', unit: 'mpg or L/100 km', type: 'number', min: 1, max: 500, default: 25, help: 'Use your own number from the trip computer or past fill-ups.' },
  { key: 'tank', label: 'Tank size', unit: 'gal or L', type: 'number', min: 1, max: 500, default: 14 },
  { key: 'currentPct', label: 'Fuel in tank now', unit: '%', type: 'number', min: 0, max: 100, default: 50 },
  { key: 'reservePct', label: 'Safety reserve', unit: '% of tank', type: 'number', min: 0, max: 50, default: 20, help: 'Never plan to arrive on empty. Stations may be closed or out of fuel.' },
  { key: 'traffic', label: 'Traffic', type: 'select', default: '1', options: [{ value: '1', label: 'Free-flowing' }, { value: '1.3', label: 'Heavy, stop-and-go (+30%)' }, { value: '1.6', label: 'Gridlock (+60%)' }] },
  { key: 'conditions', label: 'Conditions', type: 'select', default: '1', options: [{ value: '1', label: 'Normal' }, { value: '1.1', label: 'Heavy load, hills, A/C or heater (+10%)' }] },
  { key: 'idleHours', label: 'Expected idling time', unit: 'hours', type: 'number', min: 0, max: 100, default: 0, help: 'Waiting in traffic or running the engine for heat.' },
  { key: 'idleRate', label: 'Idle fuel use (optional)', unit: 'gal/h or L/h', type: 'number', optional: true, min: 0.01, max: 20, default: null, help: 'Leave blank to use about 0.3 gal/h (1.1 L/h).' },
];

export const DEFAULT_IDLE_L_PER_H = 0.3 * GAL_TO_L;

export const compute = makeCompute(fields, (v) => {
  const metric = v.units === 'metric';
  const km = metric ? v.distance : v.distance * MI_TO_KM;
  const l100 = metric ? v.economy : MPG_TO_L100 / v.economy;
  const tankL = metric ? v.tank : v.tank * GAL_TO_L;
  const idleL = v.idleRate == null ? DEFAULT_IDLE_L_PER_H : (metric ? v.idleRate : v.idleRate * GAL_TO_L);
  const mult = Number(v.traffic) * Number(v.conditions);

  const driveL = (km * l100 / 100) * mult;
  const idlingL = v.idleHours * idleL;
  const needL = driveL + idlingL;
  const reserveL = tankL * (v.reservePct / 100);
  const haveL = tankL * (v.currentPct / 100);
  const usableNow = Math.max(0, haveL - reserveL);
  const shortL = Math.max(0, needL - usableNow);
  const perFill = tankL * (1 - v.reservePct / 100);
  const stops = shortL > 0 ? (perFill > 0 ? Math.ceil(shortL / perFill - 1e-9) : Infinity) : 0;
  const rangeKm = usableNow / (l100 * mult / 100);

  const toVol = (l) => (metric ? l : l / GAL_TO_L);
  const volUnit = metric ? 'L' : 'gal';
  const toDist = (k) => (metric ? k : k / MI_TO_KM);
  const distUnit = metric ? 'km' : 'mi';

  const notes = [];
  if (!Number.isFinite(stops)) notes.push('Your reserve is as large as the tank, so refueling cannot be planned. Lower the reserve.');
  if (stops > 0) notes.push('You will need to refuel on the way. Fuel stations need electricity and may be closed or out of fuel. Fill up before you leave and carry cash.');
  if (mult > 1) notes.push('Traffic and conditions raise consumption, so the estimate is higher than free-flow driving.');
  notes.push('Never carry fuel inside the passenger area. See the Fuel Storage Safety guide.');

  return {
    results: [
      { label: 'Fuel needed for the trip', value: `${num(toVol(needL), 1)} ${volUnit}`, primary: true, note: `${num(toVol(driveL), 1)} driving + ${num(toVol(idlingL), 1)} idling` },
      { label: 'Fuel to add (with reserve)', value: `${num(toVol(Math.max(0, needL + reserveL - haveL)), 1)} ${volUnit}`, note: `Reserve ${num(toVol(reserveL), 1)} ${volUnit}` },
      { label: 'Fuel in tank now', value: `${num(toVol(haveL), 1)} ${volUnit}` },
      { label: 'Distance on current fuel (above reserve)', value: `${num(toDist(rangeKm), 0)} ${distUnit}` },
      { label: 'Refueling stops needed', value: Number.isFinite(stops) ? String(stops) : 'n/a' },
      { label: 'Full-tank range at this consumption', value: `${num(toDist(perFill / (l100 * mult / 100)), 0)} ${distUnit}`, note: 'above the safety reserve' },
    ],
    notes,
    raw: { needL: round(needL, 3), driveL: round(driveL, 3), idlingL: round(idlingL, 3), toAddL: round(Math.max(0, needL + reserveL - haveL), 3), rangeKm: round(rangeKm, 2), stops: Number.isFinite(stops) ? stops : null },
  };
});

export default {
  id: 'fuel', title: 'Fuel Planning Calculator', icon: 'car',
  summary: 'Estimate fuel for an evacuation or trip, with traffic, idling and a safety reserve.',
  tags: ['fuel', 'gas', 'gasoline', 'evacuation', 'range', 'mpg'],
  fields, defaults: () => defaultsFor(fields), compute,
  assumptions: [
    'Fuel = distance ÷ economy, multiplied by traffic and conditions factors, plus idling.',
    'Heavy traffic adds 30% and gridlock 60% to consumption; heavy load or A/C adds 10%.',
    'Idling defaults to about 0.3 gallons (1.1 liters) per hour unless you enter your own.',
    'A safety reserve (default 20% of the tank) is kept untouched.',
  ],
  limitations: [
    'Your fuel economy varies with speed, load, weather and vehicle condition.',
    'Does not account for fuel availability, closures or detours.',
    'Electric vehicles need a different calculation: plan charging stops and expect lower range in cold weather.',
  ],
  related: ['fuel-and-routes', 'evacuation-planning'],
};
