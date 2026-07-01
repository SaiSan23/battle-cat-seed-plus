import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBanners } from '../extension/lib/merge.js';

function cell(pos, name, rarity = 'rare') {
  const track = pos.endsWith('A') ? 'A' : 'B';
  return { pos, track, n: parseInt(pos, 10), rarity, name, isNext: false };
}

test('mergeBanners 對齊相同位置', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: false, cells: new Map([['1A', cell('1A', '貓甲')], ['2A', cell('2A', '貓乙')]]) } };
  const b = { banner: { id: 'B', name: 'B' }, parsed: { hasGuaranteed: false, cells: new Map([['1A', cell('1A', '貓丙')]]) } };
  const m = mergeBanners([a, b]);
  assert.deepEqual(m.positions.slice(0, 2), ['1A', '2A']);
  assert.equal(m.byPos.get('1A').get('A').name, '貓甲');
  assert.equal(m.byPos.get('1A').get('B').name, '貓丙');
  assert.equal(m.byPos.get('2A').has('B'), false);
});

test('mergeBanners 排序：先 A 軌後 B 軌、依抽數', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: false, cells: new Map([['2A', cell('2A', 'x')], ['1B', cell('1B', 'y')], ['1A', cell('1A', 'z')]]) } };
  const m = mergeBanners([a]);
  assert.deepEqual(m.positions, ['1A', '2A', '1B']);
});

test('mergeBanners 回傳 numbers（去重、升冪、涵蓋 A/B 抽數）', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: false, cells: new Map([['2A', cell('2A', 'x')], ['1B', cell('1B', 'y')], ['1A', cell('1A', 'z')]]) } };
  assert.deepEqual(mergeBanners([a]).numbers, [1, 2]);
});

test('mergeBanners anyGuaranteed', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: true, cells: new Map() } };
  assert.equal(mergeBanners([a]).anyGuaranteed, true);
});
