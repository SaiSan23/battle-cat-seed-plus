# 比較頁同抽數 A/B 軌並排 — 設計

日期:2026-07-02

## 背景與問題

比較頁(`extension/view/`)目前把每個 position 當成一列,`merge.js` 的排序為
`posSortKey = track*1e6 + n`,結果是 **A 軌 1A~100A 全部排在上半、B 軌 1B~100B 全部
排在下半**,彼此離很遠。使用者常見需求是「同一抽數換軌後(B 軌)會拿到什麼」,但目前要
上下捲很遠才能對照同一抽的 A 與 B。

## 目標

在比較頁讓**同一抽數 N 的 A 軌與 B 軌並排對照**。以「每卡池欄拆成 `A | B` 子欄」呈現,
並加一個「顯示 B 軌」開關,**預設關(只看 A 軌)**。

## 非目標

- 不重算種子、不改抓取邏輯(B 軌資料本來就已在抓回的 HTML / parser 結果中)。
- 不改 parser、不改 concurrency、不改 cache。
- 不做 backlog 其他項(欄位密度、匯出、換軌落點進階呈現等)。

## 設計

### 1. 資料模型(`extension/lib/merge.js`)

- 新增回傳欄位 `numbers`:所有 cell 的抽數去重、升冪排序的陣列
  (`[...new Set(allPos.map(p => parseInt(p,10)))].sort((a,b)=>a-b)`)。
- `positions`、`anyGuaranteed`、`byPos` 維持不變(`byPos` 仍以 `1A`/`1B` 為鍵)。
- 取值約定:抽數 `N`、卡池 `id` 的 A 格 = `byPos.get(N+'A')?.get(id)`,
  B 格 = `byPos.get(N+'B')?.get(id)`。

### 2. 版面(`extension/view/view.js` `renderTable`)

列(row)由「一列一個 position」改為「**一列一個抽數 N**」(用 `merged.numbers`)。

欄結構:第 1 欄為抽數位置,之後每個可見卡池:
- 開關**關**:1 個子欄,顯示該抽的 A 格(`N+'A'`)。
- 開關**開**:2 個子欄 `A | B`,分別顯示 `N+'A'`、`N+'B'` 格。

位置欄第一欄文字:開關關時顯示 `NA`(維持與現況一致的 `1A` 樣式);開關開時可顯示純
數字 `N`(A/B 由子標與子欄區分)。實作上以 `numbers` 產生列,位置欄依開關決定顯示
`N` 或 `NA`。

### 3. 表頭

- 開關**關**:維持現有兩列表頭 —
  1. 日期(相鄰同日期 colspan=span)
  2. 卡池簡稱(`title` 掛完整名稱)+「在 godfat 開啟」連結
  位置欄 `rowspan=2`,每卡池 colspan=1。
- 開關**開**:三列表頭 —
  1. 日期(colspan=span×2)
  2. 卡池簡稱 + godfat 連結(colspan=2)
  3. 每卡池 `A` / `B` 子標(各 colspan=1)
  位置欄 `rowspan=3`。

### 4. 每格渲染(沿用現有邏輯)

A 格、B 格共用同一套現有渲染:稀有度底色、`next` 外框、重複稀有 `dupe`(↪ 落點)、
模擬保證 `guar`。每格照樣帶 `data-pos`(含 A/B)、`data-bi`(可見卡池索引)、
`data-r`(原始稀有度)、`data-n`(貓名)。

視覺區分:
- B 子欄整欄加淺底色。
- 同卡池的 A|B 子欄之間、以及卡池與卡池之間,以較粗的分隔線區分,避免看錯哪兩欄屬同一
  卡池。
- 樣式加於 `extension/view/view.css`。

### 5. 開關

- `extension/view/view.html` 工具列新增 checkbox `#show-b`(label:「顯示 B 軌」),預設
  未勾選。
- `view.js` 監聽 `change` → 直接 `renderTable(entries)` 重繪,**不需重新抓取**
  (B 資料已在 `entries` 內)。

### 6. Find 搜尋 / 矩陣(幾乎免改)

現有 Find 掃所有 `#grid tbody td[data-r]`,矩陣以 `pos`(含 A/B)為列、`data-bi` 為欄,
`matchByCell` 鍵為 `${pos}|${bi}`。因為 `1A` 與 `1B` 本就是不同 `pos`:
- B 子欄格子只要照樣帶 `data-*`,且**只在開關開時才渲染到 DOM**,Find 便自動「跟隨開關」:
  關閉時 B 格不存在於 DOM → 掃不到;開啟時 B 格納入搜尋,矩陣自動多出 `1B` 之類的列。
- `jumpToMatch` 以 td 參照跳轉,不受列/欄重構影響。
- 預期 **不需修改 Find 相關程式碼**;若重構後 `data-*` 命名有變動再同步調整。

## 測試

- `test/merge.test.js`:新增 `numbers` 欄位的斷言(去重、升冪、涵蓋 A/B 抽數)。
- 其餘純函式(parser/godfat/concurrency/cache/banner-names)不動,現有 39 測試須全綠。
- `renderTable` 屬 DOM 渲染,無單元測試;以現有 `test/fixtures/` 在瀏覽器載入未封裝擴充手動
  驗證:開關關 = 只 A 軌一欄;開關開 = A|B 子欄並排、同抽數對齊;Find 在開關開時可搜到 B
  軌並於矩陣顯示 `*B` 列。

## 風險 / 取捨

- 開啟 B 軌後欄數為兩倍寬,橫向捲動變長 —— 屬預期,故預設關閉。
- 表頭在開/關之間 rowspan 不同,需注意 colspan/rowspan 計算正確(尤其日期 colspan×2)。
- 若未來 parser `data-*` 命名調整,Find 的「免改」前提須重新驗證。
