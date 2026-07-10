# 清單頁篩選/圖片/型態切換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清單頁加篩選列（稀有度/擁有三態/佔位名）、貓咪圖示（外連 BC 資訊網）、型態（Base~Ultra）全域切換。

**Architecture:** catlist.js 新增有序型態表 `parseCatForms`，loader 快取升 v2 鍵（`bcsp:cats2:`）且回傳 `{catMap, formsById}`；UI 全部落在 `extension/owned/`。圖片以 `<img>` 外連（不需 host_permissions），lazy＋onerror 退純文字。

**Tech Stack:** Vanilla JS（ES modules）、node:test + linkedom、Chrome MV3。

**規格：** `docs/superpowers/specs/2026-07-10-owned-gallery-design.md`

## Global Constraints

- 分支 `feat/owned-gallery`（基於 feat/owned-ui，已 checkout）；完成後停在分支等使用者測試，不合併、不 push。
- Commit 格式 `type(scope): 中文摘要`，**不加 Co-Authored-By trailer**；每 commit 前 `npm test` 全綠（`npm test 2>&1 | grep -aE 'pass |fail '` → `# fail 0`）。
- 快取格式變更必換鍵版本（v1 教訓）：新鍵 `bcsp:cats2:${lang}`，並清 v1 孤兒鍵。
- 圖片網址規則（2026-07-10 實測）：`https://battlecatsinfo.github.io/img/u/{godfat貓id − 1}/{型態索引}.png`，型態索引 0=基本/1=二階/2=三階/3=四階，無該階回 404。
- 型態名有序來源：godfat /cats title 第一行 `*名A | 名B | 名C`（依階段排序）。
- 篩選為顯示過濾不持久化；型態選擇持久化（`bcsp:owned-form`，入 SETTINGS_KEYS）。
- 統計與進度列不受篩選影響（恆為全量）。

---

### Task 1: catlist 型態表＋loader v2

**Files:**
- Modify: `extension/lib/catlist.js`
- Modify: `extension/lib/catlist-loader.js`
- Modify: `extension/lib/cache.js:60`（SETTINGS_KEYS）
- Modify: `extension/view/view.js`（loadCatList 呼叫端，檔尾）
- Modify: `extension/owned/owned.js`（loadCatList 呼叫端，init IIFE）
- Test: `test/catlist.test.js`、`test/catlist-loader.test.js`、`test/cache.test.js`

**Interfaces:**
- Produces: `parseCatForms(doc) → Map<number, string[]>`（有序型態名）；`serializeForms(map) → obj`／`deserializeForms(obj) → Map`；`loadCatList(lang, deps?) → Promise<{catMap: Map, formsById: Map} | null>`（**回傳形狀變更**）；SETTINGS_KEYS 含 `bcsp:owned-form`。

- [ ] **Step 1: 寫失敗測試**

`test/catlist.test.js` import 加 `parseCatForms, serializeForms, deserializeForms`，末尾加：

```js
test('parseCatForms：有序型態名（title 第一行序＝階段序＝圖檔序）', () => {
  const forms = parseCatForms(document);
  assert.deepEqual(forms.get(1), ['貓咪', '健美貓', '摩西根貓']);
  assert.deepEqual(forms.get(817), ['817-1']); // 佔位名貓單元素
  assert.equal(forms.get(449).length, 3); // 宮本武藏三階（與圖檔 0–2 對齊）
  assert.equal(forms.size, 793);
});

test('serializeForms/deserializeForms 往返等價（鍵回 number）', () => {
  const forms = parseCatForms(document);
  const back = deserializeForms(JSON.parse(JSON.stringify(serializeForms(forms))));
  assert.equal(back.size, forms.size);
  assert.deepEqual(back.get(1), forms.get(1));
});
```

`test/catlist-loader.test.js` 全面改為 v2 形狀——HTML 常數與 deps 不變，四個測試斷言改為：

