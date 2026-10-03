import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheel, option, example, slices, selectSlice, landingRotation, validURL, validateData, load, STORAGE_KEY } from '../src/model.js';
import { defaultColor, sectionStyle, contrast, tint } from '../src/colors.js';

test('colors migrate from older data, survive transfer and stay attached to IDs', () => {
  const original = example(); original.options.forEach(o => delete o.color);
  const data = validateData({ version: 1, wheels: [original] });
  assert.deepEqual(data.wheels[0].options.map(o => o.color), original.options.map((_, i) => defaultColor(i)));
  const selected = data.wheels[0].options[2]; selected.color = '#123abc'; selected.label = 'Renamed'; selected.adjustWeight = true; selected.weight = 2.5;
  data.wheels[0].options.reverse();
  const restored = validateData(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.wheels[0].options.find(o => o.id === selected.id).color, '#123abc');
  const transferred = validateData(restored, true);
  assert.equal(transferred.wheels[0].options.find(o => o.label === 'Renamed').color, '#123abc');
  assert.equal(load({ getItem: () => JSON.stringify(data) }).data.wheels[0].options.find(o => o.id === selected.id).color, '#123abc');
  selected.color = 'red'; assert.throws(() => validateData(data), /colors/);
});
test('labels retain readable contrast across each gradient', () => {
  for (let red = 0; red <= 255; red += 17) for (let green = 0; green <= 255; green += 17) for (let blue = 0; blue <= 255; blue += 17) {
    const color = '#' + [red, green, blue].map(c => c.toString(16).padStart(2, '0')).join('');
    const style = sectionStyle(color);
    assert.ok(contrast(color, style.text) >= 4.5, `${color}: base`);
    assert.ok(contrast(tint(color, style.highlight), style.text) >= 4.5, `${color}: highlight`);
  }
});

test('weighted random selection and pointer landing agree for decimal and extreme weights', () => {
  for (const weights of [[1, 1, 1], [.1, .3, .6], [1e308, 1e308, 1e307], [1]]) {
    const list = slices(weights.map((weight, i) => ({ ...option(String(i)), weight, adjustWeight: true })));
    assert.ok(Math.abs(list.at(-1).end - 360) < 1e-9);
    for (let i = 0; i < 1000; i++) {
      const selected = selectSlice(list, i / 1000), current = i * 73.53;
      const rotation = landingRotation(current, selected);
      const pointer = (360 - rotation % 360) % 360;
      assert.ok(pointer >= selected.start - 1e-9 && pointer <= selected.end + 1e-9);
    }
  }
});
test('equal defaults, proportional fractions, and no option-count limit', () => {
  assert.deepEqual(slices(example().options).map(s => s.fraction), Array(8).fill(.125));
  const list = slices([{ ...option('a'), adjustWeight: true, weight: .5 }, option('b')]);
  assert.equal(list[0].fraction, 1 / 3);
  assert.equal(slices(Array.from({ length: 150000 }, (_, i) => ({ label: String(i), weight: 1, adjustWeight: false }))).length, 150000);
  assert.deepEqual(slices([]), []);
});
test('links accept only absolute HTTP/S URLs without credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'ftp://example.com', 'https://u:p@example.com', 'https://']) assert.equal(validURL(url), null);
  assert.equal(validURL(' https://example.com/path '), 'https://example.com/path');
});
test('import validates atomically and assigns fresh IDs', () => {
  const original = { version: 1, wheels: [example(), wheel('Players', ['A', 'B', 'C', 'D', 'E'])] };
  const imported = validateData(original, true);
  assert.notEqual(imported.wheels[0].id, original.wheels[0].id);
  assert.notEqual(imported.wheels[0].options[0].id, original.wheels[0].options[0].id);
  assert.equal(imported.wheels[1].options.length, 5);
  for (const value of [null, { version: 2, wheels: [] }, { version: 1, wheels: [{}] }]) assert.throws(() => validateData(value));
  const bad = structuredClone(original); bad.wheels[0].options[0].weight = 0; assert.throws(() => validateData(bad));
  bad.wheels[0].options[0].weight = 1; bad.wheels[0].options[0].linkEnabled = true; bad.wheels[0].options[0].url = 'javascript:alert(1)'; assert.throws(() => validateData(bad));
});
test('storage seeds once, preserves empty libraries and protects damaged data', () => {
  assert.equal(load({ getItem: () => null }).data.wheels.length, 1);
  assert.equal(load({ getItem: () => '{"version":1,"wheels":[]}' }).data.wheels.length, 0);
  let writes = 0;
  const result = load({ getItem: () => 'damaged', setItem: () => writes++ });
  assert.equal(result.blocked, true); assert.equal(writes, 0);
  assert.equal(load({ getItem() { throw Error('denied'); } }).blocked, true);
  const draft = example(); draft.options[0].linkEnabled = true; draft.options[0].url = 'bad';
  const restored = load({ getItem: () => JSON.stringify({ version: 1, wheels: [draft] }) });
  assert.equal(restored.blocked, false); assert.equal(restored.data.wheels[0].options[0].linkEnabled, true);
  assert.equal(STORAGE_KEY, 'nawras-spinner:v1');
});
