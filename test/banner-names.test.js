import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortBannerName, bannerDateRange } from '../extension/lib/banner-names.js';

test('shortBannerName 常駐轉蛋', () => {
  assert.equal(shortBannerName('必出超激稀有角色的白金轉蛋！快來獲得心儀的貓咪吧！'), '白金');
  assert.equal(shortBannerName('必定可以獲得1隻超激稀有等級以上角色的「傳說轉蛋」！'), '黑金');
});

test('shortBannerName 合作／季節限定（EVA、白色情人節）', () => {
  assert.equal(
    shortBannerName('限定傳說稀有角色登場！新世紀福音戰士合作轉蛋2nd舉辦中！★點圖確認詳細吧!!'),
    'EVA'
  );
  assert.equal(
    shortBannerName('白色情人節期間限定的人氣轉蛋登場！★點圖確認詳細吧!!'),
    '白色情人節'
  );
});

test('shortBannerName 三種祭典各自正確', () => {
  assert.equal(shortBannerName('珍貴又夢幻的角色們在這！★超激稀有出現率上升的「特級貓咪祭」進行中!!'), '特級祭');
  assert.equal(shortBannerName('超激稀有角色齊聚一堂!!超激角色出現率上升的「超級貓咪祭」進行中!!'), '超級祭');
  assert.equal(shortBannerName('限定傳說稀有角色參戰！★超激稀有出現率超上升的「超極貓咪祭」進行中!!'), '超極祭');
});

test('shortBannerName 系列（天神兩種文案、小精靈、戰國武將）', () => {
  assert.equal(shortBannerName('貓咪世界的偉大神們，都齊聚在此啦！★點圖確認詳細吧!!'), '天神');
  assert.equal(shortBannerName('貓咪世界的眾神，集結於此！★11連轉超激確定活動中！'), '天神');
  assert.equal(shortBannerName('進化後會有召喚能力的「樹精靈小魔麗」登場！★點圖確認詳細吧!!'), '小精靈');
  assert.equal(shortBannerName('「風魔小太郎」登場！對上黑色敵人超有效！擁有強力效果的戰國武將們！'), '戰國武將');
  assert.equal(shortBannerName('穿越電子空間來到這裡的美少女們一同登場！★點圖確認詳細吧!!'), '電腦少女');
  assert.equal(shortBannerName('能以優惠價取得角色的好機會！★點圖確認詳細吧!!'), '過季轉蛋');
});

test('shortBannerName 合作（鬼滅/Fate/小圓/Crash Fever/梅露可/曼波魚/初音）', () => {
  assert.equal(shortBannerName('劇場版「鬼滅之刃」合作轉蛋！★11連轉超激確定活動中！'), '鬼滅之刃');
  assert.equal(shortBannerName('劇場版「Fate/stay night [Heaven\'s Feel]」合作轉蛋★'), 'Fate');
  assert.equal(shortBannerName('劇場版「魔法少女☆小圓」合作轉蛋！★11連轉超激確定活動中！'), '小圓');
  assert.equal(shortBannerName('【限時開放】『Crash Fever』合作轉蛋登場！'), 'Crash Fever');
  assert.equal(shortBannerName('梅露可物語合作限定轉蛋！★11連轉超激確定活動中！'), '梅露可物語');
  assert.equal(shortBannerName('『活下去！曼波魚！』合作轉蛋登場！'), '曼波魚');
});

test('shortBannerName 季節（白色情人節優先於情人節、萬聖/聖誕/復活/新年）', () => {
  assert.equal(shortBannerName('白色情人節期間限定的人氣轉蛋登場！'), '白色情人節');
  assert.equal(shortBannerName('情人節限定！可愛的巧克力貓咪登場！'), '情人節');
  assert.equal(shortBannerName('限時開放！快來獲得萬聖節變裝的可愛角色吧！'), '萬聖節');
  assert.equal(shortBannerName('冬季限定！快來獲得可愛的聖誕節貓咪吧！'), '聖誕節');
  assert.equal(shortBannerName('特製歡慶新年轉蛋來了！還有限時限定角色喔！'), '新年');
});

test('shortBannerName 破壞者（紅色/飄浮）', () => {
  assert.equal(shortBannerName('紅色破壞者轉蛋限定角色「貓飯拳派派」登場！'), '紅色破壞者');
  assert.equal(shortBannerName('專打飄浮敵人！以「閃電機兵飛雷」爲首的飄浮破壞者轉蛋！'), '飄浮破壞者');
});

test('shortBannerName 含日期前綴也能命中', () => {
  assert.equal(shortBannerName('2026-04-24 ~ 2030-01-01: 必出超激稀有角色的白金轉蛋！'), '白金');
});

test('shortBannerName fallback：去罐頭字', () => {
  assert.equal(shortBannerName('神秘新貓登場！★點圖確認詳細吧!!'), '神秘新貓登場');
});

test('shortBannerName fallback：超長截斷帶 …', () => {
  const out = shortBannerName('這是一個非常非常非常非常非常長的未知卡池名稱');
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 13);
});

test('bannerDateRange', () => {
  assert.equal(bannerDateRange('2026-06-19 ~ 2026-06-22: 異世界召喚'), '2026-06-19~2026-06-22');
  assert.equal(bannerDateRange('沒有日期的字串'), '');
});
