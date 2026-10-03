import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeAudio, tone, playSound, playTick, cancelSounds, setMuted } from '../src/audio.js';
import { boundaryCrossings } from '../src/spin-audio.js';
import { slices, wheel } from '../src/model.js';

test('exponential envelopes cancel continuously, keep quiet tails, clean up, and respect mute/overlap', async () => {
  const voices = [], gains = [];
  let created = 0, resumes = 0, context;
  const param = () => ({ events: [], setValueAtTime(...args) { this.events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); }, exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); }, cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); } });
  class AudioContext {
    constructor() { created++; context = this; this.currentTime = 10; this.state = 'suspended'; }
    async resume() { resumes++; this.state = 'running'; }
    createOscillator() { const oscillator = { frequency: param(), stops: [], connect() {}, disconnect() { this.disconnected = true; }, start(at) { this.startAt = at; }, stop(at) { this.stops.push(at); } }; voices.push(oscillator); return oscillator; }
    createGain() { const gain = { gain: param(), connect() {}, disconnect() { this.disconnected = true; } }; gains.push(gain); return gain; }
  }
  globalThis.window = { AudioContext };
  await resumeAudio(); await resumeAudio();
  assert.equal(created, 1); assert.equal(resumes, 1);
  tone(180, 1, 'sawtooth', 0.012, 0, 70);
  assert.deepEqual(gains[0].gain.events, [['set', 0.012, 10], ['exponential', 0.0001, 11]]);
  assert.equal(voices[0].stops[0], 11.02);
  assert.deepEqual(voices[0].frequency.events, [['set', 180, 10], ['exponential', 70, 11]]);
  tone(820, 0.025, 'square', 0.03, 5);
  context.currentTime = 10.5;
  cancelSounds();
  assert.ok(Math.abs(gains[0].gain.events.at(-2)[1] - Math.sqrt(0.012 * 0.0001)) < 1e-12);
  assert.equal(voices[1].stops.at(-1), 10.505);
  assert.deepEqual(gains[1].gain.events.slice(-3), [['cancel', 10.5], ['set', 0, 10.5], ['linear', 0, 10.505]]);
  playSound('wheel-win');
  assert.equal(voices.length, 10);
  const winnerNotes = [
    [523, 0.12, 'triangle', 0.06, 0], [659, 0.12, 'triangle', 0.06, 0.12],
    [784, 0.12, 'triangle', 0.06, 0.24], [1047, 0.7, 'triangle', 0.06, 0.36],
    [659, 0.7, 'sine', 0.035, 0.36], [784, 0.7, 'sine', 0.035, 0.36],
    [2093, 0.5, 'sine', 0.02, 0.4, 2200], [2106, 0.5, 'sine', 0.02, 0.4, 2210]
  ];
  winnerNotes.forEach(([frequency, duration, waveform, volume, delay, slide], i) => {
    const start = 10.5 + delay, end = start + duration;
    assert.equal(voices[i + 2].type, waveform);
    assert.deepEqual(gains[i + 2].gain.events, [['set', volume, start], ['exponential', 0.0001, end]]);
    assert.deepEqual(voices[i + 2].frequency.events, [['set', frequency, start], ...(slide ? [['exponential', slide, end]] : [])]);
    assert.equal(voices[i + 2].stops[0], end + 0.02);
  });
  setMuted(true);
  assert.equal(gains[2].gain.events.at(-2)[1], 0.06); // Cancellation at onset starts at full gain.
  assert.ok(voices.slice(2).every(voice => voice.stops.at(-1) === 10.505));
  playTick(); await resumeAudio();
  assert.equal(voices.length, 10);
  setMuted(false); context.currentTime += 1; playTick(); playTick();
  assert.equal(voices.length, 11);
  assert.equal(voices.at(-1).type, 'square');
  assert.deepEqual(voices.at(-1).frequency.events, [['set', 820, 11.5]]);
  assert.equal(voices.at(-1).stops[0], 11.545);
  context.currentTime += 0.026; playTick();
  assert.equal(voices.length, 11); // The 20 ms oscillator tail also prevents overlap.
  context.currentTime += 0.02; playTick();
  assert.equal(voices.length, 12);
  assert.equal(voices.at(-1).frequency.events[0][1], 1000);
  cancelSounds();
  context.currentTime = 12;
  tone(659, 0.12, 'triangle', 0.06);
  context.currentTime = 12.13;
  cancelSounds();
  assert.ok(Math.abs(gains.at(-1).gain.events.at(-2)[1] - 0.0001) < 1e-12);
  voices.forEach((voice, i) => { voice.onended(); assert.equal(voice.disconnected, true); assert.equal(gains[i].disconnected, true); });
  const stops = voices.map(voice => voice.stops.length);
  cancelSounds();
  assert.deepEqual(voices.map(voice => voice.stops.length), stops);
  delete globalThis.window;
});

test('pointer crossings use weighted geometry, exclude the starting seam, and include whole turns', () => {
  const w = wheel('Weighted', ['A', 'B', 'C']);
  w.options.forEach((o, i) => Object.assign(o, { adjustWeight: true, weight: [1, 2, 5][i] }));
  const boundaries = slices(w.options).map(section => section.start);
  assert.deepEqual(boundaries, [0, 45, 135]);
  assert.equal(boundaryCrossings(boundaries, 0, 224), 0);
  assert.equal(boundaryCrossings(boundaries, 224, 225), 1);
  assert.equal(boundaryCrossings(boundaries, 225, 314), 0);
  assert.equal(boundaryCrossings(boundaries, 314, 315), 1);
  assert.equal(boundaryCrossings(boundaries, 315, 360), 1);
  assert.equal(boundaryCrossings(boundaries, 360, 1080), 6);
  assert.equal(boundaryCrossings(boundaries, 725, 725), 0);
});
