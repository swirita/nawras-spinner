import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { wheel } from '../src/model.js';

const url = process.env.CHECK_URL || 'http://127.0.0.1:4176/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.resources = { timers: new Set(), frames: new Set(), voices: 0, contexts: 0 };
  const set = window.setTimeout, clear = window.clearTimeout;
  window.setTimeout = (callback, delay, ...args) => {
    const timer = set(() => { resources.timers.delete(timer); callback(...args); }, delay);
    resources.timers.add(timer); return timer;
  };
  window.clearTimeout = timer => { resources.timers.delete(timer); clear(timer); };
  const raf = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = callback => {
    const frame = raf(at => { resources.frames.delete(frame); callback(at); });
    resources.frames.add(frame); return frame;
  };
  window.cancelAnimationFrame = frame => { resources.frames.delete(frame); cancel(frame); };
  const NativeContext = window.AudioContext;
  window.AudioContext = class extends NativeContext {
    constructor() {
      super(); resources.contexts++;
      const create = this.createOscillator.bind(this);
      this.createOscillator = () => {
        const oscillator = create(); resources.voices++;
        oscillator.addEventListener('ended', () => resources.voices--, { once: true });
        return oscillator;
      };
    }
  };
});
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const snapshot = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  return { ...(await cdp.send('Memory.getDOMCounters')), ...(await page.evaluate(() => ({ timers: resources.timers.size, frames: resources.frames.size, voices: resources.voices, contexts: resources.contexts, particles: document.querySelectorAll('.confetti i').length, activeAnimations: document.getAnimations().filter(a => a.playState === 'running').length, screenAnimations: document.getAnimations().filter(a => a.playState === 'running' && !a.effect.target.closest('.particles')).length }))) };
};
const result = {};
try {
  await page.goto(url);
  for (const count of [8, 100]) {
    const w = wheel(`Performance ${count}`, Array.from({ length: count }, (_, i) => `Entry ${i + 1}`));
    Object.assign(w.options[0], { linkEnabled: true, url: 'https://example.com/start' });
    await page.evaluate(w => localStorage.setItem('nawras-spinner:v1', JSON.stringify({ version: 1, wheels: [w] })), w);
    await page.goto(`${url}#/edit/${w.id}`); await page.reload();
    result[`edit${count}`] = await page.evaluate(async () => {
      let wheelBuilds = 0, addedWheelNodes = 0;
      const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof Element && record.target.closest('#editor-wheel')) {
            addedWheelNodes += 1 + node.querySelectorAll('*').length;
            if (node.tagName.toLowerCase() === 'svg') wheelBuilds++;
          }
        }
      });
      observer.observe(document.querySelector('#editor-wheel'), { childList: true, subtree: true });
      const times = [];
      for (let batch = 0; batch < 5; batch++) {
        const start = performance.now();
        for (let i = 0; i < 40; i++) {
          const field = i % 4 === 0 ? 'title' : i % 4 === 1 ? 'url' : 'label';
          const el = document.querySelector(`[data-field="${field}"]`);
          el.value = field === 'url' ? `https://example.com/${batch}/${i}` : `Updated ${batch} ${i}`;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        times.push(performance.now() - start);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      observer.disconnect();
      times.sort((a, b) => a - b);
      return { edits: 200, medianBatchMs: times[2], wheelBuilds, addedWheelNodes };
    });
  }
  const w = wheel('Repeated spins', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  w.options.forEach((o, i) => Object.assign(o, { adjustWeight: true, weight: i + 1 }));
  w.saveWinners = true;
  await page.evaluate(w => localStorage.setItem('nawras-spinner:v1', JSON.stringify({ version: 1, wheels: [w] })), w);
  await page.goto(`${url}#/present/${w.id}`); await page.reload();
  // Warm the reusable context and dialog once before checking accumulation.
  await page.locator('[data-action=spin]').click();
  await page.locator('.winner-reveal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Back$/ }).click();
  await page.getByRole('link', { name: /^Present/ }).click();
  await page.waitForTimeout(120);
  result.beforeCycles = await snapshot();
  for (let i = 0; i < 12; i++) {
    await page.locator('[data-action=spin]').click();
    await page.locator('.winner-reveal').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Back$/ }).click();
    await page.getByRole('link', { name: /^Present/ }).click();
  }
  await page.waitForTimeout(120);
  result.afterCycles = await snapshot();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nawras-spinner:v1')).wheels[0].winnerHistory.length), 13);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const start = await metrics();
  await page.locator('[data-action=spin]').click();
  const frames = await page.evaluate(() => new Promise(resolve => {
    const gaps = []; let previous;
    const sample = timestamp => {
      if (previous !== undefined) gaps.push(timestamp - previous);
      previous = timestamp;
      if (document.querySelector('#dialog').open) { gaps.sort((a, b) => a - b); resolve({ count: gaps.length, p95Ms: gaps[Math.floor(gaps.length * .95)], over50Ms: gaps.filter(gap => gap > 50).length }); }
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  const end = await metrics();
  result.normalSpin = { ...frames, taskMs: (end.TaskDuration - start.TaskDuration) * 1000, scriptMs: (end.ScriptDuration - start.ScriptDuration) * 1000, layoutMs: (end.LayoutDuration - start.LayoutDuration) * 1000 };
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Back$/ }).click();
  await page.waitForTimeout(120);
  result.afterNormalSpin = await snapshot();
  // Interrupt the overlay fade and a running spin, then leave the screen.
  await page.getByRole('link', { name: /^Present/ }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-action=spin]').click();
  await page.locator('.winner-controls').waitFor({ state: 'visible' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-action=spin-again]').click();
  await page.evaluate(() => { location.hash = '#/wheels'; });
  await page.getByRole('heading', { name: /My Wheels/ }).waitFor();
  await page.waitForTimeout(120);
  result.interruptedFade = await snapshot();
  await page.goto(`${url}#/present/${w.id}`);
  await page.locator('[data-action=spin]').click();
  await page.waitForTimeout(250);
  await page.evaluate(() => { location.hash = '#/wheels'; });
  await page.getByRole('heading', { name: /My Wheels/ }).waitFor();
  await page.waitForTimeout(120);
  result.interruptedSpin = await snapshot();
  if (process.env.PERF_ASSERT === '1') {
    for (const name of ['afterCycles', 'afterNormalSpin', 'interruptedFade', 'interruptedSpin']) {
      assert.equal(result[name].frames, 0, name);
      assert.equal(result[name].timers, 0, name);
      assert.equal(result[name].voices, 0, name);
      assert.equal(result[name].particles, 0, name);
      assert.equal(result[name].screenAnimations, 0, name);
    }
    assert.equal(result.afterCycles.jsEventListeners, result.beforeCycles.jsEventListeners);
    assert.equal(result.afterCycles.nodes, result.beforeCycles.nodes);
    assert.equal(result.afterCycles.contexts, 1);
    assert.equal(result.edit8.wheelBuilds, 0);
    assert.equal(result.edit100.wheelBuilds, 0);
  }
  assert.deepEqual(errors, []);
  await mkdir('.checks', { recursive: true });
  await writeFile(`.checks/performance-${process.env.PERF_LABEL || 'sample'}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
