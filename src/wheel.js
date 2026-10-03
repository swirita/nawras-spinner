import { slices, labelFor, linkFor } from './model.js';
import { colorFor, sectionStyle, tint } from './colors.js';
const ns = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}) => { const el = document.createElementNS(ns, tag); for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val); return el; };
const point = angle => [250 + 238 * Math.sin(angle * Math.PI / 180), 250 - 238 * Math.cos(angle * Math.PI / 180)];
let sequence = 0;
const measure = document.createElement('canvas').getContext('2d');
export function drawWheel(container, options, { mini = false, rotation = 0, spinning = false } = {}) {
  container.replaceChildren();
  container.className = `wheel-wrap${mini ? ' mini' : ''}${spinning ? ' spinning' : ''}`;
  const svg = node('svg', { viewBox: '0 0 500 500', 'aria-label': options.length ? `Wheel with ${options.length} options` : 'Empty wheel', role: 'group' });
  const prefix = `wheel-${++sequence}`;
  const defs = node('defs');
  const sectionColors = options.map(colorFor);
  const uniqueColors = [...new Set(sectionColors)];
  const gradientIds = new Map();
  uniqueColors.forEach((color, i) => {
    gradientIds.set(color, `${prefix}-${i}`);
    const { highlight } = sectionStyle(color);
    const gradient = node('linearGradient', { id: `${prefix}-${i}`, x1: '0', y1: '0', x2: '1', y2: '1' });
    gradient.append(node('stop', { offset: '0', 'stop-color': tint(color, highlight) }), node('stop', { offset: '.55', 'stop-color': color }), node('stop', { offset: '1', 'stop-color': tint(color, highlight * .2) })); defs.append(gradient);
  });
  svg.append(defs);
  const group = node('g', { class: 'wheel-disc', style: `transform: rotate(${rotation}deg); transform-origin: 250px 250px` });
  svg.append(group);
  const list = slices(options);
  if (!list.length) { group.append(node('circle', { cx: 250, cy: 250, r: 238, fill: '#e8edf4' })); const text = node('text', { x: 250, y: 325, 'text-anchor': 'middle', class: 'empty-wheel' }); text.textContent = 'No options'; group.append(text); }
  list.forEach((slice, index) => {
    const [x1, y1] = point(slice.start), [x2, y2] = point(slice.end);
    const shape = slice.fraction > .999999999 ? node('circle', { cx: 250, cy: 250, r: 238 }) : node('path', { d: `M250 250 L${x1} ${y1} A238 238 0 ${slice.end - slice.start > 180 ? 1 : 0} 1 ${x2} ${y2} Z` });
    shape.setAttribute('fill', `url(#${gradientIds.get(sectionColors[index])})`); shape.setAttribute('stroke', '#ffffff'); shape.setAttribute('stroke-width', '1.25');
    const link = !mini && !spinning && linkFor(slice.item);
    const parent = link ? node('a', { href: link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open link for ${labelFor(slice.item)}`, class: 'slice-link' }) : node('g');
    const title = node('title'); title.textContent = labelFor(slice.item); parent.append(title, shape);
    if (!mini && options.length <= 32 && slice.fraction >= .025) {
      const angle = (slice.start + slice.end) / 2;
      const flip = angle > 180;
      const label = labelFor(slice.item);
      const width = 138;
      let size = slice.fraction >= .5 ? 18 : Math.min(18, Math.max(11, 2 * 153 * Math.sin(slice.fraction * Math.PI) * .48));
      measure.font = `600 ${size}px "Segoe UI", Arial, sans-serif`;
      size = Math.min(size, size * width / Math.max(1, measure.measureText(label).width));
      // Show exact names when they fit; hide dense/long labels rather than abbreviating them.
      if (size >= 11) {
        const text = node('text', { transform: `translate(250 250) rotate(${angle - 90 + (flip ? 180 : 0)})`, x: flip ? -153 : 153, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'slice-label', 'font-size': size });
        text.style.fill = sectionStyle(sectionColors[index]).text;
        text.textContent = label; parent.append(text);
      }
    }
    group.append(parent);
  });
  // Highlights live inside each slice, below its label, to preserve text contrast.
  svg.append(node('circle', { cx: 250, cy: 250, r: 241, fill: 'none', stroke: '#d4dfe8', 'stroke-width': 5, class: 'wheel-decoration' }), node('circle', { cx: 250, cy: 250, r: 239, fill: 'none', stroke: '#ffffff', 'stroke-width': 3, class: 'wheel-decoration' }));
  container.append(svg);
  const img = document.createElement('img'); img.className = 'centre-logo'; img.src = `${import.meta.env.BASE_URL}assets/nawras-circle.png`; img.alt = ''; container.append(img);
  const pointer = document.createElement('div'); pointer.className = 'pointer'; container.append(pointer);
  return group;
}
