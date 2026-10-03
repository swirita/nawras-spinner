let context;
let muted = false;
const voices = new Set();
const fade = 0.005;
const decayFloor = 0.0001;
const stopTail = 0.02;
let tickUntil = 0;
let tickIndex = 0;

// Call from a user gesture, including before an asynchronous overlay transition.
export async function resumeAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || muted) return;
    context ||= new AudioContext();
    if (context.state === 'suspended') await context.resume();
  } catch { /* Audio availability must not prevent spinning. */ }
}

export function cancelSounds() {
  tickIndex = 0;
  if (!context) return;
  const now = context.currentTime;
  for (const voice of voices) {
    const { oscillator, gain, start, end, stopAt, volume } = voice;
    // Match the exponential ramp, including its quiet tail before oscillator stop.
    const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
    const level = now < start || now >= stopAt ? 0
      : volume * Math.pow(decayFloor / volume, progress);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0, level), now);
    gain.gain.linearRampToValueAtTime(0, now + fade);
    oscillator.stop(now + fade);
  }
  voices.clear();
  tickUntil = now + fade;
}

export function setMuted(value) {
  muted = Boolean(value);
  if (muted) cancelSounds();
}

export function tone(frequency, duration, waveform = 'sine', volume = 0.05, delay = 0, slideToFrequency) {
  if (muted || !context || context.state !== 'running') return;
  const start = context.currentTime + delay, end = start + duration;
  const stopAt = end + stopTail;
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideToFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(slideToFrequency, end);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(decayFloor, end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  const voice = { oscillator, gain, start, end, stopAt, volume };
  voices.add(voice);
  oscillator.onended = () => {
    voices.delete(voice);
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(start);
  oscillator.stop(stopAt);
  return stopAt;
}

export function playTick() {
  if (muted || !context || context.state !== 'running' || context.currentTime < tickUntil) return;
  tickUntil = tone(tickIndex % 2 ? 1000 : 820, 0.025, 'square', 0.02);
  tickIndex++;
}

export function playSound(name) {
  cancelSounds();
  switch (name) {
    case 'wheel-win':
      tone(523, 0.12, 'triangle', 0.06, 0);
      tone(659, 0.12, 'triangle', 0.06, 0.12);
      tone(784, 0.12, 'triangle', 0.06, 0.24);
      tone(1047, 0.7, 'triangle', 0.06, 0.36);
      tone(659, 0.7, 'sine', 0.035, 0.36);
      tone(784, 0.7, 'sine', 0.035, 0.36);
      tone(2093, 0.5, 'sine', 0.02, 0.4, 2200);
      tone(2106, 0.5, 'sine', 0.02, 0.4, 2210);
      break;
  }
}
