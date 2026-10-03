import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { wheel } from '../src/model.js';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { Math.random = () => 0; });
const url = process.env.CHECK_URL || 'http://127.0.0.1:4175/';
const w = wheel('Session removals', ['First', 'Second', 'Third']);
w.removeWinner = true; w.saveWinners = true;
w.options.forEach((o, i) => Object.assign(o, { adjustWeight: true, weight: i + 2, color: ['#124c88', '#703aa0', '#68cfda'][i], linkEnabled: true, url: `https://example.com/${i}` }));
const original = structuredClone(w.options);
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('nawras-spinner:v1')).wheels[0]);
const click = name => page.getByRole('button', { name, exact: true }).click();
const assertWheel = async labels => {
  assert.deepEqual(await page.locator('#audience-wheel .slice-label').allTextContents(), labels);
  assert.deepEqual((await saved()).options, original);
};
const spin = async (name, remaining) => {
  await click('Spin'); await page.locator('.winner-reveal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#winner-name').textContent(), name);
  await assertWheel(remaining);
};
try {
  await page.goto(url); await page.evaluate(w => localStorage.setItem('nawras-spinner:v1', JSON.stringify({ version: 1, wheels: [w] })), w);
  await page.goto(`${url}#/edit/${w.id}`); await page.reload();
  assert.equal(await page.getByLabel('Remove winners during presentation').isChecked(), true);
  await page.getByRole('link', { name: /^Present/ }).click(); await assertWheel(['First', 'Second', 'Third']);
  await spin('First', ['Second', 'Third']);
  assert.equal(await page.getByRole('link', { name: /Open Link/ }).getAttribute('href'), original[0].url);
  await page.locator('.winner-controls').waitFor({ state: 'visible' }); await click('Spin Again');
  await page.locator('#dialog').waitFor({ state: 'hidden' }); await page.locator('.winner-reveal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#winner-name').textContent(), 'Second'); await assertWheel(['Third']);
  await page.keyboard.press('Escape'); await spin('Third', []);
  assert.equal(await page.locator('#app [data-action=spin]').isEnabled(), false);
  await page.locator('.winner-controls').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'Spin Again', exact: true }).isEnabled(), false);
  await page.locator('#dialog [data-action=reset-presentation]').click();
  await assertWheel(['First', 'Second', 'Third']); assert.equal((await saved()).winnerHistory.length, 3);
  await spin('First', ['Second', 'Third']); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Back$/ }).click();
  await page.getByLabel('Option 1 label', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.option-row').count(), 3); assert.deepEqual((await saved()).options, original);
  await click('Winner history'); assert.equal(await page.locator('.history-record').count(), 4);
  await click('Clear history'); await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByText('No saved winners yet.', { exact: true }).waitFor({ state: 'visible' });
  assert.deepEqual((await saved()).options, original); assert.equal((await saved()).winnerHistory.length, 0);
  assert.equal((await saved()).removeWinner, true); assert.equal((await saved()).saveWinners, true);
  await click('Close');
  await page.getByRole('link', { name: /^Present/ }).click(); await assertWheel(['First', 'Second', 'Third']);
  await spin('First', ['Second', 'Third']); await page.keyboard.press('Escape');
  await page.reload(); await assertWheel(['First', 'Second', 'Third']);
  assert.equal((await saved()).winnerHistory.length, 1);
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 450 }]) {
    await page.setViewportSize(size);
    await spin('First', ['Second', 'Third']); await page.keyboard.press('Escape');
    await spin('Second', ['Third']); await page.keyboard.press('Escape');
    await spin('Third', []); await page.keyboard.press('Escape');
    const reset = page.locator('#app [data-action=reset-presentation]');
    const box = await reset.boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= size.height);
    await reset.click(); await assertWheel(['First', 'Second', 'Third']);
  }
  assert.deepEqual(errors, []);
  console.log('Presentation checks passed: session-only ID exclusions, unchanged saved colors/weights/links, exhausted reset, new-session restoration, separate history clearing and mobile reset access.');
} finally { await browser.close(); }
