# 路線目標格子選單與規劃等待狀態 — 設計

日期:2026-07-02。承接路線規劃 v1/v2(`2026-07-02-route-planner-design.md`、
`2026-07-02-route-planner-v2-time-tickets-design.md`)。

## 背景與問題

1. 目前主表**左鍵點格 = 立刻切換位置目標**,誤觸就默默改目標,也無法選字複製;
   且只能加「位置目標」,想加「貓目標(所有出現)」得繞去 Find。
2. 「規劃路線」為同步計算,目標多時按下去按鈕無回饋,看起來像沒反應。

## 目標

1. 左鍵點格改為**彈出小選單**:加/移除此位置目標、加/移除此貓目標(所有出現)、複製貓咪名稱。
2. 右鍵**不攔截**,維持瀏覽器預設。
3. 規劃期間按鈕顯示**「規劃中…」並 disabled**(等待狀態)。

## 非目標

- Find 矩陣點擊維持跳轉,不加選單。
- `route.js` 純函式不動;既有 59 測試不修改且需全綠。
- 不做 Web Worker(同步計算已有上限控制,只補視覺回饋)。

## 設計

### 1. 格子選單(`extension/view/`)

- **觸發**:主表 `#grid` 內左鍵點擊帶 `data-bid` 的資料格(空格不觸發)。
- **選單項**(依當前狀態動態產生文字):
  1. `加入此位置目標` ↔ `移除此位置目標`(依 `routeTargets` 是否已有 `cell:{bid}|{pos}`;
     行為 = 既有 `toggleCellTarget`)。
  2. `加入此貓目標（所有出現）` ↔ `移除此貓目標`(依是否已有 `cat:{name}`;
     加入時以既有 `catAccept(name)` 蒐集所有 occurrence,含 dupe 名比對)。
  3. `搜尋此貓`(把貓名填入 `#find-name`、清空 `#find-rarity` 稀有度篩選以免濾掉此貓、
     套用 `applyFind()` 並展開 Find 抽屜)。
  4. `複製貓咪名稱`(`navigator.clipboard.writeText(name)`;擴充頁為安全環境)。
- **呈現**:單一浮層 `#cell-menu`(absolute 定位,`position: fixed` 以 click 座標定位,
  防超出視窗邊緣做簡單翻轉);一次只開一個。
- **關閉**:點選單外、按 Esc、`#table-wrap` 捲動、或執行任一選單項後。
- **右鍵**:不加 `contextmenu` handler。
- 取代原本「左鍵直接 toggleCellTarget」的 click 綁定。

### 2. 規劃等待狀態

- `runPlan()` 改為:立即把 `#plan-route` 設 `disabled` + 文字「規劃中…」→
  `setTimeout(0)` 讓瀏覽器先重繪 → 執行 `planRoutes` 與 `renderPlanList` →
  `finally` 恢復按鈕文字「規劃路線」與 disabled 狀態(依目標數)。
- `planRoutes` 拋錯(如目標超上限)時:以 `#route-body` 顯示錯誤訊息(開抽屜),不留卡死按鈕。

### 3. 檔案

- `extension/view/view.html`:加 `#cell-menu` 容器。
- `extension/view/view.js`:選單開關/定位/動作、`runPlan` 等待包裝。
- `extension/view/view.css`:選單樣式(浮層、項目 hover、與既有風格一致)。

## 測試

- 純函式無改動 → `npm test` 全綠(59)即可。
- 瀏覽器手動驗證:左鍵開選單三項行為、狀態文字切換(加入↔移除)、Esc/外點/捲動關閉、
  右鍵為瀏覽器預設、複製後剪貼簿內容正確、規劃中按鈕變「規劃中…」後恢復、
  目標超上限時顯示錯誤而非卡死。

## 風險 / 取捨

- 加目標多一步點擊(選單),換取不誤觸與可複製——使用者已確認取捨。
- `navigator.clipboard` 需使用者手勢觸發,選單項點擊符合;失敗時靜默(邊緣案例)。
