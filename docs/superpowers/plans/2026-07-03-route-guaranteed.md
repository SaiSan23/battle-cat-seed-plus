# 確定11連(GU)納入路線規劃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 規劃器支援確定11/15/7連(乾淨與撞名起手)、重複觸發改用有效稀有度、逐卡池保證型式、↪/↩ 方向顯示。

**Architecture:** route.js 新增 `simulateGuaranteed`(逐抽模擬+半步位移,落點以 G/RG 箭頭為準)與 GU 轉移+第四 Pareto 軸 `gu`;parser 加 RG 格;view 逐卡池保證值(localStorage 持久化、全域=批次工具)、方向箭頭、方案表 GU 欄。

**Tech Stack:** 既有 stack。新 fixture `dupe-forced11-banner.html`(591 保證格已預先驗證)。

## Global Constraints

- 重複觸發條件 = `effectiveRarity(cell.rarity, bannerShort) === 'rare'`(涵蓋非祭池 supa_fest)。
- GU 落點以 G/RG 格箭頭為準(去 R 字尾);模擬僅供一致性檢查(不一致標 `uncertain`)。
- 保證 Uber 只可滿足 `kind==='cat'` 且 `name` 相符的目標;票池(白金/黑金)無 GU。
- 成本四軸 `(pulls, plat, legend, gu)`;tie-break 仍 switches;白金優先分組鍵含 gu。
- commit 訊息不加 Co-Authored-By trailer(CLAUDE.md)。

---

### Task 1: Phase 0 — 重複觸發用有效稀有度

**Files:** Modify `extension/lib/route.js`;Test `test/route.test.js`

**Interfaces:** Produces: `pullOutcome` 對非祭池 `supa_fest` 撞名也觸發換軌。

- [ ] **Step 1: 失敗測試**(加入 `test/route.test.js`)

```js
test('pullOutcome：非祭池 supa_fest 撞名也觸發重複（有效稀有度）', () => {
  const m = M({ X: [C('60B', 'Gun', 'supa_fest', { dupe: { name: 'Wheel', rarity: 'rare', to: '62A' } })] });
  const o = pullOutcome(m, '戰國武將', 60, 'B', 'Gun', 'X', false);
  assert.equal(o.switched, true);
  assert.equal(o.gotName, 'Wheel');
  assert.equal(o.nextN, 62); assert.equal(o.nextTrack, 'A');
  // 祭典池的 supa_fest 是激稀有 → 不觸發
  const o2 = pullOutcome(m, '特級祭', 60, 'B', 'Gun', 'X', false);
  assert.equal(o2.switched, false);
});
```

- [ ] **Step 2: 確認 FAIL** — `npm test`。
- [ ] **Step 3: 實作** — route.js 檔頭加 `import { effectiveRarity } from './rarity.js';`,觸發條件改:

```js
  const dupe = !isSpecial && (
    (effectiveRarity(cell.rarity, bannerShort) === 'rare' && lastName != null && cell.name === lastName) ||
    (isStart && !!cell.dupe)
  );
```

- [ ] **Step 4: 全綠後 Commit** — `git commit -m "fix(route): 重複觸發改用有效稀有度（非祭池 supa_fest 也觸發）"`

---

### Task 2: parser 解析 RG 格

**Files:** Modify `extension/lib/parser.js`、`test/fixtures/STRUCTURE.md`;Test `test/parser.guaranteed.test.js`

**Interfaces:** Produces: `cell.dupeGuaranteed = { rarity, name, to }`(撞名起手保證;`to` 可帶 R 字尾)。

- [ ] **Step 1: 失敗測試**(加入 `test/parser.guaranteed.test.js`,沿用該檔載入 fixture 的寫法,fixture 改用 `dupe-forced11-banner.html`)

