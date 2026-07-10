import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventUrl, buildCatsUrl, buildOwnedSyncUrl, buildCatUrl, parseSeedParamsFromUrl } from '../extension/lib/godfat.js';

test('buildEventUrl 組出完整網址且省略空值', () => {
  const url = buildEventUrl({ seed: 2268003930, event: '2026-04-24_1047', count: 50, lang: 'tw' });
  assert.equal(
    url,
    'https://bc.godfat.org/?seed=2268003930&event=2026-04-24_1047&lang=tw&count=50'
  );
});

test('buildEventUrl 帶 last 時包含 last', () => {
  const url = buildEventUrl({ seed: 1, event: 'e', count: 10, lang: 'tw', last: 262 });
  assert.ok(url.includes('last=262'));
});

test('buildEventUrl 帶 forceGuaranteed 時加上 force_guaranteed 參數', () => {
  const url = buildEventUrl({ seed: 1, event: 'e', count: 10, lang: 'tw', forceGuaranteed: 11 });
  assert.ok(url.includes('force_guaranteed=11'));
});

test('buildEventUrl 無 forceGuaranteed 時不含該參數', () => {
  const url = buildEventUrl({ seed: 1, event: 'e', count: 10, lang: 'tw' });
  assert.ok(!url.includes('force_guaranteed'));
});

test('parseSeedParamsFromUrl 解析 godfat 種子頁', () => {
  const p = parseSeedParamsFromUrl(
    'https://bc.godfat.org/?seed=2268003930&last=262&event=2026-04-24_1047&lang=tw&count=300'
  );
  assert.deepEqual(p, { seed: 2268003930, event: '2026-04-24_1047', count: 300, lang: 'tw', last: 262 });
});

test('parseSeedParamsFromUrl 對非 godfat 或無 seed 回傳 null', () => {
  assert.equal(parseSeedParamsFromUrl('https://example.com/?seed=1'), null);
  assert.equal(parseSeedParamsFromUrl('https://bc.godfat.org/cats/1'), null);
});

test('parseSeedParamsFromUrl 吸收 force_guaranteed（0 視同未帶）', () => {
  const p = parseSeedParamsFromUrl('https://bc.godfat.org/?seed=1&event=e&force_guaranteed=11');
  assert.equal(p.forceGuaranteed, 11);
  const zero = parseSeedParamsFromUrl('https://bc.godfat.org/?seed=1&force_guaranteed=0');
  assert.ok(!('forceGuaranteed' in zero));
});

test('buildCatsUrl 組出 /cats 清單頁網址', () => {
  assert.equal(buildCatsUrl('tw'), 'https://bc.godfat.org/cats?lang=tw');
  assert.equal(buildCatsUrl(), 'https://bc.godfat.org/cats?lang=tw');
});

test('buildEventUrl 帶 o 參數（擁有清單短碼）', () => {
  assert.ok(buildEventUrl({ seed: 1, event: 'e', o: '4ZIEPP2m' }).endsWith('&o=4ZIEPP2m'));
  assert.ok(!buildEventUrl({ seed: 1, event: 'e' }).includes('o='));
});

test('buildCatsUrl 可附 o；buildOwnedSyncUrl 排序去重；buildCatUrl 個別貓頁', () => {
  assert.equal(buildCatsUrl('tw', 'abc'), 'https://bc.godfat.org/cats?lang=tw&o=abc');
  assert.equal(buildCatsUrl('tw'), 'https://bc.godfat.org/cats?lang=tw'); // 原行為不變
  assert.equal(buildOwnedSyncUrl([44, 1, 2, 1], 'tw'), 'https://bc.godfat.org/cats?lang=tw&t=1&t=2&t=44');
  assert.equal(buildCatUrl(524, 'tw'), 'https://bc.godfat.org/cats/524?lang=tw');
});

test('parseSeedParamsFromUrl 帶回 o', () => {
  assert.equal(parseSeedParamsFromUrl('https://bc.godfat.org/?seed=1&o=abc').o, 'abc');
  assert.ok(!('o' in parseSeedParamsFromUrl('https://bc.godfat.org/?seed=1')));
});