```js
test('當日快取直接用、不 fetch', async () => {
  const cached = JSON.stringify({ date: '2026-07-09', names: { 貓Y: ['uber', 9] }, forms: { 9: ['貓Y'] } });
  const storage = makeStorage({ 'bcsp:cats2:tw': cached });
  const out = await loadCatList('tw', deps(storage, async () => { throw new Error('不應呼叫'); }));
  assert.deepEqual(out.catMap.get('貓Y'), { rarity: 'uber', id: 9 });
  assert.deepEqual(out.formsById.get(9), ['貓Y']);
});

test('過期快取 → 重抓並存回 v2 鍵、清 v1 孤兒', async () => {
  const cached = JSON.stringify({ date: '2026-07-08', names: { 貓Y: ['uber', 9] }, forms: {} });
  const storage = makeStorage({ 'bcsp:cats2:tw': cached, 'bcsp:cats:tw': '{}' });
  const out = await loadCatList('tw', deps(storage, async () => ({ ok: true, text: async () => HTML })));
  assert.deepEqual(out.catMap.get('貓X'), { rarity: 'uber', id: 524 });
  assert.deepEqual(out.formsById.get(524), ['貓X']);
  assert.ok(storage.store.get('bcsp:cats2:tw').includes('2026-07-09'));
  assert.ok(!storage.store.has('bcsp:cats:tw')); // v1 孤兒清除
});

test('抓取失敗 → 過期快取頂著；無快取 → null', async () => {
  const boom = async () => { throw new Error('offline'); };
  const cached = JSON.stringify({ date: '2026-07-01', names: { 貓Y: ['uber', 9] }, forms: {} });
  const out = await loadCatList('tw', deps(makeStorage({ 'bcsp:cats2:tw': cached }), boom));
  assert.equal(out.catMap.get('貓Y').id, 9);
  assert.equal(await loadCatList('tw', deps(makeStorage(), boom)), null);
});

test('解析不到（結構變動）→ 過期快取頂著', async () => {
  const cached = JSON.stringify({ date: '2026-07-01', names: { 貓Y: ['uber', 9] }, forms: {} });
  const empty = async () => ({ ok: true, text: async () => '<p>改版了</p>' });
  const out = await loadCatList('tw', deps(makeStorage({ 'bcsp:cats2:tw': cached }), empty));
  assert.equal(out.catMap.get('貓Y').id, 9);
});
```

（makeStorage 需補 `removeItem: (k) => store.delete(k)` 與 `has` 用 `store.has`——依既有 helper 實況調整。）

`test/cache.test.js` 的 clearCache 測試：store 加 `['bcsp:owned-form', '"2"'],`，期望保留清單同步加 `'bcsp:owned-form'`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -aE 'pass |fail '` → fail > 0

- [ ] **Step 3: 實作**

`extension/lib/catlist.js` 末尾加：

```js
// 有序型態名（title 第一行依階段排序；索引＝BC 資訊網圖檔索引：0基本/1二階/2三階/3四階）
export function parseCatForms(doc) {
  const forms = new Map();
  for (const group of doc.querySelectorAll('.cats_by_rarity')) {
    for (const a of group.querySelectorAll('a[href*="/cats/"]')) {
      const id = Number((a.getAttribute('href') || '').match(/\/cats\/(\d+)/)?.[1]);
      if (!id || forms.has(id)) continue;
      const list = (a.getAttribute('title') || '').split('\n')[0]
        .replace(/\*/g, '').split('|').map((s) => s.trim()).filter(Boolean);
      if (list.length) forms.set(id, list);
    }
  }
  return forms;
}

export function serializeForms(map) {
  return Object.fromEntries(map);
}

