// Shared calculator helpers: unit constants, rounding and schema-driven input validation.
// Calculators are pure (inputs in, results out) so they can be tested without a browser.

export const GAL_TO_L = 3.785411784;
export const MI_TO_KM = 1.609344;
export const LB_TO_KG = 0.45359237;
export const CUFT_PER_GAL = 0.133680556;
export const WATER_LB_PER_GAL = 8.345;
export const MPG_TO_L100 = 235.214583; // L/100km = 235.2146 / mpg

export const round = (n, d = 1) => { const f = 10 ** d; return Math.round((n + Number.EPSILON) * f) / f; };
export const ceil = (n, d = 0) => { const f = 10 ** d; return Math.ceil(n * f - 1e-9) / f; };

export const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n, d = 1) => round(n, d).toLocaleString('en-US', { maximumFractionDigits: d });

export function hoursToText(h) {
  if (!Number.isFinite(h)) return '—';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60), mm = total % 60;
  if (hh >= 48) return `${num(h / 24, 1)} days`;
  return hh ? `${hh} h ${mm} min` : `${mm} min`;
}

/**
 * Validates raw inputs (often strings from form fields) against a field schema.
 * Returns { ok, values, errors } where values are cleaned/typed. Optional numeric fields may be empty (-> null).
 */
export function validateFields(fields, raw) {
  const values = {}, errors = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (f.type === 'checkbox') { values[f.key] = v === true || v === 'true' || v === 'on'; continue; }
    if (f.type === 'select') {
      const hit = f.options.find((o) => String(o.value) === String(v));
      if (!hit) { errors[f.key] = 'Choose one of the options.'; continue; }
      values[f.key] = hit.value;
      continue;
    }
    if (f.type === 'devices') {
      const rows = Array.isArray(v) ? v : [];
      const clean = [];
      if (rows.length > 40) { errors[f.key] = 'Up to 40 devices.'; continue; }
      let bad = null;
      rows.forEach((r, i) => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) { bad = bad || `Device ${i + 1} is not valid. Remove it and add it again.`; return; }
        const watts = Number(r.watts), hours = Number(r.hours), qty = Number(r.qty);
        const name = String(r.name || '').trim().slice(0, 60) || `Device ${i + 1}`;
        if (!Number.isFinite(watts) || watts < 0 || watts > 20000) bad = `${name}: watts must be 0–20,000.`;
        else if (!Number.isFinite(hours) || hours < 0 || hours > 24) bad = `${name}: hours per day must be 0–24.`;
        else if (!Number.isInteger(qty) || qty < 1 || qty > 100) bad = `${name}: number of devices must be a whole number from 1 to 100.`;
        else clean.push({ name, watts, hours, qty });
      });
      if (bad) errors[f.key] = bad;
      else if (!clean.length) errors[f.key] = 'Add at least one device.';
      else values[f.key] = clean;
      continue;
    }
    // number
    if (v === '' || v == null) {
      if (f.optional) { values[f.key] = null; continue; }
      errors[f.key] = 'Enter a number.';
      continue;
    }
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    if (!Number.isFinite(n)) { errors[f.key] = 'Enter a valid number.'; continue; }
    if (f.integer && !Number.isInteger(n)) { errors[f.key] = 'Use a whole number.'; continue; }
    if (f.min != null && n < f.min) { errors[f.key] = `Must be at least ${f.min}.`; continue; }
    if (f.max != null && n > f.max) { errors[f.key] = `Must be ${f.max} or less.`; continue; }
    values[f.key] = n;
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

export function defaultsFor(fields) {
  const out = {};
  for (const f of fields) out[f.key] = f.type === 'devices' ? structuredClone(f.default) : f.default;
  return out;
}

/** Wraps a compute function with validation so every calculator reports errors the same way. */
export function makeCompute(fields, run) {
  return (raw) => {
    const v = validateFields(fields, raw);
    if (!v.ok) return { ok: false, errors: v.errors };
    const extra = run(v.values);
    if (extra.errors) return { ok: false, errors: extra.errors };
    return { ok: true, ...extra };
  };
}

/**
 * Rebuilds calculator inputs from whatever was saved last time. Pure and defensive: anything of the wrong kind,
 * the wrong shape or too large is ignored and the default is used instead, so damaged saved data can never crash a screen.
 */
export function restoreInputs(calc, saved) {
  const inputs = calc.defaults();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return inputs;
  const scalar = (v) => (typeof v === 'string' ? v.slice(0, 40) : typeof v === 'number' && Number.isFinite(v) ? v : '');
  for (const f of calc.fields) {
    const s = Object.prototype.hasOwnProperty.call(saved, f.key) ? saved[f.key] : undefined;
    if (s === undefined) continue;
    if (f.type === 'devices') {
      if (Array.isArray(s) && s.length <= 40 && s.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
        inputs[f.key] = s.map((x) => ({ name: typeof x.name === 'string' ? x.name.slice(0, 60) : '', watts: scalar(x.watts), hours: scalar(x.hours), qty: scalar(x.qty) }));
      }
    } else if (f.type === 'checkbox') {
      if (typeof s === 'boolean') inputs[f.key] = s;
    } else if (typeof s === 'string' || (typeof s === 'number' && Number.isFinite(s))) {
      inputs[f.key] = typeof s === 'string' ? s.slice(0, 40) : s;
    }
  }
  return inputs;
}
