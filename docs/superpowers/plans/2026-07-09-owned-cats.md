# 擁有貓咪清單 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者記錄擁有的貓（localStorage、貓 id 為準），提供 o 短碼匯入匯出、內建清單頁（兼未擁有總覽）、view 表格未擁有標示與格子選單標記、godfat 連結帶 o、路線規劃批次目標。

**Architecture:** 純函式進 `extension/lib/`（URL 組裝進 godfat.js、儲存與解析進新檔 owned.js、/cats 載入器抽出成 catlist-loader.js 供多頁共用），UI 分別落在新頁 `extension/owned/` 與既有 `extension/view/`、`extension/popup/`。o 短碼是 godfat 伺服器端編碼：解碼＝解析 `/cats?o=…` 頁的 checked、編碼＝fetch `?t=id…` 網址讓 godfat 302 轉出短碼（`res.url` 取回）。

**Tech Stack:** Vanilla JS（ES modules）、node:test + linkedom、Chrome MV3。

**規格：** `docs/superpowers/specs/2026-07-09-owned-cats-design.md`

## Global Constraints

- 分支 `feat/owned-cats`（已建立）；**實作開始前需使用者核准**；完成後停在分支等使用者測試，不合併、不 push。
- Commit 格式 `type(scope): 中文摘要`，**不加 Co-Authored-By trailer**。
- 每個 commit 前跑 `npm test` 全綠（輸出含 `# fail 0`）。
- `extension/lib/` 只放純函式（或依賴可注入者），皆配單元測試；解析 godfat HTML 一律以結構屬性為鍵，不依賴視覺欄位。
- 清單是使用者資料：鍵 `bcsp:owned`、`bcsp:mark-unowned` 必須列入 `cache.js` 的 `SETTINGS_KEYS`（清快取不清）。
- 禮貌性：換碼請求只在「開 godfat 連結且 oDirty」或手動匯出時發生；匯入為單次請求；/cats 目錄沿用每日快取。
- godfat 相關數值（實測 2026-07-09）：/cats 有 793 隻貓、checkbox 為 `<input type="checkbox" name="t" id="cat-<id>" value="<id>">`；`?t=1&t=2&t=44` → 302 → `/cats?lang=tw&o=4ZIEPP2m`。

---

### Task 1: godfat.js 網址擴充（o 參數）

**Files:**
- Modify: `extension/lib/godfat.js`
- Test: `test/godfat.test.js`

**Interfaces:**
- Produces: `buildEventUrl({..., o})`（o 加入既有參數）、`buildCatsUrl(lang, oCode?)`、`buildOwnedSyncUrl(ids, lang)`、`buildCatUrl(id, lang)`、`parseSeedParamsFromUrl(url).o`（string | 不存在）。

- [ ] **Step 1: 寫失敗測試**（附加到 `test/godfat.test.js` 末尾）

```js
test('buildEventUrl 帶 o 參數（擁有清單短碼）', () => {
  assert.ok(buildEventUrl({ seed: 1, event: 'e', o: '4ZIEPP2m' }).endsWith('&o=4ZIEPP2m'));
  assert.ok(!buildEventUrl({ seed: 1, event: 'e' }).includes('o='));
});

test('buildCatsUrl 可附 o；buildOwnedSyncUrl 排序去重；buildCatUrl 個別貓頁', () => {
  assert.equal(buildCatsUrl('tw', 'abc'), 'https://bc.godfat.org/cats?lang=tw&o=abc');
  assert.equal(buildCatsUrl('tw'), 'https://bc.godfat.org/cats?lang=tw'); // 原行為不變
  assert.equal(buildOwnedSyncUrl([44, 1, 2, 1], 'tw'), 'https://bc.godfat.org/cats?lang=tw&t=1&t=2&t=44');
  assert.equal(buildCatUrl(524, 'tw'), 'https://bc.godfat.org/cats/524?lang=tw');
});

test('parseSeedParamsFromUrl 帶回 o', () => {
  assert.equal(parseSeedParamsFromUrl('https://bc.godfat.org/?seed=1&o=abc').o, 'abc');
  assert.ok(!('o' in parseSeedParamsFromUrl('https://bc.godfat.org/?seed=1')));
});
```

並把檔頭 import 補上新函式：

```js
import { buildEventUrl, buildCatsUrl, buildOwnedSyncUrl, buildCatUrl, parseSeedParamsFromUrl } from '../extension/lib/godfat.js';
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: fail > 0（`buildOwnedSyncUrl` 未定義）

- [ ] **Step 3: 實作 `extension/lib/godfat.js`**

`PARAM_ORDER` 加 `'o'`、`buildEventUrl` 解構與 values 加 `o`：

```js
const PARAM_ORDER = ['seed', 'last', 'event', 'lang', 'count', 'force_guaranteed', 'o'];

