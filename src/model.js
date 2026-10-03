export const VERSION = 1;
export const STORAGE_KEY = 'nawras-spinner:v1';
export const id = () => crypto.randomUUID();
export const copy = value => structuredClone(value);
export const option = (label, index = 0) => ({ id: id(), label, adjustWeight: false, weight: 1, linkEnabled: false, url: '', color: defaultColor(index) });
export const wheel = (title = 'Untitled wheel', labels = []) => ({ id: id(), title, options: labels.map(option), removeWinner: false, saveWinners: false, winnerHistory: [] });
export const example = () => wheel('Nawras Activities', ['Wordle', 'Memory', 'Slasher', 'Kahoot 1', 'Kahoot 2', 'Coupon 1', 'Coupon 2', 'Try Again']);
export const validURL = value => {
  try {
    if (!/^https?:\/\//i.test(value.trim())) return null;
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};
export const linkFor = item => item.linkEnabled ? validURL(item.url) : null;
export const labelFor = item => item.label.trim() || 'Untitled option';
export function slices(options) {
  if (!options.length) return [];
  const weights = options.map(o => o.adjustWeight ? o.weight : 1);
  const scale = weights.reduce((a, b) => Math.max(a, b), 0);
  const total = weights.reduce((sum, w) => sum + w / scale, 0);
  let start = 0;
  return options.map((item, index) => {
    const fraction = (weights[index] / scale) / total;
    const result = { item, start, end: start + fraction * 360, fraction };
    start = result.end;
    return result;
  });
}
export function selectSlice(list, random = Math.random()) {
  const angle = Math.min(Math.max(random, 0), 1 - Number.EPSILON) * 360;
  return list.find(s => angle < s.end) || list.at(-1);
}
export function landingRotation(current, slice) {
  const target = (360 - (slice.start + slice.end) / 2) % 360;
  return current + 360 * 5 + ((target - current % 360 + 360) % 360);
}
export function recordWinner(w, winner, spinId, wonAt = new Date().toISOString()) {
  if (!w.saveWinners || w.winnerHistory.some(record => record.id === spinId)) return false;
  w.winnerHistory.push({ id: spinId, optionId: winner.id, label: labelFor(winner), wonAt });
  return true;
}
export function validateData(data, fresh = false) {
  if (!data || data.version !== VERSION || !Array.isArray(data.wheels)) throw new Error('Expected a Nawras Spinner version 1 JSON file.');
  const wheelIds = new Set();
  const optionIds = new Set();
  const wheels = data.wheels.map(w => {
    if (!w || typeof w.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(w.id) || wheelIds.has(w.id) || typeof w.title !== 'string' || !Array.isArray(w.options) || typeof w.removeWinner !== 'boolean') throw new Error('Invalid wheel data.');
    wheelIds.add(w.id);
    const options = w.options.map((o, index) => {
      if (!o || typeof o.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(o.id) || optionIds.has(o.id) || typeof o.label !== 'string' || typeof o.adjustWeight !== 'boolean' || typeof o.weight !== 'number' || !Number.isFinite(o.weight) || o.weight <= 0 || typeof o.linkEnabled !== 'boolean' || typeof o.url !== 'string') throw new Error('Invalid option data. Weights must be positive numbers.');
      optionIds.add(o.id);
      if (o.linkEnabled && !validURL(o.url)) throw new Error('Enabled links must be valid HTTP or HTTPS URLs.');
      if (o.color !== undefined && !validColor(o.color)) throw new Error('Option colors must be six-digit hexadecimal colors.');
      return { id: fresh ? id() : o.id, label: o.label, adjustWeight: o.adjustWeight, weight: o.adjustWeight ? o.weight : 1, linkEnabled: o.linkEnabled, url: o.url, color: o.color?.toLowerCase() ?? defaultColor(index) };
    });
    if (w.saveWinners !== undefined && typeof w.saveWinners !== 'boolean') throw new Error('Invalid Save winners setting.');
    if (w.winnerHistory !== undefined && !Array.isArray(w.winnerHistory)) throw new Error('Invalid winner history.');
    const recordIds = new Set();
    const optionMapping = new Map(w.options.map((o, i) => [o.id, options[i].id]));
    const winnerHistory = (w.winnerHistory || []).map(record => {
      if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(record.id) || recordIds.has(record.id) || typeof record.optionId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(record.optionId) || typeof record.label !== 'string' || typeof record.wonAt !== 'string' || !Number.isFinite(Date.parse(record.wonAt))) throw new Error('Invalid winner history record.');
      recordIds.add(record.id);
      if (fresh && !optionMapping.has(record.optionId)) optionMapping.set(record.optionId, id());
      return { id: fresh ? id() : record.id, optionId: fresh ? optionMapping.get(record.optionId) : record.optionId, label: record.label, wonAt: new Date(record.wonAt).toISOString() };
    });
    return { id: fresh ? id() : w.id, title: w.title, removeWinner: w.removeWinner, options, saveWinners: w.saveWinners ?? false, winnerHistory };
  });
  return { version: VERSION, wheels };
}
export function load(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { data: { version: VERSION, wheels: [example()] }, blocked: false, initial: true };
    // In-progress URL fields may be invalid; they stay editable after refresh.
    const parsed = JSON.parse(raw);
    const draft = copy(parsed);
    if (Array.isArray(draft.wheels)) for (const w of draft.wheels) if (Array.isArray(w.options)) for (const o of w.options) if (o.linkEnabled === true && typeof o.url === 'string' && !validURL(o.url)) o.linkEnabled = false;
    const data = validateData(draft);
    data.wheels.forEach((w, i) => w.options.forEach((o, j) => o.linkEnabled = parsed.wheels[i].options[j].linkEnabled));
    return { data, blocked: false, initial: false };
  } catch (error) {
    return { data: { version: VERSION, wheels: [] }, blocked: true, error, initial: false };
  }
}
import { defaultColor, validColor } from './colors.js';
