# 路線方案面板:浮動右上、標題列拖曳 — 設計

日期:2026-07-03。README Backlog 第 9 項。

## 背景與問題

路線方案面板(`#route-popup`)目前固定右下角(`fixed; right:12px; bottom:12px`),
會擋住表格右下內容且不能移動。

## 目標

1. 預設位置改**右上角**。
2. 按住**標題列**(`#route-popup-head`)可拖曳移動整個面板;關閉鈕(×)不受影響。
3. **記住位置**:拖曳後存 localStorage,重載頁面沿用;超出視窗自動夾回。

## 非目標

- 不做面板縮放、不做吸附邊緣。
- 不動路線邏輯、抽屜內容、Find 抽屜。

## 設計

### CSS(`extension/view/view.css`)

- `#route-popup`:`bottom: 12px` → `top: 12px`(預設右上)。
- `#route-popup-head`:`cursor: grab`;拖曳中(`.dragging`)`cursor: grabbing`、
  全域鎖文字選取(`user-select: none`)。

### JS(`extension/view/view.js`)

- 拖曳:`#route-popup-head` 上 `pointerdown`(目標非 `#route-close` 時)開始——
  `setPointerCapture`、記錄起點偏移;`pointermove` 以 `left`/`top` 定位面板
  (`right` 設 `auto`),**夾在視窗內**(左右上下皆不超出,至少保留標題列可見);
  `pointerup`/`pointercancel` 結束並把 `{left, top}` 存 localStorage。
  寫法沿用 `#find-resize` 的 pointer events 模式。
- 位置還原:模組載入時讀 localStorage 鍵 **`bcsp:route-popup-pos`**,有值則套用
  `left`/`top`(先夾制到目前視窗,防止在較小視窗開啟時面板遺失),無值用預設 CSS。
- 關閉鈕:`pointerdown` 起點在 `#route-close` 上時不啟動拖曳,click 行為不變
  (已實測關閉功能正常:隱藏面板+清路徑高亮+可重開)。

### localStorage 格式

`bcsp:route-popup-pos` = `{"left": number, "top": number}`(視窗座標 px)。
解析失敗或格式不符 → 忽略、用預設位置。

## 測試

- 無純函式變更 → 既有 76 測試不修改且全綠。
- 瀏覽器實測(fetch-stub):
  1. 預設出現在右上;2. 按標題列拖曳面板跟隨、放開後位置保留;
  3. 拖出視窗邊界被夾回;4. 重載頁面 → 位置還原;
  5. 點 × 仍正常關閉(拖曳不干擾);6. localStorage 塞壞值 → 回預設位置不噴錯。

## 風險 / 取捨

- 面板預設右上會蓋住工具列右側(進度文字)一角——使用者明確要右上,且可拖走+記住位置,可接受。
