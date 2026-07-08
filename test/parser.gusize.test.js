import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable, guaranteedSize } from '../extension/lib/parser.js';

function parseFixture(name) {
  const html = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  return parseRollTable(parseHTML(html).document);
}

test('forced11 fixture 推導 GU 尺寸為 11', () => {
  const { cells } = parseFixture('gu-banner-forced11.html');
  assert.equal(guaranteedSize(cells), 11);
});

test('原生必中場次（未帶 force_guaranteed）保證格可解析、尺寸推導為 11', () => {
  const { cells, hasGuaranteed } = parseFixture('native-gu-banner.html');
  assert.equal(hasGuaranteed, true);
  const c = cells.get('1A');
  assert.equal(c.guaranteed.name, '溫泉天堂・浴場隊');
  assert.equal(c.guaranteed.to, '11B');
  assert.equal(guaranteedSize(cells), 11);
});

test('無保證格時尺寸為 null', () => {
  const { cells } = parseFixture('gu-banner.html');
  assert.equal(guaranteedSize(cells), null);
});

test('B 軌落點公式（to.n - n）：1B → 16A 推導為 15', () => {
  const minimal = parseHTML(
    '<table><tr><th>No.</th><th>Result</th><th>Guaranteed</th><th>Alt. No.</th></tr>' +
      '<tr><td><td class="cat pick rare" onclick="pick(\'1B\')"><span><a>貓</a></span></td>' +
      '<td class="cat pick uber" onclick="pick(\'1BG\')"><span><a>保證貓</a></span> -&gt; 16A</td></tr></table>'
  ).document;
  const { cells } = parseRollTable(minimal);
  assert.equal(guaranteedSize(cells), 15);
});

test('中途換軌造成的離群值以眾數排除', () => {
  const minimal = parseHTML(
    '<table><tr><th>No.</th><th>Result</th><th>Guaranteed</th><th>Alt. No.</th></tr>' +
      '<tr><td><td class="cat pick rare" onclick="pick(\'1A\')"><span><a>貓一</a></span></td>' +
      '<td class="cat pick uber" onclick="pick(\'1AG\')"><span><a>保一</a></span> -&gt; 11B</td></tr>' +
      '<tr><td><td class="cat pick rare" onclick="pick(\'2A\')"><span><a>貓二</a></span></td>' +
      '<td class="cat pick uber" onclick="pick(\'2AG\')"><span><a>保二</a></span> -&gt; 12B</td></tr>' +
      // 路徑上有重複稀有換軌 → 落點偏移的離群格
      '<tr><td><td class="cat pick rare" onclick="pick(\'3A\')"><span><a>貓三</a></span></td>' +
      '<td class="cat pick uber" onclick="pick(\'3AG\')"><span><a>保三</a></span> -&gt; 14B</td></tr></table>'
  ).document;
  const { cells } = parseRollTable(minimal);
  assert.equal(guaranteedSize(cells), 11);
});