export function buildEventUrl({ seed, event, count, lang, last, forceGuaranteed, o } = {}) {
  const values = { seed, last, event, lang, count, force_guaranteed: forceGuaranteed, o };
  // （其餘不變）
```

`buildCatsUrl` 換成、並新增兩個 builder：

```js
// /cats 清單頁（全貓依稀有度分組，供 lib/catlist.js 建對照表）；oCode＝擁有清單短碼
export function buildCatsUrl(lang, oCode) {
  const o = oCode ? `&o=${encodeURIComponent(oCode)}` : '';
  return `${GODFAT_ORIGIN}cats?lang=${encodeURIComponent(lang || 'tw')}${o}`;
}

// 換碼網址：godfat 收到 t=<id> 清單後 302 轉址、網址帶壓縮後的 o 短碼（fetch 跟隨後從 res.url 取回）
export function buildOwnedSyncUrl(ids, lang) {
  const t = [...new Set(ids)].sort((a, b) => a - b).map((i) => `&t=${i}`).join('');
  return `${GODFAT_ORIGIN}cats?lang=${encodeURIComponent(lang || 'tw')}${t}`;
}

// 個別貓頁
export function buildCatUrl(id, lang) {
  return `${GODFAT_ORIGIN}cats/${id}?lang=${encodeURIComponent(lang || 'tw')}`;
}
```

`parseSeedParamsFromUrl` 的 `out` 加一行（放 `forceGuaranteed` 之後）：

```js
    o: url.searchParams.get('o') ?? undefined, // 擁有清單短碼（godfat 純顯示用，不影響計算）
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add extension/lib/godfat.js test/godfat.test.js
git commit -m "feat(lib): godfat 網址支援擁有清單 o 參數與換碼/貓頁網址"
```

---

### Task 2: owned.js 儲存與解析＋SETTINGS_KEYS＋fixture

**Files:**
- Create: `extension/lib/owned.js`
- Create: `test/owned.test.js`
- Create: `test/fixtures/cats-tw-owned.html`
- Modify: `extension/lib/cache.js:60`（SETTINGS_KEYS）
- Modify: `extension/lib/catlist.js`（新增 `catsById`）
- Modify: `test/cache.test.js`、`test/catlist.test.js`、`test/fixtures/STRUCTURE.md`

**Interfaces:**
- Consumes: `buildOwnedSyncUrl(ids, lang)`（Task 1）。
- Produces: `loadOwned() → {ids:Set<number>, oCode:string|null, oDirty:boolean, updated:string|null}`、`saveOwned(data) → boolean`、`parseOwnedFromCatsDoc(doc) → number[]`、`extractOCode(input) → string|null`、`fetchOCode(ids, lang, fetchFn?) → Promise<string|null>`、`catsById(catMap) → Map<number, {name, rarity}>`。

- [ ] **Step 1: 抓 fixture（真實資料：貓 1、2、44 的 o 短碼）**

```bash
curl -s 'https://bc.godfat.org/cats?lang=tw&o=4ZIEPP2m' -o test/fixtures/cats-tw-owned.html
grep -c 'checked' test/fixtures/cats-tw-owned.html   # 應 ≥ 3
```

- [ ] **Step 2: 寫失敗測試 `test/owned.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import {
  loadOwned, saveOwned, parseOwnedFromCatsDoc, extractOCode, fetchOCode,
} from '../extension/lib/owned.js';
import { catsById, parseCatList } from '../extension/lib/catlist.js';

// fixture: bc.godfat.org/cats?lang=tw&o=4ZIEPP2m（2026-07-09 抓取，貓 1/2/44 已勾）
const ownedDoc = parseHTML(readFileSync(new URL('./fixtures/cats-tw-owned.html', import.meta.url), 'utf8')).document;
const plainDoc = parseHTML(readFileSync(new URL('./fixtures/cats-tw.html', import.meta.url), 'utf8')).document;

test('parseOwnedFromCatsDoc：解析 checked 的貓 id、升冪；無 o 頁回空陣列', () => {
  assert.deepEqual(parseOwnedFromCatsDoc(ownedDoc), [1, 2, 44]);
  assert.deepEqual(parseOwnedFromCatsDoc(plainDoc), []);
});

test('extractOCode：網址/裸短碼/垃圾輸入', () => {
  assert.equal(extractOCode('https://bc.godfat.org/cats?lang=tw&o=4ZIEPP2m#x'), '4ZIEPP2m');
  assert.equal(extractOCode('https://bc.godfat.org/?seed=1&o=abc&count=100'), 'abc');
  assert.equal(extractOCode('  4ZIEPP2m  '), '4ZIEPP2m');
  assert.equal(extractOCode('https://bc.godfat.org/?seed=1'), null); // 無 o
  assert.equal(extractOCode(''), null);
});

test('fetchOCode：從轉址後的 res.url 取回新短碼；失敗回 null', async () => {
  const fake = async () => ({ url: 'https://bc.godfat.org/cats?lang=tw&o=NEW42' });
  assert.equal(await fetchOCode([1, 2], 'tw', fake), 'NEW42');
  const noO = async () => ({ url: 'https://bc.godfat.org/cats?lang=tw' });
  assert.equal(await fetchOCode([], 'tw', noO), null);
  const boom = async () => { throw new Error('offline'); };
  assert.equal(await fetchOCode([1], 'tw', boom), null);
});

test('loadOwned/saveOwned：往返一致、無資料/壞值回空清單', async () => {
  const store = new Map();
  globalThis.localStorage = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    assert.deepEqual(loadOwned(), { ids: new Set(), oCode: null, oDirty: false, updated: null });
    assert.equal(saveOwned({ ids: new Set([44, 1]), oCode: 'abc', oDirty: true, updated: '2026-07-09' }), true);
    const back = loadOwned();
    assert.deepEqual([...back.ids], [1, 44]); // 存檔升冪
    assert.equal(back.oCode, 'abc');
    assert.equal(back.oDirty, true);
    assert.equal(back.updated, '2026-07-09');
    store.set('bcsp:owned', '{broken');
    assert.deepEqual(loadOwned().ids, new Set()); // 壞值 → 空
  } finally {
    delete globalThis.localStorage;
  }
});

