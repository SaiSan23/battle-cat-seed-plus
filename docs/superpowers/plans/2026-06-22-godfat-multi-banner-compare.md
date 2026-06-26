# godfat 多卡池同頁比較擴充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一個 Chrome/Edge（MV3）瀏覽器擴充，讓使用者在 godfat 種子頁一次勾選多個卡池，於單一頁面以「同抽數位置橫向對齊」方式比較所有卡池（含保證 Uber 與換軌）。

**Architecture:** 擴充以 `host_permissions` 直接抓取 godfat 各卡池頁面（避開 CORS），解析其 HTML 為結構化模型，再依抽數位置合併渲染成一張對齊表格。核心解析／合併為純函式，以 `node:test` ＋ `linkedom` 對真實 godfat HTML fixture 做 TDD；popup／content／view 等 UI 以手動驗收。採「取向 A」：忠實沿用 godfat 的欄位，不自行重算種子。

**Tech Stack:** Vanilla JS（ES modules）、Chrome Manifest V3、`node:test`、`linkedom`（測試環境提供 DOM）。無打包步驟，以 unpacked 方式載入。

## Global Constraints

- 目標瀏覽器：Chrome / Edge 等 Chromium，**Manifest V3**。
- 僅向 `https://bc.godfat.org/*` 取資料；`host_permissions` 限定此網域。
- 抓取 godfat 時**並發上限預設 5**；本次 session 快取 `(seed,event,count)`；不自動定時刷新。
- **不自行重算種子**：所有稀有度／保證／換軌資訊一律來自 godfat。
- 解析以 godfat 真實 HTML fixture 驅動；`parser` 標版本號，改版時優雅降級。
- 純函式（`lib/godfat.js`、`lib/parser.js`、`lib/merge.js`、`lib/concurrency.js`）必須可在 `node:test` 下測試：接受 `Document`／資料物件，不依賴瀏覽器專屬全域。
- 繁體中文 UI 文案。

## 已確認的 godfat DOM 結構（解析依據）

- 事件下拉：`<select id="event_select" name="event">`，內含多個 `<optgroup label="...">`，每個 `<option value="<卡池ID>">` 文字為「`YYYY-MM-DD ~ YYYY-MM-DD: 名稱`」。卡池 ID 形如 `2026-04-24_1047`。
- 種子／數量輸入：`#seed_input`、`#count_input`。
- 抽卡表：頁面唯一 `<table><tbody>`。表頭 `<th>`：`No.` / `Result` / `Guaranteed` / `Alt. result` / `Alt. guaranteed` / `Alt. No.`（`Guaranteed` 與 `Alt. guaranteed` 僅在保證事件卡池出現）。
- 每個抽數位置佔兩個 `<tr>`（score 列＋cat 列），位置標籤儲存格為 `<td id="N{n}A">` / `<td id="N{n}B">`（`rowspan="2"`），內含 `<a>` 文字如 `1A`。
- **貓格**：`<td class="cat ...">`，帶 `onclick="pick('<pos>')"`，其中 `<pos>` 形如 `1A`、`3B`，**直接標明抽數與 A/B 軌**。
  - 稀有度：class 內含 `rare`｜`supa`｜`uber`｜`legend` 其一。
  - 貓名：格內 `span > a` 的**第一個** `<a>` 的 `textContent`（第二個 `<a>` 是 `🐾` 連結，須排除）。
  - 目前位置：class 內含 `next_position`。
  - 空格：class 為 `"cat "`，無 `onclick`、無內容。
- score 列為 `<td class="score ...">`，v1 不需要其內容（可略過）。
- 每條軌道頂端有特殊 `<td colspan="3">` 的 `Backtrack` 列，解析時略過。

> **修訂（執行期發現）**：godfat 的 `Guaranteed`／`Alt. guaranteed` **表頭恆存在但預設整欄空白**，且 godfat **從不自動填入**——它無法判斷哪個卡池真有必中。保證欄純為使用者**模擬**功能：網址加 `force_guaranteed=2/7/11/15` 才填入，保證格為 `td.cat[onclick="pick('<n><A|B>G')"]`（**`G` 字尾**），含貓名與稀有度；換軌落點藏在該格 `<a href>` 的 `seed`/`last`。因此 v1 將保證做成**預設關閉的「模擬保證」下拉**（view），不對任何卡池捏造保證。primary key 一律使用 `pick('<pos>')` 的 `<pos>`。詳見 `test/fixtures/STRUCTURE.md`。

---

## Task 1: 專案骨架與 godfat 網址組裝（含測試工具）

建立可執行的測試環境，並完成第一個純函式 `lib/godfat.js`（網址組裝）。

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `extension/lib/godfat.js`
- Test: `test/godfat.test.js`

**Interfaces:**
- Produces:
  - `buildEventUrl({seed, event, count, lang, last, forceGuaranteed}) -> string`（回傳 `https://bc.godfat.org/?...` 絕對網址；省略的參數不出現在 query；`forceGuaranteed` 對應 `force_guaranteed` 參數，用於讓 godfat 填入保證欄）
  - `parseSeedParamsFromUrl(urlString) -> {seed, event, count, lang, last}|null`（非 godfat 種子頁回傳 `null`；數字欄位轉為 Number）

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "battle-cat-seed-plus",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  },
  "devDependencies": {
    "linkedom": "^0.18.0"
  }
}
```

- [ ] **Step 2: 建立 `.gitignore`**

```
node_modules/
*.log
.DS_Store
```

- [ ] **Step 3: 安裝相依並確認測試器可執行**

Run: `npm install`
Expected: 安裝完成，產生 `node_modules/`、`package-lock.json`，無錯誤。

- [ ] **Step 4: 寫失敗測試 `test/godfat.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventUrl, parseSeedParamsFromUrl } from '../extension/lib/godfat.js';

