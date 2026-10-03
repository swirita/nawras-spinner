import './style.css';
import { STORAGE_KEY, id, copy, wheel, option, load, validateData, selectSlice, landingRotation, labelFor, linkFor, recordWinner } from './model.js';
import { drawWheel } from './wheel.js';
import { colorFor, defaultColor } from './colors.js';
import { resumeAudio, cancelSounds, playSound } from './audio.js';
import { trackSpinTicks } from './spin-audio.js';

const app = document.querySelector('#app'), header = document.querySelector('#header'), notice = document.querySelector('#notice'), dialog = document.querySelector('#dialog');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw Error('Storage unavailable'); } }; }
const loaded = load(storage);
const data = loaded.data;
let blocked = loaded.blocked, spinning = false, rotation = 0, routeToken = 0, editGroup = null, lastSave = !loaded.blocked;
const histories = new Map();
const editorScroll = new Map();
let revealTimer;
let celebrationTimer;
let revealTransition = false;
let activeSpin;
let revealWait;
let confirmCallback;
let resizeTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function cancelRevealWait() {
  if (!revealWait) return;
  clearTimeout(revealWait.timer);
  cancelAnimationFrame(revealWait.frame);
  revealWait.resolve(false);
  revealWait = null;
}
function waitForReveal(milliseconds = 0) {
  return new Promise(resolve => {
    const wait = { resolve };
    revealWait = wait;
    const finish = () => { revealWait = null; resolve(true); };
    if (milliseconds) wait.timer = setTimeout(finish, milliseconds);
    else wait.frame = requestAnimationFrame(() => { wait.frame = requestAnimationFrame(finish); });
  });
}
function cancelSpin() {
  activeSpin?.stopTicks?.();
  cancelSounds();
  activeSpin?.animations.forEach(animation => animation.cancel());
  activeSpin = null;
  spinning = false;
  document.body.classList.remove('wheel-moving');
}
function stopScreenWork() {
  cancelSpin();
  cancelRevealWait();
  clearTimeout(revealTimer);
  clearTimeout(resizeTimer);
  clearCelebration();
  confirmCallback = null;
}
// Presentation exclusions are transient and never become part of saved wheel data.
let removedWinnerIds = new Set();
const presentationOptions = w => w.options.filter(o => !removedWinnerIds.has(o.id));
function clearCelebration() {
  clearTimeout(celebrationTimer);
  dialog.querySelector('.confetti')?.remove();
}
const esc = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const btn = (action, text, cls = '', extra = '') => `<button type="button" data-action="${action}" class="${cls}" ${extra}>${text}</button>`;
const route = () => { const [, view, id] = location.hash.split('/'); return { view: view || 'wheels', id }; };
const current = () => data.wheels.find(w => w.id === route().id);
const history = w => { if (!histories.has(w.id)) histories.set(w.id, { undo: [], redo: [] }); return histories.get(w.id); };
let noticeAnimation;
function message(text) {
  noticeAnimation?.cancel();
  noticeAnimation = null;
  notice.querySelector('.notice-dismiss').disabled = false;
  notice.querySelector('.notice-message').textContent = text;
  notice.classList.toggle('visible', !!text);
}
notice.querySelector('.notice-dismiss').addEventListener('click', async () => {
  if (noticeAnimation || !notice.classList.contains('visible')) return;
  if (reducedMotion.matches) { message(''); return; }
  const style = getComputedStyle(notice);
  const animation = notice.animate([
    { height: `${notice.getBoundingClientRect().height}px`, opacity: 1,
      paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
      marginTop: style.marginTop, marginBottom: style.marginBottom,
      borderTopWidth: style.borderTopWidth, borderBottomWidth: style.borderBottomWidth },
    { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px',
      marginTop: '0px', marginBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }
  ], { duration: 240, easing: 'ease-in-out' });
  noticeAnimation = animation;
  notice.querySelector('.notice-dismiss').disabled = true;
  try { await animation.finished; }
  catch { return; } // A newer notification replaces the outgoing message.
  if (noticeAnimation === animation) message('');
});
function save() {
  if (blocked) { lastSave = false; message('Saving is paused: existing storage could not be read. Your original data is untouched. Export your current wheels to keep them.'); return false; }
  try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); lastSave = true; return true; }
  catch { lastSave = false; message('Browser storage is unavailable or full. Changes are kept in this tab. Export to keep your wheels.'); return false; }
}
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function updateSaved(ok) { const indicator = document.querySelector('#saved'); if (indicator) indicator.textContent = ok ? '✓ Saved' : 'Not saved'; }
function edit(w, fn, key = null) {
  const before = copy(w); fn(w);
  if (JSON.stringify(before) === JSON.stringify(w)) return;
  const h = history(w);
  if (!key || editGroup !== key) h.undo.push(before);
  h.redo = []; editGroup = key;
  updateSaved(save()); updateHistory(w);
}
function updateHistory(w) {
  const h = history(w);
  const undo = document.querySelector('[data-action="undo"]'), redo = document.querySelector('[data-action="redo"]');
  if (undo) undo.disabled = !h.undo.length; if (redo) redo.disabled = !h.redo.length;
}
function refreshPreview(w, updateChances = true) {
  const list = drawWheel(document.querySelector('#editor-wheel'), w.options).sections;
  if (!updateChances) return;
  document.querySelector('#option-count').textContent = `${w.options.length} options`;
  document.querySelectorAll('.chance').forEach((el, i) => { const p = (list[i]?.fraction || 0) * 100; const text = `${p > 0 && p < .01 ? '<0.01' : Number(p.toFixed(2))}%`; if (el.textContent !== text) el.textContent = text; });
}
function showDialog(html) {
  clearCelebration();
  confirmCallback = null;
  clearTimeout(revealTimer); dialog.className = ''; dialog.removeAttribute('aria-labelledby');
  dialog.innerHTML = html; dialog.returnValue = ''; dialog.showModal();
}
function confirmAction(title, text, action, callback) {
  showDialog(`<form method="dialog"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="dialog-actions"><button value="cancel">Cancel</button><button class="primary" value="confirm">${esc(action)}</button></div></form>`);
  confirmCallback = callback;
}
function render() {
  stopScreenWork();
  routeToken++; rotation = 0; editGroup = null;
  removedWinnerIds = new Set();
  revealTransition = false;
  if (dialog.open) dialog.close();
  const { view } = route(), w = current();
  document.body.classList.toggle('audience', view === 'present' && !!w);
  document.body.classList.toggle('editing', view === 'edit' && !!w);
  header.innerHTML = view === 'present' && w ? `${btn('back-editor', '← Back', 'quiet audience-back')}<img class="audience-brand" src="${import.meta.env.BASE_URL}assets/nawras-name.png" alt="NawrasEdu">` : `<a class="brand" href="#/wheels" aria-label="My Wheels"><img src="${import.meta.env.BASE_URL}assets/nawras-name.png" alt="NawrasEdu"></a><a class="library-link" href="#/wheels">My Wheels</a>`;
  if (view === 'wheels' || !w) renderLibrary();
  else if (view === 'edit') renderEditor(w);
  else if (view === 'present') renderAudience(w);
  else { location.hash = '#/wheels'; }
}
function renderLibrary() {
  document.body.classList.remove('editing');
  app.innerHTML = `<div class="page-heading"><h1>My Wheels<span class="count">${data.wheels.length}</span></h1><div class="toolbar">${btn('export', '↑ Export')}${btn('import', '↓ Import')}${btn('create', '+ Create Wheel', 'primary')}</div></div><div class="cards">${data.wheels.map(w => `<article class="card" data-wheel="${w.id}"><div class="card-top"><h2>${esc(w.title || 'Untitled wheel')}</h2><span>${w.options.length} options</span></div><a class="card-preview" href="#/edit/${w.id}" aria-label="Edit ${esc(w.title)}"><div class="preview" data-preview="${w.id}"></div></a><div class="card-actions"><a class="button primary" href="#/present/${w.id}">Present <span>↗</span></a><a class="button" href="#/edit/${w.id}">Edit</a>${btn('duplicate', '⧉', 'icon-button', `aria-label="Duplicate ${esc(w.title)}" title="Duplicate"`)}${btn('delete', '×', 'icon-button delete', `aria-label="Delete ${esc(w.title)}" title="Delete"`)}</div></article>`).join('')}</div>${!data.wheels.length ? '<div class="empty-state"><div class="empty-ring">＋</div><h2>No wheels yet</h2>' + btn('create', 'Create Wheel', 'primary') + '</div>' : ''}<footer><img src="${import.meta.env.BASE_URL}assets/nawras-small.png" alt="">Nawras Spinner</footer>`;
  for (const w of data.wheels) drawWheel(document.querySelector(`[data-preview="${w.id}"]`), w.options, { mini: true });
}
function renderEditor(w) {
  const oldList = document.querySelector('.option-list');
  if (oldList && oldList.dataset.wheel === w.id) editorScroll.set(w.id, oldList.scrollTop);
  app.innerHTML = `<div class="editor-top"><a class="back-link" href="#/wheels">← My Wheels</a><div class="toolbar"><span id="saved" class="saved">${blocked ? 'Not saved' : '✓ Saved'}</span><a class="button primary" href="#/present/${w.id}">Present ↗</a></div></div><div class="editor-layout"><section class="wheel-stage" aria-label="Wheel preview"><div id="editor-wheel"></div></section><section class="editor-pane"><label class="field-label" for="wheel-title">Wheel title</label><input id="wheel-title" class="title-input" data-field="title" value="${esc(w.title)}" placeholder="Untitled wheel"><div class="options-heading"><h2>Options <span id="option-count"></span></h2><div class="history-actions">${btn('undo', '↶', '', 'aria-label="Undo" title="Undo"')}${btn('redo', '↷', '', 'aria-label="Redo" title="Redo"')}</div></div><div class="option-list" data-wheel="${w.id}" tabindex="0" role="region" aria-label="Wheel entries">${w.options.map((o, i) => `<div class="option-row" data-option="${o.id}"><div class="option-main"><span class="option-number">${String(i + 1).padStart(2, '0')}</span><input type="color" class="color-swatch" data-field="color" aria-label="Option ${i + 1} color" title="Section color" value="${colorFor(o, i)}"><input data-field="label" aria-label="Option ${i + 1} label" value="${esc(o.label)}" placeholder="Option label"><span class="chance"></span>${btn('remove-option', '×', 'remove', `aria-label="Remove option ${i + 1}"`)}</div><div class="option-settings"><label><input type="checkbox" data-field="adjustWeight" ${o.adjustWeight ? 'checked' : ''}> Adjust weight</label>${o.adjustWeight ? `<input class="weight-input" data-field="weight" type="number" min="0" step="any" aria-label="Option ${i + 1} weight" value="${o.weight}">` : ''}<label><input type="checkbox" data-field="linkEnabled" ${o.linkEnabled ? 'checked' : ''}> Link</label></div>${o.linkEnabled ? `<input class="url-input" type="url" data-field="url" aria-label="Option ${i + 1} URL" placeholder="https://example.com" value="${esc(o.url)}"><small class="url-error" ${linkFor(o) ? 'hidden' : ''}>Enter a valid HTTP or HTTPS URL.</small>` : ''}</div>`).join('')}</div><div class="option-tools">${btn('add-option', '+ Add option')}${btn('paste', 'Paste list')}${btn('reset-colors', 'Reset colors', 'text-button')}${btn('clear', 'Clear', 'text-button', `aria-label="Clear Options" ${!w.options.length ? 'disabled' : ''}`)}</div><div class="wheel-settings"><label class="remove-winner"><input type="checkbox" data-field="removeWinner" ${w.removeWinner ? 'checked' : ''}> Remove winners during presentation</label><div class="save-winners-row"><label><input type="checkbox" data-field="saveWinners" ${w.saveWinners ? 'checked' : ''}> Save winners</label>${btn('winner-history', 'Winner history', 'text-button')}</div></div></section></div>`;
  document.querySelector('.option-list').scrollTop = editorScroll.get(w.id) || 0;
  refreshPreview(w); updateHistory(w);
  updateSaved(lastSave);
}
function renderAudience(w) {
  const options = presentationOptions(w);
  const stage = app.querySelector('.audience-stage:not(.presentation-exhausted)');
  if (stage && options.length) {
    stage.querySelector('h1').textContent = w.title || 'Untitled wheel';
    drawWheel(document.querySelector('#audience-wheel'), options, { rotation });
    const button = stage.querySelector('[data-action="spin"]');
    button.disabled = false; button.textContent = 'Spin';
    return;
  }
  const spinButton = btn('spin', 'Spin', 'primary spin-button', !options.length ? 'disabled' : '');
  app.innerHTML = `<section class="audience-stage ${!options.length ? 'presentation-exhausted' : ''}"><h1>${esc(w.title || 'Untitled wheel')}</h1><div class="audience-wheel-space"><div id="audience-wheel"></div></div>${options.length ? spinButton : `<div class="presentation-end"><div class="presentation-actions">${spinButton}${w.options.length ? btn('reset-presentation', 'Reset presentation', 'quiet') : ''}</div><p class="empty-note">No options remain.</p></div>`}</section>`;
  drawWheel(document.querySelector('#audience-wheel'), options, { rotation });
}
function result(w, winner) {
  const link = linkFor(winner);
  const options = presentationOptions(w);
  showDialog(`<div class="winner-content"><h2 id="winner-name" tabindex="-1">${esc(labelFor(winner))}</h2><div class="winner-controls" hidden><button class="close-dialog" data-action="dismiss" aria-label="Close winner"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><div class="dialog-actions">${link ? `<a class="button" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open Link ↗</a>` : ''}${btn('spin-again', 'Spin Again', '', !options.length ? 'disabled' : '')}${!options.length && w.options.length ? btn('reset-presentation', 'Reset presentation') : ''}</div><p class="empty-note" ${options.length ? 'hidden' : ''}>No options remain.</p></div></div>`);
  dialog.className = 'winner-reveal'; dialog.setAttribute('aria-labelledby', 'winner-name');
  document.querySelector('#winner-name').focus({ preventScroll: true });
  fitWinner();
  revealTimer = setTimeout(() => { if (dialog.open && dialog.classList.contains('winner-reveal')) { dialog.querySelector('.winner-controls').hidden = false; } }, 1000);
  if (reducedMotion.matches) return;
  const confetti = document.createElement('div'); confetti.className = 'confetti'; confetti.setAttribute('aria-hidden', 'true');
  const spread = Math.min(innerWidth * .85, 950), rise = -Math.min(innerHeight * .75, 760);
  for (let i = 0; i < 32; i++) {
    const piece = document.createElement('i');
    piece.style.cssText = `--dx:${(Math.random() - .5) * spread}px;--rise:${rise * (.65 + Math.random() * .35)}px;--delay:${Math.random() * .5}s;--tilt:${Math.random() * 540}deg;background:${['#efc966', '#77dce9', '#c0abf0'][i % 3]}`;
    confetti.append(piece);
  }
  dialog.append(confetti);
  celebrationTimer = setTimeout(clearCelebration, 2400);
}
async function spinAgain(w) {
  if (revealTransition || spinning || !presentationOptions(w).length || !dialog.open) return;
  revealTransition = true;
  void resumeAudio();
  cancelSounds();
  clearTimeout(revealTimer);
  const token = routeToken;
  dialog.querySelectorAll('button').forEach(button => button.disabled = true);
  dialog.classList.add('winner-leaving');
  if (!reducedMotion.matches && !await waitForReveal(350)) return;
  if (token !== routeToken || !dialog.open) { revealTransition = false; return; }
  clearCelebration(); dialog.close();
  // Paint the unobscured wheel once before beginning another spin.
  if (!await waitForReveal()) return;
  revealTransition = false;
  if (token === routeToken && route().view === 'present' && current() === w) {
    spin(w);
  }
}
function showWinnerHistory(w) {
  showDialog(`<div class="history-dialog"><h2 id="history-title">Winner history</h2><div class="winner-history-list" tabindex="0" role="region" aria-label="Saved winners">${w.winnerHistory.length ? [...w.winnerHistory].reverse().map(record => `<div class="history-record"><span>${esc(record.label)}</span><time datetime="${esc(record.wonAt)}">${esc(new Date(record.wonAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</time></div>`).join('') : '<p>No saved winners yet.</p>'}</div><div class="dialog-actions">${btn('clear-winner-history', 'Clear history', 'text-button', !w.winnerHistory.length ? 'disabled' : '')}${btn('dismiss', 'Close')}</div></div>`);
  dialog.className = 'history-modal'; dialog.setAttribute('aria-labelledby', 'history-title');
}
function fitWinner() {
  const text = dialog.querySelector('#winner-name'); if (!text || !dialog.open) return;
  let low = 1, high = Math.min(128, innerWidth * .1) * .85;
  const content = dialog.querySelector('.winner-content'), controls = dialog.querySelector('.winner-controls');
  const padding = getComputedStyle(content);
  const height = Math.max(24, controls.getBoundingClientRect().top - parseFloat(padding.paddingTop) - 24);
  for (let i = 0; i < 12; i++) {
    const size = (low + high) / 2; text.style.fontSize = `${size}px`;
    if (text.scrollHeight > height || text.scrollWidth > text.clientWidth + 1) high = size; else low = size;
  }
  text.style.fontSize = `${low}px`;
}
dialog.addEventListener('close', () => {
  if (dialog.open) return; // A newer dialog may have opened before the close event runs.
  clearTimeout(revealTimer);
  clearTimeout(resizeTimer);
  clearCelebration();
  cancelSounds();
  if (dialog.classList.contains('winner-reveal')) queueMicrotask(() => { if (!dialog.open) { const button = document.querySelector('[data-action="spin"]'); (button?.disabled ? document.querySelector('[data-action="back-editor"]') : button)?.focus({ preventScroll: true }); } });
  const callback = confirmCallback;
  confirmCallback = null;
  dialog.replaceChildren();
  if (dialog.returnValue === 'confirm') callback?.();
});
dialog.addEventListener('cancel', event => {
  if (revealTransition) event.preventDefault();
  else { clearTimeout(revealTimer); clearCelebration(); }
});
let fullscreenPending = false;
async function toggleFullscreen() {
  if (fullscreenPending || !document.fullscreenEnabled) return;
  fullscreenPending = true;
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { /* Unsupported or rejected fullscreen leaves the app usable. */ }
  finally { fullscreenPending = false; }
}
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'f' || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof Element && (target.closest('input, textarea, select') || target.isContentEditable)) return;
  event.preventDefault(); toggleFullscreen();
});
document.addEventListener('fullscreenchange', () => { if (dialog.open && dialog.classList.contains('winner-reveal')) fitWinner(); });
async function spin(w) {
  const options = presentationOptions(w);
  if (spinning || revealTransition || !options.length) return;
  clearCelebration();
  spinning = true; const token = routeToken, spinId = id();
  const run = { animations: [] };
  activeSpin = run;
  document.body.classList.add('wheel-moving');
  cancelSounds();
  await resumeAudio();
  if (token !== routeToken || activeSpin !== run) return;
  const group = drawWheel(document.querySelector('#audience-wheel'), options, { rotation, spinning: true });
  const list = group.sections, slice = selectSlice(list), winner = copy(slice.item);
  const target = landingRotation(rotation, slice);
  document.querySelector('[data-action="spin"]').disabled = true;
  document.querySelector('[data-action="spin"]').textContent = 'Spinning…';
  const duration = reducedMotion.matches ? 80 : 6048;
  const frames = [{ transform: `rotate(${rotation}deg)` }, { transform: `rotate(${target}deg)` }];
  const timing = { duration, easing: 'cubic-bezier(.18,.05,.12,1)', fill: 'forwards' };
  const animation = group.animate(frames, timing);
  run.animations = [animation, ...group.rotationLayers.map(layer => layer.animate(frames, timing))];
  run.stopTicks = trackSpinTicks(animation, rotation, target, list);
  try { await animation.finished; }
  catch {
    if (activeSpin === run) { cancelSpin(); renderAudience(w); }
    return;
  }
  if (token !== routeToken || activeSpin !== run) return;
  run.stopTicks();
  run.animations.forEach(animation => animation.cancel());
  activeSpin = null;
  spinning = false;
  document.body.classList.remove('wheel-moving');
  if (data.wheels.includes(w) && recordWinner(w, winner, spinId)) save();
  rotation = target % 360;
  if (w.removeWinner) removedWinnerIds.add(winner.id);
  renderAudience(w);
  result(w, winner);
  playSound('wheel-win');
}
document.addEventListener('input', event => {
  const el = event.target, field = el.dataset.field, w = current();
  if (!field || !w || el.type === 'checkbox') return;
  const row = el.closest('[data-option]'), o = row ? w.options.find(o => o.id === row.dataset.option) : w;
  let value = el.value;
  if (field === 'weight') {
    value = Number(value); const valid = value > 0 && Number.isFinite(value);
    el.setCustomValidity(valid ? '' : 'Enter a positive weight.'); el.setAttribute('aria-invalid', String(!valid));
    if (!valid) return;
  }
  edit(w, () => { o[field] = value; }, `${o.id}:${field}`);
  if (field === 'url') row.querySelector('.url-error').hidden = !!linkFor(o);
  if (field !== 'title') refreshPreview(w, field === 'weight');
});
document.addEventListener('focusout', event => { editGroup = null; const el = event.target; if (el.dataset.field === 'weight' && !el.checkValidity()) { const o = current()?.options.find(o => o.id === el.closest('[data-option]').dataset.option); if (o) el.value = o.weight; el.setCustomValidity(''); el.setAttribute('aria-invalid', 'false'); } });
document.addEventListener('change', event => {
  const el = event.target, w = current();
  if (!w || el.type !== 'checkbox' || !el.dataset.field) return;
  const row = el.closest('[data-option]'), o = row ? w.options.find(o => o.id === row.dataset.option) : w;
  edit(w, () => { o[el.dataset.field] = el.checked; if (el.dataset.field === 'adjustWeight' && !el.checked) o.weight = 1; });
  renderEditor(w);
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action, w = current();
  if (action === 'dismiss') dialog.close();
  if (action === 'spin-again' && w) spinAgain(w);
  const cardWheel = data.wheels.find(w => w.id === button.closest('[data-wheel]')?.dataset.wheel);
  if (action === 'create') { const created = wheel('Untitled wheel'); data.wheels.push(created); save(); location.hash = `#/edit/${created.id}`; }
  if (action === 'duplicate') { const duplicate = copy(cardWheel); duplicate.id = id(); duplicate.options.forEach(o => o.id = id()); duplicate.winnerHistory = []; duplicate.title += ' (copy)'; data.wheels.push(duplicate); save(); renderLibrary(); }
  if (action === 'delete') confirmAction('Delete wheel?', cardWheel.title || 'Untitled wheel', 'Delete', () => { data.wheels = data.wheels.filter(w => w.id !== cardWheel.id); histories.delete(cardWheel.id); editorScroll.delete(cardWheel.id); save(); renderLibrary(); });
  if (action === 'export') download(JSON.stringify(data, null, 2), 'nawras-wheels.json');
  if (action === 'import') document.querySelector('#import-file').click();
  if (action === 'back-editor' && !spinning) location.hash = `#/edit/${w.id}`;
  if (action === 'spin' && !spinning && !revealTransition) spin(w);
  if (!w) return;
  if (action === 'reset-presentation' && route().view === 'present' && !spinning && !revealTransition) {
    if (dialog.open) dialog.close();
    removedWinnerIds.clear(); rotation = 0; renderAudience(w);
    document.querySelector('[data-action="spin"]').focus({ preventScroll: true });
  }
  if (action === 'winner-history') showWinnerHistory(w);
  if (action === 'clear-winner-history') confirmAction('Clear winner history?', 'Only recorded results will be cleared. Your entries and presentation remain unchanged.', 'Clear history', () => {
    w.winnerHistory = []; save(); showWinnerHistory(w);
  });
  if (action === 'undo' || action === 'redo') {
    const h = history(w), from = h[action], to = h[action === 'undo' ? 'redo' : 'undo'];
    if (!from.length) return; to.push(copy(w)); const recorded = w.winnerHistory; Object.assign(w, from.pop()); w.winnerHistory = recorded; editGroup = null; save(); renderEditor(w);
  }
  if (action === 'reset-colors') { edit(w, w => { w.options.forEach((o, index) => o.color = defaultColor(index)); }); renderEditor(w); }
  if (action === 'add-option') { edit(w, w => w.options.push(option('', w.options.length))); renderEditor(w); const inputs = app.querySelectorAll('[data-field="label"]'); inputs[inputs.length - 1].focus({ preventScroll: true }); inputs[inputs.length - 1].scrollIntoView({ block: 'nearest' }); }
  if (action === 'remove-option') { edit(w, w => { w.options = w.options.filter(o => o.id !== button.closest('[data-option]').dataset.option); }); renderEditor(w); }
  if (action === 'clear') confirmAction('Clear all options?', 'You can undo this change.', 'Clear Options', () => { edit(w, w => { w.options = []; }); renderEditor(w); });
  if (action === 'paste') showDialog(`<form id="paste-form"><h2>Paste options</h2><textarea id="paste-options" aria-label="Options, one per line" placeholder="One option per line" rows="9"></textarea><div class="dialog-actions">${btn('dismiss', 'Cancel')}<button class="primary" type="submit">Add Options</button></div></form>`);
});

