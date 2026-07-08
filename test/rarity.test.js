import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveRarity, actualRarity } from '../extension/lib/rarity.js';

test('祭典卡池：(祭) 格算該稀有度', () => {
  for (const fest of ['超級祭', '特級祭', '超極祭', '超國王祭', '女王祭']) {
    assert.equal(effectiveRarity('supa_fest', fest), 'supa');
    assert.equal(effectiveRarity('uber_fest', fest), 'uber');
  }
});

test('非祭典卡池：(祭) 格降級（祭激→稀有、祭超激→激稀有）', () => {
  assert.equal(effectiveRarity('supa_fest', '特麗希'), 'rare');
  assert.equal(effectiveRarity('uber_fest', '古代勇者'), 'supa');
});

test('一般稀有度不受祭典判定影響', () => {
  for (const short of ['特麗希', '特級祭']) {
    assert.equal(effectiveRarity('rare', short), 'rare');
    assert.equal(effectiveRarity('supa', short), 'supa');
    assert.equal(effectiveRarity('uber', short), 'uber');
    assert.equal(effectiveRarity('exclusive', short), 'exclusive');
    assert.equal(effectiveRarity('legend', short), 'legend');
  }
});

test('票池（白金/黑金）：必超激、優先於祭典降級；exclusive/legend 不變', () => {
  for (const ticket of ['白金', '黑金']) {
    assert.equal(effectiveRarity('rare', ticket), 'uber');
    assert.equal(effectiveRarity('supa', ticket), 'uber');
    assert.equal(effectiveRarity('supa_fest', ticket), 'uber');
    assert.equal(effectiveRarity('uber_fest', ticket), 'uber'); // 若先套祭典降級會錯成 supa
    assert.equal(effectiveRarity('uber', ticket), 'uber');
    assert.equal(effectiveRarity('exclusive', ticket), 'exclusive');
    assert.equal(effectiveRarity('legend', ticket), 'legend');
  }
});

// ── actualRarity：/cats 對照表為準，查無退回名單法 ──
const CATS = new Map([
  ['貓咪格鬥家', { rarity: 'rare', id: 524 }],
  ['衝浪貓', { rarity: 'supa', id: 200 }],
  ['南瓜索多姆', { rarity: 'uber', id: 773 }],
  ['透明貓', { rarity: 'special', id: 864 }], // 非轉蛋稀有度 → 不採信
]);

test('actualRarity：對照表命中即為準，class 與卡池名不影響', () => {
  // 超國王祭（rare=6770）：supa_fest 帶前段實際是稀有——名單法會錯成激稀有
  assert.equal(actualRarity('貓咪格鬥家', 'supa_fest', '超國王祭', CATS), 'rare');
  // 限定池（祭典機率 6470）：supa_fest 實際是激稀有——名單法會錯降成稀有
  assert.equal(actualRarity('衝浪貓', 'supa_fest', '伊邪那岐', CATS), 'supa');
  assert.equal(actualRarity('南瓜索多姆', 'uber_fest', '超國王祭', CATS), 'uber');
});

test('actualRarity：未來超激佔位名「(id?)」視為超激', () => {
  assert.equal(actualRarity('(861?)', 'uber', '超級祭', null), 'uber');
  assert.equal(actualRarity('(861?)', 'uber_fest', '特麗希', new Map()), 'uber');
});

test('actualRarity：查無對照（或非轉蛋稀有度）退回名單法', () => {
  assert.equal(actualRarity('未知貓', 'supa_fest', '特麗希', CATS), 'rare'); // 非祭典降級
  assert.equal(actualRarity('未知貓', 'supa_fest', '超級祭', CATS), 'supa');
  assert.equal(actualRarity('透明貓', 'rare', '特麗希', CATS), 'rare'); // special 不採信 → fallback
  assert.equal(actualRarity('未知貓', 'rare', '白金', null), 'uber'); // 無表 → 票池規則仍在
});