```js
test('RG 格解析為 dupeGuaranteed（撞名起手保證）', () => {
  const { document } = parseHTML(readFileSync(new URL('./fixtures/dupe-forced11-banner.html', import.meta.url), 'utf8'));
  const { cells } = parseRollTable(document);
  const c = cells.get('59A');
  assert.equal(c.guaranteed.name, '伊達政宗');
  assert.equal(c.guaranteed.to, '69B');
  assert.equal(c.dupeGuaranteed.name, '真田幸村');
  assert.equal(c.dupeGuaranteed.to, '70A');
});
```

- [ ] **Step 2: 確認 FAIL**。
- [ ] **Step 3: 實作** — parser.js 加 `const DUPE_GUAR_RE = /pick\('(\d+[AB])RG'\)/;`,在重抽格(R)區塊後加:

```js
  // 撞名起手保證格（RG 字尾）：以重複狀態開確定連抽的保證與落點
  for (const td of table.querySelectorAll('td.cat[onclick]')) {
    const m = (td.getAttribute('onclick') || '').match(DUPE_GUAR_RE);
    if (!m) continue;
    const target = cells.get(m[1]);
    if (!target) continue;
    const rarity = rarityOf(td);
    const name = catName(td);
    if (!name) continue;
    const arrow = td.textContent.match(/(?:->|<-)\s*(\d+[AB]R?)\b/);
    target.dupeGuaranteed = { rarity, name, to: arrow ? arrow[1] : '' };
  }
```

(既有 GUAR_RE/REROLL_RE 均要求字尾後緊接 `'`,不會誤吃 RG 格。)

- [ ] **Step 4: STRUCTURE.md 補記** — 新 fixture 一節:戰國武將頁(seed=2553018823,force_guaranteed=11,last=39);`RG` 字尾=撞名起手保證;60B/78A 為非祭池 supa_fest 重複點。
- [ ] **Step 5: 全綠後 Commit** — `git commit -m "feat(parser): 解析 RG 撞名起手保證格"`

---

### Task 3: `simulateGuaranteed` + 591 格資料驅動測試

**Files:** Modify `extension/lib/route.js`;Create `test/route.gu.test.js`

**Interfaces:** Produces: `export function simulateGuaranteed(merged, bannerShort, n, track, lastName, bannerId, size)` → `{ landing:{n,track}, gotName, gotRarity, steps: PullOutcome[], uncertain } | null`。

- [ ] **Step 1: 失敗測試** `test/route.gu.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';
import { mergeBanners } from '../extension/lib/merge.js';
import { simulateGuaranteed } from '../extension/lib/route.js';

const { document } = parseHTML(readFileSync(new URL('./fixtures/dupe-forced11-banner.html', import.meta.url), 'utf8'));
const parsed = parseRollTable(document);
const merged = mergeBanners([{ banner: { id: 'x' }, parsed }]);
const SHORT = '戰國武將'; // 非祭、非票池

test('simulateGuaranteed：乾淨起手（59A → 伊達政宗 → 69B）', () => {
  const g = simulateGuaranteed(merged, SHORT, 59, 'A', null, 'x', 11);
  assert.equal(g.gotName, '伊達政宗');
  assert.deepEqual(g.landing, { n: 69, track: 'B' });
  assert.equal(g.steps.length, 10);
  assert.equal(g.uncertain, false);
});

test('simulateGuaranteed：撞名起手（59A 持鬥士貓 → 真田幸村 → 70A）', () => {
  const g = simulateGuaranteed(merged, SHORT, 59, 'A', '鬥士貓', 'x', 11);
  assert.equal(g.gotName, '真田幸村');
  assert.deepEqual(g.landing, { n: 70, track: 'A' });
  assert.equal(g.steps[0].gotName, '魔劍士貓'); // 第一抽=重抽
});

test('simulateGuaranteed：票池回 null；尾端無 G 資料回 null', () => {
  assert.equal(simulateGuaranteed(merged, '白金', 59, 'A', null, 'x', 11), null);
  assert.equal(simulateGuaranteed(merged, SHORT, 299, 'A', null, 'x', 11), null);
});

test('資料驅動：全部 G/RG 格落點與箭頭一致、同落點保證名一致', () => {
  const names = new Map();
  let g = 0, rg = 0;
  for (const [pos, c] of parsed.cells) {
    for (const [variant, last] of [['guaranteed', null], ['dupeGuaranteed', c.name]]) {
      const cell = c[variant];
      if (!cell || !cell.to) continue;
      const sim = simulateGuaranteed(merged, SHORT, c.n, c.track, last, 'x', 11);
      if (!sim) continue; // 尾端中間格不足
      const want = cell.to.match(/^(\d+)([AB])/);
      assert.equal(String(sim.landing.n), want[1], `${pos}${variant} 落點位置`);
      assert.equal(sim.landing.track, want[2], `${pos}${variant} 落點軌`);
      assert.equal(sim.uncertain, false, `${pos}${variant} 不應 uncertain`);
      const key = `${sim.landing.n}${sim.landing.track}`;
      if (names.has(key)) assert.equal(names.get(key), cell.name, `${pos} 同落點保證名`);
      names.set(key, cell.name);
      variant === 'guaranteed' ? g++ : rg++;
    }
  }
  assert.ok(g >= 500 && rg >= 10, `覆蓋數不足 G=${g} RG=${rg}`);
});
```