test('buildEventUrl 組出完整網址且省略空值', () => {
  const url = buildEventUrl({ seed: 2268003930, event: '2026-04-24_1047', count: 50, lang: 'tw' });
  assert.equal(
    url,
    'https://bc.godfat.org/?seed=2268003930&event=2026-04-24_1047&lang=tw&count=50'
  );
});

test('buildEventUrl 帶 last 時包含 last', () => {
  const url = buildEventUrl({ seed: 1, event: 'e', count: 10, lang: 'tw', last: 262 });
  assert.ok(url.includes('last=262'));
});

test('parseSeedParamsFromUrl 解析 godfat 種子頁', () => {
  const p = parseSeedParamsFromUrl(
    'https://bc.godfat.org/?seed=2268003930&last=262&event=2026-04-24_1047&lang=tw&count=300'
  );
  assert.deepEqual(p, { seed: 2268003930, event: '2026-04-24_1047', count: 300, lang: 'tw', last: 262 });
});

test('parseSeedParamsFromUrl 對非 godfat 或無 seed 回傳 null', () => {
  assert.equal(parseSeedParamsFromUrl('https://example.com/?seed=1'), null);
  assert.equal(parseSeedParamsFromUrl('https://bc.godfat.org/cats/1'), null);
});
```

- [ ] **Step 5: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`buildEventUrl is not a function` 或模組找不到）。

- [ ] **Step 6: 實作 `extension/lib/godfat.js`**

```js
// godfat 網址組裝與種子參數解析（純函式）
const GODFAT_ORIGIN = 'https://bc.godfat.org/';
const PARAM_ORDER = ['seed', 'last', 'event', 'lang', 'count'];

export function buildEventUrl({ seed, event, count, lang, last } = {}) {
  const values = { seed, last, event, lang, count };
  const qs = PARAM_ORDER
    .filter((k) => values[k] !== undefined && values[k] !== null && values[k] !== '')
    .map((k) => `${k}=${encodeURIComponent(values[k])}`)
    .join('&');
  return `${GODFAT_ORIGIN}?${qs}`;
}

export function parseSeedParamsFromUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.hostname !== 'bc.godfat.org') return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  const seed = url.searchParams.get('seed');
  if (!seed) return null;
  const num = (v) => (v == null ? undefined : Number(v));
  const out = {
    seed: Number(seed),
    event: url.searchParams.get('event') ?? undefined,
    count: num(url.searchParams.get('count')),
    lang: url.searchParams.get('lang') ?? undefined,
    last: num(url.searchParams.get('last')),
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}
```

- [ ] **Step 7: 執行測試確認通過**

Run: `npm test`
Expected: PASS（4 個測試全過）。

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore extension/lib/godfat.js test/godfat.test.js
git commit -m "feat: 專案骨架與 godfat 網址組裝純函式"
```

---

## Task 2: 擷取真實 godfat HTML fixture 並記錄結構

為 parser 的 TDD 準備真實資料，並書面記錄保證／換軌的呈現細節（這是 Task 6 的依據）。

**Files:**
- Create: `test/fixtures/gu-banner.html`（含保證 Uber 的卡池）
- Create: `test/fixtures/normal-banner.html`（無保證事件的卡池）
- Create: `test/fixtures/STRUCTURE.md`（結構筆記）

- [ ] **Step 1: 擷取含保證 Uber 的卡池（白金轉蛋，count=50）**

Run:
```bash
mkdir -p test/fixtures
curl -s "https://bc.godfat.org/?seed=2268003930&last=262&event=2026-04-24_1047&lang=tw&count=50" -o test/fixtures/gu-banner.html
wc -c test/fixtures/gu-banner.html
```
Expected: 檔案 > 100KB（非 500 錯誤頁；`count` 太小會回 500，故用 50）。

- [ ] **Step 2: 擷取一個無保證事件的當期卡池**

先在瀏覽器或用 `grep -oE '<option[^>]*value="[0-9-]+_[0-9]+"' test/fixtures/gu-banner.html` 從事件清單挑一個**非「必出超激」「step-up」的普通卡池** ID，替換下列 `<EVENT_ID>` 後擷取：
```bash
curl -s "https://bc.godfat.org/?seed=2268003930&last=262&event=<EVENT_ID>&lang=tw&count=50" -o test/fixtures/normal-banner.html
wc -c test/fixtures/normal-banner.html
```
Expected: 檔案 > 100KB。確認其表頭**沒有** `Guaranteed` 欄（`grep -c 'Guaranteed' test/fixtures/normal-banner.html` 應為 0 或僅出現在 thead 註解外）。若找不到無保證卡池，仍可只用 GU fixture，並在 STRUCTURE.md 註明。

- [ ] **Step 3: 書面記錄結構到 `test/fixtures/STRUCTURE.md`**

實際打開兩份 fixture，記錄並回答下列項目（用實際擷取到的 HTML 片段佐證）：

```markdown
# godfat HTML 結構筆記（fixture 擷取日：2026-06-22）

## 事件下拉
- 選擇器：`#event_select option`
- optgroup label 範例：（填入實際值，如 "Upcoming:"）
- option value/text 範例：（貼一段實際 option）

