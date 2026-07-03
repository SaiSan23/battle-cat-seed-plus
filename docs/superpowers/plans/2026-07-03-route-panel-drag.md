# 路線面板浮動右上、標題列拖曳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 路線方案面板預設右上、標題列可拖曳移動、位置存 localStorage 重載還原。

**Architecture:** 純 view 層:CSS 預設位置改 top、標題列 pointer events 拖曳(沿用 `#find-resize` 模式)、`apply()` 統一夾制與定位、localStorage 存還原。

**Tech Stack:** 原生 DOM pointer events、localStorage。無新依賴。

## Global Constraints

- localStorage 鍵:`bcsp:route-popup-pos` = `{"left": number, "top": number}`;壞值忽略用預設。
- 拖曳起點在 `#route-close` 上時不啟動;click 關閉行為不變。
- 夾制:面板保持在視窗內(邊距 8px、標題列永遠可見)。
- 不動路線邏輯/抽屜內容/Find 抽屜;既有 76 測試全綠。

---

### Task 1: CSS + JS 拖曳與位置記憶

**Files:**
- Modify: `extension/view/view.css`(`#route-popup` 定位、標題列游標)
- Modify: `extension/view/view.js`(拖曳 IIFE,加在 Find 抽屜拖曳 IIFE 之後)

- [ ] **Step 1: CSS 預設右上與游標** — `#route-popup` 的 `bottom: 12px` 改 `top: 12px`;`#route-popup-head` 加 `cursor: grab; touch-action: none;`;新增:

```css
#route-popup-head.dragging { cursor: grabbing; user-select: none; }
```

- [ ] **Step 2: JS 拖曳/夾制/記憶** — `view.js` 在既有「底部抽屜可拖曳調整高度」IIFE 之後加:

```js
// 路線面板：標題列拖曳移動＋位置記憶（超出視窗自動夾回）
(() => {
  const POS_KEY = 'bcsp:route-popup-pos';
  const popup = document.querySelector('#route-popup');
  const head = document.querySelector('#route-popup-head');
  const apply = (left, top) => {
    const w = popup.offsetWidth || 320;
    const headH = head.offsetHeight || 36;
    popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(top, window.innerHeight - headH - 8))}px`;
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
  };
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY));
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) apply(saved.left, saved.top);
  } catch { /* 壞值 → 用預設位置 */ }

  let drag = null; // { dx, dy }：指標與面板左上角的偏移
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#route-close')) return; // 關閉鈕不啟動拖曳
    const r = popup.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
    head.classList.add('dragging');
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    apply(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    head.classList.remove('dragging');
    const r = popup.getBoundingClientRect();
    localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top }));
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);
})();
```

- [ ] **Step 3: 驗證語法與測試** — `node --check extension/view/view.js`;`npm test` 全綠(76)。

- [ ] **Step 4: Commit** — `git add extension/view/ && git commit -m "feat(view): 路線面板浮動右上、標題列拖曳、位置記憶"`

---

### Task 2: 瀏覽器驗證 + README

**Files:**
- Modify: `README.md`(使用說明一行;Backlog 移除已完成的第 9、10 項)

- [ ] **Step 1: 瀏覽器實測(fetch-stub)** — 六情境:
  1. 面板預設出現在**右上**;2. 按標題列拖曳面板跟隨、放開位置保留;
  3. 拖出邊界被夾回(左/上/右/下);4. 重載頁面位置還原;
  5. 點 × 正常關閉(拖曳不干擾 click);6. localStorage 塞 `"not json"` → 預設位置、無錯誤。

- [ ] **Step 2: README** — 「規劃路線」段補:

```markdown
   - 路線方案面板預設浮動右上，**按住標題列可拖曳移動**，位置會記住（重載沿用）
```

Backlog 移除第 9、10 項(拖曳面板、祭典稀有過濾——皆已完成)。

- [ ] **Step 3: Commit** — `git add README.md && git commit -m "docs: 路線面板拖曳說明；backlog 清項"`

---

## Self-Review

- **Spec coverage:** 預設右上(Task 1 Step 1)、拖曳+夾制+記憶(Step 2 `apply`/`POS_KEY`)、關閉鈕排除(pointerdown closest 檢查)、壞值容錯(try/catch + Number.isFinite)、六情境驗證與 README(Task 2)——皆有對應。
- **Placeholder scan:** 無 TBD;程式碼完整。
- **Type consistency:** `POS_KEY`/`apply(left, top)`/`drag{dx,dy}`/`.dragging` 跨步驟一致。
