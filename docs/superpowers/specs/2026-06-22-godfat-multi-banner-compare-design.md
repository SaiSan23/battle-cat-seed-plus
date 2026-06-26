# godfat 多卡池同頁比較擴充 — 設計文件

- **日期**：2026-06-22
- **狀態**：設計已核可，待寫實作計畫
- **目標瀏覽器**：Chrome / Edge 等 Chromium（Manifest V3）

## 1. 問題與目標

目前使用 [godfat 的 Battle Cats 種子追蹤網站](https://bc.godfat.org/) 時，每次想查看**不同卡池（banner）在同一種子下的結果**，都得切換上方事件下拉選單並重新載入頁面，無法同時比較多個卡池。

由於所有卡池共用同一條種子序列，玩家常見的需求是「**這一抽在哪個卡池最划算**」（指南中明確建議檢查每個進行中卡池的格子）。本工具讓使用者：

1. 一次**勾選多個卡池**
2. **一次載入**全部
3. 以**同位置橫向對齊**的方式列在同一頁比較

### 成功標準

- 在 godfat 種子頁按擴充圖示，能自動帶入當前種子並列出可選卡池
- 勾選 N 個卡池後，於單一頁面看到所有卡池、依抽數位置對齊
- 每個卡池欄與 godfat 原頁該卡池的內容一致（含稀有度顏色、Uber、**保證 Uber 欄**與**換軌箭頭**）
- 不需為了比較不同卡池而重新載入頁面

## 2. 關鍵技術決策與理由

| 決策 | 選擇 | 理由 |
| --- | --- | --- |
| 形式 | **瀏覽器擴充（Chromium MV3）** | 純靜態網頁抓 godfat 會被 CORS 擋（實測 godfat 無 `Access-Control-Allow-Origin` 標頭）；擴充可申請 host 權限直接抓，無 CORS 問題 |
| 資料來源 | **抓 godfat 並解析** | godfat 已算好 A/B 軌、保證欄、換軌、重複稀有；忠實沿用其計算最穩、最快、最不易出錯 |
| 渲染取向 | **取向 A：忠實沿用 godfat 欄位** | 每卡池照搬 godfat 原欄位群組（A / A保證 / B / B保證），共用抽數縱軸對齊。保證／換軌自然包含，解析邏輯最單純 |
| 版面 | **同位置橫向對齊** | 同一抽數位置橫看一列，立即看出哪個卡池該位置最佳 |
| v1 範疇 | **含保證 Uber 與重複稀有換軌** | 因抓 godfat，這些只是多解析幾個欄位再對齊，不需自行重算 |

> CORS 實測（2026-06-22）：`curl -H "Origin: https://example.github.io" https://bc.godfat.org/` 的回應不含任何 `Access-Control-Allow-*` 標頭，且回傳為 HTML。

## 3. godfat 網址與資料說明

- 種子頁網址參數：`seed`（種子）、`last`（上次位置）、`event`（卡池 ID，如 `2026-04-24_1047`）、`lang`（語言，如 `tw`）、`count`（顯示抽數）
- 回應為 HTML，含一張大表：欄位為 **A 軌、（A 保證軌，若為保證事件）、B 軌、（B 保證軌）**；列為抽數位置；每格含稀有度（以顏色／CSS 類別表示）、貓名、換軌箭頭（如 `→3B`）
- 同一 `seed` 下，切換 `event` 即可取得各卡池在相同種子的表；抽數位置（縱軸）在所有卡池間共用，故可逐列對齊
- 可選卡池清單：解析任一 godfat 頁的事件 `<select>` 選項取得（value = 卡池 ID、text = 名稱與日期區間）

## 4. 架構與元件

各模組各司其職、可獨立理解與測試：

| 模組 | 職責 | 相依 |
| --- | --- | --- |
| `extension/manifest.json` | MV3 設定；`host_permissions: https://bc.godfat.org/*`；權限 `activeTab`、`storage`、`tabs`；action popup | — |
| `extension/content/content.js` | 注入 godfat 頁；讀取當前種子參數與事件下拉選單全部選項；回應 popup 的查詢 | godfat 頁 DOM |
| `extension/popup/` (`popup.html/js/css`) | 按圖示時開啟；顯示偵測到的種子；卡池勾選清單（含搜尋、預設勾選進行中卡池）；「載入比較」鈕 → 開 view 分頁 | content script、`lib/godfat.js` |
| `extension/lib/godfat.js` | **純函式**：由 `{seed, event, count, lang, last}` 組出 godfat 網址；解析事件清單字串 | — |
| `extension/lib/parser.js` | **純函式**：godfat HTML（或 Document）→ 結構化卡池表。每抽位置含 A/A保證/B/B保證 cell：`{rarity, name, isUber, trackSwitchTo}`；並判斷該卡池是否含保證欄。標 parser 版本號 | — |
| `extension/lib/merge.js` | **純函式**：多個已解析卡池表 → 以抽數位置為共用縱軸的合併模型 | — |
| `extension/lib/storage.js` | session 快取（`(seed,event,count)` → HTML／已解析結果）、記住上次勾選 | `chrome.storage` |
| `extension/view/` (`view.html/js/css`) | 合併比較頁：依參數抓各卡池 → parser → merge → 渲染對齊表格 | `lib/*` |
| `extension/icons/` | 擴充圖示 | — |

### 渲染（view）細節（取向 A）

- 每個卡池為一個**欄位群組**，照 godfat 原欄位：A 軌、A 保證（若有）、B 軌、B 保證（若有）
- 共用縱軸 = 抽數位置（`1A/2A/3A…` 與對應 `1B/2B…`），逐列對齊
- **凍結首欄**（位置）與**凍結表頭**（卡池名稱）；卡池多時**橫向捲動**
- 視覺：稀有度顏色沿用對照、Uber 強調、保證欄顯示保證 Uber、換軌以箭頭標示目標位置
- v1 控制項（精簡）：
  - **調整 `count`**（顯示抽數）
  - **隱藏某個卡池**：切換該欄是否顯示；資料仍保留在快取，可再顯示而不需重抓
  - **在 godfat 開啟**：每個卡池欄提供連結，用相同的種子與 `count` 在新分頁開啟 godfat 官方「只看此卡池」的頁面（用於核對解析、或使用本工具不支援的互動如點貓名更新種子）

## 5. 資料流

1. 使用者在 godfat 種子頁按擴充圖示
2. content script 回傳「當前種子參數 ＋ 全部卡池清單」給 popup
3. 使用者勾選卡池 → popup 開新分頁（view），參數帶 `seed, count, lang, events=逗號清單`
4. view 以 host 權限**直接 fetch 各卡池 godfat 頁**（無 CORS），**限制並發（預設 5）**並顯示進度
5. parser 解析每頁 → merge 對齊 → 渲染表格
6. 本次 session 以 `(seed,event,count)` 快取結果，避免重複抓取

## 6. 錯誤處理

- **不在 godfat 頁／網址無 seed**：popup 提示「請先在 godfat 種子頁開啟」，並提供手動貼上 seed 參數的退路
- **某卡池抓取失敗**（非 200／斷線／逾時）：該欄顯示錯誤 ＋ 重試鈕 ＋「在 godfat 開啟」連結；其他卡池照常顯示
- **解析失敗**（godfat 改版導致選擇器失效）：優雅降級，標示失效位置；parser 標版本號便於修復。**此為主要維護風險，須明列於 README**
- **選太多卡池**：並發上限 ＋ 進度條；提醒「godfat 為社群資源，請勿一次大量抓取」
- **godfat 排隊／緩慢**：逾時設定 ＋ 重試鈕

### 對 godfat 的禮貌性

- 限制並發（預設 5）、本次 session 快取、不自動定時刷新；明示這是社群資源

## 7. 測試策略

- **單元測試**：`parser`、`merge`、`godfat`（網址組裝／事件清單解析）皆為純函式
  - 用存下的真實 godfat HTML fixture：至少三種——含保證 Uber、無保證、含重複稀有換軌
  - 以 Node 內建 `node:test` ＋ `linkedom`（在 Node 提供 DOM 解析）
- **手動測試**：以未封裝（unpacked）方式載入 Chrome，於真實 godfat 種子頁逐一比對
  - 每個卡池欄是否與 godfat 原頁一致
  - 保證欄與換軌箭頭是否正確
  - 凍結首欄／表頭、橫向捲動、稀有度顏色

## 8. 專案結構

```
battle-cat-seed-plus/
  extension/
    manifest.json
    popup/    popup.html popup.js popup.css
    content/  content.js
    view/     view.html view.js view.css
    lib/      godfat.js parser.js merge.js storage.js
    icons/
  test/
    fixtures/*.html
    parser.test.js  merge.test.js
  docs/
    seed-tracking/...        （現有筆記）
    superpowers/specs/...    （本文件）
```

## 9. 範疇外（Backlog）

記錄但 v1 不做：

1. **獨立 GitHub Pages 網頁版**（需 CORS 代理如 Cloudflare Worker，或改為本地自算種子）
2. **CLI／腳本匯出**（輸出 HTML/CSV）
3. **Firefox 相容**（WebExtension）
4. **直接在 godfat 頁內嵌比較面板**（不開新分頁）
5. **本地自算種子**（移植種子計算邏輯與遊戲資料，完全脫離 godfat 依賴）
6. **view 進階**：B 軌顯示切換、欄位密度選項、匯出目前視圖

## 10. 假設與已知風險

- **假設**：godfat 的事件 `<select>` 與表格 HTML 結構在近期穩定；同一 seed 下各卡池抽數位置可逐列對齊
- **風險**：godfat 改版 → parser 失效（以版本號 ＋ 優雅降級 ＋ fixture 測試緩解）
- **風險**：大量抓取對 godfat 造成負擔（以並發上限 ＋ 快取 ＋ 使用提示緩解）
