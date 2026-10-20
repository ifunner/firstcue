// Escaping-by-default HTML templates.
// Every value inside html`...` is escaped (text and attributes alike) unless it is itself
// the result of html`...` or raw(). Arrays are joined. null/undefined/false render as nothing.

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => MAP[c]);

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = s => new Safe(String(s));
export const isSafe = v => v instanceof Safe;

const part = v => (v == null || v === false) ? ''
  : v instanceof Safe ? v.s
  : Array.isArray(v) ? v.map(part).join('')
  : esc(v);

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Safe(out);
}

// Links from plans are validated on the way in; this is a second guard at render time.
export const href = u => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '#');
