// Plan data model, templates and pure helpers. No DOM, no storage: safe to unit test.

export const SCHEMA = 3;
export const SEGS = { ceremony: 'Ceremony', cocktail: 'Cocktail hour', reception: 'Reception', party: 'Dance floor' };
const t = (seg, label, o = {}) => ({ seg, label, kind: o.kind || 'song', key: !!o.key, off: !!o.off });

export const TEMPLATES = {
  banquet: { name: 'Chinese banquet', blurb: 'Ceremony, tea ceremony, banquet entrances, games', moments: [
    t('ceremony', 'Guests arriving', { kind: 'playlist' }),
    t('ceremony', 'Wedding party walks in', { key: true }),
    t('ceremony', 'Bride’s entrance', { key: true }),
    t('ceremony', 'Recessional', { key: true }),
    t('ceremony', 'Tea ceremony', { kind: 'playlist', off: true }),
    t('cocktail', 'Cocktail hour', { kind: 'playlist' }),
    t('reception', 'Parents & grandparents entrance', { key: true }),
    t('reception', 'Groomsmen entrance', { key: true }),
    t('reception', 'Bridesmaids entrance', { key: true }),
    t('reception', 'Couple’s entrance', { key: true }),
    t('reception', 'Dinner', { kind: 'playlist' }),
    t('reception', 'Father–daughter dance'),
    t('reception', 'First dance', { key: true }),
    t('reception', 'Games'),
    t('reception', 'Cake cutting'),
    t('party', 'Opening the dance floor'),
    t('party', 'Last song', { key: true }),
  ] },
  western: { name: 'Classic wedding', blurb: 'Ceremony, grand entrance, parent dances', moments: [
    t('ceremony', 'Guests arriving', { kind: 'playlist' }),
    t('ceremony', 'Wedding party walks in', { key: true }),
    t('ceremony', 'Bride’s entrance', { key: true }),
    t('ceremony', 'Signing the register'),
    t('ceremony', 'Recessional', { key: true }),
    t('cocktail', 'Cocktail hour', { kind: 'playlist' }),
    t('reception', 'Grand entrance', { key: true }),
    t('reception', 'Dinner', { kind: 'playlist' }),
    t('reception', 'First dance', { key: true }),
    t('reception', 'Father–daughter dance'),
    t('reception', 'Mother–son dance'),
    t('reception', 'Cake cutting'),
    t('party', 'Opening the dance floor'),
    t('party', 'Last song', { key: true }),
  ] },
  reception: { name: 'Reception only', blurb: 'No ceremony music', moments: [
    t('cocktail', 'Cocktail hour', { kind: 'playlist' }),
    t('reception', 'Grand entrance', { key: true }),
    t('reception', 'Dinner', { kind: 'playlist' }),
    t('reception', 'First dance', { key: true }),
    t('reception', 'Parent dances'),
    t('reception', 'Cake cutting'),
    t('party', 'Opening the dance floor'),
    t('party', 'Last song', { key: true }),
  ] },
};

// Suggestions couples can add in step 1. "*" = usually a playlist. "!" = key moment.
export const LIBRARY = {
  ceremony: ['Guests arriving*', 'Family seating', 'Grandparents walk in', 'Parents walk in', 'Officiant & groom walk in', 'Groom’s entrance!',
    'Groomsmen walk in', 'Bridesmaids walk in', 'Wedding party walks in!', 'Ring bearer & flower girl', 'Bride’s entrance!',
    'Baraat (groom’s procession)!', 'Jaimala (garland exchange)', 'Pheras', 'Ketubah signing*', 'Unity candle or sand ceremony',
    'Ring exchange', 'Signing the register', 'Recessional!', 'Tea ceremony*', 'Door games*'],
  cocktail: ['Cocktail hour*', 'Photos*', 'Lawn games*', 'Live music break*'],
  reception: ['Grand entrance!', 'Parents & grandparents entrance!', 'Groomsmen entrance!', 'Bridesmaids entrance!', 'Flower girl & ring bearer entrance',
    'Couple’s entrance!', 'Welcome speech', 'Dinner*', 'Speeches & toasts', 'Yam seng toast', 'Table visits*', 'Slideshow or video',
    'Lion dance', 'Games', 'Shoe game', 'Outfit change re-entrance!', 'Cake cutting', 'First dance!', 'Father–daughter dance', 'Mother–son dance',
    'Parent dances', 'Anniversary dance', 'Money dance', 'Bouquet toss', 'Garter toss', 'Sangeet performance', 'Surprise performance', 'Hora'],
  party: ['Opening the dance floor', 'Group or line dance', 'Late-night snack*', 'Last slow dance', 'Last song!', 'Send-off or grand exit', 'After-party*'],
};
export const libItem = s => ({ label: s.replace(/[*!]/g, ''), kind: s.includes('*') ? 'playlist' : 'song', key: s.includes('!') });