## 抽卡表
- 表頭 th 文字順序：（貼實際 th）
- 保證卡池是否多出 Guaranteed / Alt. guaranteed 欄：是/否（兩份 fixture 比較）

## 貓格 td.cat
- 一個 Result 貓格的完整 HTML：（貼實際）
- 一個 Guaranteed 貓格（有保證 Uber 的）完整 HTML：（貼實際；找 N11 附近）
- onclick pick('<pos>') 的 <pos> 格式：（A 軌 / B 軌 / 保證格各舉一例）
- 稀有度 class 實際出現值清單：rare / supa / uber / legend
- 貓名所在：span 內第一個 a 的 textContent
- next_position 出現位置：（描述）

## 換軌落點呈現
- 觀察 next_position 在 A、B 軌的分布，描述「目前位置之後落在哪一軌」如何判讀
- 保證格的 pick('<pos>') 是否標示落點
```

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/
git commit -m "test: 擷取 godfat HTML fixture 並記錄 DOM 結構"
```

---

## Task 3: 解析事件清單

**Files:**
- Create: `extension/lib/parser.js`
- Test: `test/parser.events.test.js`

**Interfaces:**
- Consumes: fixture HTML（Task 2）
- Produces:
  - `PARSER_VERSION: string`（如 `'2026-06-22'`）
  - `parseEventList(doc) -> Array<{id: string, name: string, group: string}>`（只取 `value` 形如 `YYYY-MM-DD_NNNN` 的 option；`group` 為所屬 optgroup 的 label，無則 `''`）

- [ ] **Step 1: 寫失敗測試 `test/parser.events.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseEventList } from '../extension/lib/parser.js';

const html = readFileSync(new URL('./fixtures/gu-banner.html', import.meta.url), 'utf8');
const { document } = parseHTML(html);

test('parseEventList 取出卡池 ID 與名稱', () => {
  const events = parseEventList(document);
  assert.ok(events.length >= 2, '至少數個卡池');
  // 已知 fixture 內含此卡池
  const known = events.find((e) => e.id === '2026-04-24_1047');
  assert.ok(known, '應含 2026-04-24_1047');
  assert.match(known.id, /^\d{4}-\d{2}-\d{2}_\d+$/);
  assert.ok(known.name.length > 0);
});

test('parseEventList 不含地區/型態等非卡池 option', () => {
  const events = parseEventList(document);
  assert.ok(!events.some((e) => ['en', 'tw', 'jp', 'kr', '0', '1'].includes(e.id)));
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`parseEventList is not a function`）。

- [ ] **Step 3: 實作 `extension/lib/parser.js`（先放事件解析）**

```js
// godfat HTML 解析（純函式，接受 Document）
export const PARSER_VERSION = '2026-06-22';

const EVENT_ID_RE = /^\d{4}-\d{2}-\d{2}_\d+$/;

export function parseEventList(doc) {
  const select = doc.querySelector('#event_select');
  if (!select) return [];
  const out = [];
  for (const opt of select.querySelectorAll('option')) {
    const id = (opt.getAttribute('value') || '').trim();
    if (!EVENT_ID_RE.test(id)) continue;
    const group = opt.closest('optgroup')?.getAttribute('label')?.trim() || '';
    out.push({ id, name: opt.textContent.trim(), group });
  }
  return out;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add extension/lib/parser.js test/parser.events.test.js
git commit -m "feat: 解析 godfat 事件清單"
```

---

## Task 4: 解析抽卡表的 Result 貓格（A/B 軌、稀有度、貓名）

**Files:**
- Modify: `extension/lib/parser.js`
- Test: `test/parser.rolls.test.js`

**Interfaces:**
- Produces:
  - `parseRollTable(doc) -> { hasGuaranteed: boolean, cells: Map<string, Cell> }`
  - `Cell = { pos: string, track: 'A'|'B', n: number, rarity: 'rare'|'supa'|'uber'|'legend', name: string, isNext: boolean }`
  - key 為 `pos`（如 `'1A'`、`'3B'`）。空格不納入。
  - `hasGuaranteed`：是否**實際解析到保證格**（保證欄須以 `force_guaranteed` 模擬才會填入；godfat 的 `Guaranteed` 表頭恆存在、不可作為偵測依據）。

- [ ] **Step 1: 寫失敗測試 `test/parser.rolls.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';

const html = readFileSync(new URL('./fixtures/gu-banner.html', import.meta.url), 'utf8');
const { document } = parseHTML(html);

test('parseRollTable 解析出 1A 的貓名與稀有度', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('1A');
  assert.ok(c, '應有 1A');
  assert.equal(c.track, 'A');
  assert.equal(c.n, 1);
  assert.equal(c.name, '霸龍迪歐拉姆斯');
  assert.equal(c.rarity, 'supa');
});

test('parseRollTable 同時有 A 與 B 軌位置', () => {
  const { cells } = parseRollTable(document);
  assert.ok(cells.has('1A') && cells.has('1B'));
  assert.equal(cells.get('1B').track, 'B');
});

test('parseRollTable 偵測到此為保證事件卡池', () => {
  const { hasGuaranteed } = parseRollTable(document);
  assert.equal(hasGuaranteed, true);
});