test('catsById：id 反向索引、代表名為首見名（目前顯示型態）', () => {
  const byId = catsById(parseCatList(plainDoc));
  assert.equal(byId.size, 793); // /cats 全部貓數
  assert.deepEqual(byId.get(1), { name: '貓咪', rarity: 'normal' });
  assert.equal(byId.get(524).rarity, 'rare');
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: fail > 0（模組不存在）

- [ ] **Step 4: 實作 `extension/lib/owned.js`**

```js
// 擁有貓咪清單（使用者資料，localStorage 鍵 bcsp:owned，列入 SETTINGS_KEYS 清快取不清）。
// 以貓 id 為準（貓名隨型態/語言變動）。o 短碼是 godfat 伺服器端編碼：
// 解碼＝解析 /cats?o=… 頁的 checked，編碼＝fetch ?t=<id>… 讓 godfat 302 轉出短碼。
import { buildOwnedSyncUrl } from './godfat.js';
import { clearCache } from './cache.js';

const OWNED_KEY = 'bcsp:owned';

function store() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

// 讀取清單：永遠回傳完整形狀（無資料/壞值 → 空清單）
export function loadOwned() {
  const empty = { ids: new Set(), oCode: null, oDirty: false, updated: null };
  const s = store();
  if (!s) return empty;
  try {
    const obj = JSON.parse(s.getItem(OWNED_KEY) || 'null');
    if (!obj || !Array.isArray(obj.ids)) return empty;
    return {
      ids: new Set(obj.ids.map(Number).filter(Boolean)),
      oCode: obj.oCode || null,
      oDirty: !!obj.oDirty,
      updated: obj.updated || null,
    };
  } catch {
    return empty;
  }
}

// 寫入清單；配額滿時清資料快取（設定鍵不受影響）騰空間再試一次
export function saveOwned({ ids, oCode = null, oDirty = false, updated = new Date().toLocaleDateString('sv') }) {
  const s = store();
  if (!s) return false;
  const payload = JSON.stringify({ ids: [...ids].sort((a, b) => a - b), oCode, oDirty, updated });
  try {
    s.setItem(OWNED_KEY, payload);
    return true;
  } catch {
    try {
      clearCache();
      s.setItem(OWNED_KEY, payload);
      return true;
    } catch {
      return false;
    }
  }
}

// /cats 頁每貓一個 <input type="checkbox" name="t" value="<id>">；帶 o 開頁時已擁有者有 checked 屬性
export function parseOwnedFromCatsDoc(doc) {
  return [...doc.querySelectorAll('input[name="t"][checked]')]
    .map((el) => Number(el.getAttribute('value')))
    .filter(Boolean)
    .sort((a, b) => a - b);
}

// 寬容解析匯入輸入：任何含 o= 的網址，或裸短碼
export function extractOCode(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/[?&]o=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

// 換碼：把 id 清單交給 godfat（302 → res.url 帶新 o 短碼）。失敗回 null，呼叫端退回不帶 o。
export async function fetchOCode(ids, lang, fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(buildOwnedSyncUrl([...ids], lang));
    return new URL(res.url).searchParams.get('o') || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: `extension/lib/catlist.js` 末尾新增 `catsById`**

```js
// id → { name, rarity } 反向索引：同 id 有多個型態名，以首見名為代表
// （parseCatList 對每隻貓先插入連結文字＝目前顯示型態，Map 迭代序保留首見）
export function catsById(map) {
  const byId = new Map();
  for (const [name, { rarity, id }] of map) {
    if (!byId.has(id)) byId.set(id, { name, rarity });
  }
  return byId;
}
```

- [ ] **Step 6: `extension/lib/cache.js` SETTINGS_KEYS 加兩鍵**

```js
// 使用者設定鍵：清快取（手動清除或配額滿自動騰空間）時保留，只清資料快取
const SETTINGS_KEYS = new Set(['bcsp:gu-force', 'bcsp:route-popup-pos', 'bcsp:owned', 'bcsp:mark-unowned']);
```

`test/cache.test.js` 的「clearCache 清資料快取但保留使用者設定鍵」測試：store 初始資料加 `['bcsp:owned', '{"ids":[1]}'],`，期望結果改為

```js
assert.deepEqual([...store.keys()].sort(), ['bcsp:gu-force', 'bcsp:owned', 'bcsp:route-popup-pos', 'unrelated']);
```

- [ ] **Step 7: `test/fixtures/STRUCTURE.md` 補記**（新段落，照該檔既有風格）

記載:`cats-tw-owned.html` ＝ `/cats?lang=tw&o=4ZIEPP2m`（貓 1/2/44 已勾）;每貓 checkbox `name="t" value="<id>"`,帶 o 開頁時已擁有者有 `checked` 屬性;`?t=<id>…` 送出後 godfat 302 轉址、新 o 短碼在轉址網址上;種子頁帶 `o=` 時擁有貓套 `owned` class(純顯示,不影響計算)。

- [ ] **Step 8: 跑測試確認通過**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: `# fail 0`

- [ ] **Step 9: Commit**

```bash
git add extension/lib/owned.js extension/lib/catlist.js extension/lib/cache.js \
  test/owned.test.js test/cache.test.js test/fixtures/cats-tw-owned.html test/fixtures/STRUCTURE.md
git commit -m "feat(lib): 擁有清單儲存/解析/換碼純函式，設定鍵納入清快取保護"
```

---

### Task 3: catlist 載入器抽出共用（refactor）

**Files:**
- Create: `extension/lib/catlist-loader.js`
- Create: `test/catlist-loader.test.js`
- Modify: `extension/view/view.js:54-82`（刪除內嵌 loadCatList）

**Interfaces:**
- Produces: `loadCatList(lang, {storage?, fetchFn?, parseDoc?, today?}) → Promise<Map|null>`（行為與 view.js 現行內嵌版完全相同：當日快取直接用、抓取成功存快取、解析空/失敗退回過期快取、再不行 null）。

- [ ] **Step 1: 寫失敗測試 `test/catlist-loader.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { loadCatList } from '../extension/lib/catlist-loader.js';

// 極簡 /cats 片段：一組 Uber、一隻貓（結構同 fixture，夠 parseCatList 解析）
const HTML = `<h3>Uber Rare Cat (1)</h3><div class="cats_by_rarity">
  <a href="//bc.godfat.org/cats/524" title="*貓X">貓X</a></div>`;

function makeStorage(init = {}) {
  const store = new Map(Object.entries(init));
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };
}
const deps = (storage, fetchFn) => ({
  storage,
  fetchFn,
  parseDoc: (html) => parseHTML(html).document,
  today: '2026-07-09',
});

test('當日快取直接用、不 fetch', async () => {
  const cached = JSON.stringify({ date: '2026-07-09', names: { 貓Y: ['uber', 9] } });
  const storage = makeStorage({ 'bcsp:cats:tw': cached });
  const map = await loadCatList('tw', deps(storage, async () => { throw new Error('不應呼叫'); }));
  assert.deepEqual(map.get('貓Y'), { rarity: 'uber', id: 9 });
});

test('過期快取 → 重抓並存回', async () => {
  const cached = JSON.stringify({ date: '2026-07-08', names: { 貓Y: ['uber', 9] } });
  const storage = makeStorage({ 'bcsp:cats:tw': cached });
  const map = await loadCatList('tw', deps(storage, async () => ({ ok: true, text: async () => HTML })));
  assert.deepEqual(map.get('貓X'), { rarity: 'uber', id: 524 });
  assert.ok(storage.store.get('bcsp:cats:tw').includes('2026-07-09'));
});

test('抓取失敗 → 過期快取頂著；無快取 → null', async () => {
  const boom = async () => { throw new Error('offline'); };
  const cached = JSON.stringify({ date: '2026-07-01', names: { 貓Y: ['uber', 9] } });
  const map = await loadCatList('tw', deps(makeStorage({ 'bcsp:cats:tw': cached }), boom));
  assert.equal(map.get('貓Y').id, 9);
  assert.equal(await loadCatList('tw', deps(makeStorage(), boom)), null);
});

test('解析不到（結構變動）→ 過期快取頂著', async () => {
  const cached = JSON.stringify({ date: '2026-07-01', names: { 貓Y: ['uber', 9] } });
  const empty = async () => ({ ok: true, text: async () => '<p>改版了</p>' });
  const map = await loadCatList('tw', deps(makeStorage({ 'bcsp:cats:tw': cached }), empty));
  assert.equal(map.get('貓Y').id, 9);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: fail > 0

- [ ] **Step 3: 實作 `extension/lib/catlist-loader.js`**（邏輯自 view.js 原樣搬移，依賴改可注入）

```js
// /cats 對照表載入（每日至多抓一次，禮貌性）：瀏覽器端用預設依賴，測試注入 mock。
// 失敗退回過期快取，再不行回 null（呼叫端 fallback 名單法，見 lib/rarity.js）。
import { buildCatsUrl } from './godfat.js';
import { parseCatList, serializeCatList, deserializeCatList } from './catlist.js';

export async function loadCatList(lang, {
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  fetchFn = globalThis.fetch,
  parseDoc = (html) => new DOMParser().parseFromString(html, 'text/html'),
  today = new Date().toLocaleDateString('sv'), // sv 地區格式即 YYYY-MM-DD（本地時區）
} = {}) {
  const key = `bcsp:cats:${lang}`;
  let cached = null;
  try {
    const raw = JSON.parse(storage?.getItem(key) || 'null');
    if (raw?.names) {
      cached = deserializeCatList(raw.names);
      if (raw.date === today) return cached; // 當日已抓過 → 不重抓
    }
  } catch { /* 壞值 → 重抓 */ }
  try {
    const res = await fetchFn(buildCatsUrl(lang));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const map = parseCatList(parseDoc(await res.text()));
    if (!map.size) return cached; // 結構變動解析不到 → 用過期快取頂著
    try {
      storage?.setItem(key, JSON.stringify({ date: today, names: serializeCatList(map) }));
    } catch { /* 配額滿 → 只用不存 */ }
    return map;
  } catch {
    return cached; // 離線/失敗 → 過期快取或 null
  }
}
```

- [ ] **Step 4: view.js 改用共用載入器**

刪除 view.js 的 `CATS_KEY` 常數與整個 `async function loadCatList() {...}`（第 54–82 行區塊，保留其上方的說明註解併入呼叫處），import 改為：

```js
import { loadCatList } from '../lib/catlist-loader.js';
```

並移除不再使用的 `import { parseCatList, serializeCatList, deserializeCatList } from '../lib/catlist.js';`。檔尾呼叫處改成 `loadCatList(lang).then((m) => { ... })`（原邏輯不變）。

- [ ] **Step 5: 跑測試確認通過**

Run: `npm test 2>&1 | grep -aE 'pass |fail '`
Expected: `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add extension/lib/catlist-loader.js test/catlist-loader.test.js extension/view/view.js
git commit -m "refactor(lib): /cats 對照表載入抽出共用模組（清單頁與 view 共用）"
```

---

### Task 4: 內建清單頁（兼未擁有總覽）

**Files:**
- Create: `extension/owned/owned.html`、`extension/owned/owned.js`、`extension/owned/owned.css`
- Modify: `extension/popup/popup.html`、`extension/popup/popup.js`（入口連結）

**Interfaces:**
- Consumes: `loadCatList`（Task 3）、`catsById`、`loadOwned/saveOwned/parseOwnedFromCatsDoc/extractOCode/fetchOCode`（Task 2）、`buildCatsUrl/buildCatUrl`（Task 1）。
- Produces: 頁面網址約定 `owned/owned.html?lang=<lang>&import=<oCode>`（`import` 選填：自動預填匯入框並跑預覽——Task 6 的 view 提示、popup 都導到這裡）。

- [ ] **Step 1: `extension/owned/owned.html`**

```html
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>擁有貓咪清單</title>
<link rel="stylesheet" href="owned.css">

<header id="topbar">
  <h1>擁有貓咪清單</h1>
  <span id="stats" class="badge"></span>
</header>

<div id="controls">
  <input id="search" type="search" placeholder="搜尋貓名（含各型態名）…" aria-label="搜尋貓名">
  <label class="field"><input id="only-unowned" type="checkbox"> 只看未擁有</label>
  <button id="export" type="button" class="btn-secondary"
    title="換取最新 o 短碼並在 godfat 開啟；該網址可收藏當備份">在 godfat 開啟清單</button>
</div>

<div id="import-box">
  <input id="import-input" type="text" placeholder="貼上含 o= 的 godfat 網址（或裸短碼）…">
  <button id="import-preview" type="button" class="btn-secondary">匯入…</button>
  <span id="import-result"></span>
</div>

<div id="status"></div>
<div id="groups"></div>

<script type="module" src="owned.js"></script>
```

- [ ] **Step 2: `extension/owned/owned.js`**

```js
// 擁有清單頁：資料來源＝/cats 每日快取（全站目錄，與卡池無關）。
// 勾選即存（oDirty，換碼延後到要用時）；「只看未擁有」即未擁有總覽。
import { loadCatList } from '../lib/catlist-loader.js';
import { catsById } from '../lib/catlist.js';
import { loadOwned, saveOwned, parseOwnedFromCatsDoc, extractOCode, fetchOCode } from '../lib/owned.js';
import { buildCatsUrl, buildCatUrl } from '../lib/godfat.js';

const qp = new URLSearchParams(location.search);
const lang = qp.get('lang') || 'tw';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

const RARITY_ORDER = [
  ['legend', '傳說稀有'], ['uber', '超激稀有'], ['supa', '激稀有'],
  ['rare', '稀有'], ['special', '特殊'], ['normal', '基本'],
];

let owned = loadOwned();
let byId = null; // Map id → { name, rarity }（代表名＝目前顯示型態）
const formsById = new Map(); // id → 全型態名串（搜尋用）

function renderStats() {
  const per = new Map(RARITY_ORDER.map(([r]) => [r, { own: 0, all: 0 }]));
  for (const [id, { rarity }] of byId) {
    const c = per.get(rarity);
    if (!c) continue;
    c.all++;
    if (owned.ids.has(id)) c.own++;
  }
  $('#stats').textContent = RARITY_ORDER
    .map(([r, label]) => `${label} ${per.get(r).own}/${per.get(r).all}`)
    .join('　');
}

function renderGroups() {
  const box = $('#groups');
  box.innerHTML = '';
  for (const [rarity, label] of RARITY_ORDER) {
    const cats = [...byId].filter(([, v]) => v.rarity === rarity);
    if (!cats.length) continue;
    const det = document.createElement('details');
    det.open = rarity === 'legend' || rarity === 'uber'; // 抽卡主對象預設展開
    det.innerHTML = `<summary>${label}（${cats.length}）</summary>`;
    const ul = document.createElement('ul');
    for (const [id, { name }] of cats) {
      const li = document.createElement('li');
      li.dataset.id = id;
      li.dataset.forms = formsById.get(id) || name;
      li.innerHTML =
        `<label><input type="checkbox" value="${id}"${owned.ids.has(id) ? ' checked' : ''}> ${esc(name)}</label>` +
        `<a href="${buildCatUrl(id, lang)}" target="_blank" title="在 godfat 查看">🐾</a>`;
      ul.appendChild(li);
    }
    det.appendChild(ul);
    box.appendChild(det);
  }
  applyFilters();
}

function applyFilters() {
  const q = $('#search').value.trim();
  const onlyUn = $('#only-unowned').checked;
  for (const li of document.querySelectorAll('#groups li')) {
    const okQ = !q || li.dataset.forms.includes(q);
    const okU = !onlyUn || !owned.ids.has(Number(li.dataset.id));
    li.hidden = !(okQ && okU);
  }
  if (q) for (const det of document.querySelectorAll('#groups details')) det.open = true; // 搜尋時展開全部
}

$('#groups').addEventListener('change', (ev) => {
  const cb = ev.target.closest('input[type="checkbox"]');
  if (!cb) return;
  const id = Number(cb.value);
  if (cb.checked) owned.ids.add(id); else owned.ids.delete(id);
  owned.oDirty = true; // 本地改動後短碼過期，要用時再換
  saveOwned(owned);
  renderStats();
  if ($('#only-unowned').checked) applyFilters();
});
$('#search').addEventListener('input', applyFilters);
$('#only-unowned').addEventListener('change', applyFilters);

// ── 匯入（預覽 → 取代/合併） ──
let pendingImport = null; // { ids: number[], code: string }
$('#import-preview').addEventListener('click', async () => {
  const code = extractOCode($('#import-input').value);
  const out = $('#import-result');
  pendingImport = null;
  if (!code) { out.textContent = '看不出 o 短碼：請貼含 o= 的 godfat 網址或裸短碼'; return; }
  out.textContent = '讀取中…';
  try {
    const res = await fetch(buildCatsUrl(lang, code));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const ids = parseOwnedFromCatsDoc(doc);
    if (!ids.length) { out.textContent = '此短碼沒有勾選任何貓'; return; }
    pendingImport = { ids, code };
    out.innerHTML =
      `共 ${ids.length} 隻 → ` +
      `<button id="imp-replace" type="button">取代現有清單</button> ` +
      `<button id="imp-merge" type="button">合併進現有清單</button>`;
  } catch {
    out.textContent = '讀取失敗（離線或 godfat 無回應）';
  }
});
$('#import-result').addEventListener('click', (ev) => {
  const act = ev.target.id;
  if (!pendingImport || (act !== 'imp-replace' && act !== 'imp-merge')) return;
  if (act === 'imp-replace') {
    // 取代：內容＝匯入來源，短碼直接沿用（乾淨，不需換碼）
    owned = { ids: new Set(pendingImport.ids), oCode: pendingImport.code, oDirty: false, updated: owned.updated };
  } else {
    // 合併：內容可能超出來源短碼 → 標 dirty 待換碼
    owned = { ids: new Set([...owned.ids, ...pendingImport.ids]), oCode: owned.oCode, oDirty: true, updated: owned.updated };
  }
  saveOwned(owned);
  pendingImport = null;
  $('#import-result').textContent = `已匯入，現有 ${owned.ids.size} 隻`;
  renderGroups();
  renderStats();
});

// ── 匯出：確保短碼最新後在 godfat 開啟 ──
$('#export').addEventListener('click', async () => {
  if (!owned.ids.size) { $('#status').textContent = '清單是空的，先勾幾隻吧'; return; }
  let code = !owned.oDirty ? owned.oCode : null;
  if (!code) {
    $('#status').textContent = '向 godfat 換取 o 短碼中…';
    code = await fetchOCode(owned.ids, lang);
    if (!code) { $('#status').textContent = '換碼失敗（離線或 godfat 無回應）'; return; }
    owned.oCode = code;
    owned.oDirty = false;
    saveOwned(owned);
  }
  $('#status').textContent = '';
  window.open(buildCatsUrl(lang, code), '_blank');
});

(async () => {
  $('#status').textContent = '載入貓咪目錄…';
  const catMap = await loadCatList(lang);
  if (!catMap) {
    $('#status').textContent = '無法取得 /cats 目錄（離線且無快取）；連上網後重新整理即可';
    return;
  }
  byId = catsById(catMap);
  for (const [name, { id }] of catMap) {
    formsById.set(id, formsById.has(id) ? `${formsById.get(id)}|${name}` : name);
  }
  $('#status').textContent = '';
  renderGroups();
  renderStats();
  // ?import=<o>：view 提示／popup 導流入口——自動預填並跑預覽
  const imp = qp.get('import');
  if (imp) { $('#import-input').value = imp; $('#import-preview').click(); }
})();
```

- [ ] **Step 3: `extension/owned/owned.css`**（設計 token 對齊 view.css 的命名與深色模式作法）

```css
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #fff;
  --border: #e4e7ec;
  --text: #1f2937;
  --muted: #6b7280;
  --accent: #3b5bdb;
  --r: 8px;
  --rc: 6px;
  --shadow: 0 1px 3px rgba(0, 0, 0, .08);
  --btn-hover: #f3f4f6;
  --input-bg: #fff;
  --badge-border: #d6def9;
  --danger-fg: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181d;
    --surface: #1e2128;
    --border: #32363f;
    --text: #e5e7eb;
    --muted: #9aa1ac;
    --accent: #748ffc;
    --shadow: 0 1px 3px rgba(0, 0, 0, .4);
    --btn-hover: #2a2e37;
    --input-bg: #16181d;
    --badge-border: #3a4152;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; }
#topbar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
#topbar h1 { font-size: 16px; margin: 0; }
.badge { font-size: 12px; color: var(--muted); border: 1px solid var(--badge-border); border-radius: var(--rc); padding: 2px 8px; background: var(--surface); }
#controls, #import-box { display: flex; align-items: center; gap: 10px; padding: 0 14px 10px; flex-wrap: wrap; }
#search, #import-input { padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--rc); background: var(--input-bg); color: var(--text); }
#import-input { min-width: 320px; }
button { padding: 5px 10px; border: 1px solid var(--border); border-radius: var(--rc); background: var(--surface); color: var(--text); cursor: pointer; }
button:hover { background: var(--btn-hover); }
#status { padding: 0 14px 6px; color: var(--danger-fg); }
#import-result { color: var(--muted); }
#groups { padding: 0 14px 20px; }
#groups details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--shadow); margin-bottom: 10px; }
#groups summary { cursor: pointer; padding: 8px 12px; font-weight: 600; }
#groups ul { list-style: none; margin: 0; padding: 4px 12px 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 12px; }
#groups li { display: flex; align-items: center; gap: 4px; }
#groups li a { text-decoration: none; opacity: .6; }
#groups label { cursor: pointer; }
```

- [ ] **Step 4: popup 入口**

`extension/popup/popup.html` 在 `<button id="load">` 之後加：

```html
    <a id="owned-link" href="#">擁有清單</a>
```

`extension/popup/popup.js` 末尾 IIFE 之前加：

```js
document.querySelector('#owned-link').addEventListener('click', (ev) => {
  ev.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('owned/owned.html') });
});
```

- [ ] **Step 5: 跑測試（不應有任何壞掉）＋瀏覽器手動驗證**

Run: `npm test 2>&1 | grep -aE 'pass |fail '` → Expected: `# fail 0`

