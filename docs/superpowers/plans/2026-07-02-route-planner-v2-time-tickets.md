# 路線規劃 v2(時間約束、白金優先)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 路線只含時間上可行的抽序(卡池活動窗、時間單向前進),且同抽數同總券數時白金優先於黑金。

**Architecture:** `route.js` 搜尋狀態加時間下界 `lb`(ISO 字串字典序比較),卡池可抽 iff `!end || end >= lb`,抽後 `lb=max(lb,start)`;`paretoPlans` 加等價剔除(同抽數同總券數留 legend 最小);`reasonFor` 加 `time-conflict`;view 端傳日期與 today。

**Tech Stack:** 原生 ES module、`node:test`。日期一律 `YYYY-MM-DD` 字串比較,不用 Date 物件。

## Global Constraints

- `banners` 元素擴為 `{ id, short, start, end }`;`start`/`end` 省略或空字串 = 該端不受約束。
- `options.today`(ISO 字串)未提供時視為無初始下界——既有 53 測試不需修改即應全綠。
- 標籤支配比較(`dominated`/`eqCost`)不含 `lb`;`lb` 進 state key。
- 白金優先剔除只作用於「同 pulls 且同 plat+legend 總數」的組內。
- 不建模時區時間旅行技巧(保守模型)。

---

### Task 1: `route.js` 時間模型 + `time-conflict`

**Files:**
- Modify: `extension/lib/route.js`
- Test: `test/route.test.js`

**Interfaces:**
- Consumes: 既有 `planRoutes` / `pullOutcome` / `selectPlans` / `reasonFor`。
- Produces: `planRoutes` 接受 `banners[i].start/end` 與 `options.today`;`unreachable[].reason` 新增 `'time-conflict'`。

- [ ] **Step 1: 寫失敗測試**(附加到 `test/route.test.js`;沿用檔內 `C`/`M` helper)

```js
test('planRoutes：目標只在已結束卡池 → time-conflict', () => {
  const m = M({ A: [C('1A', 'a', 'supa')] });
  const targets = [{ id: 't', kind: 'cell', accept: new Set(['A|1A']) }];
  const r = planRoutes({ merged: m, targets,
    banners: [{ id: 'A', short: '特麗希', start: '2026-06-01', end: '2026-06-30' }],
    options: { today: '2026-07-02' } });
  assert.equal(r.feasible, false);
  assert.equal(r.unreachable[0].reason, 'time-conflict');
});

test('planRoutes：先抽晚開始卡池後回不去早結束的舊卡池', () => {
  const mk = (bid, names) => names.map((nm, i) => C(`${i + 1}A`, nm, 'supa'));
  const m = M({ A: mk('A', ['a1', 'a2', 'a3']), B: mk('B', ['b1', 'b2', 'b3']) });
  const banners = [
    { id: 'A', short: '特麗希', start: '2026-07-01', end: '2026-07-05' },
    { id: 'B', short: '史塔爾', start: '2026-07-10', end: '2026-07-15' },
  ];
  // 需「先 B(位置2)後 A(位置3)」→ 抽 B 後 lb=07-10 > A.end → 不可行
  const bad = planRoutes({ merged: m, banners, options: { today: '2026-07-02' },
    targets: [
      { id: 'tb', kind: 'cell', accept: new Set(['B|2A']) },
      { id: 'ta', kind: 'cell', accept: new Set(['A|3A']) },
    ] });
  assert.equal(bad.feasible, false);
  // 對照組「先 A 後 B」可行
  const ok = planRoutes({ merged: m, banners, options: { today: '2026-07-02' },
    targets: [
      { id: 'ta', kind: 'cell', accept: new Set(['A|2A']) },
      { id: 'tb', kind: 'cell', accept: new Set(['B|3A']) },
    ] });
  assert.equal(ok.feasible, true);
  assert.equal(ok.plans[0].cost.pulls, 3);
});

test('planRoutes：活動窗重疊可交錯 A→B→A', () => {
  const m = M({ A: [C('1A', 'a1', 'supa'), C('2A', 'a2', 'supa'), C('3A', 'a3', 'supa')],
                B: [C('1A', 'b1', 'supa'), C('2A', 'b2', 'supa'), C('3A', 'b3', 'supa')] });
  const banners = [
    { id: 'A', short: '特麗希', start: '2026-07-01', end: '2026-07-10' },
    { id: 'B', short: '史塔爾', start: '2026-07-03', end: '2026-07-12' },
  ];
  const r = planRoutes({ merged: m, banners, options: { today: '2026-07-02' },
    targets: [
      { id: 't1', kind: 'cell', accept: new Set(['A|1A']) },
      { id: 't2', kind: 'cell', accept: new Set(['B|2A']) },
      { id: 't3', kind: 'cell', accept: new Set(['A|3A']) },
    ] });
  assert.equal(r.feasible, true);
  assert.equal(r.plans[0].cost.pulls, 3);
});

test('planRoutes：空日期卡池不受時間約束', () => {
  const m = M({ A: [C('1A', 'a', 'supa')] });
  const r = planRoutes({ merged: m,
    banners: [{ id: 'A', short: '特麗希' }],
    options: { today: '2026-07-02' },
    targets: [{ id: 't', kind: 'cell', accept: new Set(['A|1A']) }] });
  assert.equal(r.feasible, true);
});
```

