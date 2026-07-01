# 比較頁同抽數 A/B 軌並排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在比較頁讓同一抽數 N 的 A 軌與 B 軌以子欄並排對照,加「顯示 B 軌」開關(預設關)。

**Architecture:** `merge.js` 增回傳 `numbers`(抽數清單);`view.js renderTable` 由「一列一 position」改為「一列一抽數」,每卡池關時 1 子欄(A)、開時 2 子欄(A|B);表頭在開時多一列 A/B 子標;Find 因格子照帶 `data-*` 且 B 格只在開啟時渲染,自動跟隨開關,不需改。

**Tech Stack:** 原生 ES module、Chrome MV3 擴充、`node:test` + linkedom。

## Global Constraints

- 不改 parser / concurrency / cache / godfat 抓取邏輯。
- 純函式改動須有單元測試;現有 39 測試須全綠。
- 稀有度 class:`rare` / `supa` / `supa_fest` / `uber` / `uber_fest` / `exclusive` / `legend`。
- 不重算種子,B 軌資料沿用抓回的 parser 結果。

---

### Task 1: `merge.js` 增加 `numbers` 回傳

**Files:**
- Modify: `extension/lib/merge.js`
- Test: `test/merge.test.js`

**Interfaces:**
- Produces: `mergeBanners(entries)` 回傳新增 `numbers: number[]`(所有 cell 抽數去重、升冪)。

- [ ] **Step 1: 寫失敗測試**（加到 `test/merge.test.js`）

```js
test('mergeBanners 回傳 numbers（去重、升冪、涵蓋 A/B 抽數）', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: false, cells: new Map([['2A', cell('2A', 'x')], ['1B', cell('1B', 'y')], ['1A', cell('1A', 'z')]]) } };
  assert.deepEqual(mergeBanners([a]).numbers, [1, 2]);
});
```

- [ ] **Step 2: 跑測試確認失敗** — `npm test`,預期新測試 FAIL（`numbers` undefined）。

- [ ] **Step 3: 實作** — 在 `mergeBanners` 回傳前計算並加入:

```js
  const numbers = [...new Set([...byPos.keys()].map((p) => parseInt(p, 10)))].sort((x, y) => x - y);
  return { positions, numbers, anyGuaranteed, byPos };
```

- [ ] **Step 4: 跑測試** — `npm test`,預期全綠(40 pass)。

- [ ] **Step 5: Commit** — `git add extension/lib/merge.js test/merge.test.js && git commit`

---

### Task 2: view.html 加「顯示 B 軌」開關

**Files:**
- Modify: `extension/view/view.html`

**Interfaces:**
- Produces: DOM `#show-b`(checkbox,預設未勾)。

- [ ] **Step 1: 在工具列「模擬保證」欄後加入**（`view.html` 第 24 行 `</label>` 後）:

```html
  <label class="field"><input id="show-b" type="checkbox"> 顯示 B 軌</label>
```

- [ ] **Step 2: Commit**（與 Task 3 一起驗證,可先不 commit,併入 Task 3)

---

### Task 3: `renderTable` 改為一列一抽數 + A/B 子欄 + 動態表頭

**Files:**
- Modify: `extension/view/view.js`（`renderTable`,約 79–138 行）

**Interfaces:**
- Consumes: `merged.numbers`(Task 1)、`#show-b`(Task 2)、既有 `merged.byPos`、`currentParams`、`buildEventUrl`、`GF_ICON`、`esc`。
- Produces: `#grid` 表格;每個資料格帶 `data-pos`(含 A/B)、`data-bi`、`data-r`、`data-n`、`data-pos`,與現況一致;`lastVisibleShorts` 維持「每卡池一項、index=bi」。

- [ ] **Step 1: 抽出單格 HTML 產生器**（放在 `renderTable` 內或其上,取代原本迴圈內的行內組字串）。輸入某抽數 `pos`(如 `'12B'`)、卡池 `e`、欄索引 `bi`,回傳 `<td>` 字串;無資料回空 `<td>`:

