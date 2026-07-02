# battle-cat-seed-plus

貓咪大戰爭種子計算 Chrome 擴充：解析 bc.godfat.org 的抽卡表，提供多卡池比較頁（view）、路線規劃等功能。

## 指令

- 測試：`npm test`（node --test，fixture 在 `test/fixtures/`，結構筆記見 `test/fixtures/STRUCTURE.md`）

## 協作流程（重要）

- **修 bug 前先核對問題**：完成根因調查後，先向使用者總結「發現的問題＋打算怎麼修」，與使用者核對雙方發現是否一致，**得到確認後才開始實作**。「你檢查看看」＝查出問題並回報，不是查完直接修。
- 資料正確性以 godfat 原站呈現為準；解析勿依賴表格視覺欄位，一律以 `onclick="pick('<pos>')"` 的位置為鍵（詳見 `test/fixtures/STRUCTURE.md`）。
- **git 例行操作不用每步都問**：使用者提出「合併進 main」「清掉分支」這類請求時，push 到遠端、刪除已完全合併（fast-forward 祖先）的分支都算在請求範圍內，直接做、事後回報結果即可，不用每一步驟都先問一次。force-push、reset --hard 等真正破壞性操作仍需先確認。

## 架構速記

- `extension/lib/`：純函式（parser / merge / cache / godfat URL），皆有對應 `test/*.test.js`。
- `extension/view/`：比較頁（無 chrome.* API 的純網頁，靠 query string 帶參數、localStorage 快取）。
- 重抽格（R 字尾 pick id）是**條件性**結果：僅在「以重複狀態抵達」時觸發；主格顯示天然結果，重抽降為附註。
