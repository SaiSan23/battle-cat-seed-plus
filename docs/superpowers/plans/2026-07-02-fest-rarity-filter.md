# Find 祭典限定稀有過濾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 稀有度過濾改用有效稀有度:(祭) 格在祭典卡池算該稀有、非祭典降級(祭激→稀有、祭超激→激稀有),票池一律超激。

**Architecture:** 新增純函式 `extension/lib/rarity.js`(`effectiveRarity(rarity, bannerShort)`);view 的 `effRarity` 改為薄包裝、`RARITY_GROUP` 簡化。只動過濾邏輯,不動貓名搜尋/色條/圖例/路線。

**Tech Stack:** 原生 ES module、`node:test`。

## Global Constraints

- 祭典簡稱集合:`超級祭`/`特級祭`/`超極祭`/`超國王祭`/`女王祭`;票池:`白金`/`黑金`。
- 票池規則優先於祭典降級:`rare`/`supa`/`supa_fest`/`uber_fest` → `uber`;`exclusive`/`legend` 不變。
- 非祭典降級:`supa_fest` → `rare`、`uber_fest` → `supa`。
- 不加「(祭)限定」下拉選項;矩陣色條沿用 `origRarity`;既有 66 測試不修改且全綠。

---

### Task 1: `lib/rarity.js` 純函式

**Files:**
- Create: `extension/lib/rarity.js`
- Test: `test/rarity.test.js`

**Interfaces:**
- Produces: `export function effectiveRarity(rarity, bannerShort)`;`export const FEST_SHORTS`、`export const TICKET_SHORTS`(Set)。

- [ ] **Step 1: 寫失敗測試** `test/rarity.test.js`

```js
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
```

- [ ] **Step 2: 跑測試確認失敗** — `npm test`,預期 rarity 測試 FAIL(模組不存在)。

- [ ] **Step 3: 實作** `extension/lib/rarity.js`

```js
// 有效稀有度（純函式，供稀有度過濾用）：
// (祭) 格只在祭典卡池才是該稀有度，非祭典降一級；票池（白金/黑金）抽出必為超激以上。
export const FEST_SHORTS = new Set(['超級祭', '特級祭', '超極祭', '超國王祭', '女王祭']);
export const TICKET_SHORTS = new Set(['白金', '黑金']);

export function effectiveRarity(rarity, bannerShort) {
  if (TICKET_SHORTS.has(bannerShort)) {
    // 票抽必超激（黑金另含傳說）；exclusive/legend 維持原樣。優先於祭典降級。
    return rarity === 'exclusive' || rarity === 'legend' ? rarity : 'uber';
  }
  const fest = FEST_SHORTS.has(bannerShort);
  if (rarity === 'supa_fest') return fest ? 'supa' : 'rare';
  if (rarity === 'uber_fest') return fest ? 'uber' : 'supa';
  return rarity;
}
```

- [ ] **Step 4: 跑測試** — `npm test`,預期全綠(66 + 4)。

- [ ] **Step 5: Commit** — `git add extension/lib/rarity.js test/rarity.test.js && git commit -m "feat(rarity): 有效稀有度純函式（祭典/票池規則）"`

---

### Task 2: view 接線 + README

**Files:**
- Modify: `extension/view/view.js`(import、`effRarity`、`RARITY_GROUP`、移除 `ALWAYS_SHORTS`)、`README.md`

**Interfaces:**
- Consumes: `effectiveRarity`(Task 1)。

- [ ] **Step 1: import** — `view.js` 檔頭 import 區加:

```js
import { effectiveRarity } from '../lib/rarity.js';
```

- [ ] **Step 2: 替換 effRarity 與 ALWAYS_SHORTS** — 把:

```js
// 票抽卡池：只能用特殊票抽，貓咪皆為超激稀有以上（godfat 為對齊種子位置仍標天然稀有度）
const ALWAYS_SHORTS = new Set(['白金', '黑金']);
// 白金/黑金 的「稀有/激稀有」格一律視為超激（傳說/Exclusive 等高階維持原樣），供搜尋與顯示用
function effRarity(td) {
  const r = td.getAttribute('data-r');
  const short = lastVisibleShorts[Number(td.getAttribute('data-bi'))];
  if (ALWAYS_SHORTS.has(short) && (r === 'rare' || r === 'supa' || r === 'supa_fest')) return 'uber';
  return r;
}
```

改為:

```js
// 有效稀有度（過濾用）：(祭) 格依卡池是否祭典換算、票池必超激——規則見 lib/rarity.js
function effRarity(td) {
  const short = lastVisibleShorts[Number(td.getAttribute('data-bi'))];
  return effectiveRarity(td.getAttribute('data-r'), short);
}
```

- [ ] **Step 3: 簡化 RARITY_GROUP** — 有效稀有度已是基本值:

```js
const RARITY_GROUP = {
  rare: ['rare'],
  supa: ['supa'],
  uber: ['uber', 'exclusive', 'legend'], // 超激稀有以上：含 exclusive 與 傳說(legend)
  exclusive: ['exclusive'],
  legend: ['legend'],
};
```

- [ ] **Step 4: README** — 「重要實作細節」稀有度 class 一條之後補:

```markdown
- **稀有度過濾用「有效稀有度」**：`(祭)` 格只在祭典卡池（超級祭/特級祭/超極祭/超國王祭/女王祭）才算該稀有度，非祭典降一級（祭激→稀有、祭超激→激稀有）；白金/黑金票池一律視為超激（exclusive/傳說除外）。貓名搜尋與格子底色不受影響。
```

- [ ] **Step 5: 驗證** — `npm test` 全綠;`node --check extension/view/view.js`;瀏覽器 fetch-stub 實測:
  - 非祭典(古代勇者):搜「超激稀有」不命中 5 個 `uber_fest` 格、搜「激稀有」命中它們
  - 同 fixture 改名「特級貓咪祭」:搜「超激稀有」命中該 5 格
  - 白金:搜「超激稀有」命中 `uber_fest` 格

- [ ] **Step 6: Commit** — `git add extension/view/view.js README.md && git commit -m "feat(view): 稀有度過濾改用有效稀有度（祭典限定降級）"`

---

## Self-Review

- **Spec coverage:** 規則表(Task 1 純函式+測試矩陣)、票池優先(Task 1 測試明確含 `uber_fest`→`uber`)、view 接線與 RARITY_GROUP 簡化(Task 2)、README(Task 2)、瀏覽器驗證三情境(Task 2 Step 5)——皆有對應。
- **Placeholder scan:** 無 TBD;每步含完整程式碼。
- **Type consistency:** `effectiveRarity(rarity, bannerShort)`、`FEST_SHORTS`/`TICKET_SHORTS` 命名跨任務一致。
