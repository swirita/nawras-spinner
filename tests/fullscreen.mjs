import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.CHECK_URL || 'http://127.0.0.1:4180/nawras-spinner/';
const enter = async () => {
  await page.keyboard.press('f');
  await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
};
const exit = async () => {
  await page.keyboard.press('f'); await page.waitForFunction(() => !document.fullscreenElement);
};
try {
  await page.goto(url);
  await enter(); await exit();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Wheel title', { exact: true }).focus();
  await page.keyboard.press('f'); assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  await page.getByLabel('Wheel title', { exact: true }).blur();
  await enter();
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);
  await exit();
  await page.evaluate(() => {
    window.fullscreenRequests = 0;
    const request = document.documentElement.requestFullscreen.bind(document.documentElement);
    document.documentElement.requestFullscreen = (...args) => { fullscreenRequests++; return request(...args); };
  });
  for (const type of ['input', 'textarea', 'select', 'inherited', 'plaintext-only']) {
    await page.evaluate(type => {
      const parent = document.createElement('div'); parent.id = 'fullscreen-typing';
      const child = document.createElement(['input', 'textarea', 'select'].includes(type) ? type : 'span');
      if (type === 'inherited') parent.contentEditable = 'true';
      if (type === 'plaintext-only') parent.contentEditable = 'plaintext-only';
      parent.append(child); document.body.append(parent);
      child.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
    }, type);
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    assert.equal(await page.evaluate(() => fullscreenRequests), 0);
    await page.locator('#fullscreen-typing').evaluate(el => el.remove());
  }
  await page.evaluate(() => {
    for (const option of ['ctrlKey', 'altKey', 'metaKey', 'repeat', 'isComposing']) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, [option]: true }));
    }
  });
  assert.equal(await page.evaluate(() => fullscreenRequests), 0);
  await page.getByRole('link', { name: /^Present/ }).click();
  await page.keyboard.down('f'); await page.waitForFunction(() => !!document.fullscreenElement);
  await page.keyboard.down('f'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  await page.keyboard.up('f'); await exit();
  await page.locator('[data-action=spin]').click();
  await page.locator('.winner-reveal').waitFor({ state: 'visible' });
  await enter();
  assert.equal(await page.locator('.winner-reveal').evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth), true);
  await exit();
  await page.keyboard.press('Escape');
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  // Test default Escape handling without adding an application Escape shortcut.
  await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    window.escapePrevented = event.defaultPrevented;
  });
  assert.equal(await page.evaluate(() => escapePrevented), false);
  const notice = await page.locator('.notice-message').textContent();
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('Denied')); });
  await page.keyboard.press('f'); await page.waitForTimeout(50);
  assert.equal(await page.locator('.notice-message').textContent(), notice);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  await page.evaluate(() => { Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }); });
  await page.keyboard.press('f');
  assert.equal(await page.locator('.notice-message').textContent(), notice);
  assert.equal(await page.getByRole('button', { name: /Fullscreen/ }).count(), 0);
  // A request in flight must not produce another request from rapid distinct presses.
  await page.evaluate(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    window.pendingRequests = 0;
    document.documentElement.requestFullscreen = () => { pendingRequests++; return new Promise(resolve => window.finishRequest = resolve); };
  });
  await page.keyboard.press('f'); await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => pendingRequests), 1);
  await page.evaluate(() => finishRequest());
  await page.setViewportSize({ width: 320, height: 568 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('Fullscreen checks passed: whole-app root on library/editor/presentation/reveal, responsive fit, inherited/plaintext editable fields, modifiers, repeats, composition, pending requests, default Escape, unsupported/rejected API and no extra UI.');
} finally { await browser.close(); }