瀏覽器驗證（chrome://extensions 重新載入未封裝擴充後）：
1. 直接開 `chrome-extension://<id>/owned/owned.html`：六組分組渲染、統計顯示 `x/793` 分佈。
2. 匯入框貼 `https://bc.godfat.org/cats?lang=tw&o=4ZIEPP2m` → 預覽「共 3 隻」→ 取代 → 貓咪/坦克貓（與 id 44）變勾選、統計更新。
3. 勾/取消任一貓 → 重新整理頁面仍保留（localStorage）。
4. 「只看未擁有」→ 已勾者隱藏。搜尋「健美貓」→ 命中「貓咪」（型態名索引）。
5. 「在 godfat 開啟清單」→ 開出 `/cats?lang=tw&o=…` 且原站勾選一致。
6. popup 開啟 → 點「擁有清單」→ 開出清單頁。

- [ ] **Step 6: Commit**

```bash
git add extension/owned/ extension/popup/popup.html extension/popup/popup.js
git commit -m "feat(owned): 內建擁有清單頁（分組勾選/搜尋/統計/o 碼匯入匯出/未擁有總覽）"
```

---

### Task 5: view 表格未擁有標示＋格子選單標記

**Files:**
- Modify: `extension/view/view.html`（工具列、圖例）
- Modify: `extension/view/view.js`
- Modify: `extension/view/view.css`

