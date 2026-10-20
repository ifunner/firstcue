// Text and spreadsheet exports. Pure functions of a plan.
import { SEGS, EXPLICIT, TIME_RE, active, status } from './model.js';

const fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); };

export function asText(p, link = '') {
  const L = ['WEDDING SONG PLAN', `${p.couple.names} · ${fmtDate(p.couple.date)}`];
  if (p.dj.name) L.push(`DJ: ${p.dj.name}`);
  L.push('');
  Object.entries(SEGS).forEach(([seg, name]) => {
    const ms = active(p).filter(m => m.seg === seg); if (!ms.length) return;
    L.push(name.toUpperCase());
    ms.forEach((m, i) => {
      const st = status(m);
      L.push(`${i + 1}. ${m.label}: ${st === 'dj' ? 'DJ’s choice' : st === 'open' ? '(not picked yet)' : m.kind === 'playlist' ? 'Playlist ' + m.url : (m.title || '') + (m.url ? '  ' + m.url : '')}`);
      if (m.kind === 'song' && st === 'done' && (m.start || m.end !== 'moment')) L.push(`   Start ${m.start || '0:00'}${m.end === 'out' ? ' · play through' : m.end === 'time' ? ' · fade at ' + m.endAt : ''}`);
      if (m.note) L.push('   ' + m.note);
      if (m.announce) L.push('   Announce: ' + m.announce);
    });
    L.push('');
  });
  L.push('MUST PLAY', ...(p.must.length ? p.must.map((s, i) => `${i + 1}. ${s.title} ${s.url}`.trim()) : ['(none)']), '');
  L.push('DO NOT PLAY', ...(p.dnp.length ? p.dnp.map(s => `- ${s.title} ${s.url}`.trim()) : ['(none)']), '');
  L.push('VIBE', `Languages: ${p.vibe.langs.join(', ') || '-'}`, `Genres: ${p.vibe.genres.join(', ') || '-'}`, `Explicit: ${(EXPLICIT.find(e => e[0] === p.vibe.explicit) || [])[1] || '-'}`);
  if (p.vibe.notes) L.push(p.vibe.notes);
  if (link) L.push('', 'Open the planner: ' + link);
  return L.filter((x, i) => x !== '' || L[i - 1] !== '').join('\n');
}

// Spreadsheet-safe cell: quote, double quotes, and neutralise formulas (=, +, -, @) so a song title
// can't run as a formula when the DJ opens the file in Excel or Sheets.
export const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

export function asCSV(p) {
  const rows = [['section', '#', 'moment', 'status', 'song', 'link', 'start', 'end', 'fade_at', 'cue_times', 'notes', 'announce']];
  Object.entries(SEGS).forEach(([seg, name]) => active(p).filter(m => m.seg === seg).forEach((m, i) =>
    rows.push([name, i + 1, m.label, status(m), m.title, m.url, m.start, m.end, m.endAt, (m.note.match(TIME_RE) || []).join(' '), m.note, m.announce])));
  p.must.forEach((s, i) => rows.push(['Must play', i + 1, '', '', s.title, s.url]));
  p.dnp.forEach((s, i) => rows.push(['Do not play', i + 1, '', '', s.title, s.url]));
  rows.push([], ['Languages', p.vibe.langs.join(', ')], ['Genres', p.vibe.genres.join(', ')], ['Explicit', p.vibe.explicit], ['Notes', p.vibe.notes]);
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