test('parseRollTable 標出 next_position', () => {
  const { cells } = parseRollTable(document);
  const nextCount = [...cells.values()].filter((c) => c.isNext).length;
  assert.ok(nextCount >= 1);
});
```

> 註：若 Task 2 的 STRUCTURE.md 顯示 1A 實際貓名／稀有度與此不同（種子資料可能隨版本變動），以 fixture 實際內容更新上方斷言值。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`parseRollTable is not a function`）。

- [ ] **Step 3: 在 `parser.js` 增加 `parseRollTable`**

```js
// 完整型別清單（執行期由 fixture 確認）；含 fest 與 exclusive 變體
const RARITIES = ['legend', 'exclusive', 'uber_fest', 'uber', 'supa_fest', 'supa', 'rare'];
const PICK_RE = /pick\('(\d+[AB])'\)/; // 僅 Result 格：pick id 無 G 字尾

function rarityOf(el) {
  for (const r of RARITIES) if (el.classList.contains(r)) return r;
  return null;
}

function catName(td) {
  const a = td.querySelector('span a'); // 第一個 a 為貓名，第二個是 🐾
  return a ? a.textContent.trim() : '';
}

export function parseRollTable(doc) {
  const table = doc.querySelector('table');
  const cells = new Map();
  if (!table) return { hasGuaranteed: false, cells };

  const headers = [...table.querySelectorAll('thead th, tr:first-child th')].map((th) =>
    th.textContent.trim()
  );
  const hasGuaranteed = headers.includes('Guaranteed');

  for (const td of table.querySelectorAll('td.cat[onclick]')) {
    const m = (td.getAttribute('onclick') || '').match(PICK_RE);
    if (!m) continue;
    const pos = m[1];
    const rarity = rarityOf(td);
    const name = catName(td);
    if (!rarity || !name) continue; // 空格或無法判讀者略過
    const track = pos.endsWith('A') ? 'A' : 'B';
    const n = parseInt(pos, 10);
    cells.set(pos, { pos, track, n, rarity, name, isNext: td.classList.contains('next_position') });
  }
  return { hasGuaranteed, cells };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS。若 1A 斷言值不符，依 fixture 修正測試斷言後再跑。

- [ ] **Step 5: Commit**

```bash
git add extension/lib/parser.js test/parser.rolls.test.js
git commit -m "feat: 解析抽卡表 Result 貓格（A/B 軌、稀有度、貓名）"
```

---

## Task 5: 並發抓取工具（concurrency limiter）

**Files:**
- Create: `extension/lib/concurrency.js`
- Test: `test/concurrency.test.js`

**Interfaces:**
- Produces:
  - `mapWithLimit(items, limit, worker) -> Promise<Array<{status:'ok',value}|{status:'error',error}>>`
  - 同時執行不超過 `limit` 個 `worker(item, index)`；單一失敗不影響其他，回傳對應位置的 error 物件。

- [ ] **Step 1: 寫失敗測試 `test/concurrency.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithLimit } from '../extension/lib/concurrency.js';

test('mapWithLimit 不超過並發上限', async () => {
  let running = 0;
  let peak = 0;
  const worker = async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return 'ok';
  };
  await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 3, worker);
  assert.ok(peak <= 3, `peak ${peak} 應 <= 3`);
});

test('mapWithLimit 保留順序並隔離錯誤', async () => {
  const res = await mapWithLimit([1, 2, 3], 2, async (x) => {
    if (x === 2) throw new Error('boom');
    return x * 10;
  });
  assert.deepEqual(res[0], { status: 'ok', value: 10 });
  assert.equal(res[1].status, 'error');
  assert.equal(res[1].error.message, 'boom');
  assert.deepEqual(res[2], { status: 'ok', value: 30 });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`mapWithLimit is not a function`）。

- [ ] **Step 3: 實作 `extension/lib/concurrency.js`**

```js
// 限制並發的 map，保留順序、隔離單一錯誤（純函式，僅用標準 API）
export async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: 'ok', value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { status: 'error', error };
      }
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, runner));
  return results;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add extension/lib/concurrency.js test/concurrency.test.js
git commit -m "feat: 並發上限抓取工具"
```

---

## Task 6: 解析保證欄（force_guaranteed）

保證欄需以 `force_guaranteed=11` 擷取（見 `STRUCTURE.md`）。保證格為 `td.cat[onclick="pick('<n><A|B>G')"]`（**`G` 字尾**）。用 `gu-banner-forced11.html` fixture。

**Files:**
- Modify: `extension/lib/parser.js`
- Test: `test/parser.guaranteed.test.js`

**Interfaces:**
- Produces（擴充 `parseRollTable` 回傳的 `Cell`）：
  - `Cell.guaranteed?: { rarity, name }`（從同位置的 `G` 格取得）
  - 模型不另算換軌；落點資訊保留在 godfat 連結中，v1 不解析。

- [ ] **Step 1: 寫失敗測試 `test/parser.guaranteed.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';

const html = readFileSync(new URL('./fixtures/gu-banner-forced11.html', import.meta.url), 'utf8');
const { document } = parseHTML(html);

test('force_guaranteed fixture：位置帶 guaranteed', () => {
  const { cells } = parseRollTable(document);
  const c = cells.get('1A');
  assert.ok(c.guaranteed, '1A 應有 guaranteed');
  assert.ok(c.guaranteed.name.length > 0);
  // 依 fixture 實際值：1A 的保證為「開花爺爺」
  assert.equal(c.guaranteed.name, '開花爺爺');
});

