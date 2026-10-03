export const palette = ['#9bdfea', '#c5b8ed', '#f4cf76', '#b7dcce', '#a8c4ee', '#e2c0da', '#abd9e3', '#d4d0f1'];
export const defaultColor = index => palette[index % palette.length];
export const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export const colorFor = (item, index) => validColor(item.color) ? item.color : defaultColor(index);
export const tint = (hex, amount) => '#' + hex.slice(1).match(/../g).map(value => Math.round(parseInt(value, 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, '0')).join('');
export function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
export const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
export function sectionStyle(color) {
  const dark = '#142c4d';
  if (contrast(color, dark) >= 4.5) return { text: dark, highlight: .21 };
  if (contrast(color, '#0b1424') >= 4.5) return { text: '#0b1424', highlight: .15 };
  if (contrast(color, '#000000') >= 4.5) return { text: '#000000', highlight: .1 };
  // Limit the glass highlight on dark slices so white labels retain contrast.
  let highlight = .1;
  while (highlight > 0 && contrast(tint(color, highlight), '#ffffff') < 4.5) highlight = Math.max(0, highlight - .01);
  return { text: '#ffffff', highlight };
}
