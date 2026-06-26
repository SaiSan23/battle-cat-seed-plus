import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';

const html = readFileSync(new URL('./fixtures/gu-banner.html', import.meta.url), 'utf8');
const { document } = parseHTML(html);

test('parseRollTable 解析出 1A 的貓名與稀有度', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('1A');
  assert.ok(c, '應有 1A');
  assert.equal(c.track, 'A');
  assert.equal(c.n, 1);
  assert.equal(c.name, '霸龍迪歐拉姆斯');
  assert.equal(c.rarity, 'supa');
});

test('parseRollTable 同時有 A 與 B 軌位置', () => {
  const { cells } = parseRollTable(document);
  assert.ok(cells.has('1A') && cells.has('1B'));
  assert.equal(cells.get('1B').track, 'B');
});

test('未模擬保證時 hasGuaranteed=false（保證欄需 force_guaranteed 才填入）', () => {
  const { hasGuaranteed } = parseRollTable(document);
  assert.equal(hasGuaranteed, false);
});

test('parseRollTable 標出 next_position', () => {
  const { cells } = parseRollTable(document);
  const nextCount = [...cells.values()].filter((c) => c.isNext).length;
  assert.ok(nextCount >= 1);
});

test('parseRollTable 正確解析 exclusive 型別', () => {
  const { cells } = parseRollTable(document);
  // fixture 中 11A 為 exclusive uber「非命之王佛挪」
  assert.equal(cells.get('11A').rarity, 'exclusive');
  assert.equal(cells.get('11A').name, '非命之王佛挪');
});

test('parseRollTable 對無保證格者 hasGuaranteed=false', () => {
  const minimal = parseHTML(
    '<table><tr><th>No.</th><th>Result</th><th>Guaranteed</th><th>Alt. No.</th></tr>' +
      '<tr><td><td class="cat pick rare" onclick="pick(\'1A\')"><span><a>貓</a></span></td></tr></table>'
  ).document;
  const { hasGuaranteed, cells } = parseRollTable(minimal);
  assert.equal(hasGuaranteed, false); // 即使有 Guaranteed 表頭，無 G 格 → false
  assert.equal(cells.get('1A').name, '貓');
});