test('未強制保證的 fixture 無 guaranteed', () => {
  const plain = parseHTML(readFileSync(new URL('./fixtures/gu-banner.html', import.meta.url), 'utf8')).document;
  const { cells } = parseRollTable(plain);
  assert.equal(cells.get('1A').guaranteed, undefined);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`guaranteed` 為 undefined）。

- [ ] **Step 3: 擴充 `parseRollTable` 解析 `G` 格**

```js
// 在 parseRollTable 內，額外掃描 G 格並掛到同 pos 的 Cell：
const GUAR_RE = /pick\('(\d+[AB])G'\)/;
for (const td of table.querySelectorAll('td.cat[onclick]')) {
  const m = (td.getAttribute('onclick') || '').match(GUAR_RE);
  if (!m) continue;
  const pos = m[1]; // 例 '1A'
  const target = cells.get(pos);
  if (!target) continue;
  const rarity = rarityOf(td);
  const name = catName(td);
  if (rarity && name) target.guaranteed = { rarity, name };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS（所有 parser 測試）。若 `開花爺爺` 與 fixture 不符，依實際值修正斷言。

- [ ] **Step 5: Commit**

```bash
git add extension/lib/parser.js test/parser.guaranteed.test.js
git commit -m "feat: 解析保證 Uber 欄（force_guaranteed G 格）"
```

---

## Task 7: 合併多卡池為對齊模型

**Files:**
- Create: `extension/lib/merge.js`
- Test: `test/merge.test.js`

**Interfaces:**
- Consumes: 多個 `{ banner: {id,name}, parsed: ReturnType<parseRollTable> }`
- Produces:
  - `mergeBanners(entries) -> { positions: string[], anyGuaranteed: boolean, byPos: Map<string, Map<bannerId, Cell>> }`
  - `positions`：聯集後依抽數、A 先於 B 排序（`1A,2A,...,1B,2B,...` 或 `1A,1B,2A,2B...`——採前者：先所有 A 再所有 B，與 godfat 縱軸一致）。
  - `byPos`：position → (bannerId → Cell)。

- [ ] **Step 1: 寫失敗測試 `test/merge.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBanners } from '../extension/lib/merge.js';

function cell(pos, name, rarity = 'rare') {
  const track = pos.endsWith('A') ? 'A' : 'B';
  return { pos, track, n: parseInt(pos, 10), rarity, name, isNext: false };
}

test('mergeBanners 對齊相同位置', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: false, cells: new Map([['1A', cell('1A', '貓甲')], ['2A', cell('2A', '貓乙')]]) } };
  const b = { banner: { id: 'B', name: 'B' }, parsed: { hasGuaranteed: false, cells: new Map([['1A', cell('1A', '貓丙')]]) } };
  const m = mergeBanners([a, b]);
  assert.deepEqual(m.positions.slice(0, 2), ['1A', '2A']);
  assert.equal(m.byPos.get('1A').get('A').name, '貓甲');
  assert.equal(m.byPos.get('1A').get('B').name, '貓丙');
  assert.equal(m.byPos.get('2A').has('B'), false);
});

test('mergeBanners 排序：先 A 軌後 B 軌、依抽數', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: false, cells: new Map([['2A', cell('2A', 'x')], ['1B', cell('1B', 'y')], ['1A', cell('1A', 'z')]]) } };
  const m = mergeBanners([a]);
  assert.deepEqual(m.positions, ['1A', '2A', '1B']);
});

