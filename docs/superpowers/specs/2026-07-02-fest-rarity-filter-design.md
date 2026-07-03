# Find 稀有度過濾:祭典限定稀有處理 — 設計

日期:2026-07-02(晚)。README Backlog 第 10 項。

## 背景與問題

godfat 的 `supa_fest`(激稀有(祭))/`uber_fest`(超激稀有(祭))class 在**非祭典卡池的表
中也會出現**(fixture `gu-banner.html`=古代勇者即有 5 個 `uber_fest` 格),但那些格子只在
祭典卡池才是該稀有度。現行 `RARITY_GROUP` 把 `_fest` 一律併入激稀有/超激稀有群,導致在
非祭典卡池搜「超激稀有」誤命中 `uber_fest` 格。

## 目標

稀有度過濾改用**有效稀有度**:(祭) 格依「所屬卡池是否祭典」決定算哪一級;非祭典時降級。

## 非目標

- 不加「(祭)限定」下拉選項(使用者已決定)。
- 不動:貓名搜尋、Find 矩陣色條(仍用原始 class)、圖例、格子底色、路線規劃
  (route.js 的 dupe 判定用天然 `rarity === 'rare'`,不受影響)。
- 筆記 02「有時粉紅格非祭也是 Uber」的例外,godfat HTML 無法辨識,不處理(記風險)。

## 規則(有效稀有度)

新增純函式 `effectiveRarity(rarity, bannerShort)` 於 `extension/lib/rarity.js`:

| 原始 class | 祭典卡池¹ | 非祭典卡池 | 白金/黑金² |
|---|---|---|---|
| `supa_fest` | `supa` | `rare`(降級) | `uber` |
| `uber_fest` | `uber` | `supa`(降級) | `uber` |
| `rare` / `supa` | 不變 | 不變 | `uber` |
| `uber` | 不變 | 不變 | 不變 |
| `exclusive` / `legend` | 不變 | 不變 | 不變 |

1. **祭典判定**:卡池簡稱 ∈ `{超級祭, 特級祭, 超極祭, 超國王祭, 女王祭}`(`banner-names.js`
   既有簡稱)。
2. **票池(白金/黑金)優先於祭典規則**:票抽必為超激(黑金另含傳說),故 `rare`/`supa`/
   `supa_fest`/`uber_fest` 一律視為 `uber`;`exclusive`/`legend` 維持原樣。
   (修正現行邏輯的一個縫隙:若先套祭典降級,白金的 `uber_fest` 會被錯降成 `supa`。)

降級對應依稀有度碼區間邏輯(祭典費率下稀有度碼才夠到上一級;非祭費率落回下一級):
祭激→稀有、祭超激→激稀有。使用者已確認。

## 接線(`extension/view/view.js`)

- `effRarity(td)` 改為:取 `data-r`(原始)與該欄卡池簡稱,回傳
  `effectiveRarity(r, short)`;既有 `ALWAYS_SHORTS` 白金/黑金特例移入純函式。
- `RARITY_GROUP` 簡化:有效稀有度已是基本值,群組不再需要 `_fest` 項——
  `supa: ['supa']`、`uber: ['uber', 'exclusive', 'legend']`,其餘不變。
- Find 矩陣命中格色條沿用 `origRarity`(原始 class),不變。

## 測試

- `test/rarity.test.js`(純函式):祭典 × 非祭典 × 白金 × 黑金 × 各稀有度的矩陣斷言,
  特別含「白金的 `uber_fest` → `uber`」與「非祭 `uber_fest` → `supa`」「非祭 `supa_fest` → `rare`」。
- 既有 66 測試不修改且全綠。
- 瀏覽器實測(fetch-stub 手法):gu-banner 有 5 個 `uber_fest` 格——
  非祭典卡池:搜「超激稀有」不命中該 5 格、搜「激稀有」命中;
  將同 fixture 改名為祭典簡稱(如「特級貓咪祭」):搜「超激稀有」命中該 5 格。

## 風險 / 取捨

- 「有時粉紅格非祭也是 Uber」例外不處理:HTML 無資訊,寧可保守(少報)也不誤報。
- 祭典清單依簡稱規則,新祭典類型出現時需在 `banner-names.js` 與祭典集合同步補充。
