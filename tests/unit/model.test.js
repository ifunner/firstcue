import { test } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import { newPlan, tidyTime, validTime, status, progress, issues, followLines, moveMoment, moveSong, changedSinceSent, uid, ID_RE } from '../../js/model.js';
import { asCSV, asText, csvCell } from '../../js/exporters.js';

test('tidyTime is forgiving but never guesses ambiguous input', () => {
  assert.equal(tidyTime('19'), '0:19');
  assert.equal(tidyTime('90'), '1:30');
  assert.equal(tidyTime('125'), '1:25');
  assert.equal(tidyTime('1.25'), '1:25');
  assert.equal(tidyTime('1,25'), '1:25');
  assert.equal(tidyTime(' 2:45 '), '2:45');
  assert.equal(tidyTime('1:7'), '1:7');
  assert.equal(validTime('1:7'), false);
  assert.equal(validTime('12:05'), true);
  assert.equal(validTime(''), true);
});

test('uid only produces safe IDs', () => {
  for (let i = 0; i < 200; i++) assert.ok(ID_RE.test(uid()));
});

test('status and progress', () => {
  const p = newPlan({ template: 'reception' });
  assert.equal(progress(p).done, 0);
  p.moments[0].url = 'https://open.spotify.com/playlist/x';   // Cocktail hour is a playlist
  p.moments[1].dj = true;
  p.moments[2].title = 'Perfect';                              // Dinner is a playlist: a title alone doesn't count
  p.moments[3].title = 'Perfect';                              // First dance
  p.moments[4].off = true;
  assert.equal(status(p.moments[0]), 'done');
  assert.equal(status(p.moments[1]), 'dj');
  assert.equal(status(p.moments[2]), 'open');
  assert.equal(status(p.moments[4]), 'off');
  const pr = progress(p);
  assert.equal(pr.total, 7);
  assert.equal(pr.done, 3);
});

test('issues flag bad times and missing fades', () => {
  const p = newPlan({ template: 'reception' });
  const m = p.moments.find(x => x.label === 'First dance');
  Object.assign(m, { title: 'Perfect', start: '1:7', end: 'time', endAt: '' });
  const texts = issues(p).map(i => i.text).join(' | ');
  assert.match(texts, /start time “1:7”/);
  assert.match(texts, /fade time is missing/);
});

test('follow-up groups key moments and mentions key moments left to the DJ', () => {
  const p = newPlan({ template: 'western' });
  p.moments.find(m => m.label === 'First dance').dj = true;
  const lines = followLines(p, 'me');
  assert.match(lines[0], /^Songs still needed for: .*Bride’s entrance/);
  assert.ok(lines.some(l => /You’ve left First dance to me/.test(l)));
  assert.ok(lines.some(l => /other moments are open/.test(l)));
});

test('moveMoment reorders within a section and crosses section edges', () => {
  const p = newPlan({ template: 'western' });
  const firstCer = p.moments.find(m => m.seg === 'ceremony');
  assert.equal(moveMoment(p, firstCer.id, -1), false, 'top of the first section stays put');
  const lastCer = p.moments.filter(m => m.seg === 'ceremony').at(-1);
  moveMoment(p, lastCer.id, 1);
  assert.equal(lastCer.seg, 'cocktail');
  assert.equal(p.moments.filter(m => m.seg === 'cocktail')[0].id, lastCer.id);
  const second = p.moments.filter(m => m.seg === 'reception')[1];
  moveMoment(p, second.id, -1);
  assert.equal(p.moments.filter(m => m.seg === 'reception')[0].id, second.id);
});

test('moveSong', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(moveSong(list, 'a', -1), false);
  moveSong(list, 'c', -1);
  assert.deepEqual(list.map(s => s.id), ['a', 'c', 'b']);
});

test('changedSinceSent uses the edit counter, not clocks', () => {
  const p = newPlan();
  assert.equal(changedSinceSent(p), false);
  p.clock = 5; p.sentAt = Date.now(); p.sentClock = 5;
  assert.equal(changedSinceSent(p), false);
  p.clock = 6;
  assert.equal(changedSinceSent(p), true);
});

test('CSV: BOM, Chinese text intact, formulas neutralised', () => {
  const p = newPlan({ names: '陳美玲 & Daniel', template: 'reception' });
  p.moments[2].title = '=HYPERLINK("http://evil","click")';
  p.moments[1].title = '月亮代表誰的心';
  const csv = asCSV(p);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('月亮代表誰的心'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"",""click"")"`));
  assert.equal(csvCell('+1'), `"'+1"`);
  assert.equal(csvCell('fine'), '"fine"');
});

test('text export lists every section and the planner link', () => {
  const p = newPlan({ names: 'A & B', template: 'reception' });
  const t = asText(p, 'https://x/#i=abc');
  assert.match(t, /COCKTAIL HOUR/);
  assert.match(t, /Open the planner: https:\/\/x\/#i=abc$/);
});
