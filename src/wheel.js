import { slices, labelFor, linkFor } from './model.js';
export const colors = ['#9bdfea', '#c5b8ed', '#f4cf76', '#b7dcce', '#a8c4ee', '#e2c0da', '#abd9e3', '#d4d0f1'];
const ns = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}) => { const el = document.createElementNS(ns, tag); for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val); return el; };
const point = angle => [250 + 238 * Math.sin(angle * Math.PI / 180), 250 - 238 * Math.cos(angle * Math.PI / 180)];
let sequence = 0;
const tint = (hex, amount) => '#' + hex.slice(1).match(/../g).map(value => Math.round(parseInt(value, 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, '0')).join('');
const measure = document.createElement('canvas').getContext('2d');
export function drawWheel(container, options, { mini = false, rotation = 0, spinning = false } = {}) {
  container.replaceChildren();
  container.className = `wheel-wrap${mini ? ' mini' : ''}${spinning ? ' spinning' : ''}`;
  const svg = node('svg', { viewBox: '0 0 500 500', 'aria-label': options.length ? `Wheel with ${options.length} options` : 'Empty wheel', role: 'group' });
  const prefix = `wheel-${++sequence}`;
  const defs = node('defs');
  colors.forEach((color, i) => {
    const gradient = node('linearGradient', { id: `${prefix}-${i}`, x1: '0', y1: '0', x2: '1', y2: '1' });
    gradient.append(node('stop', { offset: '0', 'stop-color': tint(color, .21) }), node('stop', { offset: '.55', 'stop-color': color }), node('stop', { offset: '1', 'stop-color': tint(color, .04) })); defs.append(gradient);
  });
  const sheen = node('linearGradient', { id: `${prefix}-sheen`, x1: '0', y1: '0', x2: '.3', y2: '1' });
  sheen.append(node('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.18' }), node('stop', { offset: '.5', 'stop-color': '#fff', 'stop-opacity': '0' }), node('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '.035' })); defs.append(sheen); svg.append(defs);
  const group = node('g', { class: 'wheel-disc', style: `transform: rotate(${rotation}deg); transform-origin: 250px 250px` });
  svg.append(group);
  const list = slices(options);
  if (!list.length) { group.append(node('circle', { cx: 250, cy: 250, r: 238, fill: '#e8edf4' })); const text = node('text', { x: 250, y: 325, 'text-anchor': 'middle', class: 'empty-wheel' }); text.textContent = 'No options'; group.append(text); }
  list.forEach((slice, index) => {
    const [x1, y1] = point(slice.start), [x2, y2] = point(slice.end);
    const shape = slice.fraction > .999999999 ? node('circle', { cx: 250, cy: 250, r: 238 }) : node('path', { d: `M250 250 L${x1} ${y1} A238 238 0 ${slice.end - slice.start > 180 ? 1 : 0} 1 ${x2} ${y2} Z` });
    shape.setAttribute('fill', `url(#${prefix}-${index % colors.length})`); shape.setAttribute('stroke', '#ffffff'); shape.setAttribute('stroke-width', '1.25');
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
        text.textContent = label; parent.append(text);
      }
    }
    group.append(parent);
  });
  svg.append(node('circle', { cx: 250, cy: 250, r: 238, fill: `url(#${prefix}-sheen)`, class: 'wheel-decoration' }), node('circle', { cx: 250, cy: 250, r: 241, fill: 'none', stroke: '#d4dfe8', 'stroke-width': 5, class: 'wheel-decoration' }), node('circle', { cx: 250, cy: 250, r: 239, fill: 'none', stroke: '#ffffff', 'stroke-width': 3, class: 'wheel-decoration' }));
  container.append(svg);
  const img = document.createElement('img'); img.className = 'centre-logo'; img.src = `${import.meta.env.BASE_URL}assets/nawras-circle.png`; img.alt = ''; container.append(img);
  const pointer = document.createElement('div'); pointer.className = 'pointer'; container.append(pointer);
  return group;
}