**Interfaces:**
- Consumes: `loadOwned/saveOwned`（Task 2）。
- Produces: view.js 模組內 `ownedData`（loadOwned() 結果，可變）、`catIdOf(name)`、`applyOwnedMarks()`——Task 6/7 直接使用。

- [ ] **Step 1: view.html 工具列與圖例**

`#controls` 的「顯示」grp 內、`顯示 B 軌` label 之後加：

```html
    <label class="field"><input id="mark-unowned" type="checkbox"> 標示未擁有</label>
    <a id="owned-page" href="#" target="_blank" title="管理擁有的貓">擁有清單</a>
    <span id="owned-empty-hint" class="hint" hidden>（清單為空——先到「擁有清單」建立）</span>
```

`#legend-pop` 末尾加：

```html
  <span class="lg"><i class="unowned-dot"></i>未擁有</span>
```

- [ ] **Step 2: view.js 狀態與標示**

import 區加：

```js
import { loadOwned, saveOwned } from '../lib/owned.js';
```

`guValues` 初始化區塊之後加：

```js
// 擁有清單（bcsp:owned，使用者資料）：未擁有標示、格子選單標記、godfat 連結帶 o 共用
const MARK_KEY = 'bcsp:mark-unowned';
let ownedData = loadOwned();
document.querySelector('#owned-page').href = `../owned/owned.html?lang=${encodeURIComponent(lang)}`;
const markCb = document.querySelector('#mark-unowned');
markCb.checked = localStorage.getItem(MARK_KEY) === '1';
markCb.addEventListener('change', () => {
  localStorage.setItem(MARK_KEY, markCb.checked ? '1' : '0');
  applyOwnedMarks();
});
// 清單頁在別分頁改了清單 → 同步重套（storage 事件跨分頁同源觸發）
window.addEventListener('storage', (ev) => {
  if (ev.key === 'bcsp:owned') { ownedData = loadOwned(); applyOwnedMarks(); }
});

function catIdOf(name) { return catMap?.get(name)?.id ?? null; }

// 未擁有標示：渲染後補套 class（同 applyFind 模式）——不動 cellHtml，catMap 晚到也能補
function applyOwnedMarks() {
  const on = markCb.checked && !!catMap && ownedData.ids.size > 0;
  document.querySelector('#owned-empty-hint').hidden = !(markCb.checked && ownedData.ids.size === 0);
  for (const td of document.querySelectorAll('#grid tbody td[data-n]')) {
    const id = catIdOf(td.getAttribute('data-n'));
    td.classList.toggle('unowned', on && id != null && !ownedData.ids.has(id));
  }
}
```