- [ ] **Step 2: 跑測試確認失敗** — `npm test`,預期前兩項 FAIL(目前無時間約束 → `feasible:true`、reason 錯)。

- [ ] **Step 3: 實作** — `extension/lib/route.js` 四處修改:

`stateKey` 加 `lb`:
```js
function stateKey(n, track, mask, lastName, lb) {
  return `${n}|${track}|${mask}|${lastName == null ? '' : lastName}|${lb}`;
}
```

`reasonFor` 改簽名並加 `time-conflict`(判定順序:beyond-count → time-conflict → conflict):
```js
function reasonFor(target, maxPos, bannerById, today) {
  let allBeyond = true, allEnded = true;
  for (const key of target.accept) {
    const [bid, posStr] = key.split('|');
    if (parseInt(posStr, 10) <= maxPos) allBeyond = false;
    const b = bannerById.get(bid);
    if (!(b?.end && today && b.end < today)) allEnded = false;
  }
  if (allBeyond) return 'beyond-count';
  if (allEnded) return 'time-conflict';
  return 'conflict';
}
```

`selectPlans` 簽名改為 `(candidates, full, targets, maxPos, bannerById, today)`,內部 `reasonFor(t, maxPos, bannerById, today)`。

`planRoutes` 主迴圈:起始標籤加 `lb`;卡池迴圈加可抽判定與 `lb` 轉移:
```js
  const bannerById = new Map(banners.map((b) => [b.id, b]));
  const today = options.today ?? '';
  // …
  const start = { plat: 0, legend: 0, switches: 0, mask: 0, track: 'A',
    lastName: options.lastName ?? null, lb: today, steps: [] };
  frontier.set(stateKey(1, 'A', 0, start.lastName, start.lb), [start]);
```
卡池迴圈內(`pullOutcome` 之前/之後):
```js
          if (b.end && b.end < L.lb) continue; // 於目前時間下界已結束
          const o = pullOutcome(merged, b.short, n, L.track, L.lastName, b.id, n === 1);
          if (!o) continue;
          const lb = b.start && b.start > L.lb ? b.start : L.lb; // 抽未來卡池 → 時間推進
```
`insertLabel` 的新標籤加 `lb`,state key 用 `stateKey(o.nextN, o.nextTrack, newMask, o.gotName, lb)`;
結尾 `return selectPlans(candidates, full, targets, maxPos, bannerById, today);`。

- [ ] **Step 4: 跑測試** — `npm test`,預期全綠(既有 53 + 新 4)。

- [ ] **Step 5: Commit** — `git add extension/lib/route.js test/route.test.js && git commit -m "feat(route): 卡池時間約束（活動窗、時間單向前進、time-conflict）"`

---

### Task 2: `route.js` 白金優先剔除

**Files:**
- Modify: `extension/lib/route.js`(`paretoPlans`)
- Test: `test/route.test.js`

**Interfaces:**
- Consumes: Task 1 後的 `paretoPlans`。
- Produces: 同 pulls 同 plat+legend 組內僅留 legend 最小的方案。

- [ ] **Step 1: 寫失敗測試**

```js
test('planRoutes：同抽數同總券數 → 白金優先、傳說案剔除', () => {
  const m = M({ X: [C('1A', 'x1', 'supa'), C('2A', 'x2', 'supa')],
                P: [C('2A', 'star', 'supa')], L: [C('2A', 'star', 'supa')] });
  const banners = [{ id: 'X', short: '特麗希' }, { id: 'P', short: '白金' }, { id: 'L', short: '黑金' }];
  const r = planRoutes({ merged: m, banners,
    targets: [{ id: 'star', kind: 'cat', accept: new Set(['P|2A', 'L|2A']) }] });
  assert.equal(r.feasible, true);
  assert.equal(r.plans.length, 1);
  assert.equal(r.plans[0].cost.plat, 1);
  assert.equal(r.plans[0].cost.legend, 0);
});

test('planRoutes：不同總券數（2白金 vs 1傳說）兩案並列', () => {
  const m = M({ X: [C('1A', 'x1', 'supa'), C('2A', 'x2', 'supa')],
                P: [C('1A', 'c1', 'supa'), C('2A', 'c2', 'supa')],
                L: [C('2A', 'both', 'supa')] });
  const banners = [{ id: 'X', short: '特麗希' }, { id: 'P', short: '白金' }, { id: 'L', short: '黑金' }];
  const r = planRoutes({ merged: m, banners,
    targets: [
      { id: 't1', kind: 'cat', accept: new Set(['P|1A', 'L|2A']) },
      { id: 't2', kind: 'cat', accept: new Set(['P|2A', 'L|2A']) },
    ] });
  assert.equal(r.feasible, true);
  const costs = r.plans.map((p) => `${p.cost.pulls}/${p.cost.plat}/${p.cost.legend}`).sort();
  assert.deepEqual(costs, ['2/0/1', '2/2/0']); // 1 傳說券 vs 2 白金券並列
});
```

