import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';

// dupe-banner.html：seed 4066970932、event 2026-06-22_1028、count 50
// 含自然重複稀有：25A 天然=鬥士貓（與 24A 同），真正結果=重抽「貓咪探測器」→ 換軌 26B
const { document } = parseHTML(
  readFileSync(new URL('./fixtures/dupe-banner.html', import.meta.url), 'utf8')
);

test('parseRollTable 解析重複稀有：25A 帶 dupe（重抽結果＋換軌落點）', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('25A');
  assert.ok(c, '應有 25A');
  assert.equal(c.name, '鬥士貓'); // 天然（會與 24A 重複）
  assert.ok(c.dupe, '25A 應有 dupe（重抽）資訊');
  assert.equal(c.dupe.name, '貓咪探測器'); // 真正拿到的（重抽）
  assert.equal(c.dupe.to, '26B'); // 換軌落點
});

test('parseRollTable 非重複位置無 dupe', () => {
  const { cells } = parseRollTable(document);
  assert.equal(cells.get('24A').dupe, undefined);
});

test('parseRollTable 解析 31A 重複稀有 → 32B', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('31A');
  assert.ok(c.dupe);
  assert.equal(c.dupe.name, '海賊貓');
  assert.equal(c.dupe.to, '32B');
});
