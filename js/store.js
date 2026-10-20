// The only module that touches browser storage. Swap this for a Supabase adapter in v1.1.
// One key per plan (firstcue:plan:<id>) plus an index, so saving one plan never rewrites the others.

import { validate } from './wire.js';
import { uid } from './model.js';

const K = { index: 'firstcue:index', plan: id => 'firstcue:plan:' + id, dj: 'firstcue:dj', device: 'firstcue:device', legacy: 'firstcue:plans' };
let onError = () => {};

function ls() { try { return globalThis.localStorage || null; } catch (e) { return null; } }
function read(k, fallback) { const s = ls(); if (!s) return fallback; try { const v = s.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
function write(k, v) {
  const s = ls(); if (!s) { onError('unavailable'); return false; }
  try { s.setItem(k, JSON.stringify(v)); return true; } catch (e) { onError(e && e.name === 'QuotaExceededError' ? 'full' : 'blocked'); return false; }
}

// Device-only fields that are kept with the plan on this device but never put in links.
const LOCAL_KEYS = ['local'];

export const Store = {
  onError(fn) { onError = fn; },
  available() { const s = ls(); if (!s) return false; try { s.setItem('firstcue:probe', '1'); s.removeItem('firstcue:probe'); return true; } catch (e) { return false; } },

  ids() { return (read(K.index, []) || []).filter(x => typeof x === 'string'); },
  get(id) {
    const raw = read(K.plan(id), null); if (!raw) return null;
    const p = validate(raw); if (!p) return null;
    LOCAL_KEYS.forEach(k => { if (raw[k] && typeof raw[k] === 'object') p[k] = raw[k]; });
    return p;
  },
  all() { return this.ids().map(id => this.get(id)).filter(Boolean); },
  save(p) {
    if (!p || p.demo || p.preview) return true;
    const ok = write(K.plan(p.id), p);
    if (ok) { const ids = this.ids(); if (!ids.includes(p.id)) write(K.index, [...ids, p.id]); }
    return ok;
  },
  remove(id) { const s = ls(); try { s && s.removeItem(K.plan(id)); } catch (e) {} write(K.index, this.ids().filter(x => x !== id)); },

  dj() { const d = read(K.dj, null); return d && typeof d === 'object' ? { name: String(d.name || ''), email: String(d.email || '') } : null; },
  setDj(d) { return write(K.dj, { name: d.name || '', email: d.email || '' }); },

  deviceId() {
    let d = read(K.device, null);
    if (typeof d !== 'string' || !/^[a-z0-9]{4,24}$/.test(d)) { d = uid(8); write(K.device, d); }
    return d;
  },

  // Ask the browser not to clear our data under storage pressure. Safari and Chrome may still decide.
  async persist() {
    try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist(); } catch (e) {}
    return false;
  },

  // Another tab on this device saved a plan.
  onExternalChange(fn) {
    globalThis.addEventListener && globalThis.addEventListener('storage', e => {
      if (e.key && e.key.startsWith('firstcue:plan:')) fn(e.key.slice('firstcue:plan:'.length));
    });
  },

  // One-time move from the v0.2 layout (all plans under one key).
  migrateLegacy() {
    const old = read(K.legacy, null);
    if (!old || typeof old !== 'object') return 0;
    let n = 0;
    Object.values(old).forEach(raw => { const p = validate(raw); if (p && !this.get(p.id)) { this.save(p); n++; } });
    const s = ls(); try { s && s.removeItem(K.legacy); } catch (e) {}
    return n;
  },
};