```js
function cellHtml(pos, e, bi) {
  const c = merged.byPos.get(pos)?.get(e.banner.id);
  if (!c) return '<td></td>';
  const cls = [c.dupe ? c.dupe.rarity : c.rarity];
  if (c.isNext) cls.push('next');
  if (c.dupe) cls.push('dupe');
  if (pos.endsWith('B')) cls.push('btrack');
  const mainName = c.dupe ? c.dupe.name : c.name;
  const dupeNote = c.dupe ? `<div class="dupe-note">重複稀有 ↪ ${esc(c.dupe.to)}</div>` : '';
  const guarTo = c.guaranteed?.to ? ` ↪ ${esc(c.guaranteed.to)}` : '';
  const guar = c.guaranteed ? `<div class="guar">保證: ${esc(c.guaranteed.name)}${guarTo}</div>` : '';
  const title = c.dupe ? ` title="天然 ${esc(c.name)}（重複）→ 實得 ${esc(c.dupe.name)}"` : '';
  const rr = c.dupe ? c.dupe.rarity : c.rarity;
  return (
    `<td class="${cls.join(' ')}"${title} data-r="${esc(rr)}" data-n="${esc(mainName)}"` +
    ` data-pos="${esc(pos)}" data-bi="${bi}">${esc(mainName)}${dupeNote}${guar}</td>`
  );
}
```

- [ ] **Step 2: 重寫 `renderTable` 主體**（merge 之後整段 body/thead 組裝):

```js
function renderTable(entries) {
  const merged = mergeBanners(entries);
  const visible = entries.filter((e) => !hidden.has(e.banner.id));
  lastVisibleShorts = visible.map((e) => e.banner.short);
  const showB = document.querySelector('#show-b').checked;
  const sub = showB ? 2 : 1; // 每卡池子欄數
  const table = document.querySelector('#grid');

  function cellHtml(pos, e, bi) { /* Step 1 內容 */ }

  // 第 1 列：日期（相鄰相同者跨欄合併，colspan × 子欄數）
  const dateRow = [`<th class="pos" rowspan="${showB ? 3 : 2}">位置</th>`];
  for (let i = 0; i < visible.length; ) {
    const d = visible[i].banner.date;
    let span = 1;
    while (i + span < visible.length && visible[i + span].banner.date === d) span++;
    dateRow.push(`<th class="date" colspan="${span * sub}">${esc(d) || '—'}</th>`);
    i += span;
  }

  // 第 2 列：簡稱（colspan=子欄數）＋在 godfat 開啟
  const { useCount, forceGuaranteed } = currentParams();
  const nameRow = [];
  for (const e of visible) {
    const link = buildEventUrl({ seed, event: e.banner.id, count: useCount, lang, last, forceGuaranteed });
    nameRow.push(
      `<th colspan="${sub}" title="${esc(e.banner.name)}">${esc(e.banner.short)}` +
        `<a class="gf" href="${link}" target="_blank" title="在 godfat 開啟此卡池">${GF_ICON}</a></th>`
    );
  }

  // 第 3 列（僅 showB）：A / B 子標
  const headRows = [`<tr>${dateRow.join('')}</tr>`];
  if (showB) {
    const abRow = visible.map(() => '<th class="ab">A</th><th class="ab btrack">B</th>').join('');
    headRows.push(`<tr>${nameRow.join('')}</tr>`);
    headRows.push(`<tr class="hend">${abRow}</tr>`);
  } else {
    headRows.push(`<tr class="hend">${nameRow.join('')}</tr>`);
  }

  const out = [`<thead>${headRows.join('')}</thead>`];
  const body = [];
  for (const n of merged.numbers) {
    const posLabel = showB ? String(n) : `${n}A`;
    const tds = [`<td class="pos">${posLabel}</td>`];
    for (let bi = 0; bi < visible.length; bi++) {
      const e = visible[bi];
      tds.push(cellHtml(`${n}A`, e, bi));
      if (showB) tds.push(cellHtml(`${n}B`, e, bi));
    }
    body.push(`<tr>${tds.join('')}</tr>`);
  }
  out.push(`<tbody>${body.join('')}</tbody>`);
  table.innerHTML = out.join('');
  applyFind();
}
```

- [ ] **Step 3: 綁定開關** — 在既有事件綁定區(約 323 行 `#count` 監聽附近)加:

```js
document.querySelector('#show-b').addEventListener('change', () => renderTable(currentEntries));
```

其中 `currentEntries` 需可取用:在 `load()` 內 `renderTable(entries)` 前,加 `currentEntries = entries;`,並於模組頂層宣告 `let currentEntries = [];`。（`renderToggles` 內既有的 `renderTable(entries)` 亦改用同一參照或維持 entries 皆可。）

- [ ] **Step 4: 手動驗證(見 Task 5)**,再 Commit — `git add extension/view/view.html extension/view/view.js && git commit`

---

### Task 4: view.css — B 子欄底色、子欄/卡池分隔線、第三列表頭 sticky

**Files:**
- Modify: `extension/view/view.css`

- [ ] **Step 1: 加入樣式**（附加到檔尾）:

```css
/* A/B 子欄 */
thead tr:nth-child(3) th { top: 52px; box-shadow: 0 1px 0 var(--border); }
thead th.hend { box-shadow: 0 1px 0 var(--border); }
thead th.ab { text-align: center; font: 11px/1 var(--mono); color: var(--muted); font-weight: 600; }
/* B 軌整欄淺底（不覆蓋稀有度色：用半透明疊加） */
tbody td.btrack { box-shadow: inset 0 0 0 9999px rgba(0, 0, 0, .035); }
tbody tr:hover td.btrack { box-shadow: inset 0 0 0 9999px rgba(59, 91, 219, .10), inset 0 0 0 9999px rgba(0, 0, 0, .035); }
/* 每個卡池（每 2 子欄）之間較粗分隔線，B 子欄右邊界即卡池邊界 */
tbody td.btrack, thead th.ab.btrack { border-right: 2px solid var(--border); }
```

- [ ] **Step 2: 覆寫既有第二列 sticky 底線依賴** — 原 CSS 第 122 行
  `thead tr:nth-child(2) th { box-shadow: 0 1px 0 var(--border); }` 會讓 B 軌開啟時第二列
  (簡稱列)誤畫底線。改為僅由 `.hend` 提供底線:把該規則的 `box-shadow` 移除(保留 `top: 26px`):

```css
thead tr:nth-child(2) th { top: 26px; }
```

- [ ] **Step 3: Commit** — `git add extension/view/view.css && git commit`

---

### Task 5: 手動驗證 + README backlog 勾除

**Files:**
- Modify: `README.md`(backlog 第 6 項移除「B 軌顯示切換」字樣)

- [ ] **Step 1: 單元測試** — `npm test`,預期全綠(40 pass, 0 fail)。

- [ ] **Step 2: 瀏覽器手動驗證** — `chrome://extensions` 載入未封裝 `extension/`,於 godfat 種子頁選多卡池 →「載入比較」:
  - 開關**關**:每卡池一欄,列為 `1A、2A…`(只 A 軌),與改動前 A 軌內容一致。
  - 開關**開**:每卡池拆 `A|B` 子欄,同一列同抽數 A/B 並排;B 子欄有淺底、卡池間有較粗分隔線;表頭三列對齊、捲動時三列皆凍結。
  - Find:開關關時搜不到 B;開關開時可搜到 B 軌貓,矩陣出現 `*B` 列且點擊可跳轉。
  - 模擬保證下拉切換後,保證格在 A、B 子欄皆正確顯示。

- [ ] **Step 3: 更新 README** — backlog 第 6 項移除已完成的「B 軌顯示切換」。

- [ ] **Step 4: Commit** — `git add README.md && git commit`

---

## Self-Review

- **Spec coverage:** 資料模型(Task 1)、版面/子欄(Task 3)、表頭(Task 3)、每格渲染(Task 3 `cellHtml`)、開關(Task 2+3)、Find 跟隨(Task 3 保留 `data-*`+B 僅開啟渲染,無需改 Find)、測試(Task 1+5)、CSS 視覺(Task 4)——皆有對應。
- **Placeholder scan:** 無 TBD;所有程式碼步驟含實際內容。
- **Type consistency:** `numbers`、`cellHtml(pos, e, bi)`、`currentEntries`、`data-bi`/`data-pos` 命名跨任務一致;`btrack`/`hend`/`ab` class 在 Task 3(HTML)與 Task 4(CSS)一致。