`renderTable` 尾端 `applyFind();` 之後加一行 `applyOwnedMarks();`。
檔尾 `loadCatList(lang).then((m) => {...})` 回呼內 `applyFind();` 之後加 `applyOwnedMarks();`。

- [ ] **Step 3: 格子選單加「標記為已擁有」**

`openCellMenu` 的 `cellMenu.innerHTML` 改為（在 find 之前插入 own 鈕）：

```js
  const cid = catIdOf(menuCtx.name);
  const ownBtn = cid == null
    ? '<button data-act="own" disabled title="目錄查無此貓（離線或目錄未更新），暫無法標記">標記為已擁有</button>'
    : `<button data-act="own">${ownedData.ids.has(cid) ? '取消已擁有標記' : '標記為已擁有'}</button>`;
  cellMenu.innerHTML =
    `<button data-act="cell">${hasCell ? '移除此位置目標' : '加入此位置目標'}</button>` +
    `<button data-act="cat">${hasCat ? '移除此貓目標' : '加入此貓目標（所有出現）'}</button>` +
    ownBtn +
    `<button data-act="find">搜尋此貓</button>` +
    `<button data-act="copy">複製貓咪名稱</button>`;
```

選單 click handler 加分支（`act === 'copy'` 之前）：

```js
  else if (act === 'own') {
    const cid = catIdOf(name);
    if (cid != null) {
      if (ownedData.ids.has(cid)) ownedData.ids.delete(cid);
      else ownedData.ids.add(cid);
      ownedData.oDirty = true; // 短碼過期，要用時再換
      saveOwned(ownedData);
      applyOwnedMarks();
    }
  }
```

- [ ] **Step 4: view.css 樣式**

`:root` 加 `--unowned: #0ca678;`，深色覆寫區加 `--unowned: #38d9a9;`。規則區加：

```css
/* 未擁有角標：小圓點，不動 godfat 底色 */
#grid td.unowned { position: relative; }
#grid td.unowned::after {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--unowned);
  box-shadow: 0 0 0 1px var(--surface);
}
#legend-pop i.unowned-dot { background: var(--unowned); border-radius: 50%; }
```

- [ ] **Step 5: 測試＋瀏覽器驗證**

Run: `npm test 2>&1 | grep -aE 'pass |fail '` → Expected: `# fail 0`

瀏覽器（可離線：view 頁用 `test/fixtures/` 解析結果餵 localStorage 快取渲染）：
1. 清單空＋勾「標示未擁有」→ 無圓點、出現「清單為空」提示。
2. 清單頁匯入 3 隻（o=4ZIEPP2m）後回 view → 勾「標示未擁有」→ 幾乎所有格子有圓點（稀有池的貓咪/坦克貓除外）。
3. 點格子 →「標記為已擁有」→ 該貓所有格子圓點消失；再開選單顯示「取消已擁有標記」。
4. 開著 view 與清單頁兩分頁，清單頁勾選 → view 圓點即時更新（storage 事件）。
5. 深淺色模式各看一次圓點對比。

- [ ] **Step 6: Commit**

```bash
git add extension/view/view.html extension/view/view.js extension/view/view.css
git commit -m "feat(view): 未擁有貓角標標示與格子選單快速標記"
```

---

### Task 6: godfat 連結帶 o＋popup 帶入與匯入提示

**Files:**
- Modify: `extension/view/view.js`、`extension/view/view.html`
- Modify: `extension/popup/popup.js`

