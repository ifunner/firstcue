import { test, expect } from '@playwright/test';
import { pack, watch } from './helpers.js';

const base = { v: 3, dj: { name: 'iFunner' }, couple: { names: 'Test', date: '2027-01-01' }, template: 'banquet', started: true, updated: 1, clock: 1, vv: { evil: 1 } };
const XSS = `x"><img src=x onerror=alert('xss')>`;
const crafted = {
  'IDs that break out of attributes': { ...base, id: XSS, moments: [{ id: XSS, seg: 'ceremony', label: 'Bride’s entrance', title: 'Song', url: 'https://open.spotify.com/track/1' }], must: [{ id: XSS, title: 'a' }], dnp: [{ id: `"><svg onload=alert(1)>`, title: 'b' }] },
  'javascript: and data: URLs': { ...base, id: 'evil0002', moments: [{ id: 'm1', seg: 'reception', label: 'First dance', title: 'Click me', url: 'javascript:alert(1)' }, { id: 'm2', seg: 'cocktail', kind: 'playlist', label: 'Cocktail hour', url: 'data:text/html,<script>alert(1)</script>' }], must: [{ id: 's1', title: 'x', url: 'javascript:alert(2)' }] },
  'script in every text field': { ...base, id: 'evil0003', dj: { name: '<img src=x onerror=alert(3)>', email: 'a@b.co"><script>alert(4)</script>' }, couple: { names: '<script>alert(5)</script>', date: '<b>' }, moments: [{ id: 'm1', seg: 'party', label: '<img src=x onerror=alert(6)>', title: '<svg onload=alert(7)>', note: '0:11 <img src=x onerror=alert(8)>', announce: '<iframe src=javascript:alert(9)>' }], vibe: { notes: '<img src=x onerror=alert(10)>', langs: ['<b onmouseover=alert(11)>x</b>'] } },
  'wrong types everywhere': { ...base, id: 'evil0004', couple: { names: { a: 1 }, date: 42 }, vibe: { langs: 'English', genres: null, explicit: {} }, moments: [{ id: 'm1', seg: 'nowhere', label: 12345, end: [], kind: 'evil' }], must: 'nope', dnp: [null, 1, 'x'], gone: 'all' },
  'oversized values': { ...base, id: 'evil0005', couple: { names: 'A'.repeat(3000) }, moments: Array.from({ length: 120 }, (_, i) => ({ id: 'm' + i, seg: 'party', label: 'L'.repeat(600), title: 'T'.repeat(600), note: '0:11 '.repeat(600) })) },
};

// Compress once at load so compression time doesn't count against each test.
const packed = Object.fromEntries(Object.entries(crafted).map(([k, v]) => [k, pack(v)]));
for (const name of Object.keys(crafted)) {
  for (const kind of ['#i=', '#p=']) {
    test(`crafted link is harmless: ${name} (${kind === '#i=' ? 'couple view' : 'run sheet'})`, async ({ page }) => {
      const problems = watch(page);
      await page.goto('/' + kind + packed[name]);
      await page.waitForTimeout(150);
      if (kind === '#i=') for (const step of ['moments', 'songs', 'floor', 'send']) {
        const s = page.locator(`.step[data-go=${step}]`); if (await s.count()) { await s.click(); await page.waitForTimeout(50); }
      }
      await page.mouse.move(200, 300); await page.mouse.move(300, 400);
      expect(problems).toEqual([]);
      expect(await page.locator('a[href^="javascript"], a[href^="data:"], iframe, img[src="x"], svg[onload]').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }
}

test('absurdly long links are refused, not decoded', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/#i=' + 'A'.repeat(70000));
  await expect(page.locator('h1')).toHaveText('This link didn’t come through in full.');
  expect(problems).toEqual([]);
});

test('pages ship a Content-Security-Policy that blocks inline script', async ({ page }) => {
  await page.goto('/');
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
});
