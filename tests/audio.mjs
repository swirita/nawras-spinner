import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { wheel, slices } from '../src/model.js';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
const page = await browser.newPage({ reducedMotion: 'no-preference' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const NativeContext = window.AudioContext;
  window.audioLog = { contexts: 0, voices: [], animations: [], samples: [], reveals: [] };
  let active, previous, previousTime, sample;
  window.AudioContext = class extends NativeContext {
    constructor() {
      super(); audioLog.contexts++;
      const create = this.createOscillator.bind(this);
      this.createOscillator = () => {
        const oscillator = create(), voice = { stops: [] };
        const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (frequency, at) => { voice.frequency = frequency; return setFrequency(frequency, at); };
        audioLog.voices.push(voice);
        const start = oscillator.start.bind(oscillator), stop = oscillator.stop.bind(oscillator);
        oscillator.start = at => {
          Object.assign(voice, { at, now: this.currentTime, type: oscillator.type, wall: performance.now(), state: this.state, overlay: document.querySelector('#dialog').open, sample });
          start(at);
        };
        oscillator.stop = at => { voice.stops.push(at); stop(at); };
        return oscillator;
      };
    }
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, timing) {
    const animation = animate.call(this, frames, timing);
    if (this.classList.contains('wheel-disc')) {
      const from = parseFloat(frames[0].transform.slice(7)), to = parseFloat(frames[1].transform.slice(7));
      active = { animation, group: this, from, to };
      previous = from; previousTime = undefined;
      audioLog.animations.push({ wall: performance.now(), duration: timing.duration });
      animation.finished.then(() => audioLog.finished = performance.now(), () => {});
    }
    return animation;
  };
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = callback => raf(timestamp => {
    if (active?.animation.playState === 'running') {
      const progress = active.animation.effect.getComputedTiming().progress;
      const angle = active.from + (active.to - active.from) * progress;
      const matrix = new DOMMatrix(getComputedStyle(active.group).transform);
      const rendered = (Math.atan2(matrix.b, matrix.a) * 180 / Math.PI + 360) % 360;
      sample = { previous, angle, rendered, gap: previousTime === undefined ? 0 : timestamp - previousTime, timestamp };
      audioLog.samples.push(sample);
      previous = angle; previousTime = timestamp;
    }
    callback(timestamp);
  });
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
      if (document.querySelector('#dialog').classList.contains('winner-reveal') && document.querySelector('#dialog').open) audioLog.reveals.push(performance.now());
    }).observe(document.querySelector('#dialog'), { attributes: true, attributeFilter: ['open'] });
  });
});
const url = process.env.CHECK_URL || 'http://127.0.0.1:4175/';
const w = wheel('Weighted audio', ['One', 'Two', 'Three']);
w.options.forEach((o, i) => Object.assign(o, { adjustWeight: true, weight: [1, 2, 5][i] }));
const boundaries = slices(w.options).map(s => s.start);
try {
  await page.goto(url);
  await page.evaluate(w => localStorage.setItem('nawras-spinner:v1', JSON.stringify({ version: 1, wheels: [w] })), w);
  await page.goto(`${url}#/present/${w.id}`); await page.reload();
  await page.locator('[data-action=spin]').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => { const end = performance.now() + 220; while (performance.now() < end) {} });
  await page.locator('.winner-reveal').waitFor({ state: 'visible', timeout: 9000 });
  let log = await page.evaluate(() => audioLog);
  const ticks = log.voices.filter(voice => voice.type === 'square');
  assert.equal(log.contexts, 1); assert.equal(log.animations[0].duration, 6048);
  assert.ok(ticks.length > 8);
  assert.equal(log.voices.some(voice => voice.type === 'sawtooth'), false);
  for (const [i, tick] of ticks.entries()) {
    assert.equal(tick.frequency, i % 2 ? 1000 : 820);
    assert.ok(tick.at <= tick.now && tick.now - tick.at < 0.03); // Immediate, never future-scheduled.
    assert.ok(Math.abs(tick.stops[0] - tick.at - 0.045) < 0.000001); // 25 ms decay + 20 ms quiet tail.
    if (i) assert.ok(tick.at >= ticks[i - 1].stops[0]);
    const { previous, angle, rendered, gap } = tick.sample;
    assert.ok(gap <= 80);
    const angularError = Math.abs(((angle - rendered + 180) % 360 + 360) % 360 - 180);
    assert.ok(angularError < 0.001);
    // Independently enumerate physical seams passing the top pointer.
    assert.ok(boundaries.some(b => Array.from({ length: 8 }, (_, turn) => turn * 360 - b).some(crossing => crossing > previous && crossing <= angle)));
  }
  assert.ok(log.samples.some(sample => sample.gap > 180));
  const gaps = ticks.slice(1).map((tick, i) => tick.at - ticks[i].at);
  assert.ok(gaps.slice(-3).reduce((a, b) => a + b) > gaps.slice(0, 3).reduce((a, b) => a + b));
  const win = log.voices.filter(voice => voice.type !== 'square');
  assert.equal(win.length, 8);
  assert.deepEqual(win.map(voice => voice.frequency), [523, 659, 784, 1047, 659, 784, 2093, 2106]);
  assert.ok(win[0].wall >= log.finished);
  assert.ok(Math.abs(win[0].wall - log.reveals[0]) < 30);
  await page.locator('.winner-controls').waitFor({ state: 'visible' });
  const count = log.voices.length;
  const clicked = await page.evaluate(() => { const at = performance.now(); document.querySelector('[data-action=spin-again]').click(); return at; });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => audioLog.voices.length), count);
  await page.waitForFunction(count => audioLog.voices.length > count, count);
  log = await page.evaluate(() => audioLog);
  assert.equal(log.contexts, 1);
  assert.ok(log.voices[count].wall - clicked >= 350);
  assert.equal(log.voices[count].overlay, false);
  await page.evaluate(() => { location.hash = '#/wheels'; });
  await page.getByRole('heading', { name: /My Wheels/ }).waitFor();
  const cancelledCount = await page.evaluate(() => audioLog.voices.length);
  await page.waitForTimeout(6200);
  assert.equal(await page.locator('#dialog').isVisible(), false);
  assert.equal(await page.evaluate(() => audioLog.voices.length), cancelledCount);
  assert.deepEqual(errors, []);
  console.log('Audio checks passed: every tick crosses a rendered weighted boundary, alternating nonoverlapping immediate tones, missed-frame skipping, natural slowdown, unchanged reveal fanfare, replay fade and cancellation.');
} finally { await browser.close(); }
