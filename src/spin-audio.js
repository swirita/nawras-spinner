import { playTick } from './audio.js';

// Slice angles are clockwise from the fixed pointer at twelve o'clock.
// A boundary at b passes it whenever wheel rotation + b is a multiple of 360.
export function boundaryCrossings(boundaries, previous, angle) {
  return boundaries.reduce((count, boundary) => count
    + Math.floor((angle + boundary) / 360)
    - Math.floor((previous + boundary) / 360), 0);
}

export function trackSpinTicks(animation, from, to, sections) {
  const boundaries = [...new Set(sections.filter(section => section.fraction > 0).map(section => section.start))];
  // A single section is drawn as a circle and has no dividing line.
  if (boundaries.length < 2) return () => {};
  let previous = from, previousTime = performance.now(), frame;
  const sample = timestamp => {
    const progress = animation.effect.getComputedTiming().progress;
    if (progress === null || animation.playState !== 'running') return;
    // The animation engine supplies its eased progress, including whole turns.
    const angle = from + (to - from) * progress;
    const crossed = boundaryCrossings(boundaries, previous, angle);
    // Consume all crossings even when muted, busy, hidden, or a frame was missed.
    // Never queue catch-up tones; at most one immediate tick per fresh frame.
    if (!document.hidden && timestamp - previousTime <= 80 && crossed > 0) playTick();
    previous = angle;
    previousTime = timestamp;
    frame = requestAnimationFrame(sample);
  };
  frame = requestAnimationFrame(sample);
  return () => cancelAnimationFrame(frame);
}
