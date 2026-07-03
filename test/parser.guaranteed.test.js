import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';

const html = readFileSync(new URL('./fixtures/gu-banner-forced11.html', import.meta.url), 'utf8');
const { document } = parseHTML(html);

test('force_guaranteed fixture：1A 帶 guaranteed 且 hasGuaranteed=true', () => {
  const { cells, hasGuaranteed } = parseRollTable(document);
  assert.equal(hasGuaranteed, true);
  const c = cells.get('1A');
  assert.ok(c.guaranteed, '1A 應有 guaranteed');
  assert.ok(c.guaranteed.name.length > 0);
  assert.equal(c.guaranteed.name, '開花爺爺');
});

test('保證格解析換軌落點 to（1A 保證抽後落 11B）', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('1A');
  assert.equal(c.guaranteed.to, '11B');
});

test('RG 格解析為 dupeGuaranteed（撞名起手保證）', () => {
  const dupePage = parseHTML(
    readFileSync(new URL('./fixtures/dupe-forced11-banner.html', import.meta.url), 'utf8')
  ).document;
  const { cells } = parseRollTable(dupePage);
  const c = cells.get('59A');
  assert.equal(c.guaranteed.name, '伊達政宗');
  assert.equal(c.guaranteed.to, '69B');
  assert.equal(c.dupeGuaranteed.name, '真田幸村');
  assert.equal(c.dupeGuaranteed.to, '70A');
  // 無撞名點的位置沒有 dupeGuaranteed
  assert.equal(cells.get('60A').dupeGuaranteed, undefined);
});

test('僅有 RG 格（無 G 格）時 hasGuaranteed 也為 true', () => {
  const minimal = parseHTML(
    '<table><tr><th>No.</th><th>Result</th><th>Guaranteed</th><th>Alt. No.</th></tr>' +
      '<tr><td><td class="cat pick rare" onclick="pick(\'1A\')"><span><a>貓</a></span></td>' +
      '<td class="cat pick uber" onclick="pick(\'1ARG\')"><span><a>保證貓</a></span> -&gt; 12B</td></tr></table>'
  ).document;
  const { hasGuaranteed, cells } = parseRollTable(minimal);
  assert.equal(cells.get('1A').dupeGuaranteed.name, '保證貓');
  assert.equal(hasGuaranteed, true);
});

test('未強制保證的 fixture 無 guaranteed', () => {
  const plain = parseHTML(
    readFileSync(new URL('./fixtures/gu-banner.html', import.meta.url), 'utf8')
  ).document;
  const { cells } = parseRollTable(plain);
  assert.equal(cells.get('1A').guaranteed, undefined);
});
