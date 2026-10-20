import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bigPlan } from './setup.js';
import { LINK_BUDGET } from '../../js/config.js';
import { newPlan, ID_RE } from '../../js/model.js';
import { validate, encode, decode, safeUrl, cleanUrl, safeEmail, reconcile, merge, vvCompare, toFile, fromFile, editLink, planLink } from '../../js/wire.js';

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/v02-links.json', import.meta.url)), 'utf8'));
const pack = o => globalThis.LZString.compressToEncodedURIComponent(JSON.stringify(o));

test('URL allow-list: only http(s) survives', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(safeUrl('vbscript:x'), '');
  assert.equal(safeUrl('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(cleanUrl('https://open.spotify.com/track/1?si=abc'), 'https://open.spotify.com/track/1');
  assert.equal(cleanUrl('not a link'), '');
});

test('email validation', () => {
  assert.equal(safeEmail('ivan@example.com'), 'ivan@example.com');
  assert.equal(safeEmail('x@y'), '');
  assert.equal(safeEmail('a@b.com?bcc=evil@x.com'), '');
});

test('validate: crafted IDs are replaced, URLs and types are cleaned', () => {
  const p = validate({ v: 2, id: 'x"><img>', template: 'nope', couple: { names: { a: 1 }, date: 'tomorrow' },
    moments: [{ id: 'x"><img src=x onerror=alert(1)>', seg: 'nowhere', label: 12345, url: 'javascript:alert(1)', end: 'boom', kind: 'evil' }],
    must: [{ id: 'ok1', title: 'Song', url: 'javascript:1' }], must2: 1, vibe: { langs: 'English', genres: null, explicit: 'x' } });
  assert.ok(ID_RE.test(p.id));
  const m = p.moments[0];
  assert.ok(ID_RE.test(m.id));
  assert.equal(m.seg, 'reception');
  assert.equal(m.label, '12345');
  assert.equal(m.url, '');
  assert.equal(m.end, 'moment');
  assert.equal(m.kind, 'song');
  assert.equal(p.must[0].url, '');
  assert.deepEqual(p.vibe.langs, []);
  assert.deepEqual(p.vibe.genres, []);
  assert.equal(p.vibe.explicit, 'radio');
  assert.equal(p.couple.names, '');
  assert.equal(p.couple.date, '');
  assert.equal(p.template, 'banquet');
});

test('validate: duplicate IDs are made unique; lengths are clamped', () => {
  const p = validate({ moments: [{ id: 'aaa', label: 'x'.repeat(5000) }, { id: 'aaa', label: 'y' }], couple: { names: 'n'.repeat(5000) } });
  assert.notEqual(p.moments[0].id, p.moments[1].id);
  assert.ok(p.moments[0].label.length <= 80);
  assert.ok(p.couple.names.length <= 120);
});

test('validate rejects non-plans', () => {
  assert.equal(validate(null), null);
  assert.equal(validate({ moments: 'nope' }), null);
  assert.equal(decode('garbage'), null);
  assert.equal(decode(''), null);
});

test('round trip: encode then decode gives the same plan', async () => {
  const p = await bigPlan(12, 1);
  const back = decode(encode(p));
  assert.equal(back.couple.names, p.couple.names);
  assert.equal(back.moments.length, 12);
  assert.equal(back.moments[3].title, p.moments[3].title);
  assert.equal(back.moments[3].note, p.moments[3].note);
  assert.deepEqual(back.vv, p.vv);
  assert.equal(back.must.length, 10);
});

test('real v0.2 links still open', () => {
  for (const [kind, h] of Object.entries({ invite: fixtures.invite, progress: fixtures.progress, plan: fixtures.plan })) {
    const p = decode(h.slice(3));
    assert.ok(p, `${kind} link decodes`);
    assert.equal(p.couple.names, '陳美玲 & Daniel');
    assert.ok(p.legacy, 'marked legacy so timestamps decide');
  }
  const prog = decode(fixtures.progress.slice(3));
  assert.ok(prog.moments.some(m => m.title.includes('Thousand Years') && m.start === '0:19'));
  assert.ok(prog.must.some(s => s.title.includes('海闊天空')));
});

test('link size: a full 17-moment plan fits the budget; a huge one is flagged', async () => {
  const typical = await bigPlan(17, 0);   // every moment filled: title, link, times, announcement
  const huge = await bigPlan(30, 3);
  const base = 'https://ifunner.github.io/firstcue/';
  const t = planLink(base, typical).length, h = planLink(base, huge).length;
  assert.ok(t <= LINK_BUDGET, `typical ${t} <= ${LINK_BUDGET}`);
  assert.ok(h > LINK_BUDGET, `huge ${h} > ${LINK_BUDGET} so the file fallback is offered`);
  assert.ok(editLink(base, typical).startsWith(base + '#i='));
});

test('plan files round trip and reject other JSON', async () => {
  const p = await bigPlan(5, 1);
  const f = fromFile(toFile(p, 'plan'));
  assert.equal(f.kind, 'plan');
  assert.equal(f.plan.moments.length, 5);
  assert.ok(f.plan.sentAt > 0);
  assert.equal(fromFile('{"app":"other"}'), null);
  assert.equal(fromFile('not json'), null);
});

test('version vectors', () => {
  assert.equal(vvCompare({ a: 1 }, { a: 1 }), 'equal');
  assert.equal(vvCompare({ a: 2 }, { a: 1 }), 'a');
  assert.equal(vvCompare({ a: 1 }, { a: 1, b: 1 }), 'b');
  assert.equal(vvCompare({ a: 2 }, { b: 1 }), 'concurrent');
});

function partnerSetup() {
  const base = newPlan({ names: 'A & B' });
  base.clock = 1; base.vv = { dj: 1 };
  const a = structuredClone(base), b = structuredClone(base);
  const ma = a.moments.find(m => m.label === 'Wedding party walks in');
  a.clock = 5; a.vv = { dj: 1, phonea: 4 }; ma.title = 'A Thousand Years'; ma.r = 5;
  const mb = b.moments.find(m => m.label === 'First dance');
  b.clock = 3; b.vv = { dj: 1, phoneb: 2 }; mb.title = '月亮代表誰的心'; mb.r = 3;
  return { base, a, b };
}

test('reconcile: new, take, keep, conflict', () => {
  const { base, a, b } = partnerSetup();
  assert.equal(reconcile(null, a).action, 'new');
  assert.equal(reconcile(base, a).action, 'take');
  assert.equal(reconcile(a, base).action, 'keep');
  assert.equal(reconcile(a, structuredClone(a)).action, 'same');
  assert.equal(reconcile(a, b).action, 'conflict');
});

test('merge keeps both partners’ picks', () => {
  const { a, b } = partnerSetup();
  const m = merge(a, b);
  assert.equal(m.moments.find(x => x.label === 'Wedding party walks in').title, 'A Thousand Years');
  assert.equal(m.moments.find(x => x.label === 'First dance').title, '月亮代表誰的心');
  assert.deepEqual(m.vv, { dj: 1, phonea: 4, phoneb: 2 });
});

test('merge: newest edit wins on the same moment; deletions stick', () => {
  const { a, b } = partnerSetup();
  const ma = a.moments.find(m => m.label === 'First dance'); ma.title = 'Older pick'; ma.r = 2;
  b.moments.push({ ...b.moments[0], id: 'custom1', label: 'Lion dance', custom: true, r: 3 });
  a.gone = ['custom1'];
  const m = merge(a, b);
  assert.equal(m.moments.find(x => x.label === 'First dance').title, '月亮代表誰的心');
  assert.ok(!m.moments.some(x => x.id === 'custom1'));
});

test('merge: songs added on either side are kept', () => {
  const { a, b } = partnerSetup();
  a.must = [{ id: 's1', title: 'Mr. Brightside', url: '', r: 4 }]; a.lr = 4;
  b.must = [{ id: 's2', title: '海闊天空', url: '', r: 2 }]; b.lr = 2;
  const m = merge(a, b);
  assert.deepEqual(m.must.map(s => s.id).sort(), ['s1', 's2']);
});
