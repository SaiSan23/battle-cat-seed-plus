# 格子選單與規劃等待狀態 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主表左鍵點格改為彈出選單(位置目標/貓目標/複製貓名),右鍵維持瀏覽器預設;規劃路線加「規劃中…」等待狀態。

**Architecture:** 純 view 層改動:單一浮層 `#cell-menu` 以 fixed 定位在點擊座標,動態產生三個選單項;`runPlan` 以 `setTimeout(0)` 包裝讓等待狀態先重繪。`route.js` 不動。

**Tech Stack:** 原生 DOM、`navigator.clipboard`。無新依賴。

## Global Constraints

- `route.js` 純函式不動;既有 59 測試不修改且需全綠。
- 右鍵不攔截(不加 `contextmenu` handler)。
- Find 矩陣點擊維持跳轉,不加選單。
- 選單關閉時機:點選單外、Esc、`#table-wrap` 捲動、執行任一選單項後。

---

### Task 1: 格子選單

**Files:**
- Modify: `extension/view/view.html`、`extension/view/view.js`、`extension/view/view.css`

**Interfaces:**
- Consumes: 既有 `routeTargets`、`toggleCellTarget(bid,pos,name)`、`catAccept(name)`、`renderTargetChips()`、`renderTable(currentEntries)`、格子的 `data-bid`/`data-pos`/`data-n`。
- Produces: `toggleCatTarget(name)`、`openCellMenu(td,x,y)`、`closeCellMenu()`;DOM `#cell-menu`。

- [ ] **Step 1: HTML 加選單容器** — `extension/view/view.html`,在 `#route-popup` 之後加:

```html
<div id="cell-menu" hidden></div>
```

- [ ] **Step 2: view.js 加貓目標切換與選單邏輯** — 在 `renderTargetChips()` 定義之後加:

```js
function toggleCatTarget(name) {
  const id = `cat:${name}`;
  if (routeTargets.has(id)) routeTargets.delete(id);
  else routeTargets.set(id, { id, kind: 'cat', label: name, accept: catAccept(name) });
  renderTargetChips();
  renderTable(currentEntries);
}

// ── 格子選單（左鍵開啟；右鍵不攔截維持瀏覽器預設） ──
const cellMenu = document.querySelector('#cell-menu');
let menuCtx = null; // { bid, pos, name }

function closeCellMenu() { cellMenu.hidden = true; menuCtx = null; }

function openCellMenu(td, x, y) {
  menuCtx = { bid: td.getAttribute('data-bid'), pos: td.getAttribute('data-pos'), name: td.getAttribute('data-n') };
  const hasCell = routeTargets.has(`cell:${menuCtx.bid}|${menuCtx.pos}`);
  const hasCat = routeTargets.has(`cat:${menuCtx.name}`);
  cellMenu.innerHTML =
    `<button data-act="cell">${hasCell ? '移除此位置目標' : '加入此位置目標'}</button>` +
    `<button data-act="cat">${hasCat ? '移除此貓目標' : '加入此貓目標（所有出現）'}</button>` +
    `<button data-act="copy">複製貓咪名稱</button>`;
  cellMenu.hidden = false;
  // 先顯示取得尺寸再定位（防超出視窗右/下緣）
  cellMenu.style.left = `${Math.min(x, window.innerWidth - cellMenu.offsetWidth - 8)}px`;
  cellMenu.style.top = `${Math.min(y, window.innerHeight - cellMenu.offsetHeight - 8)}px`;
}

cellMenu.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn || !menuCtx) return;
  const { bid, pos, name } = menuCtx;
  const act = btn.getAttribute('data-act');
  if (act === 'cell') toggleCellTarget(bid, pos, name);
  else if (act === 'cat') toggleCatTarget(name);
  else if (act === 'copy') navigator.clipboard?.writeText(name).catch(() => {});
  closeCellMenu();
});
```

- [ ] **Step 3: 改 #grid 點擊綁定** — 把既有:

```js
document.querySelector('#grid').addEventListener('click', (ev) => {
  const td = ev.target.closest('td[data-bid]');
  if (!td) return;
  toggleCellTarget(td.getAttribute('data-bid'), td.getAttribute('data-pos'), td.getAttribute('data-n'));
});
```

改為:

