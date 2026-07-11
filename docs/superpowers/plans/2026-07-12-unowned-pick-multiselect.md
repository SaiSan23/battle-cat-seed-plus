# 表內未擁有 modal 快速多選 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** view 頁「表內未擁有的貓」modal 的勾選提速：預設全不選、稀有度群組三態開關、Shift 範圍選取、反選。

**Architecture:** 可測邏輯（三態彙總、範圍展開）抽 `extension/lib/multiselect.js` 純函式＋node --test；DOM 接線在 `extension/view/view.js` 用 `click` 事件委派（`change` 非 MouseEvent 拿不到 `shiftKey`）。勾選後的計數與超限擋板 `updateUpCount()` 邏輯不動、僅修選取器。

**Tech Stack:** vanilla JS（ES module）、node:test、無相依套件。

**規格:** `docs/superpowers/specs/2026-07-12-unowned-pick-multiselect-design.md`

## Global Constraints

- 不動 `collectUnownedInTable()`、`MAX_TARGETS`（=12，來自 `lib/route.js`）、超限擋板語意（超限＝`up-over` 警示色＋加入鈕 disabled）。
- 單項勾選框一律加 class `up-item`、群組勾選框 class `up-gcb`；既有「撈全部 input」的選取器都要改成 `input.up-item`，否則群組框會被當成一隻貓加入目標。
- commit 格式 `type(scope): 中文摘要`，**不加 Co-Authored-By trailer**。
- 每個 task 結尾 `npm test` 必須全綠（現有 123 測試不修改）。

---

### Task 1: lib 純函式 groupState / rangeIndices

**Files:**
- Create: `extension/lib/multiselect.js`
- Test: `test/multiselect.test.js`

**Interfaces:**
- Consumes: 無。
- Produces: `groupState(bools: boolean[]) => 'all'|'none'|'partial'`（空陣列＝`'none'`）；`rangeIndices(anchor: number, current: number) => number[]`（兩端含、方向無關、遞增排序）。Task 2/3 由 view.js import。

- [ ] **Step 1: 寫失敗測試**

`test/multiselect.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupState, rangeIndices } from '../extension/lib/multiselect.js';

test('groupState：全勾/全不勾/混合/空', () => {
  assert.equal(groupState([true, true]), 'all');
  assert.equal(groupState([true]), 'all');
  assert.equal(groupState([false, false]), 'none');
  assert.equal(groupState([true, false, true]), 'partial');
  assert.equal(groupState([]), 'none');
});

test('rangeIndices：正向、反向、同點', () => {
  assert.deepEqual(rangeIndices(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(rangeIndices(4, 1), [1, 2, 3, 4]);
  assert.deepEqual(rangeIndices(2, 2), [2]);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -aE 'multiselect|fail '`
Expected: FAIL（Cannot find module …/extension/lib/multiselect.js）

- [ ] **Step 3: 最小實作**

`extension/lib/multiselect.js`：

```js
// 未擁有 modal 快速多選的可測邏輯（純函式；DOM 接線在 view/view.js）。

// 群組三態彙總：all=整組已勾、none=整組未勾（含空組）、partial=部分。
export function groupState(bools) {
  if (!bools.length || bools.every((b) => !b)) return 'none';
  return bools.every(Boolean) ? 'all' : 'partial';
}

// Shift 範圍選取：錨點與本次點擊之間（含兩端）的扁平 index，方向無關。
export function rangeIndices(anchor, current) {
  const [lo, hi] = anchor <= current ? [anchor, current] : [current, anchor];
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add extension/lib/multiselect.js test/multiselect.test.js
git commit -m "feat(lib): 多選輔助純函式 groupState/rangeIndices"
```

---

### Task 2: 預設全不選＋群組三態開關＋反選

**Files:**
- Modify: `extension/view/view.js`（`openUnownedPick` 約 502-519 行、`updateUpCount` 約 522-533 行、modal 事件接線約 765-785 行、import 區約第 7 行）
- Modify: `extension/view/view.html:103-108`（foot 按鈕列）
- Modify: `extension/view/view.css`（約 454、461 行）

**Interfaces:**
- Consumes: `groupState`（Task 1）。
- Produces: `upItems() => HTMLInputElement[]`（扁平單項清單，渲染順序）、`refreshUpState()`（群組三態回寫＋`updateUpCount()` 統一收尾）、`setAllUpItems(checked: boolean)`。`#unowned-pick-body` 的 `click` 委派 listener（Task 3 會整段替換成含 Shift 的版本）。單項＝`input.up-item`（`value`＝貓名）、群組框＝`input.up-gcb`。

