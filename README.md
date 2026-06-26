# Battle Cats Seed+ 多卡池比較

一個 Chrome / Edge（Manifest V3）瀏覽器擴充，讓你在 [godfat 種子追蹤頁](https://bc.godfat.org/) 一次勾選多個卡池（banner），於**單一頁面以「同抽數位置橫向對齊」**的方式比較。

由於所有卡池共用同一條種子序列，常見需求是「這一抽在哪個卡池最划算」。本工具把多個卡池並排，同一抽數位置（`1A`、`2A`…）排在同一列，一眼看出哪個卡池該位置是超激／保證 Uber，不必反覆切換卡池重新載入。

## 安裝（未封裝載入）

1. 開啟 `chrome://extensions`
2. 開啟右上角「開發人員模式」
3. 點「載入未封裝項目」，選擇本專案的 `extension/` 資料夾

## 使用

1. 在 godfat 的**種子頁**（網址含 `seed=...`）開啟頁面
2. 點擴充圖示 → 會自動帶入當前種子，並列出可選卡池（進行中者預設勾選）
3. 勾選想比較的卡池 → 按「載入比較」
4. 開啟比較頁：
   - 第一欄為抽數位置，每個卡池一欄，依位置橫向對齊
   - 稀有度以底色標示、目前位置有外框
   - 凍結首欄與表頭，可橫向捲動
   - 上方可勾選**隱藏／顯示**某卡池欄（不需重抓）、調整顯示抽數
   - **模擬保證**下拉（預設「無」）：選 11（一般）或 15（Buster step-up）後重抓，於各格顯示「保證: …」；選「無」則只比較 A/B 軌 Result
   - 每欄「在 godfat 開啟」可用相同種子在 godfat 開啟該單卡池原頁

## 開發

```bash
npm install
npm test      # node:test + linkedom，對 godfat HTML fixture 做單元測試
```

- 純函式（`extension/lib/`）皆有單元測試：`godfat.js`（網址）、`parser.js`（解析）、`merge.js`（合併）、`concurrency.js`（並發）。
- 測試 fixture 與 godfat DOM 結構筆記見 `test/fixtures/`（含 `STRUCTURE.md`）。

## 重要實作細節

- **資料來源**：擴充以 `host_permissions` 直接抓取 godfat 各卡池頁面（避開 CORS），解析其 HTML。不自行重算種子（忠實沿用 godfat 計算）。
- **保證欄是「模擬」功能**：godfat 的「Guaranteed」表頭**永遠存在，不代表該卡池真的有必中**；godfat 也**從不自動填入**保證欄（原生整欄空白）。保證純粹是使用者透過 `force_guaranteed=2/7/11/15` 開啟的模擬（保證格 pick id 帶 `G` 字尾）。godfat 的 HTML 無法判斷哪個卡池真有必中（該資訊在遊戲資料）。因此本工具把它做成預設關閉的「模擬保證」下拉，比照 godfat，由使用者自行套用，不對任何卡池捏造保證。
- **稀有度 class**：`rare` / `supa` / `supa_fest` / `uber` / `uber_fest` / `exclusive`（`legend` 亦可能出現）。

## 已知維護風險

godfat 改版可能使 HTML 結構改變、導致 `parser.js` 失效。`parser.js` 標有 `PARSER_VERSION`；修復時請更新 `test/fixtures/` 內的 fixture 與 `STRUCTURE.md`，並讓單元測試通過。

## 對 godfat 的禮貌性

godfat 是社群資源。本工具：抓取**並發上限 5**、本次 session 內快取（同 count 不重抓的最佳化見 backlog）、不自動定時刷新。請勿一次大量抓取。

## Backlog（v1 未做）

1. 獨立 GitHub Pages 網頁版（需 CORS 代理或本地自算種子）
2. CLI／腳本匯出（HTML/CSV）
3. Firefox（WebExtension）相容
4. 直接在 godfat 頁內嵌比較面板（不開新分頁）
5. 本地自算種子（完全脫離 godfat 依賴）
6. view 進階：B 軌顯示切換、欄位密度、匯出目前視圖、`(seed,event,count)` 記憶體快取（`lib/storage.js`）
7. 換軌落點解析（保證格 `<a href>` 內已含落點 seed/last，可進一步呈現）
8. step-up（Buster）卡池自動改用 `force_guaranteed=15`