export const LANGS = ['English', 'Cantonese', 'Mandarin', 'Tagalog', 'Hindi', 'Punjabi', 'Spanish', 'Korean', 'Vietnamese', 'French'];
export const GENRES = ['Top 40', '2000s throwbacks', '90s', 'Hip-hop & R&B', 'Motown & soul', 'House & EDM', 'Latin', 'Afrobeats', 'Cantopop', 'Mandopop', 'K-pop', 'Bollywood', 'Rock', 'Country'];
export const ENDS = [['moment', 'Fade when the moment’s over'], ['out', 'Play it all'], ['time', 'Fade at…']];
export const EXPLICIT = [['clean', 'Clean only'], ['radio', 'Radio edits'], ['any', 'Anything goes']];
export const KINDS = ['song', 'playlist'];

// IDs only ever contain [a-z0-9]; validation enforces this for anything that comes from a link.
const ALPH = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function uid(n = 8) {
  const out = [];
  const buf = (globalThis.crypto && globalThis.crypto.getRandomValues) ? globalThis.crypto.getRandomValues(new Uint8Array(n)) : null;
  for (let i = 0; i < n; i++) out.push(ALPH[(buf ? buf[i] : Math.floor(Math.random() * 256)) % 36]);
  return out.join('');
}
export const ID_RE = /^[a-z0-9]{1,24}$/;

export const isEntrance = l => /entrance|walks? in|procession/i.test(String(l || ''));
export const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').trim();

export function newMoment(seg, label, o = {}) {
  return { id: uid(), seg, label: label || '', kind: o.kind || 'song', key: !!o.key, off: !!o.off, custom: !!o.custom,
    dj: false, title: '', url: '', start: '', end: 'moment', endAt: '', note: '', announce: '', r: 0 };
}
export function newPlan({ names = '', date = '', due = '', template = 'banquet', dj = { name: '', email: '' } } = {}) {
  const tpl = TEMPLATES[template] ? template : 'banquet';
  const now = Date.now();
  return { v: SCHEMA, id: uid(12), dj: { name: dj.name || '', email: dj.email || '' },
    couple: { names, date, due }, template: tpl,
    moments: TEMPLATES[tpl].moments.map(m => newMoment(m.seg, m.label, m)),
    must: [], dnp: [], vibe: { langs: [], genres: [], explicit: 'radio', notes: '' },
    started: false, sentAt: 0, sentClock: 0, created: now, updated: now,
    clock: 0, vv: {}, lr: 0, vr: 0, or: 0, gone: [] };
}

export const status = m => m.off ? 'off'
  : m.dj ? 'dj'
  : (m.kind === 'playlist' ? m.url : (m.title || m.url)) ? 'done' : 'open';
export const active = p => p.moments.filter(m => !m.off);
export function progress(p) {
  const r = active(p);
  return { total: r.length, done: r.filter(m => status(m) !== 'open').length, open: r.filter(m => status(m) === 'open') };
}
export const changedSinceSent = p => !!p.sentAt && p.clock > (p.sentClock || 0);
export const delegatedKey = p => active(p).filter(m => m.key && m.dj);

