import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventUrl, parseSeedParamsFromUrl } from '../extension/lib/godfat.js';

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