- [ ] **Step 1: import 與渲染改版**

view.js import 區加：

```js
import { groupState } from '../lib/multiselect.js';
```

`openUnownedPick()` 內的 `parts.push(...)` 整段改為（單項移除 `checked`、加 class；群組標題 div → 含群組框的 label）：

```js
    parts.push(
      `<div class="up-group"><label class="up-head"><input type="checkbox" class="up-gcb"><i class="up-dot" data-r="${r}"></i>${RARITY_LABEL[r]}（${names.length}）</label>` +
        names.map((n) => `<label><input type="checkbox" class="up-item" value="${esc(n)}"> ${esc(n)}</label>`).join('') +
        '</div>'
    );
```

函式最後一行 `updateUpCount();` 改為 `refreshUpState();`。

- [ ] **Step 2: 收尾 helper 與選取器修正**

`updateUpCount()` 前加（`groupState` 彙總回寫 checked/indeterminate；`indeterminate` 只有 JS 屬性、無 HTML attribute）：

```js
function upItems() {
  return [...document.querySelectorAll('#unowned-pick-body input.up-item')];
}
// 所有勾選操作的統一收尾：群組三態回寫＋計數/擋板
function refreshUpState() {
  for (const g of document.querySelectorAll('#unowned-pick-body .up-group')) {
    const st = groupState([...g.querySelectorAll('input.up-item')].map((cb) => cb.checked));
    const gcb = g.querySelector('input.up-gcb');
    gcb.checked = st === 'all';
    gcb.indeterminate = st === 'partial';
  }
  updateUpCount();
}
function setAllUpItems(checked) {
  for (const cb of upItems()) cb.checked = checked;
  refreshUpState();
}
```

選取器修正（群組框不能混進計數與加入）：

- `updateUpCount()` 內 `'#unowned-pick-body input:checked'` → `'#unowned-pick-body input.up-item:checked'`
- `#up-add` listener 內 `'#unowned-pick-body input:checked'` → `'#unowned-pick-body input.up-item:checked'`

- [ ] **Step 3: 事件接線改版**

既有三行 listener 替換：

```js
document.querySelector('#unowned-pick-body').addEventListener('change', updateUpCount);
document.querySelector('#up-all').addEventListener('click', () => {
  for (const cb of document.querySelectorAll('#unowned-pick-body input')) cb.checked = true;
  updateUpCount();
});
document.querySelector('#up-none').addEventListener('click', () => {
  for (const cb of document.querySelectorAll('#unowned-pick-body input')) cb.checked = false;
  updateUpCount();
});
```

改為（checkbox 的鍵盤操作也會發 click，委派 `click` 即可涵蓋；群組框點擊語意靠原生行為：indeterminate/未勾點後 checked=true → 整組勾起，已全勾點後 checked=false → 整組取消）：

```js
document.querySelector('#unowned-pick-body').addEventListener('click', (ev) => {
  const cb = ev.target;
  if (!(cb instanceof HTMLInputElement)) return;
  if (cb.classList.contains('up-gcb')) {
    for (const item of cb.closest('.up-group').querySelectorAll('input.up-item')) item.checked = cb.checked;
  }
  refreshUpState();
});
document.querySelector('#up-all').addEventListener('click', () => setAllUpItems(true));
document.querySelector('#up-none').addEventListener('click', () => setAllUpItems(false));
document.querySelector('#up-invert').addEventListener('click', () => {
  for (const cb of upItems()) cb.checked = !cb.checked;
  refreshUpState();
});
```

- [ ] **Step 4: HTML 反選鈕＋CSS**

view.html foot（`#up-none` 之後、`#up-add` 之前）加：

```html
    <button id="up-invert" type="button" class="btn-secondary">反選</button>
```

view.css 兩處修改（`.up-head` 提高特異度蓋過 `.up-group label` 的 inline-flex/margin；所有 label 禁選字避免 Shift 點擊反白）：

```css
.up-group .up-head { display: flex; align-items: center; gap: 6px; font-weight: 600; margin: 0 0 2px; cursor: pointer; }
```

（取代原 `.up-head { display: flex; align-items: center; gap: 6px; font-weight: 600; margin-bottom: 2px; }`）

```css
.up-group label { display: inline-flex; align-items: center; gap: 4px; margin: 0 12px 2px 0; cursor: pointer; user-select: none; }
```