**Interfaces:**
- Consumes: `buildEventUrl({..., o})`、`parseSeedParamsFromUrl().o`（Task 1）、`fetchOCode`（Task 2）、`ownedData`（Task 5）。

- [ ] **Step 1: view 連結帶 o**

view.js 加 helper（`catIdOf` 旁）：

```js
// godfat 外連帶擁有清單（原站套 owned 底色）；清單空或無短碼則不帶
function ownedO() { return ownedData.ids.size && ownedData.oCode ? ownedData.oCode : undefined; }
```

`renderTable` 的 nameRow `buildEventUrl({...})` 與 `renderError` 的 `buildEventUrl({...})` 各加 `o: ownedO()` 參數。

- [ ] **Step 2: oDirty 時開連結前換碼**

view.js import 加 `fetchOCode`（併入 Task 5 的 owned.js import）。`#grid` 既有 click listener 之前加：

```js
// 本地清單改過（oDirty）→ 開 godfat 前先換一次新短碼（單次輕量請求）；失敗照常開、僅短碼較舊/缺
document.querySelector('#grid').addEventListener('click', async (ev) => {
  const a = ev.target.closest('a.gf');
  if (!a || !ownedData.oDirty || !ownedData.ids.size) return;
  ev.preventDefault();
  const code = await fetchOCode(ownedData.ids, lang);
  if (code) {
    ownedData.oCode = code;
    ownedData.oDirty = false;
    saveOwned(ownedData);
    renderTable(currentEntries); // 表頭連結換上新短碼
  }
  const url = new URL(a.href);
  if (code) url.searchParams.set('o', code);
  window.open(url, '_blank');
});
```

- [ ] **Step 3: popup 帶 o、view 顯示匯入提示**

`extension/popup/popup.js` 的 `#load` handler、`params` 組好後加：

```js
  // godfat 頁帶 o（擁有清單短碼）→ 轉交 view：連結沿用＋與本地不同時提示匯入
  if (SEED.o) params.set('o', SEED.o);
```

view.html 的 `#controls` 內 `#clear-cache` 之前加：

```html
  <span id="owned-import-hint" class="hint" hidden>godfat 頁帶有擁有清單 → <a href="#" target="_blank">匯入…</a></span>
```

view.js 檔尾初始化區（`load()` 呼叫前）加：

```js
// godfat 網址上帶著與本地不同的 o → 一鍵導向清單頁匯入（取代/合併在那邊選）
{
  const pageO = qp.get('o');
  if (pageO && pageO !== ownedData.oCode) {
    const hint = document.querySelector('#owned-import-hint');
    hint.hidden = false;
    hint.querySelector('a').href =
      `../owned/owned.html?lang=${encodeURIComponent(lang)}&import=${encodeURIComponent(pageO)}`;
  }
}
```

- [ ] **Step 4: 測試＋瀏覽器驗證**

Run: `npm test 2>&1 | grep -aE 'pass |fail '` → Expected: `# fail 0`

瀏覽器：
1. 有清單（3 隻、oCode 乾淨）→ view 表頭「在 godfat 開啟」連結含 `&o=4ZIEPP2m`；開頁後 godfat 對貓咪/坦克貓格套 azure 底。
2. view 格子選單標記一隻（oDirty）→ 點「在 godfat 開啟」→ 稍候開出的網址帶**新的** o 短碼；再看連結已更新、不再重複換碼。
3. godfat 頁網址手動加 `&o=4ZIEPP2m`（與本地不同時）→ popup 載入比較 → view 出現「匯入…」提示 → 點入清單頁自動跑預覽。
4. 清單清空 → 連結不帶 o。

- [ ] **Step 5: Commit**

```bash
git add extension/view/view.js extension/view/view.html extension/popup/popup.js
git commit -m "feat(view): godfat 連結帶擁有清單短碼（dirty 先換碼），popup 帶入 o 並提示匯入"
```

---

### Task 7: 路線規劃批次目標（可逐隻取捨）

**Files:**
- Modify: `extension/view/view.html`（按鈕＋選擇面板）
- Modify: `extension/view/view.js`
- Modify: `extension/view/view.css`

**Interfaces:**
- Consumes: `catMap`、`ownedData`、`catAccept(name)`、`routeTargets`、`renderTargetChips()`、`mergeBanners`、`currentParams()`（皆 view.js 既有/Task 5）。

- [ ] **Step 1: view.html**

`#route-area` 內 `#plan-route` 之前加：

```html
    <button id="add-unowned" type="button" class="btn-secondary" disabled>未擁有目標…</button>
```

`#cell-menu` 之前加面板：

```html
<div id="unowned-pick" hidden>
  <div id="unowned-pick-head">
    <span class="find-title">表內未擁有的貓</span>
    <button id="up-close" type="button" title="關閉">×</button>
  </div>
  <div id="unowned-pick-body"></div>
  <div id="unowned-pick-foot">
    <button id="up-all" type="button" class="btn-secondary">全選</button>
    <button id="up-none" type="button" class="btn-secondary">全不選</button>
    <button id="up-add" type="button">加入目標</button>
  </div>
</div>
```

- [ ] **Step 2: view.js 收集與面板**

`addFindAsTargets` 之後加：

```js
// ── 批次目標：表內出現且未擁有的貓 ──────────────────────────
const RARITY_SEQ = ['legend', 'uber', 'supa', 'rare', 'special', 'normal'];
const RARITY_LABEL = { legend: '傳說', uber: '超激', supa: '激稀有', rare: '稀有', special: '特殊', normal: '基本' };

// 只看未隱藏卡池、顯示抽數視野內；主格與重抽附註的貓名皆算「出現」；目錄查無者不列、另計數
function collectUnownedInTable() {
  const seen = new Set();
  const groups = new Map(); // rarity -> [name]
  let unknown = 0;
  const merged = mergeBanners(currentEntries.filter((e) => !hidden.has(e.banner.id)));
  const { useCount } = currentParams();
  for (const [pos, byBanner] of merged.byPos) {
    if (parseInt(pos, 10) > useCount) continue; // 快取可能大於顯示抽數 → 與畫面視野一致
    for (const c of byBanner.values()) {
      for (const name of [c.name, c.dupe?.name]) {
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const hit = catMap?.get(name);
        if (!hit) { unknown++; continue; }
        if (ownedData.ids.has(hit.id)) continue;
        if (!groups.has(hit.rarity)) groups.set(hit.rarity, []);
        groups.get(hit.rarity).push(name);
      }
    }
  }
  return { groups, unknown };
}

function openUnownedPick() {
  const { groups, unknown } = collectUnownedInTable();
  const parts = [];
  for (const r of RARITY_SEQ) {
    const names = (groups.get(r) || []).sort();
    if (!names.length) continue;
    parts.push(
      `<div class="up-group"><div class="up-head">${RARITY_LABEL[r]}（${names.length}）</div>` +
        names.map((n) => `<label><input type="checkbox" value="${esc(n)}" checked> ${esc(n)}</label>`).join('') +
        '</div>'
    );
  }
  if (!parts.length) parts.push('<p class="empty">表內沒有未擁有的貓</p>');
  if (unknown) parts.push(`<p class="hint">另有 ${unknown} 名查無 /cats 目錄、無法判定，未列入</p>`);
  document.querySelector('#unowned-pick-body').innerHTML = parts.join('');
  document.querySelector('#unowned-pick').hidden = false;
}

// 啟用條件：目錄與卡池已載入、清單非空（空清單＝全部未擁有，列出無意義）
function updateAddUnowned() {
  const btn = document.querySelector('#add-unowned');
  btn.disabled = !catMap || !currentEntries.length || !ownedData.ids.size;
  btn.title = !ownedData.ids.size ? '先到「擁有清單」建立清單' : '列出表內未擁有的貓，勾選後批量加入目標';
}
```

