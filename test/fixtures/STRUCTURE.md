# godfat HTML 結構筆記（fixture 擷取日：2026-06-22）

擷取種子：`seed=2268003930&last=262&lang=tw&count=50`

## Fixtures

- `gu-banner.html`：白金轉蛋 `2026-04-24_1047`（保證 11 連抽卡池，表頭含 Guaranteed）。
- 未擷取 normal-banner.html：**當期 TW 卡池清單中所有可轉蛋卡池皆含 Guaranteed 欄**（實測 12 個皆然），找不到純無保證卡池。`hasGuaranteed=false` 路徑改以 Task 4 的最小 inline HTML 測試覆蓋。
- 註：部分事件 ID（如 `2026-06-19_1015`）為非轉蛋事件，會 302 redirect（回應含 `Jellyfish found`），需排除。`count` 範圍 1–999（`root.rb` TrackMaxCount=999，超出會被夾回）；原「count 太小（如 8）會回 500」的紀錄已過時（2026-07-08 實測 count=8 回 200），fixture 仍建議 `count>=50` 以涵蓋足夠結構。

## 事件下拉
- 選擇器：`#event_select option`
- 含多個 `<optgroup label="...">`（如 `Upcoming:`）。
- option：`value="YYYY-MM-DD_NNNN"`（如 `2026-04-24_1047`），文字為「`YYYY-MM-DD ~ YYYY-MM-DD: 名稱`」。
- 其他 select（非卡池，需排除）：lang/name/display/ui/theme/last/find/`add_future_ubers`。

## 抽卡表
- 頁面唯一 `<table><tbody>`。表頭 th 文字順序：`No.` / `Result` / `Guaranteed` / `Alt. result` / `Alt. guaranteed` / `Alt. No.`
- 每個抽數位置佔兩個 `<tr>`：**score 子列**（上）＋ **cat 子列**（下）；位置標籤 `<td id="N{n}{A|B}" rowspan="2">`，內含 `<a>` 文字如 `1A`。
- 因 rowspan/colspan 與軌道偏移，**欄位視覺位置不可靠**；務必以 `onclick="pick('<pos>')"` 的 `<pos>` 為鍵。

### 貓格 `td.cat`
- 每個位置有「Result」與「Guaranteed」兩個 `td.cat`，共 `2 × count × 2軌` 個。
- **Result 格**：`td.cat` 帶 `onclick="pick('<n><A|B>')"`（無 X 字尾），**有貓名**。
  - 貓名 = 格內 `span > a` 的**第一個** `<a>` 的 textContent（第二個 `<a>` 是 `🐾` 連結 `/cats/<id>`，須排除）。
  - 稀有度／型別 class（去除 `cat`/`pick`/`next_position` 後）：`rare`｜`supa`｜`supa_fest`｜`uber`｜`uber_fest`｜`exclusive`。
  - `next_position`：標記目前位置。
- **score 格**：`td.score` 帶 `onclick="pick('<n><A|B>X')"`（**X 字尾＝score 子列**，非保證欄），預設視圖**永遠空白**。

## 保證欄：原生逐場次自動顯示；`force_guaranteed` 僅為覆蓋
- **（2026-07-08 更正）**原「保證欄需 force_guaranteed 啟用、godfat 從不自動填」的結論**是錯的**——
  當初實測的 1047/1048 是白金/傳說**票池**，遊戲資料本來就沒必中旗標，保證欄才全空。
- godfat 的遊戲資料（`build/bc-tw.yaml`）**逐場次**帶 `guaranteed: true`（11 連）或 `step_up: true`
  （15 連）旗標；無 `force_guaranteed` 參數時，godfat 依旗標**自動填入**保證欄
  （`gacha_pool.rb#guaranteed_rolls`：guaranteed→11、step_up→15、無旗標→0）。
  必中是**場次**屬性非卡池屬性：同一卡池（如革命軍團 979）2026-06-05 場次有 `guaranteed`、2026-07-03 場次沒有。
- 控制項：`<select id="force_guaranteed_input" name="force_guaranteed">`，值 `""`/`2`/`7`/`11`/`15`。標題：「Force show guaranteed even when this gacha banner doesn't have it」——非 0 時**蓋過**原生值，僅供模擬。
- 保證欄有值時（原生旗標或 force 皆同構）：
  - 保證格為 `td.cat[onclick="pick('<n><A|B>G')"]`（**`G` 字尾**），含貓名與稀有度 class。
  - 例（起始 1A）：`1AG`=開花爺爺、`1BG`=非命之王佛挪。
  - 換軌落點：藏在 G 格 `<a href>` 的 `seed`/`last` 參數（保證抽後的新種子與位置），**非箭頭字元**。
- 換軌落點箭頭：格內文字如「`-> 11B`」（落 B 軌）／「`<- 12A`」（落回 A 軌）；
  **落點超出已載入範圍時顯示 `<?>`**（`view.rb#link_to_next`）——parser 的箭頭 regex
  不會命中 → `to=''`，路線規劃對該格用 fallback 公式或跳過。
- fixture `gu-banner-forced11.html` 即 `event=2026-04-24_1047&force_guaranteed=11` 擷取。

## 防禦性註記：find / o 參數會改格子 class
godfat 網址帶 `find=<id>`（搜貓）時命中格 class 換成 `found`、帶 `o=...`（持有清單）時有
`owned` 類覆蓋——**取代稀有度 class** 會使 parser 的 `rarityOf` 回 null 而跳過該格。
本工具抓取時一律不帶 `find`/`o`，故不受影響；未來若要帶，parser 需先擴充。