dialog.addEventListener('submit', event => {
  if (event.target.id !== 'paste-form') return;
  event.preventDefault();
  const w = current(), labels = document.querySelector('#paste-options').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!w || !labels.length) return;
  edit(w, w => { w.options = w.options.concat(labels.map((label, index) => option(label, w.options.length + index))); });
  dialog.close(); renderEditor(w);
});
document.querySelector('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { const imported = validateData(JSON.parse(await file.text()), true); data.wheels = data.wheels.concat(imported.wheels); const saved = save(); if (location.hash === '#/wheels' || !location.hash) render(); else location.hash = '#/wheels'; if (saved) message(`Imported ${imported.wheels.length} wheel${imported.wheels.length === 1 ? '' : 's'}.`); }
  catch (error) { message(`Import failed: ${error.message}`); }
  finally { event.target.value = ''; }
});
window.addEventListener('hashchange', render);
window.addEventListener('pagehide', () => { stopScreenWork(); noticeAnimation?.cancel(); });
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('page-hidden', document.hidden);
  if (document.hidden) { cancelSounds(); clearCelebration(); }
});
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) clearCelebration(); });
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  if (!dialog.open || !dialog.classList.contains('winner-reveal')) return;
  resizeTimer = setTimeout(() => {
    if (dialog.classList.contains('winner-reveal') && dialog.open) fitWinner();
  }, 100);
});
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { blocked = true; message('Wheels changed in another tab. Saving is paused here. Export changes from this tab before refreshing.'); } });
if (loaded.initial) save();
if (blocked) message('Saved data is unreadable or storage is unavailable. Saving is paused to protect existing data. Export any new wheels before closing this tab.');
render();
