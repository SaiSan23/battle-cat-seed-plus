# 擁有貓咪清單 — 設計

日期:2026-07-09。

## 背景與目標

使用者想記錄自己擁有的貓,並得到「還缺哪些貓」的視角來輔助抽卡決策:
比較表上一眼看出新貨、路線規劃直接以未擁有的貓為目標。

清單是**使用者資料**,只存在瀏覽器 localStorage,不進 git、不隨擴充發佈;
repo 只含程式碼與公開假資料 fixture(專案將公開,此點已與使用者確認)。

## 已驗證的 godfat 原生機制(2026-07-09 實測)

1. `/cats` 目錄頁每隻貓有 checkbox:`<input type="checkbox" name="t" id="cat-<id>" value="<id>" onchange="roll(this)">`,
   `roll()` 只是 `form.submit()`(GET)。
2. 送出 `?t=1&t=2&t=44` 後,**伺服器**將 id 清單壓成短碼並以 meta-refresh 轉址:
   `/cats?lang=tw&o=4ZIEPP2m`。短碼可完整往返(該頁以 `checked` 還原勾選,
   hidden `name="o"` 帶著短碼)。編碼為伺服器端實作,前端無現成解碼器。
3. 種子頁帶 `o=` 時,godfat 對擁有的貓套 `owned` class(azure 底＋稀有度色條),
   並把 `o` 一路帶進頁上所有連結;`o` 不影響抽卡計算,純顯示。

因此 `o` 短碼可作為**標準交換格式**:匯入、匯出備份、跨裝置、回原站看標示,
全部相通。解碼繞道「抓 `/cats?o=…` 解析 checked」;編碼繞道「組 `t=` 網址
讓 godfat 轉出新短碼(從轉址目標取回,不需載入整頁)」。

## 已定案的方向(使用者選擇)

- 涵蓋**全部稀有度**(與 /cats 一致,匯入不丟資訊;UI 靠分組收合控制規模)。
- 建立/維護管道:**o 碼匯入匯出＋內建清單頁＋view 格子選單標記**三者都做;
  「照路線抽完自動記錄」留待未來版本。
- 第一版功能:view 標示未擁有、在 godfat 開啟帶 o、路線批次目標(可逐隻取捨)、
  未擁有總覽(併入清單頁,同頁正反兩用)。

## 資料模型與儲存

- **以貓 id 為準**(貓名隨形態/語言變動,id 穩定;catlist.js 存 id 即為此鋪路)。
- localStorage 新增鍵 `bcsp:owned`:

  ```json
  { "ids": [1, 2, 44], "oCode": "4ZIEPP2m", "oDirty": false, "updated": "2026-07-09" }
  ```

  - `oCode`:最近一次與 godfat 同步的短碼快取;本地增刪後設 `oDirty: true`,
    需要用到時才重新換碼(見「godfat 連結帶 o」)。
  - 鍵加入 `cache.js` 的 `SETTINGS_KEYS`:清快取、版本升級一律保留。
- 貓 id ↔ 名字/稀有度靠既有 catlist 每日快取(`bcsp:cats:{lang}`)對照;
  需要新增 id→{name, rarity} 反向索引(catlist.js 現為 名→{rarity, id})。

## 新純函式庫 `extension/lib/owned.js`

比照既有 lib 全配單元測試(fixture 用貓 1/2/44 的 `/cats?o=4ZIEPP2m` 樣本頁,
`STRUCTURE.md` 補記 checkbox 結構):

- `parseOwnedFromCatsDoc(doc)`:解析 `/cats?o=…` 頁被勾選的 checkbox → id 陣列(匯入)。
- `buildOwnedSyncUrl(ids, lang)`:組 `/cats?lang=…&t=…&t=…` 網址(換碼/推回原站)。
- `extractOCode(urlOrCode)`:從整段網址或裸字串取出 o 短碼(匯入輸入的寬容解析)。
- 載入/儲存 `bcsp:owned`、集合運算(未擁有 = catlist 全集 − owned)。

## 內建清單頁(兼未擁有總覽)

新頁 `extension/owned/owned.html|js|css`:與 view 同為純網頁(無 chrome.* API、
同源共用 localStorage),入口在 view 工具列與 popup。

