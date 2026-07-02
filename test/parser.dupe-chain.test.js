import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';

// dupe-chain-banner.html：seed 3259876338、event 2026-06-26_1053（史塔爾）、count 140
// 連鎖重複稀有：132A=占卜貓、133A 天然=占卜貓（重複）→ 重抽 神槍手貓、落點「134BR」（帶 R 字尾）
// 134BR 再重複 → 重抽 超能力貓、落點 136A（原站顯示「<- 136A 超能力貓」）
const { document } = parseHTML(
  readFileSync(new URL('./fixtures/dupe-chain-banner.html', import.meta.url), 'utf8')
);

test('133A 天然名為占卜貓、dupe 落點保留 R 字尾（134BR）', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('133A');
  assert.ok(c, '應有 133A');
  assert.equal(c.name, '占卜貓'); // 天然（與 132A 重複）
  assert.ok(c.dupe, '133A 應有 dupe');
  assert.equal(c.dupe.name, '神槍手貓');
  assert.equal(c.dupe.to, '134BR'); // 落點帶 R：抵達 134B 時仍處於重複狀態
});

test('134B 天然名為神槍手貓、dupe 落點 136A（箭頭在名前的 <- 形式）', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('134B');
  assert.equal(c.name, '神槍手貓');
  assert.ok(c.dupe, '134B 應有 dupe（連鎖重抽格）');
  assert.equal(c.dupe.name, '超能力貓');
  assert.equal(c.dupe.to, '136A');
});

test('鄰近非重複位置無 dupe', () => {
  const { cells } = parseRollTable(document);
  assert.equal(cells.get('133B').dupe, undefined);
  assert.equal(cells.get('134A').dupe, undefined);
});