test('mergeBanners anyGuaranteed', () => {
  const a = { banner: { id: 'A', name: 'A' }, parsed: { hasGuaranteed: true, cells: new Map() } };
  assert.equal(mergeBanners([a]).anyGuaranteed, true);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL（`mergeBanners is not a function`）。

- [ ] **Step 3: 實作 `extension/lib/merge.js`**

```js
// 合併多卡池解析結果為對齊模型（純函式）
function posSortKey(pos) {
  const n = parseInt(pos, 10);
  const track = pos.endsWith('A') ? 0 : 1; // 先 A 後 B
  return track * 1e6 + n;
}

export function mergeBanners(entries) {
  const byPos = new Map();
  let anyGuaranteed = false;
  for (const { banner, parsed } of entries) {
    if (parsed.hasGuaranteed) anyGuaranteed = true;
    for (const [pos, c] of parsed.cells) {
      if (!byPos.has(pos)) byPos.set(pos, new Map());
      byPos.get(pos).set(banner.id, c);
    }
  }
  const positions = [...byPos.keys()].sort((p, q) => posSortKey(p) - posSortKey(q));
  return { positions, anyGuaranteed, byPos };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add extension/lib/merge.js test/merge.test.js
git commit -m "feat: 合併多卡池為對齊模型"
```

---

## Task 8: Manifest 與 content script（讀取種子與卡池清單）

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/content/content.js`
- Create: `extension/icons/icon16.png`, `icon48.png`, `icon128.png`（任意簡單佔位圖示）

**Interfaces:**
- content script 回應 `chrome.runtime.onMessage` 的 `{type:'GET_GODFAT_CONTEXT'}`，回傳 `{seedParams, events}`：
  - `seedParams = parseSeedParamsFromUrl(location.href)`
  - `events = parseEventList(document)`

- [ ] **Step 1: 建立 `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Battle Cats Seed+ 多卡池比較",
  "version": "0.1.0",
  "description": "在 godfat 種子頁一次比較多個卡池",
  "permissions": ["activeTab", "storage", "tabs"],
  "host_permissions": ["https://bc.godfat.org/*"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "content_scripts": [
    {
      "matches": ["https://bc.godfat.org/*"],
      "js": ["lib/godfat.js", "lib/parser.js", "content/content.js"]
    }
  ]
}
```

> 註：content script 以非 module 載入並依序執行；`godfat.js`／`parser.js` 的 `export` 在此情境需可被存取。為相容，於 Step 2 改用 `globalThis` 掛載（見下），或在 content 內以 `import()` 動態載入。最簡作法：content 不直接 import，改在 content.js 內**重複最小邏輯**會違反 DRY；因此採「動態 import」：

- [ ] **Step 2: 建立 `extension/content/content.js`（以動態 import 重用 lib）**

```js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'GET_GODFAT_CONTEXT') return;
  (async () => {
    const godfat = await import(chrome.runtime.getURL('lib/godfat.js'));
    const parser = await import(chrome.runtime.getURL('lib/parser.js'));
    sendResponse({
      seedParams: godfat.parseSeedParamsFromUrl(location.href),
      events: parser.parseEventList(document),
    });
  })();
  return true; // 非同步回應
});
```

並把 manifest 的 content_scripts 改為只載入 content.js：
```json
"content_scripts": [
  { "matches": ["https://bc.godfat.org/*"], "js": ["content/content.js"] }
],
"web_accessible_resources": [
  { "resources": ["lib/*.js"], "matches": ["https://bc.godfat.org/*"] }
]
```

- [ ] **Step 3: 建立佔位圖示**

任意產生三個 PNG（純色即可）。可用線上工具或既有圖；尺寸 16/48/128。放到 `extension/icons/`。

- [ ] **Step 4: 手動驗收**

1. Chrome 開 `chrome://extensions` → 開啟「開發人員模式」→「載入未封裝項目」選 `extension/`。
2. 開啟 `https://bc.godfat.org/?seed=2268003930&last=262&event=2026-04-24_1047&lang=tw&count=50`。
3. 在該分頁的 DevTools Console 執行：
```js
chrome.runtime.sendMessage({type:'GET_GODFAT_CONTEXT'}, console.log)
```
（若 Console 無 `chrome.runtime`，改於 Step 5 popup 完成後一併驗收。）
Expected: 回傳物件含 `seedParams.seed === 2268003930` 與非空 `events` 陣列。

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/content/content.js extension/icons/
git commit -m "feat: manifest 與 content script（讀取種子與卡池清單）"
```

---

## Task 9: Popup（偵測種子、勾選卡池、開啟比較頁）

**Files:**
- Create: `extension/popup/popup.html`
- Create: `extension/popup/popup.css`
- Create: `extension/popup/popup.js`

**Interfaces:**
- Consumes: content script 的 `GET_GODFAT_CONTEXT`；`lib/godfat.js`
- 行為：顯示種子；列出卡池（預設勾選「進行中」——即名稱日期區間包含今日者）；「載入比較」開啟 `view/view.html?seed=..&count=..&lang=..&events=逗號清單`。

- [ ] **Step 1: 建立 `extension/popup/popup.html`**

```html
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="popup.css">
<div id="app">
  <div id="status">偵測中…</div>
  <div id="controls" hidden>
    <input id="filter" type="search" placeholder="搜尋卡池…">
    <ul id="banner-list"></ul>
    <button id="load">載入比較</button>
  </div>
</div>
<script type="module" src="popup.js"></script>
```

- [ ] **Step 2: 建立 `extension/popup/popup.css`**

```css
body { width: 360px; font: 13px/1.4 sans-serif; margin: 0; padding: 10px; }
#banner-list { list-style: none; margin: 8px 0; padding: 0; max-height: 320px; overflow: auto; }
#banner-list li { padding: 3px 0; }
#load { width: 100%; padding: 8px; font-weight: bold; }
#status { color: #555; }
.group-label { font-weight: bold; margin-top: 6px; color: #333; }
```

- [ ] **Step 3: 建立 `extension/popup/popup.js`**

```js
import { buildEventUrl } from '../lib/godfat.js';

const $ = (s) => document.querySelector(s);

function isRunningToday(name) {
  // 名稱格式："YYYY-MM-DD ~ YYYY-MM-DD: ..."
  const m = name.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return false;
  const today = new Date().toISOString().slice(0, 10);
  return m[1] <= today && today <= m[2];
}

async function getContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_GODFAT_CONTEXT' }).catch(() => null);
  return { tab, ...(res || {}) };
}

let SEED = null;

function render(events) {
  const list = $('#banner-list');
  list.innerHTML = '';
  for (const e of events) {
    const li = document.createElement('li');
    const checked = isRunningToday(e.name) ? 'checked' : '';
    li.innerHTML = `<label><input type="checkbox" value="${e.id}" ${checked}> ${e.name}</label>`;
    list.appendChild(li);
  }
}

$('#filter')?.addEventListener('input', (ev) => {
  const q = ev.target.value.toLowerCase();
  for (const li of $('#banner-list').children) {
    li.hidden = !li.textContent.toLowerCase().includes(q);
  }
});

$('#load').addEventListener('click', () => {
  const ids = [...$('#banner-list').querySelectorAll('input:checked')].map((i) => i.value);
  if (!SEED || ids.length === 0) return;
  const params = new URLSearchParams({
    seed: SEED.seed,
    count: SEED.count ?? 100,
    lang: SEED.lang ?? 'tw',
    events: ids.join(','),
  });
  chrome.tabs.create({ url: chrome.runtime.getURL('view/view.html') + '?' + params });
});

(async () => {
  const ctx = await getContext();
  if (!ctx.seedParams) {
    $('#status').textContent = '請先在 godfat 種子頁（含 seed 的網址）開啟本擴充。';
    return;
  }
  SEED = ctx.seedParams;
  $('#status').textContent = `種子：${SEED.seed}`;
  $('#controls').hidden = false;
  render(ctx.events || []);
})();
```

- [ ] **Step 4: 手動驗收**

1. 重新載入擴充（`chrome://extensions` → 重新載入）。
2. 在 godfat 種子頁按擴充圖示。
Expected: 顯示「種子：2268003930」、卡池清單列出且進行中者預設勾選；搜尋可過濾。
3. 勾幾個卡池 → 按「載入比較」。
Expected: 開新分頁到 `view/view.html?...`（此時 view 尚未實作，頁面空白或預設內容即可）。

