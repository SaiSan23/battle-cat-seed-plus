import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import {
  loadOwned, saveOwned, parseOwnedFromCatsDoc, extractOCode, fetchOCode,
} from '../extension/lib/owned.js';

// fixture: bc.godfat.org/cats?lang=tw&o=4ZIEPP2m（2026-07-09 抓取，貓 1/2/44 已勾）
const ownedDoc = parseHTML(readFileSync(new URL('./fixtures/cats-tw-owned.html', import.meta.url), 'utf8')).document;
const plainDoc = parseHTML(readFileSync(new URL('./fixtures/cats-tw.html', import.meta.url), 'utf8')).document;

test('parseOwnedFromCatsDoc：解析 checked 的貓 id、升冪；無 o 頁回空陣列', () => {
  assert.deepEqual(parseOwnedFromCatsDoc(ownedDoc), [1, 2, 44]);
  assert.deepEqual(parseOwnedFromCatsDoc(plainDoc), []);
});

test('extractOCode：網址/裸短碼/垃圾輸入', () => {
  assert.equal(extractOCode('https://bc.godfat.org/cats?lang=tw&o=4ZIEPP2m#x'), '4ZIEPP2m');
  assert.equal(extractOCode('https://bc.godfat.org/?seed=1&o=abc&count=100'), 'abc');
  assert.equal(extractOCode('  4ZIEPP2m  '), '4ZIEPP2m');
  assert.equal(extractOCode('https://bc.godfat.org/?seed=1'), null); // 無 o
  assert.equal(extractOCode(''), null);
  assert.equal(extractOCode('https://bc.godfat.org/?o=%zz'), null); // 壞 URL 編碼 → null 不拋錯
});

test('fetchOCode：從轉址後的 res.url 取回新短碼；失敗回 null', async () => {
  const fake = async () => ({ url: 'https://bc.godfat.org/cats?lang=tw&o=NEW42' });
  assert.equal(await fetchOCode([1, 2], 'tw', fake), 'NEW42');
  const noO = async () => ({ url: 'https://bc.godfat.org/cats?lang=tw' });
  assert.equal(await fetchOCode([], 'tw', noO), null);
  const boom = async () => { throw new Error('offline'); };
  assert.equal(await fetchOCode([1], 'tw', boom), null);
});

test('loadOwned/saveOwned：往返一致、無資料/壞值回空清單', async () => {
  const store = new Map();
  globalThis.localStorage = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    assert.deepEqual(loadOwned(), { ids: new Set(), oCode: null, oDirty: false, updated: null });
    assert.equal(saveOwned({ ids: new Set([44, 1]), oCode: 'abc', oDirty: true }), true);
    const back = loadOwned();
    assert.deepEqual([...back.ids], [1, 44]); // 存檔升冪
    assert.equal(back.oCode, 'abc');
    assert.equal(back.oDirty, true);
    assert.equal(back.updated, new Date().toLocaleDateString('sv')); // 每次存檔蓋當日
    store.set('bcsp:owned', '{broken');
    assert.deepEqual(loadOwned().ids, new Set()); // 壞值 → 空
  } finally {
    delete globalThis.localStorage;
  }
});
