import './style.css';
import './polish.css';
import './editor-layout.css';
import { VERSION, STORAGE_KEY, id, copy, wheel, option, load, validateData, slices, selectSlice, landingRotation, labelFor, linkFor } from './model.js';
import { drawWheel } from './wheel.js';
import { colorFor, defaultColor } from './colors.js';

const app = document.querySelector('#app'), header = document.querySelector('#header'), notice = document.querySelector('#notice'), dialog = document.querySelector('#dialog');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw Error('Storage unavailable'); } }; }
const loaded = load(storage);
let data = loaded.data, blocked = loaded.blocked, spinning = false, rotation = 0, routeToken = 0, editGroup = null, lastSave = !loaded.blocked;
const histories = new Map();
const editorScroll = new Map();
let revealTimer;
const esc = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const btn = (action, text, cls = '', extra = '') => `<button type="button" data-action="${action}" class="${cls}" ${extra}>${text}</button>`;
const route = () => { const [, view, id] = location.hash.split('/'); return { view: view || 'wheels', id }; };
const current = () => data.wheels.find(w => w.id === route().id);
const history = w => { if (!histories.has(w.id)) histories.set(w.id, { undo: [], redo: [] }); return histories.get(w.id); };
function message(text) { notice.textContent = text; notice.classList.toggle('visible', !!text); }
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
function refreshPreview(w) {
  drawWheel(document.querySelector('#editor-wheel'), w.options);
  const list = slices(w.options);
  document.querySelector('#option-count').textContent = `${w.options.length} options`;
  document.querySelectorAll('.chance').forEach((el, i) => { const p = (list[i]?.fraction || 0) * 100; el.textContent = `${p > 0 && p < .01 ? '<0.01' : Number(p.toFixed(2))}%`; });
}
function showDialog(html, after) {
  clearTimeout(revealTimer); dialog.className = ''; dialog.removeAttribute('aria-labelledby');
  dialog.innerHTML = html; dialog.returnValue = ''; dialog.showModal();
  dialog.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => dialog.close());
  after?.();
}
function confirmAction(title, text, action, callback) {
  showDialog(`<form method="dialog"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="dialog-actions"><button value="cancel">Cancel</button><button class="primary" value="confirm">${esc(action)}</button></div></form>`);
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') callback(); }, { once: true });
}
function render() {
  routeToken++; rotation = 0; editGroup = null;
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
  app.innerHTML = `<div class="editor-top"><a class="back-link" href="#/wheels">← My Wheels</a><div class="toolbar"><span id="saved" class="saved">${blocked ? 'Not saved' : '✓ Saved'}</span><a class="button primary" href="#/present/${w.id}">Present ↗</a></div></div><div class="editor-layout"><section class="wheel-stage" aria-label="Wheel preview"><div id="editor-wheel"></div></section><section class="editor-pane"><label class="field-label" for="wheel-title">Wheel title</label><input id="wheel-title" class="title-input" data-field="title" value="${esc(w.title)}" placeholder="Untitled wheel"><div class="options-heading"><h2>Options <span id="option-count"></span></h2><div class="history-actions">${btn('undo', '↶', '', 'aria-label="Undo" title="Undo"')}${btn('redo', '↷', '', 'aria-label="Redo" title="Redo"')}</div></div><div class="option-list" data-wheel="${w.id}" tabindex="0" role="region" aria-label="Wheel entries">${w.options.map((o, i) => `<div class="option-row" data-option="${o.id}"><div class="option-main"><span class="option-number">${String(i + 1).padStart(2, '0')}</span><input type="color" class="color-swatch" data-field="color" aria-label="Option ${i + 1} color" title="Section color" value="${colorFor(o, i)}"><input data-field="label" aria-label="Option ${i + 1} label" value="${esc(o.label)}" placeholder="Option label"><span class="chance"></span>${btn('remove-option', '×', 'remove', `aria-label="Remove option ${i + 1}"`)}</div><div class="option-settings"><label><input type="checkbox" data-field="adjustWeight" ${o.adjustWeight ? 'checked' : ''}> Adjust weight</label>${o.adjustWeight ? `<input class="weight-input" data-field="weight" type="number" min="0" step="any" aria-label="Option ${i + 1} weight" value="${o.weight}">` : ''}<label><input type="checkbox" data-field="linkEnabled" ${o.linkEnabled ? 'checked' : ''}> Link</label></div>${o.linkEnabled ? `<input class="url-input" type="url" data-field="url" aria-label="Option ${i + 1} URL" placeholder="https://example.com" value="${esc(o.url)}"><small class="url-error" ${linkFor(o) ? 'hidden' : ''}>Enter a valid HTTP or HTTPS URL.</small>` : ''}</div>`).join('')}</div><div class="option-tools">${btn('add-option', '+ Add option')}${btn('paste', 'Paste list')}${btn('reset-colors', 'Reset colors', 'text-button')}${btn('clear', 'Clear', 'text-button', `aria-label="Clear Options" ${!w.options.length ? 'disabled' : ''}`)}</div><label class="remove-winner"><input type="checkbox" data-field="removeWinner" ${w.removeWinner ? 'checked' : ''}> Remove winner after each spin</label></section></div>`;
  document.querySelector('.option-list').scrollTop = editorScroll.get(w.id) || 0;
  refreshPreview(w); updateHistory(w);
  updateSaved(lastSave);
}
function renderAudience(w) {
  app.innerHTML = `<section class="audience-stage"><h1>${esc(w.title || 'Untitled wheel')}</h1><div id="audience-wheel"></div>${btn('spin', 'Spin', 'primary spin-button', !w.options.length ? 'disabled' : '')}${!w.options.length ? '<p class="empty-note">No options remain.</p>' : ''}</section>`;
  drawWheel(document.querySelector('#audience-wheel'), w.options);
}
function result(w, winner) {
  const link = linkFor(winner);
  showDialog(`<div class="winner-content"><h2 id="winner-name" tabindex="-1">${esc(labelFor(winner))}</h2><div class="winner-controls" hidden><button class="close-dialog" data-action="dismiss" aria-label="Close winner">×</button><div class="dialog-actions">${link ? `<a class="button" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open Link ↗</a>` : ''}${btn('spin-again', 'Spin Again', '', !w.options.length ? 'disabled' : '')}</div><p class="empty-note" ${w.options.length ? 'hidden' : ''}>No options remain.</p></div></div>`, () => {
    dialog.querySelector('[data-action="spin-again"]').addEventListener('click', () => { dialog.close(); drawWheel(document.querySelector('#audience-wheel'), w.options, { rotation }); spin(w); });
  });
  dialog.className = 'winner-reveal'; dialog.setAttribute('aria-labelledby', 'winner-name');
  document.querySelector('#winner-name').focus({ preventScroll: true });
  fitWinner();
  revealTimer = setTimeout(() => { if (dialog.open && dialog.classList.contains('winner-reveal')) { dialog.querySelector('.winner-controls').hidden = false; } }, 1000);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const confetti = document.createElement('div'); confetti.className = 'confetti'; confetti.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 36; i++) { const piece = document.createElement('i'); piece.style.cssText = `--dx:${(Math.random() - .5) * Math.min(innerWidth, 1100)}px;--dy:${(Math.random() - .45) * Math.min(innerHeight, 900)}px;--delay:${Math.random() * .12}s;--tilt:${Math.random() * 540}deg;background:${['#efc966', '#77dce9', '#c0abf0'][i % 3]}`; confetti.append(piece); }
  dialog.append(confetti); setTimeout(() => confetti.remove(), 2200);
}
function fitWinner() {
  const text = dialog.querySelector('#winner-name'); if (!text || !dialog.open) return;
  let low = 1, high = Math.min(128, innerWidth * .1);
  const height = Math.max(40, innerHeight - 200);
  for (let i = 0; i < 12; i++) {
    const size = (low + high) / 2; text.style.fontSize = `${size}px`;
    if (text.scrollHeight > height || text.scrollWidth > text.clientWidth + 1) high = size; else low = size;
  }
  text.style.fontSize = `${low}px`;
}
dialog.addEventListener('close', () => {
  clearTimeout(revealTimer);
  if (dialog.classList.contains('winner-reveal')) queueMicrotask(() => { if (!dialog.open) { const button = document.querySelector('[data-action="spin"]'); (button?.disabled ? document.querySelector('[data-action="back-editor"]') : button)?.focus({ preventScroll: true }); } });
});
async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { message('Fullscreen is unavailable in this browser.'); }
}
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'f' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || route().view !== 'present' || dialog.open) return;
  if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  event.preventDefault(); toggleFullscreen();
});
async function spin(w) {
  if (spinning || !w.options.length) return;
  spinning = true; const token = routeToken;
  const list = slices(w.options), slice = selectSlice(list), winner = copy(slice.item);
  const target = landingRotation(rotation, slice), group = drawWheel(document.querySelector('#audience-wheel'), w.options, { rotation, spinning: true });
  document.querySelector('[data-action="spin"]').disabled = true;
  document.querySelector('[data-action="spin"]').textContent = 'Spinning…';
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 5040;
  const animation = group.animate([{ transform: `rotate(${rotation}deg)` }, { transform: `rotate(${target}deg)` }], { duration, easing: 'cubic-bezier(.18,.05,.12,1)', fill: 'forwards' });
  await animation.finished;
  spinning = false;
  if (token !== routeToken) return;
  rotation = target % 360;
  drawWheel(document.querySelector('#audience-wheel'), w.options, { rotation });
  // Reveal against the original slices first; keep this disc until the next spin.
  result(w, winner);
  if (w.removeWinner) { edit(w, w => { w.options = w.options.filter(o => o.id !== winner.id); }); }
  dialog.querySelector('[data-action="spin-again"]').disabled = !w.options.length;
  if (!w.options.length && !dialog.querySelector('.empty-note')) {
    const note = document.createElement('p'); note.className = 'empty-note'; note.textContent = 'No options remain.'; dialog.querySelector('.winner-controls').append(note);
  }
  if (!w.options.length) dialog.querySelector('.empty-note').hidden = false;
  const spinButton = document.querySelector('[data-action="spin"]'); spinButton.disabled = !w.options.length; spinButton.textContent = 'Spin';
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
  refreshPreview(w);
});
document.addEventListener('focusout', event => { editGroup = null; const el = event.target; if (el.dataset.field === 'weight' && !el.checkValidity()) { const o = current()?.options.find(o => o.id === el.closest('[data-option]').dataset.option); if (o) el.value = o.weight; el.setCustomValidity(''); el.setAttribute('aria-invalid', 'false'); } });
document.addEventListener('change', event => {
  const el = event.target, w = current();
  if (!w || el.type !== 'checkbox' || !el.dataset.field) return;
  const row = el.closest('[data-option]'), o = row ? w.options.find(o => o.id === row.dataset.option) : w;
  edit(w, () => { o[el.dataset.field] = el.checked; if (el.dataset.field === 'adjustWeight' && !el.checked) o.weight = 1; });
  renderEditor(w);
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action, w = current();
  const cardWheel = data.wheels.find(w => w.id === button.closest('[data-wheel]')?.dataset.wheel);
  if (action === 'create') { const created = wheel('Untitled wheel'); data.wheels.push(created); save(); location.hash = `#/edit/${created.id}`; }
  if (action === 'duplicate') { const duplicate = copy(cardWheel); duplicate.id = id(); duplicate.options.forEach(o => o.id = id()); duplicate.title += ' (copy)'; data.wheels.push(duplicate); save(); renderLibrary(); }
  if (action === 'delete') confirmAction('Delete wheel?', cardWheel.title || 'Untitled wheel', 'Delete', () => { data.wheels = data.wheels.filter(w => w.id !== cardWheel.id); histories.delete(cardWheel.id); save(); renderLibrary(); });
  if (action === 'export') download(JSON.stringify(data, null, 2), 'nawras-wheels.json');
  if (action === 'import') document.querySelector('#import-file').click();
  if (action === 'back-editor' && !spinning) location.hash = `#/edit/${w.id}`;
  if (action === 'spin') { drawWheel(document.querySelector('#audience-wheel'), w.options, { rotation }); spin(w); }
  if (!w) return;
  if (action === 'undo' || action === 'redo') {
    const h = history(w), from = h[action], to = h[action === 'undo' ? 'redo' : 'undo'];
    if (!from.length) return; to.push(copy(w)); Object.assign(w, from.pop()); editGroup = null; save(); renderEditor(w);
  }
  if (action === 'reset-colors') { edit(w, w => { w.options.forEach((o, index) => o.color = defaultColor(index)); }); renderEditor(w); }
  if (action === 'add-option') { edit(w, w => w.options.push(option('', w.options.length))); renderEditor(w); const inputs = app.querySelectorAll('[data-field="label"]'); inputs[inputs.length - 1].focus({ preventScroll: true }); inputs[inputs.length - 1].scrollIntoView({ block: 'nearest' }); }
  if (action === 'remove-option') { edit(w, w => { w.options = w.options.filter(o => o.id !== button.closest('[data-option]').dataset.option); }); renderEditor(w); }
  if (action === 'clear') confirmAction('Clear all options?', 'You can undo this change.', 'Clear Options', () => { edit(w, w => { w.options = []; }); renderEditor(w); });
  if (action === 'paste') showDialog(`<form id="paste-form"><h2>Paste options</h2><textarea id="paste-options" aria-label="Options, one per line" placeholder="One option per line" rows="9"></textarea><div class="dialog-actions">${btn('dismiss', 'Cancel')}<button class="primary" type="submit">Add Options</button></div></form>`, () => {
    document.querySelector('#paste-form').addEventListener('submit', event => { event.preventDefault(); const labels = document.querySelector('#paste-options').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); if (!labels.length) return; edit(w, w => { w.options = w.options.concat(labels.map((label, index) => option(label, w.options.length + index))); }); dialog.close(); renderEditor(w); });
  });
});
document.querySelector('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { const imported = validateData(JSON.parse(await file.text()), true); data.wheels = data.wheels.concat(imported.wheels); const saved = save(); location.hash = '#/wheels'; renderLibrary(); if (saved) message(`Imported ${imported.wheels.length} wheel${imported.wheels.length === 1 ? '' : 's'}.`); }
  catch (error) { message(`Import failed: ${error.message}`); }
  finally { event.target.value = ''; }
});
window.addEventListener('hashchange', render);
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer); resizeTimer = setTimeout(() => {
    if (dialog.classList.contains('winner-reveal') && dialog.open) fitWinner();
  }, 100);
});
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { blocked = true; message('Wheels changed in another tab. Saving is paused here. Export changes from this tab before refreshing.'); } });
if (loaded.initial) save();
if (blocked) message('Saved data is unreadable or storage is unavailable. Saving is paused to protect existing data. Export any new wheels before closing this tab.');
render();
