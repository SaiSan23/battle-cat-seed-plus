# 表內未擁有 modal 快速多選 — 設計

日期：2026-07-12。

## 背景與問題

view 頁「表內未擁有的貓」modal（`#unowned-pick`）目前打開時**全部預勾**，但路線目標
上限只有 12（`MAX_TARGETS`）。實際場景（如 58 隻未擁有）開場即觸發超限擋板、
「加入目標」被 disable，使用者得逐一取消幾十個勾選。現有工具只有全域「全選／全不選」
兩極，中間缺少批次操作。

## 目標

讓勾選這件事變快：預設不勾、可整組開關、可範圍選取、可反選。
勾選後的計數與超限擋板（`updateUpCount()`：合計＝既有目標＋本次新增，
超過 12 變警示色並 disable 加入鈕）**維持原樣不動**。

## 非目標

- 不做名字搜尋過濾、不做拖曳掃選（使用者已決定）。
- 不做超限自動截斷（例：自動只留前 12）；維持「超限就擋」。
- 不動 `collectUnownedInTable()` 的收集邏輯、稀有度分組排序、`MAX_TARGETS`。

## 互動規格

### B. 預設全不選

`openUnownedPick()` 渲染單項時移除 `checked`。開場顯示「將加入 0，合計 N／上限 12」、
加入鈕 disabled（既有 `fresh === 0` 邏輯已涵蓋，無須新程式）。

### A. 稀有度群組三態開關

- 每個群組標題列（`.up-head`）前加一顆群組勾選框（`input.up-gcb`），與色點、
  「傳說（10）」文字同屬可點擊的 label。
- 三態呈現：組內全勾＝checked、全不勾＝unchecked、部分＝`indeterminate`
  （JS 屬性設定，無對應 HTML attribute）。
- 點擊語意：目前**非全選 → 整組勾起**；已全選 → 整組取消（與原生 indeterminate
  點擊行為一致：indeterminate 點擊後為 checked）。
- 任何單項變動、全選／全不選／反選後，即時重算所有群組的三態。

### C. Shift 範圍選取

- 記錨點（anchor）＝**最後一次非 Shift 點擊**的單項在扁平清單（跨群組、依渲染順序）
  中的 index；群組勾選框不佔 index、也不動錨點。
- Shift+點擊單項：把 `[min(anchor, i), max(anchor, i)]` 區間內所有單項設成
  **這次點擊後該項的狀態**；錨點不變（Gmail 慣例）。
- 無錨點時的 Shift 點擊＝普通點擊（設錨點）。
- modal 重新開啟（重新渲染）時錨點歸零。
- 單項 label 加 `user-select: none`，避免 Shift 點擊拖出文字反白。

### D. 反選

`#unowned-pick-foot` 在「全不選」後加「反選」鈕（`#up-invert`，`btn-secondary`），
翻轉所有單項勾選。按鈕順序：全選、全不選、反選、加入目標。

### 共同收尾

所有操作（單項點擊、Shift 範圍、群組開關、全選、全不選、反選）結束時統一：
重算群組三態 → `updateUpCount()`。

## 純函式（`extension/lib/multiselect.js`）

依專案慣例把可測邏輯抽到 lib：

- `groupState(bools)` → `'all' | 'none' | 'partial'`（空陣列視為 `'none'`）。
- `rangeIndices(anchor, current)` → 兩端點（含）之間的 index 陣列，方向無關。

## 接線（`extension/view/`）

- `view.html`：foot 加 `#up-invert` 按鈕。
- `view.js`：
  - `openUnownedPick()`：單項移除 `checked`；群組標題渲染改為含 `input.up-gcb` 的
    label；渲染後錨點重設為 `null`。
  - `#unowned-pick-body` 事件委派改用 `click`（`change` 事件非 MouseEvent、
    拿不到 `shiftKey`）：目標是群組框 → 整組設定；目標是單項 → 依 `ev.shiftKey`
    走錨點更新或範圍展開。
  - 全選、全不選、反選、群組操作共用「重算三態＋計數」收尾函式。
- `view.css`：`.up-gcb` 對齊微調、單項 label `user-select: none`。
  （更正：實作無獨立 `.up-gcb` 規則——實際是 `.up-head` 改 `.up-group .up-head` 提高
  特異度＋`cursor: pointer`，`user-select: none` 加在既有 `.up-group label` 規則上。）

## 測試

- `test/multiselect.test.js`：`groupState`（全勾／全不勾／混合／空）、
  `rangeIndices`（正向、反向、同點）。
- 既有測試不修改且全綠（`npm test`）。
- 瀏覽器實測（fixture 餵 localStorage 手法）checklist：
  1. 開啟 modal：全部未勾、「將加入 0」、加入鈕 disabled。
  2. 群組框：點一下整組勾起（標頭變 checked）、再點整組取消；手動取消組內一隻
     → 標頭變 indeterminate。
  3. Shift：點 A、Shift+點 E → A–E 全勾；Shift+點 C（取消方向）→ 範圍照錨點展開。
     **實測 label 文字上的 Shift+點擊是否保留 `shiftKey`**（瀏覽器轉發 click 至
     input 時 modifier 可能遺失）；若遺失，改在 label 層攔截原始事件。
  4. 反選：勾 3 隻按反選 → 其餘全勾、原 3 隻取消。
  5. 超限擋板照舊：勾超過 12 → 紅字＋加入鈕 disabled。

## 風險 / 取捨

- **label 轉發 click 的 modifier 遺失**：Shift 範圍選取的唯一技術風險，已列入實測
  checklist，備援方案為 label 層攔截。
- 預設全不選改變既有使用者習慣（原本全勾）；但原行為在超限場景下每次都要手動清，
  屬修正而非退化。
- Shift 範圍跨群組展開是刻意行為（扁平清單直覺），不做「限同群組」特例。

## 實作後變更

最終全分支 review 的兩項 minor 加固（commit `058f796`）：

- `upShiftHint` 只在點擊落在 label 內時記錄——點到 modal 空白或提示文字的 Shift
  點擊不再殘留到下一次點擊。
- Shift 分支前擋掉既非 `up-gcb` 也非 `up-item` 的 input：未來若在 modal 內加其他
  輸入元件（如搜尋框），不會以 `indexOf === -1` 誤入範圍計算。