- 資料來源 = catlist 每日快取(全遊戲目錄,與開哪些卡池無關)。godfat 出新貓 →
  每日快取自動跟上 → 新貓自動以未擁有出現,零人工維護。
- 按稀有度 6 組分組(可收合)＋搜尋框;勾選即存。頂部統計「傳說 x/y、超激 x/y…」。
- 「只看未擁有」切換 = 未擁有總覽視角(同一頁正反兩用)。
- **匯入**:貼任何含 `o=` 的 godfat 網址或裸短碼 → 抓 `/cats?o=…` 解析 →
  預覽數量後選**取代**或**合併**。
- **匯出/推回 godfat**:開啟換碼後的 godfat `/cats` 網址,原站即有同一份清單,
  網址列的 o 碼兼作備份字串。
- 貓名連到 godfat 個別貓頁(`/cats/<id>`)。

## view 表格標示未擁有

- 未擁有的貓在格子上加**小角標**(左緣色條或角落圓點,實作時定稿),
  **不改底色**——底色忠實沿用 godfat 是既有原則。
- 工具列開關「標示未擁有」(偏好記住);清單為空時不標示並提示建立清單。
- **格子選單新增「標記為已擁有」**(已擁有顯示「取消標記」):日常增量維護主管道。
- 名→id 靠 catlist 對照(1984 名已驗證零撞名,含各形態名);catlist 快取不可用時
  此功能降級提示,不影響其他功能。

## godfat 連結帶 o

- view 的「在 godfat 開啟」等外連 godfat 連結一律附 `o=<oCode>`。
- `oDirty` 時開連結前先換碼:fetch `buildOwnedSyncUrl(ids)`,godfat 回 302,
  從轉址目標網址取出新 o(一次輕量請求、不載頁面),成功則存回並清 dirty;
  失敗退回不帶 o 照常開啟。
- popup 若偵測目前 godfat 分頁網址帶 `o` 且與本地不同(content script 的
  `GET_GODFAT_CONTEXT` 加傳 `o`),view 工具列亮提示「一鍵從 godfat 匯入」。

## 路線規劃批次目標(可逐隻取捨)

- 工具列新按鈕「加入未擁有目標」:列出**本次已載入卡池中出現**且未擁有的貓
  (按稀有度分組、預設全勾、**可逐隻取消**)→ 確認後以既有「該貓任一出現擇一」
  目標型式批量加入,之後照常規劃 Pareto 路線。
- 只列表內出現的貓(路線只能收表上有的);已隱藏卡池照既有規則不入路線。

## 風險與備援

1. **`t=` 網址長度**:~~可能超上限~~ **已實測銷案(2026-07-09)**:/cats 頁實為
   793 隻貓(1984 為含形態的名字數),全勾的 `t=` 網址僅 4687 字元,godfat 回
   HTTP 302、o 短碼 155 字元,且與頁上「Own all below!」連結的短碼一致。
   換碼從 302 的 Location 標頭即可取得,不需載入頁面。備援(移植 godfat 開源
   o 編碼器為 JS)確定不需要,僅留未來選項。
2. **/cats 頁改版**:沿用 fixture＋`STRUCTURE.md` 機制,owned 解析一併納入測試。
3. **禮貌性**:換碼請求只在「開 godfat 連結且 dirty」或手動匯出時發生,
   勾選動作本身不打站;匯入為單次請求。

## 施工切分(分支 `feat/owned-cats`,commit 依功能單一)

1. `feat(lib)`:owned.js＋SETTINGS_KEYS 納入 `bcsp:owned`＋fixture 與測試
2. `feat(owned)`:清單頁(分組勾選/搜尋/統計/匯入/匯出/未擁有總覽)
3. `feat(view)`:表格未擁有標示＋格子選單標記
4. `feat(view)`:godfat 連結帶 o(含 dirty 換碼、popup 帶 o 提示匯入)
5. `feat(route)`:批次目標選擇器
6. `docs`:README/CLAUDE.md 補充

## 未來版本(本版不做)

- 路線面板「已照此路線抽完」批次入帳。
- 本地 o 編解碼器(風險 1 已銷案,僅在想完全離線換碼時才考慮)。
