// Everything that crosses a trust boundary goes through here: links, plan files and stored copies.
// decode -> migrate -> validate (clamp, type-check, allow-list) -> plan object the UI can trust.
// Also: the link format, version vectors and merging two copies of the same plan.

import { LIMITS } from './config.js';
import { SCHEMA, SEGS, TEMPLATES, KINDS, ENDS, EXPLICIT, ID_RE, uid } from './model.js';

const LZ = () => globalThis.LZString;

// ---------- primitive sanitizers ----------
const str = (v, max) => (typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v)) ? String(v) : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
const bool = v => v === true;
const num = v => (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : 0;
const oneOf = (v, list, d) => list.includes(v) ? v : d;
const date = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
export function safeUrl(v) {
  const s = str(v, LIMITS.url).trim();
  if (!s) return '';
  try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : ''; } catch (e) { return ''; }
}
export function cleanUrl(v) {
  const s = safeUrl(v); if (!s) return '';
  const u = new URL(s);
  if (/(^|\.)spotify\.com$/.test(u.hostname)) u.search = '';
  return u.toString();
}
export const safeEmail = v => { const s = str(v, LIMITS.email).trim(); return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s) ? s : ''; };
const id = (v, seen, n = 8) => { let s = typeof v === 'string' && ID_RE.test(v) ? v : uid(n); while (seen && seen.has(s)) s = uid(n); seen && seen.add(s); return s; };
const tags = v => Array.isArray(v) ? [...new Set(v.map(x => str(x, LIMITS.tag).trim()).filter(Boolean))].slice(0, LIMITS.tags) : [];
const vv = v => {
  const out = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) Object.entries(v).slice(0, LIMITS.devices).forEach(([k, n]) => { if (ID_RE.test(k)) out[k] = num(n); });
  return out;
};

// ---------- migrate old shapes forward ----------
export function migrate(o) {
  if (!o || typeof o !== 'object') return null;
  const v = num(o.v) || 2;
  if (v < 3) {
    // v0.2 links had no version vector. Mark them legacy so reconcile falls back to timestamps.
    o = { ...o, v: SCHEMA, clock: 0, vv: {}, legacy: true, sentClock: 0 };
  }
  return o;
}

// ---------- validate into a trusted plan ----------
export function validate(o) {
  o = migrate(o);
  if (!o || !Array.isArray(o.moments)) return null;
  const seen = new Set();
  const segs = Object.keys(SEGS);
  const endKeys = ENDS.map(e => e[0]);
  const moments = o.moments.slice(0, LIMITS.moments).filter(m => m && typeof m === 'object').map(m => ({
    id: id(m.id, seen), seg: oneOf(m.seg, segs, 'reception'), label: str(m.label, LIMITS.label) || 'Moment',
    kind: oneOf(m.kind, KINDS, 'song'), key: bool(m.key), off: bool(m.off), custom: bool(m.custom), dj: bool(m.dj),
    title: str(m.title, LIMITS.title), url: safeUrl(m.url), start: str(m.start, LIMITS.time), end: oneOf(m.end, endKeys, 'moment'),
    endAt: str(m.endAt, LIMITS.time), note: str(m.note, LIMITS.note), announce: str(m.announce, LIMITS.announce), r: num(m.r),
  }));
  const songs = list => (Array.isArray(list) ? list : []).slice(0, LIMITS.songs).filter(s => s && typeof s === 'object')
    .map(s => ({ id: id(s.id, seen), title: str(s.title, LIMITS.title), url: safeUrl(s.url), r: num(s.r) }))
    .filter(s => s.title || s.url);
  const dj = o.dj && typeof o.dj === 'object' ? o.dj : {};
  const couple = o.couple && typeof o.couple === 'object' ? o.couple : {};
  const vibe = o.vibe && typeof o.vibe === 'object' ? o.vibe : {};
  return {
    v: SCHEMA, id: typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : uid(12),
    dj: { name: str(dj.name, LIMITS.djName), email: safeEmail(dj.email) },
    couple: { names: str(couple.names, LIMITS.names), date: date(couple.date), due: date(couple.due) },
    template: oneOf(o.template, Object.keys(TEMPLATES), 'banquet'),
    moments, must: songs(o.must), dnp: songs(o.dnp),
    vibe: { langs: tags(vibe.langs), genres: tags(vibe.genres), explicit: oneOf(vibe.explicit, EXPLICIT.map(e => e[0]), 'radio'), notes: str(vibe.notes, LIMITS.vibeNotes) },
    started: bool(o.started), sentAt: num(o.sentAt), sentClock: num(o.sentClock), created: num(o.created), updated: num(o.updated),
    clock: num(o.clock), vv: vv(o.vv), lr: num(o.lr), vr: num(o.vr), or: num(o.or),
    gone: (Array.isArray(o.gone) ? o.gone : []).filter(g => typeof g === 'string' && ID_RE.test(g)).slice(-LIMITS.gone),
    legacy: bool(o.legacy),
  };
}

