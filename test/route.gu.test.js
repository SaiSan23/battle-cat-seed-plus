import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';
import { mergeBanners } from '../extension/lib/merge.js';
import { simulateGuaranteed } from '../extension/lib/route.js';

const { document } = parseHTML(readFileSync(new URL('./fixtures/dupe-forced11-banner.html', import.meta.url), 'utf8'));
const parsed = parseRollTable(document);
const merged = mergeBanners([{ banner: { id: 'x' }, parsed }]);
const SHORT = '戰國武將'; // 非祭、非票池

test('simulateGuaranteed：乾淨起手（59A → 伊達政宗 → 69B）', () => {
  const g = simulateGuaranteed(merged, SHORT, 59, 'A', null, 'x', 11);
  assert.equal(g.gotName, '伊達政宗');
  assert.deepEqual(g.landing, { n: 69, track: 'B' });
  assert.equal(g.steps.length, 10);
  assert.equal(g.uncertain, false);
});

test('simulateGuaranteed：撞名起手（59A 持鬥士貓 → 真田幸村 → 70A）', () => {
  const g = simulateGuaranteed(merged, SHORT, 59, 'A', '鬥士貓', 'x', 11);
  assert.equal(g.gotName, '真田幸村');
  assert.deepEqual(g.landing, { n: 70, track: 'A' });
  assert.equal(g.steps[0].gotName, '魔劍士貓'); // 第一抽=重抽
});

test('simulateGuaranteed：票池回 null；尾端無 G 資料回 null', () => {
  assert.equal(simulateGuaranteed(merged, '白金', 59, 'A', null, 'x', 11), null);
  assert.equal(simulateGuaranteed(merged, SHORT, 299, 'A', null, 'x', 11), null);
});

test('資料驅動：全部 G/RG 格落點與箭頭一致、同落點保證名一致', () => {
  const names = new Map();
  let g = 0, rg = 0;
  for (const [pos, c] of parsed.cells) {
    for (const [variant, last] of [['guaranteed', null], ['dupeGuaranteed', c.name]]) {
      const cell = c[variant];
      if (!cell || !cell.to) continue;
      const sim = simulateGuaranteed(merged, SHORT, c.n, c.track, last, 'x', 11);
      if (!sim) continue; // 尾端中間格不足
      const want = cell.to.match(/^(\d+)([AB])/);
      assert.equal(String(sim.landing.n), want[1], `${pos} ${variant} 落點位置`);
      assert.equal(sim.landing.track, want[2], `${pos} ${variant} 落點軌`);
      assert.equal(sim.uncertain, false, `${pos} ${variant} 不應 uncertain`);
      const key = `${sim.landing.n}${sim.landing.track}`;
      if (names.has(key)) assert.equal(names.get(key), cell.name, `${pos} 同落點保證名`);
      names.set(key, cell.name);
      if (variant === 'guaranteed') g++; else rg++;
    }
  }
  assert.ok(g >= 500 && rg >= 10, `覆蓋數不足 G=${g} RG=${rg}`);
});
