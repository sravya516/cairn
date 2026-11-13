import { round, num, defaultsFor, makeCompute } from './common.js';

/** Typical, approximate loads for quick adding. Check the label on your own devices. */
export const PRESETS = [
  { name: 'Phone charging', watts: 15, hours: 2, qty: 1 },
  { name: 'LED lantern or bulb', watts: 8, hours: 5, qty: 2 },
  { name: 'Wi-Fi router', watts: 10, hours: 8, qty: 1 },
  { name: 'Laptop', watts: 50, hours: 4, qty: 1 },
  { name: 'CPAP machine', watts: 40, hours: 8, qty: 1 },
  { name: 'Refrigerator (running time)', watts: 150, hours: 8, qty: 1 },
  { name: 'Box fan', watts: 50, hours: 8, qty: 1 },
  { name: 'Small TV', watts: 60, hours: 3, qty: 1 },
  { name: 'Radio or weather radio', watts: 5, hours: 6, qty: 1 },
  { name: 'Oxygen concentrator', watts: 300, hours: 24, qty: 1 },
];

export const fields = [
  { key: 'devices', label: 'Devices', type: 'devices', default: [PRESETS[0], PRESETS[1], PRESETS[2]] },
  { key: 'days', label: 'Days to cover', type: 'number', integer: true, min: 1, max: 60, default: 1 },
  { key: 'reserve', label: 'Reserve', unit: '%', type: 'number', min: 0, max: 200, default: 25, help: 'Extra capacity for losses, cold, battery aging and surprises.' },
  { key: 'useInverter', label: 'Devices use AC outlets (inverter)', type: 'checkbox', default: true },
  { key: 'inverterEff', label: 'Inverter efficiency', unit: '%', type: 'number', min: 50, max: 100, default: 90, help: 'Typical inverters are about 85–92% efficient.' },
  { key: 'dod', label: 'Usable battery capacity', unit: '%', type: 'number', min: 30, max: 100, default: 90, help: 'Lithium iron phosphate and many power stations allow 80–100%. Lead-acid should stay near 50%.' },
  { key: 'voltage', label: 'Battery voltage (for amp-hours)', type: 'select', default: 12, options: [{ value: 12, label: '12 V' }, { value: 24, label: '24 V' }, { value: 48, label: '48 V' }] },
];

export const compute = makeCompute(fields, (v) => {
  const rows = v.devices.map((d) => ({ ...d, wh: d.watts * d.hours * d.qty }));
  const whDay = rows.reduce((n, r) => n + r.wh, 0);
  const peakW = v.devices.reduce((n, d) => n + d.watts * d.qty, 0);
  if (whDay <= 0) return { errors: { devices: 'Add a device that uses power for at least part of the day.' } };

  const whTotal = whDay * v.days;
  const eff = v.useInverter ? v.inverterEff / 100 : 1;
  const afterInverter = whTotal / eff;
  const capacity = (afterInverter / (v.dod / 100)) * (1 + v.reserve / 100);

  const notes = [
    'Devices that start motors (refrigerators, pumps, power tools) briefly draw several times their running watts. Make sure your inverter or station’s surge rating covers that.',
    'Heating and cooling appliances (space heaters, hair dryers, electric stoves, air conditioners) use 1,000 W or more and drain batteries very quickly.',
  ];
  if (peakW > 1500) notes.push(`If everything ran at once it would draw about ${num(peakW, 0)} W. Many portable power stations top out below that.`);
  if (v.devices.some((d) => /oxygen|cpap|ventilator|dialysis|insulin/i.test(d.name))) notes.push('Medical equipment: ask your provider and your electric utility about backup plans. Do not rely on a single battery for life-sustaining equipment.');

  return {
    results: [
      { label: 'Recommended battery capacity', value: `${num(capacity, 0)} Wh`, note: `${num(capacity / 1000, 2)} kWh`, primary: true },
      { label: 'Energy used per day', value: `${num(whDay, 0)} Wh` },
      { label: `Energy for ${v.days} day${v.days > 1 ? 's' : ''}`, value: `${num(whTotal, 0)} Wh` },
      { label: 'After inverter losses', value: `${num(afterInverter, 0)} Wh` },
      { label: `Amp-hours at ${v.voltage} V`, value: `${num(capacity / v.voltage, 0)} Ah` },
      { label: 'Peak load if all run at once', value: `${num(peakW, 0)} W` },
    ],
    breakdown: rows.map((r) => ({ name: r.name, wh: round(r.wh, 1) })),
    notes,
    raw: { whDay: round(whDay, 2), whTotal: round(whTotal, 2), capacityWh: round(capacity, 2), peakW },
  };
});

export default {
  id: 'power', title: 'Power Calculator', icon: 'power',
  summary: 'Total watt-hours for your devices and the battery capacity to power them.',
  tags: ['power', 'watts', 'watt-hours', 'battery capacity', 'inverter', 'generator'],
  fields, defaults: () => defaultsFor(fields), compute,
  assumptions: [
    'Watt-hours = watts × hours of use × number of devices.',
    'AC devices lose energy in the inverter (default 90% efficient).',
    'Only part of a battery is usable (default 90%). The calculator divides by that fraction.',
    'A reserve (default 25%) is added on top. Raise it for cold weather or old batteries.',
  ],
  limitations: [
    'Uses the watts you enter. Real consumption varies: check the label or use a plug-in power meter.',
    'Appliances that cycle (refrigerators) should use their running hours, not 24 hours.',
    'Does not model startup surges, solar input or battery aging.',
  ],
  related: ['power-calculations', 'portable-power-stations'],
};
