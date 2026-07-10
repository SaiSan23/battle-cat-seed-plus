import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import {
  parseCatList, serializeCatList, deserializeCatList, catsById,
  parseCatForms, serializeForms, deserializeForms,
} from '../extension/lib/catlist.js';

// fixture: bc.godfat.org/cats?lang=tw（2026-07-08 抓取，六個 .cats_by_rarity 分組）
const { document } = parseHTML(readFileSync(new URL('./fixtures/cats-tw.html', import.meta.url), 'utf8'));
const map = parseCatList(document);

test('parseCatList：六組全解析、名字數量合理', () => {
  // 793 隻貓 × 多型態名；fixture 實測 1984 個名字，設下限防解析退化
  assert.ok(map.size > 1500, `名字數 ${map.size} 應 > 1500`);
});

test('parseCatList：實際稀有度正確（對照 godfat /cats 分組）', () => {
  assert.deepEqual(map.get('貓咪格鬥家'), { rarity: 'rare', id: 524 }); // 超國王祭 supa_fest 帶內的稀有貓
  assert.equal(map.get('衝浪貓')?.rarity, 'supa');
  assert.equal(map.get('南瓜索多姆')?.rarity, 'uber');
  assert.equal(map.get('月影少年薰')?.rarity, 'legend');
  assert.equal(map.get('貓咪')?.rarity, 'normal');
});

test('parseCatList：title 內的各型態名皆索引（格子可能顯示任一型態）', () => {
  // 貓咪(id 1) 的三型態：貓咪 / 健美貓 / 摩西根貓（皆列於 title 第一行）
  for (const form of ['貓咪', '健美貓', '摩西根貓']) {
    assert.deepEqual(map.get(form), { rarity: 'normal', id: 1 }, form);
  }
});

test('serialize/deserialize 往返等價', () => {
  const back = deserializeCatList(serializeCatList(map));
  assert.equal(back.size, map.size);
  assert.deepEqual(back.get('貓咪格鬥家'), map.get('貓咪格鬥家'));
});

test('catsById：id 反向索引、代表名為首見名（目前顯示型態）', () => {
  const byId = catsById(map);
  assert.equal(byId.size, 793); // /cats 全部貓數
  assert.deepEqual(byId.get(1), { name: '貓咪', rarity: 'normal' });
  assert.equal(byId.get(524).rarity, 'rare');
});

test('parseCatForms：有序型態名（title 第一行序＝階段序＝圖檔序）', () => {
  const forms = parseCatForms(document);
  assert.deepEqual(forms.get(1), ['貓咪', '健美貓', '摩西根貓']);
  assert.deepEqual(forms.get(817), ['817-1']); // 佔位名貓單元素
  assert.equal(forms.get(449).length, 3); // 宮本武藏三階（與圖檔 0–2 對齊）
  assert.equal(forms.size, 793);
});

test('serializeForms/deserializeForms 往返等價（鍵回 number）', () => {
  const forms = parseCatForms(document);
  const back = deserializeForms(JSON.parse(JSON.stringify(serializeForms(forms))));
  assert.equal(back.size, forms.size);
  assert.deepEqual(back.get(1), forms.get(1));
});
