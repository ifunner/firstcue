import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPlanner, startAsCouple, linkFrom, hashOf, watch, toFile } from './helpers.js';
import { decode } from '../../js/wire.js';

const v02 = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/v02-links.json', import.meta.url)), 'utf8'));

test('partners editing on two devices: nothing is lost, they choose how to combine', async ({ browser }) => {
  const invite = await createPlanner(await (await browser.newContext()).newPage());
  const a = await (await browser.newContext()).newPage(); const b = await (await browser.newContext()).newPage();
  for (const p of [a, b]) { await startAsCouple(p, invite); await p.click('.stepbar [data-go=songs]'); }

  await a.click('.scard:has-text("Wedding party walks in") .shead');
  await a.fill('.scard.expanded [data-f=title]', 'A Thousand Years – Christina Perri');
  await b.click('.scard:has-text("First dance") .shead');
  await b.fill('.scard.expanded [data-f=title]', '月亮代表誰的心 – David Tao');
  await b.click('[data-open-dialog=share]');
  const fromB = hashOf(await linkFrom(b, 'progress'));

  await a.goto('/' + fromB);
  await expect(a.locator('#dlg')).toBeVisible();
  await expect(a.locator('#dlg')).toContainText('Two versions');
  await a.keyboard.press('Escape');
  await expect(a.locator('#dlg')).toBeVisible();          // can't be skipped
  await a.click('[data-resolve=both]');
  const summaries = await a.locator('.scard .ss').allTextContents();
  expect(summaries.join(' ')).toContain('A Thousand Years');
  expect(summaries.join(' ')).toContain('月亮代表誰的心');

  // A sends the combined version back; B takes it without a prompt
  await a.click('[data-open-dialog=share]');
  const fromA = hashOf(await linkFrom(a, 'progress'));
  await b.goto('/' + fromA);
  await expect(b.locator('.dlg[open]')).toHaveCount(0);
  expect((await b.locator('.scard .ss').allTextContents()).join(' ')).toContain('A Thousand Years');
});

test('two tabs on one device stay in sync', async ({ browser }) => {
  const ctx = await browser.newContext();
  const invite = await createPlanner(await ctx.newPage());
  const t1 = await ctx.newPage(), t2 = await ctx.newPage();
  await t2.goto('/' + invite); await t2.waitForSelector('.welcome');
  await startAsCouple(t1, invite);
  await t1.click('.step[data-go=floor]');
  await t1.fill('#add-must', 'Mr. Brightside'); await t1.press('#add-must', 'Enter');
  await expect(t2.locator('#toast')).toContainText('another tab');
  await t2.click('.welcome [data-go=moments]').catch(() => {});
  await t2.click('.step[data-go=floor]');
  await t2.click('[data-lang=Cantonese]');
  const stored = await t2.evaluate(() => {
    const ids = JSON.parse(localStorage.getItem('firstcue:index'));
    return ids.map(id => JSON.parse(localStorage.getItem('firstcue:plan:' + id))).find(p => p.started);
  });
  expect(stored.must.map(s => s.title)).toContain('Mr. Brightside');
  expect(stored.vibe.langs).toContain('Cantonese');
});

test('a cut-off link shows a couple-friendly page, not the DJ sign-up', async ({ page }) => {
  const invite = await createPlanner(page);
  await page.goto('/' + invite.slice(0, Math.floor(invite.length * 0.6)));
  await expect(page.locator('h1')).toHaveText('This link didn’t come through in full.');
  await expect(page.locator('#fileopen')).toHaveCount(1);
});

test('real v0.2 links still open', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/' + v02.plan);
  await expect(page.locator('.rs-head h1')).toHaveText('陳美玲 & Daniel');
  await expect(page.locator('.rs')).toContainText('A Thousand Years');
  await page.goto('/' + v02.progress);
  await expect(page.locator('body')).toHaveAttribute('data-view', /songs|welcome/);
  expect(problems).toEqual([]);
});

test('plan files open from the home page', async ({ page }) => {
  const plan = decode(v02.plan.slice(3));
  await page.goto('/');
  await page.setInputFiles('#fileopen', { name: 'mei-daniel.firstcue.json', mimeType: 'application/json', buffer: Buffer.from(toFile(plan, 'plan')) });
  await expect(page.locator('.rs-head h1')).toHaveText('陳美玲 & Daniel');
});

test('must play stays capped at 10, and ⇄ respects the cap', async ({ page }) => {
  const invite = await createPlanner(page);
  await startAsCouple(page, invite);
  await page.click('.step[data-go=floor]');
  for (let i = 1; i <= 10; i++) { await page.fill('#add-must', `Song ${i}`); await page.press('#add-must', 'Enter'); }
  await page.fill('#add-must', 'Song 11'); await page.press('#add-must', 'Enter');
  await expect(page.locator('#toast')).toContainText('holds 10');
  await page.fill('#add-dnp', 'Macarena'); await page.press('#add-dnp', 'Enter');
  const id = await page.getAttribute('.dnp .fitem', 'data-sid');
  await page.click(`[data-swap="dnp:${id}"]`);
  await expect(page.locator('.must .fitem')).toHaveCount(10);
  await expect(page.locator('.dnp .fitem')).toHaveCount(1);
});

test('the “saved” status is visible on phones', async ({ page }) => {
  const invite = await createPlanner(page);
  await startAsCouple(page, invite);
  await page.uncheck('.mrow:has(input[value="Games"]) .tick');
  await expect(page.locator('#saved')).toBeVisible();
  await expect(page.locator('#saved')).toContainText('Saved');
});

test('in-app browsers get a warning to open Safari or Chrome', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0' });
  const page = await ctx.newPage();
  const invite = await createPlanner(page);
  await startAsCouple(page, invite);
  await expect(page.locator('.banner.warn')).toContainText('inside the Instagram app');
});
