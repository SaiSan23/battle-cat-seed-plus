# 確定11連(GU)納入路線規劃 — 設計

日期:2026-07-03。含四個 Phase 與筆記 07 修訂。

## 背景

路線規劃目前只會單抽,但實戰抽超激主要靠確定11連。godfat 在 `force_guaranteed`
模式下提供完整保證資料:`G` 格(乾淨起手)與 **`RG` 格(撞名起手,本輪新發現)**,
含保證 Uber 名與落點箭頭。已以使用者提供的戰國武將頁(seed=2553018823,存為
fixture)做 **591 格全驗證(578 G + 13 RG)零例外**,確立模型。

## 已驗證的機制模型

1. **GU(值 G,如 11)= G−1 次單抽 + 1 次保證**:前 G−1 抽照普通單抽走
   (含中途重複稀有換軌,規則同既有 `pullOutcome`);保證抽只耗**一顆**種子,
   落點 = 最後位置滑半步:`(q,A)→(q,B)`、`(q,B)→(q+1,A)`。
2. **撞名起手**(抵達起點時與上一抽同名重複):用 `RG` 格資料;等於第一抽先重抽
   換軌、剩下照走。
3. **重複稀有觸發條件 = 有效稀有度為稀有**:非祭典池的 `supa_fest` 格(降級為稀有)
   **也會觸發**——實測頁 60B/78A 即是;現行 route.js 只認原始 `rare` 是 **bug**。
4. 同一顆種子位置的保證 Uber 跨所有 G/RG 變體一致(unit 由該位置稀有度種子決定)。

## Phase 0:重複觸發改用有效稀有度(bug fix,影響現有單抽路線)

- `route.js` `pullOutcome` 觸發條件 `cell.rarity === 'rare'` 改為
  `effectiveRarity(cell.rarity, bannerShort) === 'rare'`(import `lib/rarity.js`;
  票池經 effectiveRarity 回 `uber` 天然不觸發,與既有 `isSpecial` 排除雙保險)。
- 新 fixture `test/fixtures/dupe-forced11-banner.html`(戰國武將頁,含 R/RG/G、
  supa_fest 重複點);`STRUCTURE.md` 補記 `RG` 字尾與本頁特徵。

## Phase 1:↪/↩ 方向區分顯示(筆記 07 待辦)

- 不改 parser:方向由「本格軌道 vs 落點軌道」推導——落點在對軌且位置+1(A→B)
  = 前進 `↪`;落點回 A 軌(B→A)= 回溯 `↩`。
- view 的重複附註與保證附註箭頭改用 `↪`/`↩`(現在一律 `↪`)。

## Phase 2:逐卡池保證型式(含 backlog #8)

- **每卡池自己的保證值**(`無`/`7`/`11`/`15`)為唯一生效來源。初始自動預設:
  一般卡池→`11`、Buster 系(革命軍團/紅色破壞者/飄浮破壞者)→`15`、白金/黑金→`無`。
- **全域下拉降級為批次工具**:選項改為批次動作(重設為自動預設/全部無/全部 7/11/15),
  執行後套用到各卡池的個別下拉並回到 placeholder;**不存在全域值蓋卡池值的持續狀態**。
- 卡池開關列每卡池旁加小型下拉顯示生效值、可個別覆寫;變更即重抓該次載入
  (cacheKey 既含 force,不會錯置)。
- `fetchBanner` 逐卡池帶各自 force 值。

## Phase 3:GU 進規劃器

### parser
- 新增解析 `RG` 格:`/pick\('(\d+[AB])RG'\)/` → `cell.dupeGuaranteed = {name, rarity, to}`
  (結構同 `guaranteed`;落點可帶 R 字尾)。

### route.js
- 新增匯出 `simulateGuaranteed(merged, bannerShort, n, track, lastName, bannerId, size)`
  → `{ landing:{n,track}, gotName, gotRarity, steps, uncertain } | null`:
  - 起手判定:同 `pullOutcome` 的重複條件 → 撞名用 `dupeGuaranteed`、乾淨用 `guaranteed`;
    無對應資料(如尾端無 G 格、或撞名但無 RG)→ 回 `null`(該狀態不可開 GU)。
  - 中間 G−1 抽以 `pullOutcome` 逐抽模擬(同卡池;任何一抽無資料 → `null`)。
  - **落點以 G/RG 格箭頭為準**(去 R 字尾);模擬落點與箭頭不一致時(理論不會,
    591/591 驗證)仍用箭頭並標 `uncertain`。
  - 保證抽的 `gotName` = G/RG 格貓名。
- `planRoutes` 每狀態增加轉移「開 GU」(對每個 `guValue ≠ 無` 的可見卡池):
  - 消耗抽數 `k += size`、`gu += 1`;中間各抽與保證 Uber 皆可收集目標(帶 name 判定);
  - 中間步照常入 `steps`(k 遞增);保證步 `pos` = 起點位置、旗標 `gu: true`。
- **成本第四軸 `gu`**:標籤支配(`eqCost`/`dominated`)、最終 Pareto(`dom3`→四軸)、
  白金優先分組鍵、`selectPlans` 最省比較鏈全部擴軸。`Plan.cost` 增 `gu`。
- `banners[]` 元素增 `gu: 7|11|15|null`(view 端由每卡池生效值傳入)。

### view
- 方案表加「GU」欄;選方案路徑高亮:中間步照常標步序,GU 起點格加 `path-gu` 徽章
  (title 含保證 Uber 名與落點)。

## 筆記 07 修訂

- 「godfat 保證欄以乾淨起點計算」結論修正:godfat **同時建模**乾淨(`G`)與撞名
  (`RG`)兩種起手;之前調查漏看 RG 格。
- 記錄 591 格驗證方法與結果;「遊戲內最終驗證」仍保留(godfat vs 真實遊戲)。

## 測試

1. Phase 0:合成模型測非祭池 `supa_fest` 觸發重複(現行為 FAIL 的回歸測試);
   既有 76 測試不破壞(需檢查依賴原規則的測試)。
2. parser:RG 格解析(新 fixture)。
3. `simulateGuaranteed` 合成測試:乾淨/撞名起手、內部重複、尾端無資料回 null、
   uncertain 防禦。
4. **資料驅動 591 格測試**(新 fixture):每個 G/RG 格,`simulateGuaranteed` 的落點
   == 箭頭;同種子位置保證名一致。
5. planRoutes:GU 收集目標(保證 Uber 與中間格)、gu 第四軸 Pareto、與時間/券別/
   白金優先共存。
6. 瀏覽器 fetch-stub:批次工具與逐卡池下拉、↪/↩ 顯示、含 GU 的方案表與 path-gu 高亮。

## 風險 / 取捨

- godfat 只支援 force_guaranteed 2/7/11/15;其他特殊必中規則模擬不了(上游限制)。
- 「哪些卡池真的有保證活動」由使用者把關(自動預設是猜測,可逐卡池關)。
- godfat vs 真實遊戲的最終一致性仍待遊戲內實測(筆記 07;工具一貫忠實鏡像 godfat)。
- 搜尋分支數增加(每狀態多「開 GU」選項);目標數上限 12 與位置上限沿用,實測慢再優化。
