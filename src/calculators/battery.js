import { round, num, hoursToText, defaultsFor, makeCompute } from './common.js';

export const fields = [
  { key: 'capacity', label: 'Battery capacity', type: 'number', min: 0.1, max: 1000000, default: 500 },
  { key: 'capacityUnit', label: 'Capacity unit', type: 'select', default: 'Wh', options: [{ value: 'Wh', label: 'Watt-hours (Wh)' }, { value: 'Ah', label: 'Amp-hours (Ah)' }, { value: 'mAh', label: 'Milliamp-hours (mAh)' }] },
  { key: 'voltage', label: 'Battery voltage', unit: 'V', type: 'number', min: 1, max: 60, default: 12, help: 'Needed for Ah and mAh. Phone power banks are about 3.7 V; many batteries are 12 V.' },
  { key: 'loadW', label: 'Load to power', unit: 'W', type: 'number', min: 0.1, max: 20000, default: 50 },
  { key: 'efficiency', label: 'Conversion efficiency', unit: '%', type: 'number', min: 50, max: 100, default: 90, help: 'Use about 85–92% for AC through an inverter, near 100% for DC or USB.' },
  { key: 'dod', label: 'Usable capacity', unit: '%', type: 'number', min: 10, max: 100, default: 90 },
  { key: 'targetHours', label: 'Runtime you want (optional)', unit: 'hours', type: 'number', optional: true, min: 0, max: 10000, default: 24 },
  { key: 'chargerW', label: 'Charging power', unit: 'W', type: 'number', min: 1, max: 20000, default: 100, help: 'Solar panel watts in full sun are lower in practice; use realistic output.' },
  { key: 'chargeEff', label: 'Charging efficiency', unit: '%', type: 'number', min: 30, max: 100, default: 85 },
  { key: 'startPct', label: 'Current charge level', unit: '%', type: 'number', min: 0, max: 100, default: 0 },
];

export const PHONE_CHARGE_WH = 12; // typical smartphone full charge, approximate

export function capacityToWh(capacity, unit, voltage) {
  if (unit === 'Wh') return capacity;
  if (unit === 'Ah') return capacity * voltage;
  return (capacity / 1000) * voltage; // mAh
}

export const compute = makeCompute(fields, (v) => {
  const capWh = capacityToWh(v.capacity, v.capacityUnit, v.voltage);
  const usableWh = capWh * (v.dod / 100);
  const deliverableWh = usableWh * (v.efficiency / 100);
  const runtimeH = deliverableWh / v.loadW;

  const whToRestore = capWh * (1 - v.startPct / 100);
  const chargeH = whToRestore / (v.chargerW * (v.chargeEff / 100));

  const results = [
    { label: 'Runtime at this load', value: hoursToText(runtimeH), note: `${num(runtimeH, 1)} hours`, primary: true },
    { label: 'Battery energy', value: `${num(capWh, 1)} Wh` },
    { label: 'Usable energy delivered', value: `${num(deliverableWh, 1)} Wh` },
    { label: 'Time to charge to full', value: hoursToText(chargeH), note: `${num(whToRestore, 0)} Wh to restore at ${num(v.chargerW * (v.chargeEff / 100), 0)} W effective` },
    { label: 'Phone charges (about 12 Wh each)', value: String(Math.floor(deliverableWh / PHONE_CHARGE_WH)) },
  ];

  const notes = ['Real runtime is usually shorter in cold weather, with an aging battery, or when the load spikes.'];
  let needWh = null, shortfall = null;
  if (v.targetHours) {
    needWh = (v.loadW * v.targetHours) / (v.efficiency / 100) / (v.dod / 100);
    shortfall = Math.max(0, needWh - capWh);
    results.push({ label: `Capacity needed for ${num(v.targetHours, 1)} h`, value: `${num(needWh, 0)} Wh`, note: shortfall > 0 ? `You are ${num(shortfall, 0)} Wh short` : 'Your battery is enough' });
  }
  if (v.capacityUnit !== 'Wh') notes.push(`Converted to watt-hours using ${v.voltage} V: Wh = ${v.capacityUnit === 'Ah' ? 'Ah' : 'mAh ÷ 1000'} × V.`);

  return { results, notes, raw: { capWh: round(capWh, 2), usableWh: round(usableWh, 2), deliverableWh: round(deliverableWh, 2), runtimeH: round(runtimeH, 3), chargeH: round(chargeH, 3), needWh: needWh == null ? null : round(needWh, 2) } };
});

export default {
  id: 'battery', title: 'Battery Calculator', icon: 'power',
  summary: 'Runtime of a battery at a given load, capacity needed, and charging time.',
  tags: ['battery', 'runtime', 'capacity', 'charging time', 'mAh', 'amp-hours'],
  fields, defaults: () => defaultsFor(fields), compute,
  assumptions: [
    'Energy (Wh) = amp-hours × volts, or milliamp-hours ÷ 1000 × volts.',
    'Runtime = capacity × usable fraction × conversion efficiency ÷ load watts.',
    'Charging time = energy to restore ÷ (charger watts × charging efficiency).',
    'A smartphone full charge is estimated at about 12 Wh.',
  ],
  limitations: [
    'Batteries lose capacity in cold weather and with age.',
    'Constant-power math ignores voltage sag and the slower final stage of charging.',
    'Solar charging depends on sun, angle and shade. Use realistic panel output.',
  ],
  related: ['batteries-maintenance', 'power-calculations', 'usb-phone-charging'],
};
