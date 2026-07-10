import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, serializeParsed, deserializeParsed } from '../extension/lib/cache.js';

test('cacheKey 由四條件組成、相同輸入相同鍵', () => {
  const a = cacheKey({ seed: 1, event: 'e1', force: '11', last: 262 });
  const b = cacheKey({ seed: 1, event: 'e1', force: '11', last: 262 });
  assert.equal(a, b);
  assert.ok(a.includes('1|e1|11|262'));
});

test('cacheKey 條件不同→鍵不同；count 不入鍵（一池一份、就大不就小）', () => {
  const base = { seed: 1, event: 'e1', force: '', last: 1 };
  assert.notEqual(cacheKey(base), cacheKey({ ...base, force: '11' }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, seed: 2 }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, last: 2 }));
  assert.equal(cacheKey({ ...base, count: 100 }), cacheKey({ ...base, count: 500 }));
});

test('serializeParsed / deserializeParsed Map 往返一致', () => {
  const cell = { pos: '1A', track: 'A', n: 1, rarity: 'supa', name: '貓', isNext: false };
  const parsed = { hasGuaranteed: true, cells: new Map([['1A', cell]]) };
  const round = deserializeParsed(JSON.parse(JSON.stringify(serializeParsed(parsed))));
  assert.equal(round.hasGuaranteed, true);
  assert.ok(round.cells instanceof Map);
  assert.deepEqual(round.cells.get('1A'), cell);
});

test('clearCache 清資料快取但保留使用者設定鍵', async () => {
  // 最小 localStorage mock（cache.js 以 typeof localStorage 探測）
  const store = new Map([
    ['bcsp:v4:1|e|100||', '{}'],
    ['bcsp:cats:tw', '{}'],
    ['bcsp:gu-force', '{"e":"11"}'],
    ['bcsp:route-popup-pos', '{"left":8,"top":8}'],
    ['bcsp:owned', '{"ids":[1]}'],
    ['bcsp:owned-form', '"2"'],
    ['unrelated', 'x'],
  ]);
  globalThis.localStorage = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    const { clearCache } = await import('../extension/lib/cache.js');
    assert.equal(clearCache(), true);
    assert.deepEqual([...store.keys()].sort(), ['bcsp:gu-force', 'bcsp:owned', 'bcsp:owned-form', 'bcsp:route-popup-pos', 'unrelated']);
  } finally {
    delete globalThis.localStorage;
  }
});

test('cacheGet/cacheSet 帶 count 往返；purgeOldCaches 只清舊版本鍵', async () => {
  const store = new Map([
    ['bcsp:v4:1|e|100||', '{}'], // 舊版孤兒
    ['bcsp:cats:tw', '{}'],
    ['bcsp:gu-force', '{}'],
  ]);
  globalThis.localStorage = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    // store() 於每次呼叫時讀 localStorage，直接複用同一模組實例即可
    const { cacheKey: key, cacheGet, cacheSet, purgeOldCaches } = await import('../extension/lib/cache.js');
    const parsed = { hasGuaranteed: false, cells: new Map() };
    const k = key({ seed: 1, event: 'e1', force: '', last: 1 });
    cacheSet(k, { name: '池', count: 250, parsed });
    const hit = cacheGet(k);
    assert.equal(hit.name, '池');
    assert.equal(hit.count, 250); // 就大不就小的判斷依據
    purgeOldCaches();
    assert.ok(!store.has('bcsp:v4:1|e|100||')); // 舊版清掉
    assert.ok(store.has(k)); // 現版保留
    assert.ok(store.has('bcsp:cats:tw') && store.has('bcsp:gu-force')); // 非版本鍵不動
  } finally {
    delete globalThis.localStorage;
  }
});