export function deserializeForms(obj) {
  return new Map(Object.entries(obj || {}).map(([id, list]) => [Number(id), list]));
}
```

`extension/lib/catlist-loader.js`：import 加 `parseCatForms, serializeForms, deserializeForms`；函式體改為（**v2 鍵、回傳 {catMap, formsById}**）：

```js
  const key = `bcsp:cats2:${lang}`; // v2：值含 forms（格式變更必換鍵版本）
  let cached = null;
  try {
    const raw = JSON.parse(storage?.getItem(key) || 'null');
    if (raw?.names) {
      cached = { catMap: deserializeCatList(raw.names), formsById: deserializeForms(raw.forms) };
      if (raw.date === today) return cached; // 當日已抓過 → 不重抓
    }
  } catch { /* 壞值 → 重抓 */ }
  try {
    const res = await fetchFn(buildCatsUrl(lang));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = parseDoc(await res.text());
    const map = parseCatList(doc);
    if (!map.size) return cached; // 結構變動解析不到 → 用過期快取頂著
    const forms = parseCatForms(doc);
    try {
      storage?.setItem(key, JSON.stringify({ date: today, names: serializeCatList(map), forms: serializeForms(forms) }));
      storage?.removeItem(`bcsp:cats:${lang}`); // v1 孤兒鍵順手釋放
    } catch { /* 配額滿 → 只用不存 */ }
    return { catMap: map, formsById: forms };
  } catch {
    return cached; // 離線/失敗 → 過期快取或 null
  }
```

`extension/lib/cache.js`：SETTINGS_KEYS 加 `'bcsp:owned-form'`。

`extension/view/view.js` 檔尾呼叫端（view 只用 catMap）：

```js
  loadCatList(lang).then((m) => {
    if (!m) return;
    catMap = m.catMap;
    applyFind();
    applyOwnedMarks();
    updateAddUnowned();
  });
```

`extension/owned/owned.js` init IIFE：`const catMap = await loadCatList(lang);` 改為

```js
  const data = await loadCatList(lang);
  if (!data) { /* 原離線訊息不變 */ }
  byId = catsById(data.catMap);
  formsById = data.formsById;
```

並把 `const formsById = new Map();` 改 `let formsById = new Map();`、**刪除** init 內手工組 formsById 的迴圈；`li.dataset.forms` 改由 `(formsById.get(id) || [name]).join('|')` 組（Task 2 會重寫該行，此步先保行為等價）。

- [ ] **Step 4: 跑測試全綠** → `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add extension/lib/catlist.js extension/lib/catlist-loader.js extension/lib/cache.js \
  extension/view/view.js extension/owned/owned.js \
  test/catlist.test.js test/catlist-loader.test.js test/cache.test.js
git commit -m "feat(lib): /cats 有序型態表與快取 v2（loader 回傳含 formsById）"
```

---

### Task 2: 型態全域切換＋卡片圖示

**Files:**
- Modify: `extension/owned/owned.html`、`extension/owned/owned.js`、`extension/owned/owned.css`

**Interfaces:**
- Consumes: `formsById`（Task 1）。
- Produces: `#form-sel`（型態選擇器）、`iconUrl(id, fi)`、`formIndexFor(id)`、`applyForm()`——Task 3 不依賴這些，但共存於同檔。

- [ ] **Step 1: owned.html** `#controls` 內 `#search` 之後加：

```html
  <label class="field">型態
    <select id="form-sel">
      <option value="0">基本</option>
      <option value="1">二階</option>
      <option value="2">三階</option>
      <option value="3">四階</option>
    </select>
  </label>
```

- [ ] **Step 2: owned.js**

常數區（`RARITY_ORDER` 附近）加：

```js
// 貓咪圖示：BC 資訊網（https://battlecatsinfo.github.io，圖檔編號＝godfat 貓 id − 1）
// 型態索引 0基本/1二階/2三階/3四階；無該階 404 → onerror 退純文字
const ICON_BASE = 'https://battlecatsinfo.github.io/img/u';
const FORM_KEY = 'bcsp:owned-form';
const iconUrl = (id, fi) => `${ICON_BASE}/${id - 1}/${fi}.png`;
// 每貓實際顯示階 = min(全域選擇, 該貓最高階)
function formIndexFor(id) {
  const n = formsById.get(id)?.length || 1;
  return Math.min(Number($('#form-sel').value) || 0, n - 1);
}
```