- [ ] **Step 2: 確認 FAIL**。
- [ ] **Step 3: 實作**(route.js,`pullOutcome` 之後)

```js
const POS_RE = /^(\d+)([AB])/;

// 確定連抽模擬（size=7/11/15）：size-1 次單抽 + 保證抽（僅耗一顆種子 → 半步位移）。
// 落點以 godfat G/RG 格箭頭為準；撞名起手（抵達即與上一抽同名重複）用 RG 資料。
export function simulateGuaranteed(merged, bannerShort, n, track, lastName, bannerId, size) {
  if (SPECIAL[bannerShort]) return null; // 票池無 GU
  const startCell = merged.byPos.get(`${n}${track}`)?.get(bannerId);
  if (!startCell) return null;
  const dupStart = effectiveRarity(startCell.rarity, bannerShort) === 'rare' &&
    lastName != null && startCell.name === lastName;
  const gcell = dupStart ? startCell.dupeGuaranteed : startCell.guaranteed;
  if (!gcell?.name) return null;
  const steps = [];
  let curN = n, curT = track, last = lastName;
  for (let i = 0; i < size - 1; i++) {
    const o = pullOutcome(merged, bannerShort, curN, curT, last, bannerId, false);
    if (!o) return null;
    steps.push(o);
    curN = o.nextN; curT = o.nextTrack; last = o.gotName;
  }
  const simLand = curT === 'A' ? { n: curN, track: 'B' } : { n: curN + 1, track: 'A' };
  const m = gcell.to ? POS_RE.exec(gcell.to) : null;
  const landing = m ? { n: Number(m[1]), track: m[2] } : simLand;
  const uncertain = m ? landing.n !== simLand.n || landing.track !== simLand.track : false;
  return { landing, gotName: gcell.name, gotRarity: gcell.rarity || 'uber', steps, uncertain };
}
```

- [ ] **Step 4: 全綠後 Commit** — `git commit -m "feat(route): simulateGuaranteed（591 格資料驅動驗證）"`

---

### Task 4: planRoutes GU 轉移 + 第四軸 gu

**Files:** Modify `extension/lib/route.js`;Test `test/route.test.js`

**Interfaces:** Produces: `banners[].gu: 7|11|15|null`;`Plan.cost.gu`;GU 步 `{ gu: true, pos: 起點, gotName: 保證名 }`;保證 Uber 只滿足 `kind:'cat'` 名字相符目標。

- [ ] **Step 1: 失敗測試**