## 稀有度／型別 class 完整清單
`rare`｜`supa`｜`supa_fest`｜`uber`｜`uber_fest`｜`exclusive`（`legend` 亦可能出現，未在此 fixture 觀察到）。
`_fest` 為 fest 限定升級格；`exclusive` 為特定 uber 集。

## 對計畫的影響（修訂）
- `buildEventUrl`（Task 1）：新增可選 `forceGuaranteed` 參數。
- Task 4（解析 Result 欄）：稀有度清單擴充為 `legend, exclusive, uber_fest, uber, supa_fest, supa, rare`；Result 格 = pick id **無 G 字尾**者。
- Task 6（解析保證欄）：改用 `gu-banner-forced11.html`，解析 pick id **帶 G 字尾**的 `td.cat` → `Cell.guaranteed = {rarity, name}`。
- Task 10（view）：抓取時加 `force_guaranteed=11`（v1 預設）。
- **原 v1「含保證」範疇維持不變**，問題已由 `force_guaranteed` 解決。

## dupe-chain-banner.html（2026-07-02 增）
- 擷取：`seed=3259876338&last=521&event=2026-06-26_1053&lang=tw&count=140`（史塔爾）。
- 含連鎖重複稀有：`133A` 天然占卜貓（與 132A 重複）→ 重抽格 `133AR`「神槍手貓 -> 134BR」（落點帶 R 字尾）；
  `134BR`「<- 136A 超能力貓」（箭頭與落點在貓名前）。用於驗證落點 R 字尾與箭頭兩種排列。

## dupe-forced11-banner.html（2026-07-03 新增）

戰國武將卡池（seed=2553018823、last=39、event=2026-04-24_1044、count=300、force_guaranteed=11）。特徵：

- **`RG` 字尾＝撞名起手保證格**：以重複狀態抵達該位置時開確定連抽的保證 Uber 與落點
  （如 `59ARG`「<- 70A 真田幸村」；乾淨起手的 `59AG` 為「伊達政宗 -> 69B」，兩者並存）。
- 含 14 個 R 重抽格，其中 **60B/78A 落在 `supa_fest` 格上**——標準機率（rare=6970）卡池的
  `supa_fest` 帶（score 6470–6969）實際是稀有，故同樣觸發重複。godfat 的重抽僅發生在
  **實際 Rare**（`cat.rb#duped?`），route.js 觸發條件據此以實際稀有度判定（/cats 對照表
  優先、名單法 fallback，見 lib/rarity.js）。
- 578 G ＋ 13 RG 保證格已以「逐抽模擬＋保證抽半步位移」全數驗證落點與箭頭一致
  （見 test/route.gu.test.js 資料驅動測試）。
- `X`/`GX` 字尾仍為 score 子列（預設空白），與本頁其他字尾無關。

## native-gu-banner.html（2026-07-08 新增）

革命軍團卡池**原生必中**場次（seed=1、event=2026-06-05_979、lang=tw、count=30，**未帶 force_guaranteed**）。

- 該場次在 bc-tw.yaml 帶 `guaranteed: true`（11 連）；頁面不帶 force 參數即自動填入 40 個 G 格，
  結構與 forced 頁完全相同（`1AG` 溫泉天堂・浴場隊 `-> 11B`）。
- 用途：驗證「原生保證頁可解析」與「GU 尺寸由 G 格落點差推導＝11」。
- G 格落點差公式：A 軌 `to.n - n + 1`、B 軌 `to.n - n`（保證抽半步位移的逆運算）。

## cats-tw.html（2026-07-08 新增）

godfat `/cats?lang=tw` 全貓清單頁（約 310KB），供 `lib/catlist.js` 建「貓名→實際稀有度＋id」對照表。

- 六個 `.cats_by_rarity` 分組，各組**前一個兄弟元素**為英文標題（不隨 lang 變）：
  `Legend Rare Cat (20)`／`Uber Rare Cat (327)`／`Super Rare Cat (104)`／`Rare Cat (176)`／
  `Special Cat (156)`／`Normal Cat (10)`。
- 每隻貓一個 `<a href="//bc.godfat.org/cats/<id>?lang=tw">`：連結文字為顯示名，
  `title` **第一行**列出所有型態名（「`*名A | 名B | 名C`」，`*` 標記顯示中的型態）——
  抽卡表格子可能顯示任一型態名，故全部索引。實測 1984 個名字、零跨貓撞名。
- 尚未實裝的貓以佔位名（如 `817-1`）出現；抽卡表則顯示 `(id?)`（`cat.rb#future_uber`），
  兩者對不上 → 由 `rarity.js` 以 `(\d+\?)` 樣式直接視為超激。
- **為何需要此表**：抽卡表格子 class 是全站固定 score 區間（`cat.rb#rarity_label`：
  6470/6970/9070/9470/9970 分界），實際稀有度卻依各場次機率分界（`gacha.rb#dig_rarity`）。
  機率非標準的卡池兩者脫鉤：祭典機率（rare=6470）的限定池整帶錯位；
  超國王祭（rare=6770）的 `supa_fest` 帶（6470–6969）甚至**分裂**——前段（<6770）實際稀有、
  後段實際激稀有（實測 2026-04-10_1012：20 名中 15 稀有／5 激稀有），光靠 class 換算必錯。