- [ ] **Step 2: 跑測試確認失敗** — `npm test`,預期第一項 FAIL(目前 1白金/1傳說 兩案並列)。

- [ ] **Step 3: 實作** — `paretoPlans` 在 `byKey` 去重後、排序前插入組內剔除:

```js
function paretoPlans(cands) {
  const nd = cands.filter((c) => !cands.some((o) => o !== c && dom3(o, c)));
  const byKey = new Map();
  for (const c of nd) {
    const k = `${c.pulls}|${c.plat}|${c.legend}`;
    const cur = byKey.get(k);
    if (!cur || c.switches < cur.switches) byKey.set(k, c);
  }
  // 白金優先：同抽數且同總券數者，只留傳說券最少的（白金券較便宜）
  const byGroup = new Map();
  for (const c of byKey.values()) {
    const g = `${c.pulls}|${c.plat + c.legend}`;
    const cur = byGroup.get(g);
    if (!cur || c.legend < cur.legend) byGroup.set(g, c);
  }
  return [...byGroup.values()]
    .sort((a, b) => a.pulls - b.pulls || a.plat - b.plat || a.legend - b.legend)
    .map(toPlan);
}
```

- [ ] **Step 4: 跑測試** — `npm test`,全綠(注意既有「抽數 vs 白金券 Pareto 兩方案」測試 20/0 與 4/1 分屬不同 pulls 組,不受影響)。

- [ ] **Step 5: Commit** — `git add extension/lib/route.js test/route.test.js && git commit -m "feat(route): 白金優先於黑金（同抽數同總券數剔除傳說案）"`

---

### Task 3: view 整合 + README

**Files:**
- Modify: `extension/view/view.js`(`runPlan`、`renderPlanList`)、`README.md`

**Interfaces:**
- Consumes: Task 1/2 的 `planRoutes` 新參數。

- [ ] **Step 1: `runPlan` 傳日期與 today** — `extension/view/view.js`:

```js
function runPlan() {
  const visible = currentEntries.filter((e) => !hidden.has(e.banner.id));
  const banners = visible.map((e) => {
    const [start = '', end = ''] = (e.banner.date || '').split('~');
    return { id: e.banner.id, short: e.banner.short, start, end };
  });
  const merged = mergeBanners(currentEntries);
  const targets = [...routeTargets.values()];
  const today = new Date().toLocaleDateString('sv'); // sv 地區格式即 YYYY-MM-DD（本地時區）
  lastPlanResult = planRoutes({ merged, targets, banners, options: { lastName: null, today } });
  renderPlanList(lastPlanResult);
}
```

- [ ] **Step 2: `renderPlanList` 不可行文案** — 原因對照改為:

```js
  const REASON_LABEL = {
    'beyond-count': '超出載入抽數',
    'time-conflict': '卡池已結束',
    'conflict': '互斥/軌道或時間不可達',
  };
  const warn = result.feasible ? '' :
    `<div class="err">無法收齊全部：${result.unreachable
      .map((u) => `${esc(u.id)}（${REASON_LABEL[u.reason] || u.reason}）`)
      .join('、')}。以下為可行子集方案。</div>`;
```

- [ ] **Step 3: README** — 「規劃路線」段補兩點:

```markdown
   - 路線已考慮**卡池活動時間**：只在活動期間抽該卡池、時間單向前進（先抽較晚開始的卡池後，回不去屆時已結束的舊卡池）；已結束卡池的目標會標「卡池已結束」
   - 抽數與總券數相同時**白金優先於黑金**（白金券較便宜），僅保留白金方案
```

- [ ] **Step 4: 驗證** — `npm test` 全綠;`node --check extension/view/view.js`;瀏覽器手動驗證(載入含白金+黑金+一般卡池,規劃時方案不再出現同抽數的傳說券重複案;選只含已結束卡池的目標會標「卡池已結束」)。

- [ ] **Step 5: Commit** — `git add extension/view/view.js README.md && git commit -m "feat(view): 路線規劃傳入卡池時間與 today；文案更新"`

---

## Self-Review

- **Spec coverage:** 時間模型(Task 1:可抽判定/lb 轉移/stateKey/today)、time-conflict(Task 1 reasonFor)、白金優先(Task 2 paretoPlans)、UI 與相容(Task 3;向後相容由既有測試不改而全綠驗證)、spec 六測試情境(Task 1 四項 + Task 2 兩項)——皆有對應。
- **Placeholder scan:** 無 TBD;每步含完整程式碼。
- **Type consistency:** `stateKey(…, lb)`、標籤欄位 `lb`、`selectPlans(candidates, full, targets, maxPos, bannerById, today)`、`reasonFor(target, maxPos, bannerById, today)`、`banners[i].{start,end}`、`options.today` 跨任務一致。
