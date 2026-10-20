// Load the vendored lz-string into globalThis, the same way the browser does.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const src = readFileSync(fileURLToPath(new URL('../../vendor/lz-string.min.js', import.meta.url)), 'utf8');
const ctx = { module: undefined, define: undefined };
vm.runInNewContext(src + ';this.LZString = LZString;', ctx);
globalThis.LZString = ctx.LZString;

// A full, realistic plan for size and round-trip tests.
export async function bigPlan(n = 30, noteRepeat = 3) {
  const { newPlan, uid } = await import('../../js/model.js');
  const p = newPlan({ names: '陳美玲 & Daniel Wong', date: '2027-08-21', due: '2027-08-07', template: 'banquet', dj: { name: 'iFunner', email: 'ivan@example.com' } });
  p.moments = Array.from({ length: n }, (_, i) => ({
    id: uid(), seg: ['ceremony', 'cocktail', 'reception', 'party'][i % 4], label: `Moment ${i} 入場`, kind: 'song', key: i % 3 === 0, off: false, custom: false, dj: false,
    title: `月亮代表誰的心 Song ${i} – Artist ${i}`, url: `https://open.spotify.com/track/5zpEPwbPcf0Kl2dEyw0T${String(i).padStart(2, '0')}`,
    start: '1:25', end: 'time', endAt: '3:10', note: '0:11 doors open, 0:23 walk to centre, 慢慢走到台上。 '.repeat(noteRepeat), announce: 'Mr. & Mrs. Wong (say WONG)', r: i + 1,
  }));
  p.must = Array.from({ length: 10 }, (_, i) => ({ id: uid(), title: `Must play ${i} – Artist`, url: `https://open.spotify.com/track/abcdefghijklmnopqrstu${i}`, r: 1 }));
  p.dnp = Array.from({ length: 5 }, (_, i) => ({ id: uid(), title: `Do not play ${i}`, url: '', r: 1 }));
  p.vibe = { langs: ['English', 'Cantonese'], genres: ['Cantopop'], explicit: 'radio', notes: 'Lots of family.' };
  p.clock = 40; p.vv = { abcd1234: 40 };
  return p;
}