- [ ] **Step 5: Commit**

```bash
git add extension/popup/
git commit -m "feat: popup（偵測種子、勾選卡池、開啟比較頁）"
```

---

## Task 10: View（抓取、合併、渲染對齊表格）

**Files:**
- Create: `extension/view/view.html`
- Create: `extension/view/view.css`
- Create: `extension/view/view.js`

**Interfaces:**
- Consumes: `lib/godfat.js`、`lib/parser.js`、`lib/merge.js`、`lib/concurrency.js`
- 由 URL query 取得 `seed,count,lang,events`；抓各卡池、解析、合併、渲染。

- [ ] **Step 1: 建立 `extension/view/view.html`**

```html
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="view.css">
<h1>多卡池比較 <span id="seed-label"></span></h1>
<div id="toolbar">
  <label>顯示抽數 <input id="count" type="number" min="10" max="500" step="10"></label>
  <span id="progress"></span>
</div>
<div id="banner-toggles"></div>
<div id="table-wrap"><table id="grid"></table></div>
<script type="module" src="view.js"></script>
```

- [ ] **Step 2: 建立 `extension/view/view.css`**

```css
body { font: 13px/1.4 sans-serif; margin: 12px; }
#table-wrap { overflow: auto; max-height: 80vh; border: 1px solid #ccc; }
table { border-collapse: collapse; }
th, td { border: 1px solid #ddd; padding: 3px 6px; white-space: nowrap; }
thead th { position: sticky; top: 0; background: #fff; z-index: 2; }
tbody td.pos, thead th.pos { position: sticky; left: 0; background: #fafafa; z-index: 1; font-weight: bold; }
.rare { background: #d9ead3; }
.supa { background: #fff2cc; }
.uber { background: #fce5cd; }
.legend { background: #f4cccc; }
.next { outline: 2px solid #3367d6; }
.guar { font-size: 11px; color: #b06000; }
.err { color: #c00; }
```

- [ ] **Step 3: 建立 `extension/view/view.js`**

```js
import { buildEventUrl } from '../lib/godfat.js';
import { parseRollTable } from '../lib/parser.js';
import { mergeBanners } from '../lib/merge.js';
import { mapWithLimit } from '../lib/concurrency.js';

const CONCURRENCY = 5;
const qp = new URLSearchParams(location.search);
const seed = Number(qp.get('seed'));
const count = Number(qp.get('count')) || 100;
const lang = qp.get('lang') || 'tw';
const eventIds = (qp.get('events') || '').split(',').filter(Boolean);

document.querySelector('#seed-label').textContent = `（種子 ${seed}）`;
document.querySelector('#count').value = count;

async function fetchBanner(id, useCount, force) {
  // force（'' / '2' / '7' / '11' / '15'）來自「模擬保證」下拉；'' 時不傳 forceGuaranteed
  const forceGuaranteed = force ? Number(force) : undefined;
  const url = buildEventUrl({ seed, event: id, count: useCount, lang, forceGuaranteed });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parsed = parseRollTable(doc);
  // 卡池名稱取自該頁被選中的 option
  const name = doc.querySelector('#event_select option[selected]')?.textContent.trim() || id;
  return { banner: { id, name }, parsed };
}

function renderError(id, message) {
  // 在表頭區顯示該卡池抓取失敗
  const div = document.createElement('div');
  div.className = 'err';
  div.innerHTML = `卡池 ${id} 載入失敗：${message} <a href="${buildEventUrl({ seed, event: id, count, lang })}" target="_blank">在 godfat 開啟</a>`;
  document.querySelector('#banner-toggles').appendChild(div);
}

const hidden = new Set(); // 被隱藏的 bannerId

function renderTable(entries) {
  const merged = mergeBanners(entries);
  const visible = entries.filter((e) => !hidden.has(e.banner.id));
  const table = document.querySelector('#grid');
  // 表頭：位置 + 每卡池一欄（含「在 godfat 開啟」）
  const head = ['<th class="pos">位置</th>'];
  for (const e of visible) {
    head.push(`<th>${e.banner.name}<br><a href="${buildEventUrl({ seed, event: e.banner.id, count, lang })}" target="_blank">在 godfat 開啟</a></th>`);
  }
  const rows = [`<thead><tr>${head.join('')}</tr></thead>`];
  const body = [];
  for (const pos of merged.positions) {
    const tds = [`<td class="pos">${pos}</td>`];
    for (const e of visible) {
      const c = merged.byPos.get(pos)?.get(e.banner.id);
      if (!c) { tds.push('<td></td>'); continue; }
      const guar = c.guaranteed ? `<div class="guar">保證: ${c.guaranteed.name}</div>` : '';
      tds.push(`<td class="${c.rarity} ${c.isNext ? 'next' : ''}">${c.name}${guar}</td>`);
    }
    body.push(`<tr>${tds.join('')}</tr>`);
  }
  rows.push(`<tbody>${body.join('')}</tbody>`);
  table.innerHTML = rows.join('');
}

function renderToggles(entries) {
  const box = document.querySelector('#banner-toggles');
  box.innerHTML = '';
  for (const e of entries) {
    const label = document.createElement('label');
    label.style.marginRight = '10px';
    label.innerHTML = `<input type="checkbox" checked data-id="${e.banner.id}"> ${e.banner.name}`;
    label.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) hidden.delete(e.banner.id); else hidden.add(e.banner.id);
      renderTable(entries);
    });
    box.appendChild(label);
  }
}

async function load(useCount) {
  const progress = document.querySelector('#progress');
  progress.textContent = `載入中 0/${eventIds.length}…`;
  let done = 0;
  const results = await mapWithLimit(eventIds, CONCURRENCY, async (id) => {
    const r = await fetchBanner(id, useCount);
    progress.textContent = `載入中 ${++done}/${eventIds.length}…`;
    return r;
  });
  const entries = [];
  results.forEach((r, i) => {
    if (r.status === 'ok') entries.push(r.value);
    else renderError(eventIds[i], r.error.message);
  });
  progress.textContent = `完成（${entries.length}/${eventIds.length}）`;
  renderToggles(entries);
  renderTable(entries);
}

document.querySelector('#count').addEventListener('change', (ev) => {
  const c = Math.max(10, Math.min(500, Number(ev.target.value) || 100));
  load(c);
});

load(count);
```

