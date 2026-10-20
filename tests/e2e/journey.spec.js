import { test, expect } from '@playwright/test';
import { createPlanner, startAsCouple, linkFrom, hashOf, watch } from './helpers.js';

test('DJ creates a planner, couple fills it in, DJ gets the run sheet', async ({ browser }) => {
  const djCtx = await browser.newContext(); const dj = await djCtx.newPage(); const djProblems = watch(dj);
  const invite = await createPlanner(dj, { names: '陳美玲 & Daniel' });
  await expect(dj.locator('#created h1')).toContainText('陳美玲 & Daniel');
  await expect(dj.locator('[data-share="invite:copy"]')).toHaveText('Copy message with link');

  const cCtx = await browser.newContext(); const c = await cCtx.newPage(); const problems = watch(c);
  await startAsCouple(c, invite);

  // Moments: untick, add a suggestion and a custom one, reorder with the keyboard-friendly arrows
  await c.uncheck('.mrow:has(input[value="Games"]) .tick');
  await c.click('[data-picker=reception]');
  await c.click('[data-addlib="reception|Lion dance"]');
  await c.fill('#other-reception', 'Grandma’s karaoke');
  await c.press('#other-reception', 'Enter');
  await c.click('[data-picker=""]');
  const labels = () => c.$$eval('.mlist[data-seg=reception] .mlabel', els => els.map(e => e.value));
  const before = await labels();
  const lastId = await c.getAttribute('.mlist[data-seg=reception] .mrow:last-child', 'data-id');
  await c.click(`.mrow[data-id="${lastId}"] [data-mv="-1"]`);
  const after = await labels();
  expect(after.at(-2)).toBe(before.at(-1));
  await expect(c.locator(`.mrow[data-id="${lastId}"] [data-mv="-1"]`)).toBeFocused();

  // Songs
  await c.click('.stepbar [data-go=songs]');
  await expect(c.locator('.scard.expanded .sl b')).toHaveText('Guests arriving');
  await c.fill('.scard.expanded [data-f=url]', 'https://open.spotify.com/playlist/37i9dQZF1DX?si=abc');
  await c.click('.scard.expanded [data-next]');
  await c.fill('.scard.expanded [data-f=title]', 'A Thousand Years – Christina Perri');
  await c.click('.scard.expanded details.more summary');
  await c.fill('.scard.expanded [data-f=start]', '125');
  await c.click('.scard.expanded [data-f=note]');
  await expect(c.locator('.scard.expanded [data-f=start]')).toHaveValue('1:25');
  await c.fill('.scard.expanded [data-f=note]', '0:25 bridesmaids start');
  await c.click('.scard.expanded [data-next]');
  await c.click('.scard.expanded [data-leave]');

  // Dance floor
  await c.click('.step[data-go=floor]');
  await c.fill('#add-must', '海闊天空 – Beyond'); await c.press('#add-must', 'Enter');
  await c.click('[data-lang=Cantonese]');
  await expect(c.locator('[data-lang=Cantonese]')).toHaveAttribute('aria-pressed', 'true');

  // Send: copying asks whether it was sent instead of claiming it was
  await c.click('.step[data-go=send]');
  const plan = hashOf(await linkFrom(c, 'plan'));
  await c.click('[data-share="plan:copy"]');
  await expect(c.locator('.ask')).toBeVisible();
  await expect(c.locator('.status.ok')).toHaveCount(0);
  await c.click('[data-act=confirm-sent]');
  await expect(c.locator('.status.ok')).toContainText('Sent to iFunner');

  // DJ receives it
  await dj.goto('/' + plan);
  await expect(dj.locator('.rs-head h1')).toHaveText('陳美玲 & Daniel');
  await expect(dj.locator('.rs')).toContainText('A Thousand Years – Christina Perri');
  await expect(dj.locator('.rs')).toContainText('1:25');
  await expect(dj.locator('.rs-note .tc').first()).toHaveText('0:25');
  await expect(dj.locator('.rs')).toContainText('Lion dance');
  await expect(dj.locator('.rs-extra')).toContainText('海闊天空');
  await expect(dj.locator('.rs')).not.toContainText('Games');
  await dj.goto('/');
  await expect(dj.locator('.couple-row')).toContainText('Received');

  expect(problems).toEqual([]); expect(djProblems).toEqual([]);
});

test('follow-up link reopens the couple’s planner where they left off', async ({ browser }) => {
  const dj = await (await browser.newContext()).newPage();
  const invite = await createPlanner(dj, { template: 'western' });
  const cCtx = await browser.newContext(); const c = await cCtx.newPage();
  await startAsCouple(c, invite);
  await c.click('.stepbar [data-go=songs]');
  await c.click('.scard.expanded [data-leave]');
  await c.fill('.scard.expanded [data-f=title]', 'Perfect – Ed Sheeran');
  await c.click('.step[data-go=send]');
  const plan = hashOf(await linkFrom(c, 'plan'));

  await dj.goto('/' + plan);
  await expect(dj.locator('.follow')).toContainText('Songs still needed for');
  const follow = hashOf(await linkFrom(dj, 'follow'));

  await c.goto('/' + follow);
  await expect(c.locator('body')).toHaveAttribute('data-view', 'songs');
  await expect(c.locator('.scard.expanded')).toHaveCount(1);
  await expect(c.locator('.dlg[open]')).toHaveCount(0);   // same history: no conflict prompt
});

test('“Leave these to your DJ” asks before handing over key moments', async ({ page }) => {
  const invite = await createPlanner(page, { template: 'western' });
  await startAsCouple(page, invite);
  await page.click('.step[data-go=send]');
  await page.click('[data-act=leave-rest]');
  await expect(page.locator('#dlg')).toBeVisible();
  await page.click('[data-leave-all=rest]');
  await expect(page.locator('#dlg')).toBeHidden();
  await expect(page.locator('.openlist').first()).toContainText('First dance');
});