`renderGroups` 的 li 內容改為（tooltip 列全部型態名）：

```js
    for (const [id, { name }] of cats) {
      const li = document.createElement('li');
      li.dataset.id = id;
      const forms = formsById.get(id) || [name];
      li.dataset.forms = forms.join('|');
      if (owned.ids.has(id)) li.className = 'owned';
      const fi = formIndexFor(id);
      li.innerHTML =
        `<label title="${esc(forms.join(' | '))}"><input type="checkbox" value="${id}"${owned.ids.has(id) ? ' checked' : ''}>` +
        ` <img class="icon" loading="lazy" alt="" src="${iconUrl(id, fi)}">` +
        ` <span class="nm">${esc(forms[fi] || name)}</span></label>` +
        `<a href="${buildCatUrl(id, lang)}" target="_blank" title="在 godfat 查看">🐾</a>`;
      ul.appendChild(li);
    }
```

事件掛載區加（型態切換就地更新，不重繪分組——保留收合與捲動）：

```js
function applyForm() {
  localStorage.setItem(FORM_KEY, $('#form-sel').value);
  for (const li of document.querySelectorAll('#groups li')) {
    const id = Number(li.dataset.id);
    const forms = formsById.get(id);
    if (!forms) continue;
    const fi = formIndexFor(id);
    li.querySelector('.nm').textContent = forms[fi] || forms[0];
    const img = li.querySelector('img.icon');
    img.hidden = false; // 換階重試（前一階可能 404 被隱藏）
    img.src = iconUrl(id, fi);
  }
}
$('#form-sel').addEventListener('change', applyForm);
try { $('#form-sel').value = localStorage.getItem(FORM_KEY) || '0'; } catch { /* 無 localStorage → 預設 */ }

// 圖 404／外站掛 → 隱藏圖留文字（error 不冒泡，capture 委派）
$('#groups').addEventListener('error', (ev) => {
  if (ev.target?.matches?.('img.icon')) ev.target.hidden = true;
}, true);
```

注意：`#form-sel` 初值設定要在 init IIFE 呼叫 `renderGroups()` **之前**生效（上列程式碼在模組頂層事件區即可，IIFE 在檔尾）。

- [ ] **Step 3: owned.css**

```css
#groups li .icon { width: 42px; height: 32px; object-fit: cover; border-radius: 3px; flex: none; background: var(--bar-track); }
```

並把 `#groups ul` 的 `minmax(200px, 1fr)` 改 `minmax(230px, 1fr)`、`#groups li label` 的 `padding: 4px 8px` 改 `padding: 3px 8px 3px 6px`。

- [ ] **Step 4: 測試＋瀏覽器驗證**

`npm test` → `# fail 0`。瀏覽器（可用 `python3 -m http.server` 服務 repo、餵 fixture 目錄快取，圖片需連線）：
1. 圖示顯示（貓咪＝白貓圖）；lazy：捲到才載。
2. 型態切「三階」→ 貓咪變「摩西根貓」＋圖變；武藏顯示第三階；只有一階的貓不變。
3. 切「四階」→ 無四階的貓停在最高階；有 404 的圖消失只留名字。
4. 重新整理 → 型態選擇保留（bcsp:owned-form）。
5. tooltip 顯示「貓咪 | 健美貓 | 摩西根貓」。

- [ ] **Step 5: Commit**

```bash
git add extension/owned/
git commit -m "feat(owned): 貓咪圖示與型態（Base~Ultra）全域切換"
```

---

### Task 3: 篩選列（稀有度／擁有三態／佔位名）

