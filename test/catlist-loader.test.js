import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { loadCatList } from '../extension/lib/catlist-loader.js';

// 極簡 /cats 片段：一組 Uber、一隻貓（結構同 fixture，夠 parseCatList 解析）
const HTML = `<h3>Uber Rare Cat (1)</h3><div class="cats_by_rarity">
  <a href="//bc.godfat.org/cats/524" title="*貓X">貓X</a></div>`;

function makeStorage(init = {}) {
  const store = new Map(Object.entries(init));
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}
const deps = (storage, fetchFn) => ({
  storage,
  fetchFn,
  parseDoc: (html) => parseHTML(html).document,
  today: '2026-07-09',
});

test('當日快取直接用、不 fetch', async () => {
  const cached = JSON.stringify({ date: '2026-07-09', names: { 貓Y: ['uber', 9] }, forms: { 9: ['貓Y'] } });
  const storage = makeStorage({ 'bcsp:cats2:tw': cached });
  const out = await loadCatList('tw', deps(storage, async () => { throw new Error('不應呼叫'); }));
  assert.deepEqual(out.catMap.get('貓Y'), { rarity: 'uber', id: 9 });
  assert.deepEqual(out.formsById.get(9), ['貓Y']);
});

test('過期快取 → 重抓並存回 v2 鍵、清 v1 孤兒', async () => {
  const cached = JSON.stringify({ date: '2026-07-08', names: { 貓Y: ['uber', 9] }, forms: {} });
  const storage = makeStorage({ 'bcsp:cats2:tw': cached, 'bcsp:cats:tw': '{}' });
  const out = await loadCatList('tw', deps(storage, async () => ({ ok: true, text: async () => HTML })));
  assert.deepEqual(out.catMap.get('貓X'), { rarity: 'uber', id: 524 });
  assert.deepEqual(out.formsById.get(524), ['貓X']);
  assert.ok(storage.store.get('bcsp:cats2:tw').includes('2026-07-09'));
  assert.ok(!storage.store.has('bcsp:cats:tw')); // v1 孤兒清除
});

test('抓取失敗 → 過期快取頂著；無快取 → null', async () => {
  const boom = async () => { throw new Error('offline'); };
  const cached = JSON.stringify({ date: '2026-07-01', names: { 貓Y: ['uber', 9] }, forms: {} });
  const out = await loadCatList('tw', deps(makeStorage({ 'bcsp:cats2:tw': cached }), boom));
  assert.equal(out.catMap.get('貓Y').id, 9);
  assert.equal(await loadCatList('tw', deps(makeStorage(), boom)), null);
});

test('解析不到（結構變動）→ 過期快取頂著', async () => {
  const cached = JSON.stringify({ date: '2026-07-01', names: { 貓Y: ['uber', 9] }, forms: {} });
  const empty = async () => ({ ok: true, text: async () => '<p>改版了</p>' });
  const out = await loadCatList('tw', deps(makeStorage({ 'bcsp:cats2:tw': cached }), empty));
  assert.equal(out.catMap.get('貓Y').id, 9);
});
