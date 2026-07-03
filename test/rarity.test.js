import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveRarity } from '../extension/lib/rarity.js';

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
