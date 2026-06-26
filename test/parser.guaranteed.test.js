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

test('未強制保證的 fixture 無 guaranteed', () => {
  const plain = parseHTML(
    readFileSync(new URL('./fixtures/gu-banner.html', import.meta.url), 'utf8')
  ).document;
  const { cells } = parseRollTable(plain);
  assert.equal(cells.get('1A').guaranteed, undefined);
});
