# 路線規劃 v2:卡池時間約束、白金優先於黑金 — 設計

日期:2026-07-02(深夜)。承接 `2026-07-02-route-planner-design.md` 的「待辦(v2 需求)」段。

## 背景與問題

v1 的 `planRoutes` 忽略卡池活動時間,可能產出時間上不可行的抽序(例如先抽較晚開始的
卡池、再回頭抽屆時已結束的舊卡池)。另外白金/黑金給相同結果時,Pareto 三軸互不支配、
兩案並列,但白金券比傳說券便宜,應優先白金。

## 目標

1. 路線只含**時間上可行**的抽序:每抽的卡池在當下活動中;時間單向前進。
2. 抽數相同、總券數相同時,**剔除傳說券較多的方案**(白金優先)。

## 非目標

- 不建模時區「時間旅行」技巧(筆記 04:回過去時區抽仍在進行的舊卡池)。採保守模型:
  不會產出實際不可行的路線,只可能漏掉極限技巧路線。
- 不設白金↔傳說券匯率:2 白金 vs 1 傳說屬不同總券數,兩案並列由使用者挑。
- 不加新 UI 控件;不改 parser / merge / cache。

## 設計

### 1. 時間模型(`extension/lib/route.js`)

全部以 ISO 日期字串(`YYYY-MM-DD`)**字典序比較**,不用 Date 物件。

- `banners` 元素擴為 `{ id, short, start, end }`;`start`/`end` 可省略或空字串 = 該端不受約束。
  view 端由既有 `banner.date`(`"YYYY-MM-DD~YYYY-MM-DD"` 或 `''`)拆出。
- `options.today`(ISO 字串):規劃起點時間。view 端傳當日;純函式測試自行指定。
  未提供則視為無初始下界(向後相容)。
- 搜尋狀態新增**時間下界 `lb`**(字串,初始 = `today`),進 state key。
- **可抽判定**:卡池 `b` 於狀態 `lb` 可抽 iff `!b.end || b.end >= lb`。
  (已結束者永不可抽,包括 `end < today`。)
- **轉移**:抽 `b` 後 `lb' = (b.start && b.start > lb) ? b.start : lb`。
  抽未來卡池 = 把時間推進到其開始日;之後 `end < lb'` 的舊卡池即不可再抽。
- 活動窗重疊者可交錯抽(比較含當日,`>=`)。
- 標籤支配比較(`dominated`/`eqCost`)**不含** `lb`——`lb` 已在 state key 內,
  不同 `lb` 屬不同狀態,互不剔除。

### 2. 白金優先於黑金(等價剔除)

在 `paretoPlans` 產出前緣後追加一步過濾:

- 分組鍵 = `(pulls, plat + legend)`(抽數、總券數)。
- 同組內只留 `legend` 最小者;`legend` 相同再依既有規則(`switches` 最小)取代表。
- 效果:`(10抽,1白金,0傳說)` vs `(10抽,0白金,1傳說)` → 只留白金案;
  `(10抽,2白金,0)` vs `(10抽,0,1傳說)` → 總券數不同,兩案並列。

### 3. 不可行原因擴充

`reasonFor(target, maxPos, banners, today)` 判定順序:

1. 所有 accept 格位置皆 `> maxPos` → `'beyond-count'`。
2. 否則,所有 accept 格所屬卡池皆已結束(`end && end < today`)→ `'time-conflict'`。
3. 否則 → `'conflict'`(含判不出的順序性時間衝突)。

### 4. UI(`extension/view/view.js`,改動極小)

- `runPlan()`:`banners` 元素加 `start`/`end`(由 `e.banner.date.split('~')` 取);
  `options.today` 傳 `new Date().toLocaleDateString('sv')`(sv 地區格式即 YYYY-MM-DD,
  取本地時區當日;不用 `toISOString` 以免深夜時 UTC 差一天)。
  (註:`banner.start` 既有欄位即日期起日,`end` 需從 `date` 字串拆。)
- 不可行文案:`beyond-count` → 「超出載入抽數」;`time-conflict` → 「卡池已結束」;
  `conflict` → 「互斥/軌道或時間不可達」。

## 相容性

- `banners` 不帶 `start`/`end`、`options` 不帶 `today` 時行為與 v1 完全相同
  (全無時間約束)——既有 53 測試不需修改即應全綠。

## 測試(`test/route.test.js` 新增)

1. **已結束卡池**:目標只在 `end < today` 的卡池 → `feasible:false`、原因 `time-conflict`。
2. **回不去舊卡池**:卡池 A 窗 `[d1,d2]`、B 窗 `[d3,d4]`(`d3 > d2`),目標需「先 B 後 A」
   的順序 → 不可行(或繞其他 occurrence);「先 A 後 B」的對照組可行。
3. **重疊可交錯**:A、B 活動窗重疊,路線 A→B→A 可行。
4. **空日期不受約束**:無 `start`/`end` 的卡池任何時點可抽。
5. **白金優先**:同抽數、同總券數(1白金 vs 1傳說)→ 只留白金案。
6. **不同總券數並列**:2白金 vs 1傳說 → 兩案皆在 Pareto。

## 風險 / 取捨

- state key 加 `lb` 使狀態數增加,但 `lb` 取值僅限「today 與各卡池 start」至多
  `|banners|+1` 種,可控。
- 保守時間模型可能漏掉時區技巧路線(已列非目標)。
- godfat 日期缺漏時寬鬆處理(隨時可抽),可能高估可行性——屬少數邊緣案例,已與使用者確認。
