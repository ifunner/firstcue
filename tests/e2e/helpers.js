import { expect } from '@playwright/test';
import '../unit/setup.js';   // puts LZString on globalThis for building crafted links
export { toFile, encode } from '../../js/wire.js';

export const pack = obj => globalThis.LZString.compressToEncodedURIComponent(JSON.stringify(obj));

// Every share row has a WhatsApp link whose text ends with the FirstCue link.
export async function linkFrom(page, key) {
  const href = await page.getAttribute(`[data-href="${key}:wa"]`, 'href');
  const text = decodeURIComponent(href.split('text=')[1]);
  return text.match(/https?:\/\/\S+/)[0];
}
export const hashOf = url => url.slice(url.indexOf('#'));

export async function createPlanner(page, { names = 'Mei & Daniel', date = '2027-08-21', template = 'banquet', email = 'dj@example.com' } = {}) {
  await page.goto('/');
  await page.fill('#s-names', names);
  await page.fill('#s-date', date);
  await page.dispatchEvent('#s-date', 'change');
  await page.check(`input[name=tpl][value=${template}]`, { force: true });
  if (await page.isVisible('#s-email')) await page.fill('#s-email', email);
  else { await page.click('details.more summary'); await page.fill('#s-email', email); }
  await page.click('button[type=submit]');
  await expect(page.locator('#created')).toBeVisible();
  return hashOf(await linkFrom(page, 'invite'));
}

export async function startAsCouple(page, inviteHash) {
  await page.goto('/' + inviteHash);
  await page.click('.welcome [data-go=moments]');
  await expect(page.locator('.stephead h1')).toHaveText('Which moments need music?');
}

// Collect script errors and any alert/confirm dialogs (which would mean injected script ran).
export function watch(page) {
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('dialog', async d => { problems.push('dialog: ' + d.message()); await d.dismiss(); });
  return problems;
}
