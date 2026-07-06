# battle-cat-seed-plus

貓咪大戰爭種子計算 Chrome 擴充：解析 bc.godfat.org 的抽卡表，提供多卡池比較頁（view）、路線規劃等功能。

## 指令

- 測試：`npm test`（node --test，fixture 在 `test/fixtures/`，結構筆記見 `test/fixtures/STRUCTURE.md`）

## 協作流程（重要）

### Git 工作流

- **功能開發一律開分支**，不直接動 main；實作完成後停在分支上等使用者測試。
- **使用者測試通過、明確說合併，才能合併**——完成實作 ≠ 可以合併。
- **合併前先整理 commit，依「功能單一」原則 squash**：同一件事壓成一筆（例：整個前端重構）；性質不同的變更拆開（例：「重構」＋「修復」共兩筆）。整理方案先列給使用者確認，執行後驗證 `git diff 原分支` 為空、測試通過，再 fast-forward 合併、刪除工作分支。
- **push 一律等使用者明說**：任何情況下不主動推遠端，「合併進 main」不隱含授權 push。
- 刪除已完全合併的分支屬合併請求範圍內，直接做、事後回報；force-push、reset --hard 等破壞性操作仍需先確認。

### Commit 訊息

- **統一格式 `type(scope): 中文摘要`**：type 用 `feat` / `fix` / `refactor` / `docs` / `chore`（必要時 `test`）；scope 選填（`view`、`route`、`popup`、`lib` 等，跨範圍不標）；摘要中文一行、結尾不加句號；細節放 body、條列用 `-`。
- **不加 Co-Authored-By: Claude trailer**（覆蓋預設行為）。

### 溝通與確認

- **修 bug 前先核對問題**：完成根因調查後，先向使用者總結「發現的問題＋打算怎麼修」，與使用者核對雙方發現是否一致，**得到確認後才開始實作**。「你檢查看看」＝查出問題並回報，不是查完直接修。
- **順手發現的既有 bug**：修了可以，但回報時要單獨點名（是什麼問題、為什麼順手修），合併整理時拆成獨立的 fix commit。
- **影響範圍的方向性決策先用選項問使用者**（如改版幅度、要不要納入某功能），不自行假設。

### 驗證

- **合併前必跑 `npm test`**；UI 變更盡量實際起瀏覽器驗證，不能只看程式碼（view 頁可用 `test/fixtures/` 解析結果餵 localStorage 快取，離線完整渲染）。
- 資料正確性以 godfat 原站呈現為準；解析勿依賴表格視覺欄位，一律以 `onclick="pick('<pos>')"` 的位置為鍵（詳見 `test/fixtures/STRUCTURE.md`）。

## 架構速記

- `extension/lib/`：純函式（parser / merge / cache / godfat URL），皆有對應 `test/*.test.js`。
- `extension/view/`：比較頁（無 chrome.* API 的純網頁，靠 query string 帶參數、localStorage 快取）。
- 重抽格（R 字尾 pick id）是**條件性**結果：僅在「以重複狀態抵達」時觸發；主格顯示天然結果，重抽降為附註。