（原行尾加 `user-select: none;`）

- [ ] **Step 5: 測試**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add extension/view/view.js extension/view/view.html extension/view/view.css
git commit -m "feat(view): 未擁有 modal 預設全不選、群組三態開關與反選"
```

---

### Task 3: Shift 範圍選取

**Files:**
- Modify: `extension/view/view.js`（import、`openUnownedPick` 尾、Task 2 的 `#unowned-pick-body` click 委派）

**Interfaces:**
- Consumes: `rangeIndices`（Task 1）、`upItems()`／`refreshUpState()`（Task 2）。
- Produces: 無（行為終點）。

- [ ] **Step 1: 錨點狀態與委派改版**

import 補 `rangeIndices`：

```js
import { groupState, rangeIndices } from '../lib/multiselect.js';
```

`openUnownedPick()` 尾端 `refreshUpState();` 前加一行 `upAnchor = null;`（重新渲染錨點歸零）。

Task 2 的 `#unowned-pick-body` click 委派整段替換為：

```js
let upAnchor = null; // Shift 範圍錨點＝最後一次非 Shift 點擊的單項扁平 index
let upShiftHint = false; // 點 label 文字時瀏覽器轉發給 input 的合成 click 可能遺失 shiftKey，先在 label 層記下
document.querySelector('#unowned-pick-body').addEventListener('click', (ev) => {
  const cb = ev.target;
  if (!(cb instanceof HTMLInputElement)) { upShiftHint = ev.shiftKey; return; }
  const shift = ev.shiftKey || upShiftHint;
  upShiftHint = false;
  if (cb.classList.contains('up-gcb')) {
    for (const item of cb.closest('.up-group').querySelectorAll('input.up-item')) item.checked = cb.checked;
  } else if (shift && upAnchor != null) {
    // 錨點→本次之間整段設成本次點擊後的狀態；錨點不動（Gmail 慣例）
    const items = upItems();
    for (const j of rangeIndices(upAnchor, items.indexOf(cb))) items[j].checked = cb.checked;
  } else {
    upAnchor = upItems().indexOf(cb);
  }
  refreshUpState();
});
```

注意 `let upAnchor` / `let upShiftHint` 宣告在 listener 之前的模組層級（緊鄰這段接線即可）；`openUnownedPick` 在其上方引用 `upAnchor`，`let` 提升到模組載入時已初始化、無 TDZ 問題（`openUnownedPick` 只在點擊後才執行）。

- [ ] **Step 2: 測試**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: `# fail 0`

- [ ] **Step 3: Commit**

```bash
git add extension/view/view.js
git commit -m "feat(view): 未擁有 modal Shift 範圍選取"
```

---

### Task 4: 瀏覽器實測

**Files:** 無（驗證 task；發現 bug 才回頭改）。

**Interfaces:**
- Consumes: Task 1-3 全部。
- Produces: 實測結果（回報用；如有修正，獨立 fix commit）。

- [ ] **Step 1: 準備資料**

瀏覽器（可離線：view 頁用 `test/fixtures/` 解析結果餵 localStorage 快取渲染；先到清單頁匯入小清單如 `o=4ZIEPP2m`（3 隻），讓「未擁有」名單夠長）。

- [ ] **Step 2: checklist 逐項驗證**

1. 開啟 modal：全部未勾、群組框全空、「將加入 0，合計 N／上限 12」、加入鈕 disabled。
2. 群組框：點一下整組勾起（標頭 checked）；再點整組取消；手動取消組內一隻 → 標頭變 indeterminate（橫線）。
3. Shift：點 A、Shift+點 E → A–E 全勾；再 Shift+點 C → 錨點 A–C 依 C 點後狀態設定。**分別在勾選框本體與 label 文字上 Shift+點擊**（驗 `upShiftHint` 備援）；跨群組範圍也試一次。
4. 反選：勾 3 隻按反選 → 其餘全勾、原 3 隻取消；群組三態跟著更新。
5. 全選/全不選：群組框與計數同步。
6. 超限擋板照舊：勾超過 12 → 紅字＋加入鈕 disabled；≤12 時可加入，加入後 chips 正確。
7. Shift 點擊拖動不出現文字反白（user-select: none）。
8. 深淺色模式各看一次群組框與標頭排版。

- [ ] **Step 3: 回報**

實測結果整理回報使用者；規格若有落差，依協作流程回寫規格〈實作後變更〉節。