// ---------- wire format ----------
// Only known fields travel. Device-only state (base, nudges, preview flags) never leaves the device.
const WIRE_MOMENT = ['id', 'seg', 'label', 'kind', 'key', 'off', 'custom', 'dj', 'title', 'url', 'start', 'end', 'endAt', 'note', 'announce', 'r'];
const prune = o => { const out = {}; for (const [k, v] of Object.entries(o)) { if (v === '' || v === false || v === 0 || v == null) continue; if (Array.isArray(v) && !v.length) continue; if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue; out[k] = v; } return out; };
export function toWire(p) {
  return prune({
    v: SCHEMA, id: p.id, dj: prune(p.dj), couple: prune(p.couple), template: p.template,
    moments: p.moments.map(m => { const o = {}; WIRE_MOMENT.forEach(k => { o[k] = m[k]; }); if (o.end === 'moment') o.end = ''; if (o.kind === 'song') o.kind = ''; return prune(o); }),
    must: p.must.map(s => prune({ id: s.id, title: s.title, url: s.url, r: s.r })),
    dnp: p.dnp.map(s => prune({ id: s.id, title: s.title, url: s.url, r: s.r })),
    vibe: prune({ langs: p.vibe.langs, genres: p.vibe.genres, explicit: p.vibe.explicit === 'radio' ? '' : p.vibe.explicit, notes: p.vibe.notes }),
    started: p.started, sentAt: p.sentAt, sentClock: p.sentClock, created: p.created, updated: p.updated,
    clock: p.clock, vv: p.vv, lr: p.lr, vr: p.vr, or: p.or, gone: p.gone,
  });
}
export const encode = p => LZ().compressToEncodedURIComponent(JSON.stringify(toWire(p)));
// Real plans are a few KB. Anything far beyond that is refused before and after decompressing.
const MAX_LINK = 60000, MAX_JSON = 1500000;
export function decode(s) {
  try {
    s = String(s || '');
    if (!s || s.length > MAX_LINK) return null;
    const json = LZ().decompressFromEncodedURIComponent(s);
    if (!json || json.length > MAX_JSON) return null;
    return validate(JSON.parse(json));
  } catch (e) { return null; }
}
export const editLink = (base, p) => base + '#i=' + encode(p);
export const planLink = (base, p, now = Date.now()) => base + '#p=' + encode({ ...p, sentAt: now, sentClock: p.clock });

// ---------- plan files (fallback when a link is too long) ----------
export const toFile = (p, kind) => JSON.stringify({ app: 'firstcue', format: 1, kind: kind === 'plan' ? 'plan' : 'progress', plan: toWire(kind === 'plan' ? { ...p, sentAt: Date.now(), sentClock: p.clock } : p) }, null, 1);
export function fromFile(text) {
  try {
    if (String(text).length > MAX_JSON) return null;
    const o = JSON.parse(String(text).replace(/^\uFEFF/, ''));
    if (!o || o.app !== 'firstcue') return null;
    const plan = validate(o.plan);
    return plan ? { kind: o.kind === 'plan' ? 'plan' : 'progress', plan } : null;
  } catch (e) { return null; }
}

// ---------- version vectors ----------
// Each device counts its own edits. Comparing vectors tells us whether one copy already
// contains the other (safe to replace) or both have edits the other hasn't seen (conflict).
export function vvCompare(a = {}, b = {}) {
  let aMore = false, bMore = false;
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => { const x = a[k] || 0, y = b[k] || 0; if (x > y) aMore = true; if (y > x) bMore = true; });
  return aMore && bMore ? 'concurrent' : aMore ? 'a' : bMore ? 'b' : 'equal';
}
export const vvMax = (a = {}, b = {}) => { const o = { ...a }; Object.entries(b).forEach(([k, n]) => { o[k] = Math.max(o[k] || 0, n); }); return o; };