- [ ] **Step 4: 手動驗收**

1. 重新載入擴充。
2. 從 popup 勾選 2–3 個卡池 → 載入比較。
Expected:
   - 出現對齊表格：第一欄為位置（`1A,2A,…`），每卡池一欄，依位置橫向對齊。
   - 稀有度有底色、目前位置有外框。
   - 「模擬保證」預設「無」時無任何「保證: …」；切到 11 後重抓並顯示保證欄；切回「無」消失。
   - 凍結首欄與表頭、可橫向捲動。
   - 卡池勾選可隱藏／顯示某欄（不需重抓）。
   - 改「顯示抽數」會重新載入。
   - 每欄「在 godfat 開啟」連到對應單卡池頁。
3. 逐一比對某卡池欄與 godfat 原頁該卡池內容一致（貓名、稀有度、保證 Uber）。

- [ ] **Step 5: Commit**

```bash
git add extension/view/
git commit -m "feat: view 比較頁（抓取、合併、渲染對齊表格）"
```

---

## Task 11: README 與最終整合驗收

**Files:**
- Create: `README.md`

- [ ] **Step 1: 撰寫 `README.md`**

內容須包含：
- 專案用途與「同位置橫向對齊比較」說明
- 安裝：`chrome://extensions` → 開發人員模式 → 載入未封裝 `extension/`
- 使用：在 godfat 種子頁按圖示 → 勾選卡池 → 載入比較
- 開發：`npm install`、`npm test`
- **已知維護風險**：godfat 改版可能使 parser 失效；parser 標 `PARSER_VERSION`，修復時更新 `test/fixtures/` 與 `STRUCTURE.md`
- 禮貌性：並發上限 5、session 快取、勿大量抓取（godfat 為社群資源）
- Backlog（取自 spec §9）：GitHub Pages 網頁版、CLI 匯出、Firefox 相容、godfat 內嵌面板、本地自算種子、B 軌切換/匯出

- [ ] **Step 2: 全流程手動驗收**

Run: `npm test`
Expected: 所有單元測試通過。

再跑一次 Task 10 Step 4 的完整 E2E，確認無回歸。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README 與使用/開發說明"
```

---

## Self-Review（撰寫者自查紀錄）

**Spec 覆蓋對照：**
- §2 擴充/MV3/host_permissions → Task 8 manifest
- §2 抓 godfat 解析 → Task 4/6 parser、Task 10 fetch
- §2 取向 A（忠實沿用欄位）→ Task 4/6/10
- §2 版面同位置橫向對齊 → Task 7 merge、Task 10 render（凍結首欄/表頭）
- §2 v1 含保證/換軌 → Task 6 guaranteed、Task 4 isNext
- §3 事件清單來源 → Task 3
- §4 各模組（content/popup/godfat/parser/merge/storage/view）→ Task 8/9/1/3-4-6/7/(快取見下)/10
- §5 資料流（含並發 5、進度）→ Task 5 concurrency、Task 10 load
- §5 session 快取 → 見下「已知缺口」
- §6 錯誤處理（非 godfat 頁、抓取失敗、解析失敗降級、在 godfat 開啟）→ Task 9 status、Task 10 renderError、Task 4/6 略過無法解析者
- §6 禮貌性 → Task 5/10、Task 11 README
- §7 測試（parser/merge/url 純函式 + fixtures + 手動）→ Task 1-7 TDD、Task 8-10 手動
- §8 結構 → 各 Task 檔案路徑

**已知缺口（刻意延後，非 placeholder）：**
- spec §4 的 `lib/storage.js`（session 快取與記住勾選）未獨立成任務。v1 的 view 在單頁 session 內，重複 `count` 變更會重抓；如需快取，於 Task 10 完成後新增「Task 12: 加入 `(seed,event,count)` 記憶體快取」。此為效能優化，不影響正確性，故列為後續。README（Task 11）會載明。

**型別一致性：** `Cell`／`parseRollTable`／`mergeBanners` 回傳結構在 Task 4/6/7/10 一致；`buildEventUrl` 參數在 Task 1/9/10 一致；`mapWithLimit` 回傳 `{status,value|error}` 在 Task 5/10 一致。

**Placeholder 掃描：** Task 6 的選擇器需以 fixture 最終確認（已明確指示依 STRUCTURE.md 調整，且附推定作法與測試），屬「fixture 驅動」而非空白佔位。