// Times typed in notes ("0:11 doors open") become cue points on the DJ's run sheet.
export const TIME_RE = /\b(\d{1,2}:[0-5]\d)\b/g;
export const validTime = s => !s || /^\d{1,2}:[0-5]\d$/.test(String(s).trim());
// Forgiving time entry: "125" -> "1:25", "1.25" -> "1:25", "90" -> "1:30". Ambiguous input like "1:7" is left for the couple to fix.
export function tidyTime(s) {
  s = String(s || '').trim().replace(/[.,;h]/g, ':').replace(/\s+/g, '');
  if (!s) return '';
  if (/^\d{1,2}$/.test(s)) { const n = +s; return n < 60 ? `0:${String(n).padStart(2, '0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
  if (/^\d{3,4}$/.test(s)) return `${s.slice(0, -2)}:${s.slice(-2)}`;
  return s;
}

export function issues(p) {
  const out = [];
  active(p).forEach(m => {
    const st = status(m);
    if (st === 'open') out.push({ m, kind: 'open', text: `${m.label}${m.key ? ' (key moment)' : ''}: no ${m.kind === 'playlist' ? 'playlist' : 'song'} yet` });
    if (st !== 'done' || m.kind !== 'song') return;
    if (!validTime(m.start)) out.push({ m, kind: 'time', text: `${m.label}: start time “${m.start}” should look like 1:25` });
    if (m.end === 'time' && !m.endAt) out.push({ m, kind: 'time', text: `${m.label}: fade time is missing` });
    if (m.end === 'time' && m.endAt && !validTime(m.endAt)) out.push({ m, kind: 'time', text: `${m.label}: fade time “${m.endAt}” should look like 2:45` });
  });
  return out;
}

// Lines for the DJ's follow-up message. Key moments are named; everything else is summarised.
export function followLines(p, djName = 'me') {
  const open = progress(p).open, key = open.filter(m => m.key), rest = open.filter(m => !m.key);
  const lines = [];
  if (key.length) lines.push(`Songs still needed for: ${key.map(m => m.label).join(', ')}`);
  issues(p).filter(i => i.kind === 'time').forEach(i => lines.push(i.text));
  if (rest.length) lines.push(key.length || lines.length
    ? `${rest.length} other moment${rest.length > 1 ? 's are' : ' is'} open (${rest.map(m => m.label).join(', ')}). Happy to choose ${rest.length > 1 ? 'those' : 'it'} for you if you prefer`
    : `Still open: ${rest.map(m => m.label).join(', ')}. Happy to choose ${rest.length > 1 ? 'those' : 'it'} for you if you prefer`);
  const dk = delegatedKey(p);
  if (dk.length) lines.push(`You’ve left ${dk.map(m => m.label).join(', ')} to ${djName}. Happy to suggest a few, or tell me if you’d rather pick`);
  return lines;
}

// Keyboard/button reordering. Moving past the top or bottom of a section moves into the next section.
export function moveMoment(p, id, dir) {
  const segs = Object.keys(SEGS);
  const i = p.moments.findIndex(m => m.id === id); if (i < 0) return false;
  const m = p.moments[i];
  const same = p.moments.map((x, k) => [x, k]).filter(([x]) => x.seg === m.seg);
  const pos = same.findIndex(([x]) => x.id === id);
  const target = same[pos + dir];
  if (target) { const k = target[1]; p.moments[i] = p.moments[k]; p.moments[k] = m; return true; }
  const si = segs.indexOf(m.seg) + dir;
  if (si < 0 || si >= segs.length) return false;
  m.seg = segs[si];
  p.moments.splice(i, 1);
  const idxs = p.moments.map((x, k) => [x, k]).filter(([x]) => x.seg === m.seg).map(([, k]) => k);
  let at;
  if (dir < 0) at = idxs.length ? idxs[idxs.length - 1] + 1 : p.moments.length;
  else at = idxs.length ? idxs[0] : p.moments.length;
  p.moments.splice(at, 0, m);
  return true;
}
export function moveSong(list, id, dir) {
  const i = list.findIndex(s => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]]; return true;
}