> ※實作後正名：「佔位名」＝「召喚」（編號單位實為貓咪附帶的召喚屬性，非未譯名貓）。
> 本 task 的程式碼區塊保留當時原文；實際識別字已改 `SUMMON_RE`／`#summon-state`，見文末〈實作後變更〉。

**Files:**
- Modify: `extension/owned/owned.html`、`extension/owned/owned.js`、`extension/owned/owned.css`

**Interfaces:**
- Consumes: `formsById`、既有 `applyFilters` 呼叫點（search input、storage handler、checkbox change、renderGroups 尾端）。
- Produces: 重寫版 `applyFilters()`；`#own-state`（取代 `#only-unowned`）。

- [ ] **Step 1: owned.html**

`#controls` 裡的 `<label class="field"><input id="only-unowned" …> 只看未擁有</label>` **整個替換**為：

```html
  <label class="field">擁有
    <select id="own-state">
      <option value="">全部</option>
      <option value="1">已擁有</option>
      <option value="0">未擁有</option>
    </select>
  </label>
  <label class="field">佔位名
    <select id="ph-state" title="尚未實裝、只有編號的貓（如 817-1）">
      <option value="">顯示</option>
      <option value="hide">隱藏</option>
      <option value="only">只看</option>
    </select>
  </label>
```

`#controls` 與 `#import-box` 之間加稀有度 chips 列：

```html
<div id="rarity-filter" role="group" aria-label="稀有度篩選"></div>
```

- [ ] **Step 2: owned.js**

`applyFilters` 重寫（AND 關係；稀有度藏整組）：

```js
const PLACEHOLDER_RE = /^\d+[-_]\d+$/; // 佔位名（尚無譯名的未來貓）
let rarityFilter = ''; // '' = 全部

function applyFilters() {
  const q = $('#search').value.trim();
  const ownState = $('#own-state').value; // ''/1/0
  const phState = $('#ph-state').value;   // ''/hide/only
  for (const det of document.querySelectorAll('#groups details')) {
    det.hidden = !!rarityFilter && !det.classList.contains(`g-${rarityFilter}`);
  }
  for (const li of document.querySelectorAll('#groups li')) {
    const id = Number(li.dataset.id);
    const isPh = PLACEHOLDER_RE.test((formsById.get(id) || [''])[0]);
    const okQ = !q || li.dataset.forms.includes(q);
    const okOwn = !ownState || (ownState === '1') === owned.ids.has(id);
    const okPh = !phState || (phState === 'only') === isPh;
    li.hidden = !(okQ && okOwn && okPh);
  }
  if (q) for (const det of document.querySelectorAll('#groups details')) det.open = true;
}
```

稀有度 chips（事件掛載區；「全部」＋六稀有度，單選高亮）：

```js
{
  const rf = $('#rarity-filter');
  rf.innerHTML = '<button type="button" class="on" data-r="">全部</button>' +
    RARITY_ORDER.map(([r, label]) => `<button type="button" data-r="${r}">${label}</button>`).join('');
  rf.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-r]');
    if (!btn) return;
    rarityFilter = btn.dataset.r;
    for (const b of rf.querySelectorAll('button')) b.classList.toggle('on', b === btn);
    applyFilters();
  });
}
```

既有呼叫點替換：`$('#only-unowned')` 的兩處——change 監聽改成

```js
$('#own-state').addEventListener('change', applyFilters);
$('#ph-state').addEventListener('change', applyFilters);
```

checkbox change handler 內 `if ($('#only-unowned').checked) applyFilters();` 改 `if ($('#own-state').value) applyFilters();`。全檔 grep 確認 `only-unowned` 零殘留。

- [ ] **Step 3: owned.css**

