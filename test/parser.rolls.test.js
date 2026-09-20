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

test('parseRollTable 支援 godfat 2026-09 新版 minor_/major_ 稀有度 class 格式', () => {
  const tableHtml =
    '<table><tbody>' +
    '<tr><td class="position cat pick minor_rare major_rare next_position" onclick="pick(\'1A\')"><span><a>稀有貓</a> <a>🐾</a></span></td>' +
    '<td class="position cat pick minor_rare major_rare" onclick="pick(\'1AG\')"><span><a>保證貓</a> <a>🐾</a> -&gt; 11B</span></td>' +
    '<td class="position cat pick minor_rare major_rare" onclick="pick(\'1B\')"><span><a>稀有B</a> <a>🐾</a></span></td></tr>' +
    '<tr><td class="position cat pick minor_supa major_supa" onclick="pick(\'2A\')"><span><a>激稀有貓</a> <a>🐾</a></span></td>' +
    '<td class="position cat pick minor_supa_fest major_supa_fest" onclick="pick(\'2B\')"><span><a>祭激稀有</a> <a>🐾</a></span></td></tr>' +
    '<tr><td class="position cat pick minor_uber major_uber" onclick="pick(\'3A\')"><span><a>超激貓</a> <a>🐾</a></span></td>' +
    '<td class="position cat pick minor_uber_fest major_uber_fest" onclick="pick(\'3B\')"><span><a>祭超激貓</a> <a>🐾</a></span></td></tr>' +
    '<tr><td class="position cat pick minor_exclusive major_exclusive" onclick="pick(\'4A\')"><span><a>限定超激</a> <a>🐾</a></span></td>' +
    '<td class="position cat pick minor_legend major_legend" onclick="pick(\'4B\')"><span><a>傳說貓</a> <a>🐾</a></span></td></tr>' +
    '<tr><td class="position cat pick minor_legend_fest major_legend_fest" onclick="pick(\'5A\')"><span><a>祭傳說貓</a> <a>🐾</a></span></td>' +
    '<td class="position cat pick minor_uber major_uber_fest" onclick="pick(\'5B\')"><span><a>進階雙色貓</a> <a>🐾</a></span></td></tr>' +
    '</tbody></table>';
  const { cells, hasGuaranteed } = parseRollTable(parseHTML(tableHtml).document);

  assert.equal(hasGuaranteed, true);
  assert.equal(cells.size, 10);

  const c1A = cells.get('1A');
  assert.equal(c1A.name, '稀有貓');
  assert.equal(c1A.rarity, 'rare');
  assert.equal(c1A.isNext, true);
  assert.equal(c1A.guaranteed?.name, '保證貓');
  assert.equal(c1A.guaranteed?.to, '11B');

  assert.equal(cells.get('2A').rarity, 'supa');
  assert.equal(cells.get('2B').rarity, 'supa_fest');
  assert.equal(cells.get('3A').rarity, 'uber');
  assert.equal(cells.get('3B').rarity, 'uber_fest');
  assert.equal(cells.get('4A').rarity, 'exclusive');
  assert.equal(cells.get('4B').rarity, 'legend');
  assert.equal(cells.get('5A').rarity, 'legend'); // legend_fest 正規化為 legend
  assert.equal(cells.get('5B').rarity, 'uber_fest'); // fest 優先判定
});
