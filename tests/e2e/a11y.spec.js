import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createPlanner, startAsCouple } from './helpers.js';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
async function axe(page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }))
    .violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')})`));
}

const VIEWS = [
  ['setup', async p => { await p.goto('/'); }],
  ['welcome', async p => { await p.goto('/#demo'); }],
  ['moments + suggestions', async p => { await p.goto('/#demo'); await p.click('.welcome [data-go=moments]'); await p.click('[data-picker=reception]'); }],
  ['songs (open card)', async p => { await p.goto('/#demo'); await p.click('.welcome [data-go=moments]'); await p.click('.step[data-go=songs]'); await p.click('.scard:has-text("Bride") .shead'); await p.click('.scard.expanded details.more summary').catch(() => {}); }],
  ['dance floor', async p => { await p.goto('/#demo'); await p.click('.welcome [data-go=moments]'); await p.click('.step[data-go=floor]'); }],
  ['send', async p => { await p.goto('/#demo'); await p.click('.welcome [data-go=moments]'); await p.click('.step[data-go=send]'); }],
  ['save & share dialog', async p => { await p.goto('/#demo'); await p.click('.welcome [data-go=moments]'); await p.click('[data-open-dialog=share]'); }],
  ['run sheet', async p => { await p.goto('/#demo-sheet'); }],
  ['broken link', async p => { await p.goto('/#i=broken'); }],
  ['privacy', async p => { await p.goto('/privacy.html'); }],
];

for (const scheme of ['light', 'dark']) {
  for (const [name, open] of VIEWS) {
    test(`axe: no serious issues on ${name} (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, bypassCSP: true });   // lets axe inject itself
      const page = await ctx.newPage();
      await open(page);
      await page.waitForTimeout(100);
      expect(await axe(page)).toEqual([]);
    });
  }
}

test('Save & share dialog traps focus and returns it on close', async ({ page }) => {
  await page.goto('/#demo');
  await page.click('.welcome [data-go=moments]');
  const opener = page.locator('[data-open-dialog=share]');
  await opener.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#dlg')).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement.closest('#dlg') || document.activeElement === document.body);
    expect(inside).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#dlg')).toBeHidden();
  await expect(opener).toBeFocused();
});

test('moments can be reordered from the keyboard', async ({ page }) => {
  const invite = await createPlanner(page);
  await startAsCouple(page, invite);
  const first = await page.locator('.mlist[data-seg=ceremony] .mlabel').first().inputValue();
  const down = page.locator('.mlist[data-seg=ceremony] .mrow').first().locator('[data-mv="1"]');
  await down.focus(); await page.keyboard.press('Enter');
  expect(await page.locator('.mlist[data-seg=ceremony] .mlabel').nth(1).inputValue()).toBe(first);
  await expect(page.locator('.mlist[data-seg=ceremony] .mrow').nth(1).locator('[data-mv="1"]')).toBeFocused();   // focus follows the moved item
  await page.keyboard.press('Enter');
  expect(await page.locator('.mlist[data-seg=ceremony] .mlabel').nth(2).inputValue()).toBe(first);
});