```js
test('planRoutes：開 GU 收保證 Uber，gu 計軸、抽數含 GU 全長', () => {
  // 3 格 supa 直線 + 3A 帶 guaranteed（size=3 模擬小型 GU）
  const m = M({ X: [
    C('1A', 'a', 'supa'), C('2A', 'b', 'supa', { guaranteed: { name: 'UBER', rarity: 'uber', to: '4B' } }),
    C('3A', 'c', 'supa'), C('4B', 'd', 'supa'), C('5B', 'e', 'supa'),
  ] });
  const banners = [{ id: 'X', short: '特麗希', gu: 3 }];
  const r = planRoutes({ merged: m, banners,
    targets: [{ id: 'cat:UBER', kind: 'cat', name: 'UBER', accept: new Set() }] });
  assert.equal(r.feasible, true);
  const p = r.plans[0];
  assert.equal(p.cost.gu, 1);
  assert.equal(p.cost.pulls, 4); // 1 抽單抽 + GU 3 抽
  const guStep = p.steps.find((s) => s.gu);
  assert.equal(guStep.gotName, 'UBER');
  assert.equal(guStep.pos, '2A'); // GU 起點
});

test('planRoutes：gu 為第四 Pareto 軸（單抽長路 vs GU 短路並列）', () => {
  const xs = [C('1A', 'x1', 'supa', { guaranteed: { name: 'STAR', rarity: 'uber', to: '3B' } })];
  for (let i = 2; i <= 9; i++) xs.push(C(`${i}A`, `x${i}`, 'supa'));
  xs.push(C('10A', 'STAR', 'uber'));
  const m = M({ X: xs });
  const banners = [{ id: 'X', short: '特麗希', gu: 3 }];
  const r = planRoutes({ merged: m, banners,
    targets: [{ id: 'cat:STAR', kind: 'cat', name: 'STAR', accept: new Set(['X|10A']) }] });
  assert.equal(r.feasible, true);
  const costs = r.plans.map((p) => `${p.cost.pulls}/${p.cost.gu}`).sort();
  assert.deepEqual(costs, ['10/0', '3/1']); // 10 單抽 vs GU(3抽) 並列
});

test('planRoutes：保證 Uber 不滿足 cell 目標', () => {
  const m = M({ X: [C('1A', 'a', 'supa', { guaranteed: { name: 'UBER', rarity: 'uber', to: '3B' } }), C('2A', 'b', 'supa')] });
  const banners = [{ id: 'X', short: '特麗希', gu: 3 }];
  const r = planRoutes({ merged: m, banners,
    targets: [{ id: 't', kind: 'cell', name: 'UBER', accept: new Set(['X|9A']) }] });
  assert.equal(r.feasible, false);
});
```

- [ ] **Step 2: 確認 FAIL**。
- [ ] **Step 3: 實作**
  1. 標籤/成本四軸:`eqCost`/`dominated` 加 `gu`;`dom3` 改四軸比較(pulls,plat,legend,gu);`toPlan` cost 加 `gu`;`paretoPlans` 的 `byKey` 鍵加 gu、白金優先 `byGroup` 鍵改 `${c.pulls}|${c.gu}|${c.plat + c.legend}`;`selectPlans` 最省比較鏈在 legend 後加 gu;起始標籤 `gu: 0`。
  2. 主迴圈 banner 迴圈內、單抽轉移後加 GU 轉移:

```js
          // 開確定連抽（該卡池有保證值時）
          if (b.gu) {
            const g = simulateGuaranteed(merged, b.short, n, L.track, L.lastName, b.id, b.gu);
            if (g) {
              let mask = L.mask, kk = L.k, sw = L.switches;
              const guSteps = [];
              for (const o of g.steps) {
                kk++;
                const atCell = o.uncertain ? 0 : (cellIdx.get(`${b.id}|${o.posStr}`) || 0);
                let got = 0;
                if (atCell) for (let i = 0; i < T; i++) {
                  if ((atCell & (1 << i)) && (targets[i].name == null || targets[i].name === o.gotName)) got |= 1 << i;
                }
                const collected = [];
                for (let i = 0; i < T; i++) if ((got & (1 << i)) && !(mask & (1 << i))) collected.push(targets[i].id);
                mask |= got;
                if (o.switched) sw++;
                guSteps.push({ k: kk, pos: o.posStr, track: o.posStr.endsWith('A') ? 'A' : 'B', bannerId: b.id,
                  gotName: o.gotName, gotRarity: o.gotRarity, switched: o.switched, uncertain: o.uncertain,
                  ticket: null, collected, gu: false });
              }
              // 保證抽：只滿足 cat 目標（保證 Uber 無格子位置）
              kk++;
              let got = 0;
              for (let i = 0; i < T; i++) {
                if (targets[i].kind === 'cat' && targets[i].name === g.gotName) got |= 1 << i;
              }
              const collected = [];
              for (let i = 0; i < T; i++) if ((got & (1 << i)) && !(mask & (1 << i))) collected.push(targets[i].id);
              mask |= got;
              guSteps.push({ k: kk, pos: `${n}${L.track}`, track: L.track, bannerId: b.id,
                gotName: g.gotName, gotRarity: g.gotRarity, switched: true, uncertain: g.uncertain,
                ticket: null, collected, gu: true });
              const steps2 = L.steps.concat(guSteps);
              const lb2 = b.start && b.start > L.lb ? b.start : L.lb;
              if (mask !== L.mask) candidates.push({ pulls: kk, plat: L.plat, legend: L.legend, gu: L.gu + 1, switches: sw, mask, steps: steps2 });
              if (mask !== full && g.landing.n <= maxPos) {
                insertAt(g.landing.n, stateKey(g.landing.n, g.landing.track, mask, g.gotName, lb2),
                  { k: kk, plat: L.plat, legend: L.legend, gu: L.gu + 1, switches: sw, mask, track: g.landing.track, lastName: g.gotName, lb: lb2, steps: steps2 });
              }
            }
          }
```

  3. 既有單抽轉移的標籤/candidates 全部補 `gu: L.gu`。
- [ ] **Step 4: 全綠後 Commit** — `git commit -m "feat(route): GU 轉移與第四 Pareto 軸 gu"`

---

### Task 5: view — ↪/↩、逐卡池保證值、批次工具、GU 欄與高亮

**Files:** Modify `extension/view/view.js`、`view.html`、`view.css`

- [ ] **Step 1: ↪/↩ 方向** — `cellHtml` 中重複附註與保證附註的箭頭改為方向推導:

```js
    const dir = (to) => (to && /\d+A/.test(to) ? '↩' : '↪'); // 落點在 A 軌=回溯，B 軌=前進
    const dupeTo = c.dupe?.to ? ` ${dir(c.dupe.to)} ${esc(c.dupe.to)}` : '';
```

保證附註 `guarTo` 同樣改用 `dir(c.guaranteed.to)`;若有 `c.dupeGuaranteed` 加第二行附註
`保證(撞名): ${name} ${dir(to)} ${to}`。

- [ ] **Step 2: 逐卡池保證值** — view.js:

```js
const GU_KEY = 'bcsp:gu-values';
const BUSTER_SHORTS = new Set(['革命軍團', '紅色破壞者', '飄浮破壞者']);
const guValues = new Map(Object.entries(JSON.parse(localStorage.getItem(GU_KEY) || '{}')));
function autoGu(short) {
  if (TICKET_SHORTS.has(short)) return '';
  return BUSTER_SHORTS.has(short) ? '15' : '11';
}
function saveGu() { localStorage.setItem(GU_KEY, JSON.stringify(Object.fromEntries(guValues))); }
```