```js
document.querySelector('#grid').addEventListener('click', (ev) => {
  const td = ev.target.closest('td[data-bid]');
  if (!td) { closeCellMenu(); return; }
  openCellMenu(td, ev.clientX, ev.clientY);
});
```

並在其後加關閉綁定:

```js
document.addEventListener('click', (ev) => {
  if (!cellMenu.hidden && !ev.target.closest('#cell-menu') && !ev.target.closest('#grid td[data-bid]')) closeCellMenu();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeCellMenu(); });
document.querySelector('#table-wrap').addEventListener('scroll', closeCellMenu);
```

- [ ] **Step 4: CSS** — `extension/view/view.css` 檔尾加:

```css
/* 格子選單 */
#cell-menu { position: fixed; z-index: 30; display: flex; flex-direction: column; min-width: 190px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--rc);
  box-shadow: 0 6px 24px rgba(0, 0, 0, .18); padding: 4px; }
#cell-menu[hidden] { display: none; }
#cell-menu button { border: none; background: none; text-align: left; font: inherit; padding: 7px 10px;
  border-radius: 4px; cursor: pointer; color: var(--text); white-space: nowrap; }
#cell-menu button:hover { background: var(--accent-weak); color: var(--accent); }
```

- [ ] **Step 5: 驗證 + Commit** — `node --check extension/view/view.js`;瀏覽器手動:左鍵開選單、三項行為、加入↔移除文字切換、Esc/外點/捲動關閉、右鍵為瀏覽器預設、複製貓名成功。
  `git add extension/view/ && git commit -m "feat(view): 格子左鍵選單（位置/貓目標、複製貓名）"`

---

### Task 2: 規劃等待狀態 + 文案

**Files:**
- Modify: `extension/view/view.js`(`runPlan`)、`extension/view/view.html`(`#route-hint`)、`README.md`

**Interfaces:**
- Consumes: 既有 `runPlan` / `renderPlanList` / `planRoutes`。

- [ ] **Step 1: `runPlan` 等待包裝** — 整個函式改為:

```js
function runPlan() {
  const btn = document.querySelector('#plan-route');
  btn.disabled = true;
  btn.textContent = '規劃中…';
  setTimeout(() => { // 先讓瀏覽器重繪等待狀態，再跑同步計算
    try {
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
    } catch (err) {
      document.querySelector('#route-popup').hidden = false;
      document.querySelector('#route-body').innerHTML = `<div class="err">${esc(err.message)}</div>`;
    } finally {
      btn.textContent = '規劃路線';
      btn.disabled = routeTargets.size === 0;
    }
  }, 0);
}
```

- [ ] **Step 2: 提示文案** — `view.html` 的 `#route-hint` 改為:

```html
  <span id="route-hint" class="hint">點格子開選單加入目標；或用下方 Find 搜貓名後「加入命中」</span>
```

- [ ] **Step 3: README** — 「規劃路線」段第一條改為:

```markdown
   - 點表格格子開**選單**：加入該位置目標、加入該貓目標（所有出現擇一即可）、複製貓咪名稱；或用 Find 搜貓名後按「加入命中」批量加入
```

- [ ] **Step 4: 驗證 + Commit** — `npm test` 全綠(59);`node --check extension/view/view.js`;瀏覽器手動:按規劃後按鈕變「規劃中…」再恢復、超過 12 目標時抽屜顯示錯誤且按鈕恢復。
  `git add extension/view/ README.md && git commit -m "feat(view): 規劃等待狀態；文案更新"`

---

## Self-Review

- **Spec coverage:** 選單三項+動態文字(Task 1 Step 2)、右鍵不攔截(無 contextmenu handler)、關閉時機四種(Task 1 Step 3)、定位防出界(Step 2 openCellMenu)、等待狀態+錯誤處理(Task 2 Step 1)、文案(Task 2 Step 2/3)——皆有對應。
- **Placeholder scan:** 無 TBD;每步含完整程式碼。
- **Type consistency:** `toggleCatTarget(name)`、`openCellMenu(td,x,y)`、`closeCellMenu()`、`menuCtx{bid,pos,name}`、`data-act` 值 `cell|cat|copy` 跨步驟一致;`toggleCellTarget`/`catAccept` 沿用既有簽名。