const sameContent = (a, b) => { const w = p => JSON.stringify({ ...toWire(p), vv: 0, clock: 0, updated: 0, sentAt: 0, sentClock: 0, created: 0 }); return w(a) === w(b); };

// Decide what to do when a link (incoming) meets this device's copy (local).
// Returns { action: 'new' | 'take' | 'keep' | 'same' | 'conflict', older?: boolean }.
export function reconcile(local, incoming) {
  if (!local) return { action: 'new' };
  if (local.legacy || incoming.legacy || (!Object.keys(local.vv).length && !Object.keys(incoming.vv).length)) {
    if (sameContent(local, incoming)) return { action: 'same' };
    return incoming.updated > local.updated ? { action: 'take' } : { action: 'keep', older: incoming.updated < local.updated };
  }
  const c = vvCompare(local.vv, incoming.vv);
  if (c === 'equal') return { action: 'same' };
  if (c === 'a') return { action: 'keep', older: true };
  if (c === 'b') return { action: 'take' };
  return sameContent(local, incoming) ? { action: 'take' } : { action: 'conflict' };
}

// Moments whose content differs between two copies (for the conflict message).
export function differingMoments(a, b) {
  const key = m => JSON.stringify([m.off, m.dj, m.title, m.url, m.start, m.end, m.endAt, m.note, m.announce, m.label]);
  const bm = new Map(b.moments.map(m => [m.id, m]));
  const out = [];
  a.moments.forEach(m => { const o = bm.get(m.id); if (!o || key(o) !== key(m)) out.push(m.label); });
  b.moments.forEach(m => { if (!a.moments.some(x => x.id === m.id)) out.push(m.label); });
  return [...new Set(out)];
}

// Merge two concurrent copies. For each moment the most recently edited version wins;
// moments or songs added on either side are kept unless deleted on the other.
export function merge(local, incoming) {
  const gone = new Set([...local.gone, ...incoming.gone]);
  const L = new Map(local.moments.map(m => [m.id, m])), I = new Map(incoming.moments.map(m => [m.id, m]));
  const orderSrc = incoming.or >= local.or ? incoming : local, other = orderSrc === incoming ? local : incoming;
  const pick = (a, b) => (!a ? b : !b ? a : (b.r > a.r ? b : a));
  const moments = [];
  orderSrc.moments.forEach(m => { if (!gone.has(m.id)) moments.push({ ...pick(L.get(m.id), I.get(m.id)) }); });
  other.moments.forEach(m => {
    if (gone.has(m.id) || moments.some(x => x.id === m.id)) return;
    const lastSame = moments.map(x => x.seg).lastIndexOf(m.seg);
    moments.splice(lastSame < 0 ? moments.length : lastSame + 1, 0, { ...m });
  });
  const listSrc = incoming.lr >= local.lr ? incoming : local, listOther = listSrc === incoming ? local : incoming;
  const must = listSrc.must.filter(s => !gone.has(s.id)).map(s => ({ ...s }));
  const dnp = listSrc.dnp.filter(s => !gone.has(s.id)).map(s => ({ ...s }));
  const have = new Set([...must, ...dnp].map(s => s.id));
  listOther.must.forEach(s => { if (!gone.has(s.id) && !have.has(s.id)) must.push({ ...s }); });
  listOther.dnp.forEach(s => { if (!gone.has(s.id) && !have.has(s.id)) dnp.push({ ...s }); });
  const newer = incoming.clock >= local.clock ? incoming : local;
  return {
    ...newer, moments, must, dnp,
    vibe: { ...(incoming.vr >= local.vr ? incoming : local).vibe },
    started: local.started || incoming.started,
    sentAt: Math.max(local.sentAt, incoming.sentAt), sentClock: Math.max(local.sentClock, incoming.sentClock),
    clock: Math.max(local.clock, incoming.clock), vv: vvMax(local.vv, incoming.vv),
    lr: Math.max(local.lr, incoming.lr), vr: Math.max(local.vr, incoming.vr), or: Math.max(local.or, incoming.or),
    gone: [...gone].slice(-LIMITS.gone), updated: Math.max(local.updated, incoming.updated), legacy: false,
  };
}