(`TICKET_SHORTS` 自 `lib/rarity.js` import。)`fetchBanner(id, useCount, force)` 的 force 改由呼叫端傳 `guValues.get(id) ?? ''`;`load()` 完成後對「首次見到的 id」設 `guValues.set(id, autoGu(short))`,若因此有值變動 → `saveGu()` 後**再 load() 一次**(其餘命中快取)。`#guar` 下拉改為批次工具:選項 `批次設定…`(placeholder)/`重設為自動預設`/`全部無`/`全部 7`/`全部 11`/`全部 15`,change 時套用到 guValues 全部、saveGu、load()、跳回 placeholder。`renderToggles` 每卡池 label 後加 `<select class="gu-sel" data-id=...>`(無/7/11/15,值=guValues),change → 更新 guValues、saveGu、load()。

- [ ] **Step 3: 規劃與方案表** — `runPlan` 的 banners 元素加 `gu: Number(guValues.get(e.banner.id)) || null`;方案表 thead 加 `<th>GU</th>`、rows 加 `p.cost.gu`;`showPlanPath` 對 `s.gu` 步:該步 `pos` 格加 `path-gu` class 與 `data-gu-title`(title=`開${...}連：${s.gotName}`),不佔 data-step(GU 起點格同時是中間第一抽格,step 序號由中間步標)。CSS:

```css
tbody td.path-gu { outline: 3px double #0b7285; outline-offset: -3px; }
#banner-toggles .gu-sel { font-size: 11px; height: 20px; margin-left: 4px; }
```

- [ ] **Step 4: 驗證** — `npm test` 全綠;`node --check`;瀏覽器 fetch-stub(用新 fixture):
  ↪/↩ 顯示正確(59A 保證 ↪ 69B、撞名保證 ↩ 70A)、逐卡池下拉與批次工具、重載後 guValues 保留、
  含 GU 的方案表(GU 欄)與 path-gu 高亮、59A 目標「真田幸村」(cat)在持鬥士貓狀態可由 GU 收集。
- [ ] **Step 5: Commit** — `git commit -m "feat(view): 逐卡池保證型式、↪/↩ 方向、GU 方案欄與高亮"`

---

### Task 6: 文件 — 筆記 07 修訂 + README

**Files:** Modify `docs/seed-tracking/07-保證抽與重複稀有交互.md`、`README.md`

- [ ] **Step 1: 筆記 07 修訂** — 「待驗證」節改寫:godfat 同時建模乾淨(`G`)與撞名(`RG`)起手
  (2026-07-03 發現,先前調查漏看 RG);記錄 591 格驗證(方法:逐抽模擬+半步位移,
  fixture `dupe-forced11-banner.html`);「遊戲內最終驗證」保留。「待辦:方向區分顯示」標已完成。
- [ ] **Step 2: README** — 規劃路線段補:逐卡池保證型式(自動預設/批次工具)、GU 方案欄、
  ↪/↩ 方向說明;重要實作細節補 RG 格與有效稀有度觸發。
- [ ] **Step 3: 全部測試 + Commit** — `git commit -m "docs: 筆記07 修訂（RG 格與 591 格驗證）；README 更新"`

---

## Self-Review

- **Spec coverage:** Phase 0(Task 1)、RG 解析(Task 2)、simulateGuaranteed+591 驗證(Task 3)、GU 轉移+四軸(Task 4)、Phase 1/2/3 view(Task 5)、筆記 07+README(Task 6)——全覆蓋。
- **Placeholder scan:** 無 TBD;各步含完整程式碼或明確編輯指示。
- **Type consistency:** `simulateGuaranteed(merged, bannerShort, n, track, lastName, bannerId, size)`、`banners[].gu`、`cost.gu`、`Step.gu`、`cell.dupeGuaranteed{rarity,name,to}`、`guValues`/`autoGu`/`GU_KEY`/`BUSTER_SHORTS` 跨任務一致。