```css
#rarity-filter { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 16px 10px; }
#rarity-filter button { height: 26px; padding: 0 10px; font-size: 12px; border-radius: 999px; color: var(--muted); }
#rarity-filter button.on { color: var(--accent); border-color: var(--accent); background: var(--accent-weak); font-weight: 600; }
```

- [ ] **Step 4: 測試＋瀏覽器驗證**

`npm test` → `# fail 0`。瀏覽器：
1. 點「超激稀有」chip → 只剩超激分組；「全部」還原。
2. 擁有=未擁有＋稀有度=傳說 → AND 生效；統計/進度列數字不變（全量）。
3. 佔位名=只看 → 只剩 817-1 這類；=隱藏 → 消失。
4. 搜尋與各篩選疊加正常；清空搜尋不弄壞 chips 狀態。

- [ ] **Step 5: Commit**

```bash
git add extension/owned/
git commit -m "feat(owned): 篩選列——稀有度 chips、擁有狀態三態、佔位名顯示控制"
```

---

### Task 4: 文件

**Files:**
- Modify: `README.md`

- [ ] **Step 1**: 「使用」第 6 項（擁有清單）補：型態切換、圖示、篩選列三句；「重要實作細節」補一則：

```markdown
- **貓咪圖示外連 BC 資訊網**（battlecatsinfo.github.io，圖檔編號＝godfat 貓 id − 1、型態索引 0–3）：lazy 載入、圖缺或站掛自動退回純文字，不影響清單功能。感謝 BC 資訊網整理的素材。
```

「對 godfat 的禮貌性」不變（圖片不打 godfat）。

- [ ] **Step 2**: `npm test` → `# fail 0`；Commit：

```bash
git add README.md
git commit -m "docs: 清單頁篩選/圖示/型態切換說明與圖片出處"
```

---

## 完成後

1. `npm test` 全綠＋各 Task 瀏覽器驗證跑過。
2. 停在 `feat/owned-gallery` 等使用者驗收（連同 feat/owned-ui 的介面一起看）；不合併、不 push。

## 實作後變更（2026-07-10～11 驗收期間）

4 個 Task 依上文完成（commit 7d9a18c／af88a3b／8d898b9／d411d99）後，驗收期間追加以下變更；
與上文程式碼或措辭不一致處，以本節與實際程式碼為準：

1. **「佔位名」正名「召喚」**（a83b104）：使用者對照遊戲確認，`/^\d+[-_]\d+$/` 命中的
   編號單位（817-1 等 21 隻）是**貓咪附帶的召喚屬性單位**，不是「尚無譯名的未來貓」。
   Task 3 的 `PLACEHOLDER_RE`／`#ph-state`／UI「佔位名」已全面改為 `SUMMON_RE`／
   `#summon-state`／「召喚」；判定規則與篩選行為不變。
2. **缺圖改「往上一階找」**（c196794）：「遠古的蛋」系列（24 隻）BC 資訊網僅存孵化後
   （第三型態）的圖，0/1.png 皆 404。Task 2 的 error handler 從「直接隱圖留文字」改為
   `data-fi` 逐階遞增重試至該貓最高階，全缺才隱圖；Task 4 的 README 文字同步改寫。
   副作用「蛋名配孵化圖」經使用者選項確認接受。
3. **新增 JSON 檔案備份**（2ba3bd5）：使用者手動輸入全清單後要求防遺失——
   lib 新增 `serializeBackup`／`parseBackup`（kind 標記驗明正身、id 清洗，含單元測試）；
   「匯出備份檔」下載 JSON、「匯入備份檔」與 o 碼匯入共用取代／合併確認
   （抽出 `showImportPreview` 共用）。chrome.storage.sync 經評估後使用者決定不做。
4. **前端視覺收尾**（222294c）：`.field select` 對齊 30px 輸入框樣式、稀有度 chips 加
   分組標題同款色點、「在 godfat 開啟清單」`margin-left:auto` 推右與篩選分群。

測試自 122 增至 123（parseBackup 一組）。
