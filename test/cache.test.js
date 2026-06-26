import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, serializeParsed, deserializeParsed } from '../extension/lib/cache.js';

test('cacheKey 由五條件組成、相同輸入相同鍵', () => {
  const a = cacheKey({ seed: 1, event: 'e1', count: 100, force: '11', last: 262 });
  const b = cacheKey({ seed: 1, event: 'e1', count: 100, force: '11', last: 262 });
  assert.equal(a, b);
  assert.ok(a.includes('1|e1|100|11|262'));
});

test('cacheKey 條件不同→鍵不同（含 last）', () => {
  const base = { seed: 1, event: 'e1', count: 100, force: '', last: 1 };
  assert.notEqual(cacheKey(base), cacheKey({ ...base, count: 200 }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, force: '11' }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, seed: 2 }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, last: 2 }));
});

test('serializeParsed / deserializeParsed Map 往返一致', () => {
  const cell = { pos: '1A', track: 'A', n: 1, rarity: 'supa', name: '貓', isNext: false };
  const parsed = { hasGuaranteed: true, cells: new Map([['1A', cell]]) };
  const round = deserializeParsed(JSON.parse(JSON.stringify(serializeParsed(parsed))));
  assert.equal(round.hasGuaranteed, true);
  assert.ok(round.cells instanceof Map);
  assert.deepEqual(round.cells.get('1A'), cell);
});