事件掛載區加：

```js
document.querySelector('#add-unowned').addEventListener('click', openUnownedPick);
document.querySelector('#up-close').addEventListener('click', () => { document.querySelector('#unowned-pick').hidden = true; });
document.querySelector('#up-all').addEventListener('click', () => {
  for (const cb of document.querySelectorAll('#unowned-pick-body input')) cb.checked = true;
});
document.querySelector('#up-none').addEventListener('click', () => {
  for (const cb of document.querySelectorAll('#unowned-pick-body input')) cb.checked = false;
});
document.querySelector('#up-add').addEventListener('click', () => {
  for (const cb of document.querySelectorAll('#unowned-pick-body input:checked')) {
    const name = cb.value;
    const id = `cat:${name}`;
    if (!routeTargets.has(id)) routeTargets.set(id, { id, kind: 'cat', name, label: name, accept: catAccept(name) });
  }
  document.querySelector('#unowned-pick').hidden = true;
  renderTargetChips();
  renderTable(currentEntries);
});
```

三處呼叫 `updateAddUnowned()`：`load()` 尾端（`renderTable(entries);` 後）、`loadCatList` 回呼內、Task 5 的 storage 事件與格子選單 own 分支內（清單增減影響啟用狀態與內容）。

- [ ] **Step 3: view.css 面板樣式**

```css
/* 批次目標選擇面板：置中浮層 */
#unowned-pick {
  position: fixed;
  inset: 10vh auto auto 50%;
  transform: translateX(-50%);
  width: min(560px, 92vw);
  max-height: 76vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  z-index: 30;
}
#unowned-pick[hidden] { display: none; }
#unowned-pick-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); }
#unowned-pick-body { overflow: auto; padding: 8px 12px; }
#unowned-pick-foot { display: flex; gap: 8px; justify-content: flex-end; padding: 8px 12px; border-top: 1px solid var(--border); }
.up-group { margin-bottom: 8px; }
.up-head { font-weight: 600; margin-bottom: 2px; }
.up-group label { display: inline-flex; align-items: center; gap: 4px; margin: 0 12px 2px 0; cursor: pointer; }
```

- [ ] **Step 4: 測試＋瀏覽器驗證**

Run: `npm test 2>&1 | grep -aE 'pass |fail '` → Expected: `# fail 0`

瀏覽器：
1. 清單空 → 按鈕 disabled（title 提示）；匯入 3 隻後啟用。
2. 開面板 → 按實際稀有度分組、預設全勾；取消其中幾隻 → 加入目標 → chips 出現、格子高亮、「規劃路線」可跑出 Pareto 方案。
3. 隱藏一個卡池再開面板 → 只在該池出現的貓不再列出。
4. 已是目標的貓再加入 → 不重複（chips 數不變）。

- [ ] **Step 5: Commit**

```bash
git add extension/view/view.html extension/view/view.js extension/view/view.css
git commit -m "feat(route): 未擁有貓批次目標選擇器（按稀有度分組、可逐隻取捨）"
```

---

### Task 8: 文件

**Files:**
- Modify: `README.md`（使用章節、重要實作細節、禮貌性）
- Modify: `CLAUDE.md`（架構速記）

- [ ] **Step 1: README.md**

「使用」清單加一項（規劃路線之後）：

```markdown
6. **擁有清單**（記錄你有的貓 → 標示新貨、批次目標）：
   - popup／view 工具列開「擁有清單」頁：按稀有度分組勾選、搜尋（含各型態名）、「只看未擁有」總覽
   - **匯入匯出走 godfat 原生 o 短碼**：在 godfat `/cats` 頁勾過的清單，貼網址即可匯入（取代或合併）；「在 godfat 開啟清單」可換取最新短碼、該網址兼作備份
   - view 勾「標示未擁有」→ 未擁有的貓在格子角落標小圓點（不動 godfat 底色）；點格子選單可直接「標記為已擁有」
   - 「在 godfat 開啟」連結會帶上清單（原站套 owned 底色）；本地改過清單會先向 godfat 換新短碼
   - 路線規劃「未擁有目標…」：列出表內未擁有的貓（按實際稀有度分組、預設全勾、可逐隻取捨）批量加入目標
```

「重要實作細節」加一則：

```markdown
- **擁有清單以貓 id 為準、o 短碼為交換格式**：清單存 localStorage（`bcsp:owned`，清快取不清）。o 短碼是 godfat 伺服器端編碼——匯入靠解析 `/cats?o=…` 頁的 checked、匯出/換碼靠 `?t=<id>…` 網址讓 godfat 302 轉出短碼（全 793 隻的網址僅 ~4.7KB，實測可行）。`o` 對 godfat 是純顯示參數，不影響抽卡計算。
```

「禮貌性」段補：「換碼請求只在開 godfat 連結且清單有改動、或手動匯出時發生（單次輕量請求）」。

- [ ] **Step 2: CLAUDE.md 架構速記**

```markdown
- `extension/owned/`：擁有清單頁（純網頁，與 view 同源共用 localStorage；資料鍵 `bcsp:owned` 屬使用者設定、清快取不清）。o 短碼＝godfat 伺服器端編碼：解碼靠解析 `/cats?o=…` 的 checked、編碼靠 `?t=id…` 讓 godfat 302 轉出。
```

- [ ] **Step 3: 全綠確認＋Commit**

Run: `npm test 2>&1 | grep -aE 'pass |fail '` → Expected: `# fail 0`

```bash
git add README.md CLAUDE.md
git commit -m "docs: 擁有清單功能說明與架構速記"
```

---

## 完成後

1. `npm test` 全綠、上述各 Task 的瀏覽器驗證跑過。
2. **停在 `feat/owned-cats` 分支等使用者實測**；不合併、不 push。
3. 合併時再向使用者提 squash 整理方案（預期壓成：lib 兩筆或一筆＋owned 頁＋view 標示＋連結帶 o＋route 批次＋docs）。
