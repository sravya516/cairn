// Inline formatting for guide text: **bold** only. Pure and safe: returns plain parts, never HTML.
export function inlineParts(str) {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  const s = String(str);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ b: false, v: s.slice(last, m.index) });
    out.push({ b: true, v: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ b: false, v: s.slice(last) });
  return out;
}

export const stripInline = (str) => String(str).replace(/\*\*/g, '');

/** Turns a phone string into a safe tel: link, or null if it is not dialable. */
export function telHref(phone) {
  // Drop an extension ("x22", "ext. 5", "#5") so it never becomes part of the dialed number.
  const main = String(phone || '').trim().split(/\s*(?:x|ext\.?|#)/i)[0];
  if (!main || /[^0-9+()\-.\s]/.test(main)) return null; // anything else is not a phone number
  const digits = main.replace(/[^\d+]/g, '');
  if (!/^\+?\d{3,15}$/.test(digits)) return null;
  return 'tel:' + digits;
}
