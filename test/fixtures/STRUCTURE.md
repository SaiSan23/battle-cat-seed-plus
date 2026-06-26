# godfat HTML 結構筆記（fixture 擷取日：2026-06-22）

擷取種子：`seed=2268003930&last=262&lang=tw&count=50`

## Fixtures

- `gu-banner.html`：白金轉蛋 `2026-04-24_1047`（保證 11 連抽卡池，表頭含 Guaranteed）。
- 未擷取 normal-banner.html：**當期 TW 卡池清單中所有可轉蛋卡池皆含 Guaranteed 欄**（實測 12 個皆然），找不到純無保證卡池。`hasGuaranteed=false` 路徑改以 Task 4 的最小 inline HTML 測試覆蓋。
- 註：部分事件 ID（如 `2026-06-19_1015`）為非轉蛋事件，會 302 redirect（回應含 `Jellyfish found`），需排除。`count` 太小（如 8）會回 500，使用 `count>=50`。

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

## 保證欄：需以 `force_guaranteed` 參數啟用
- **預設視圖**（無 `force_guaranteed`）：Guaranteed / Alt. guaranteed 欄的 `td.cat` 全部無 onclick 且無內容（實測 1047 與 1048 兩卡池皆為 100 個保證格全空）。
- 控制項：`<select id="force_guaranteed_input" name="force_guaranteed">`，值 `""`/`2`/`7`/`11`/`15`。標題：「Force show guaranteed even when this gacha banner doesn't have it」。
- **加上 `&force_guaranteed=11`（一般）或 `=15`（Buster step-up）後**，保證欄即填入：
  - 保證格為 `td.cat[onclick="pick('<n><A|B>G')"]`（**`G` 字尾**），含貓名與稀有度 class。
  - 例（起始 1A）：`1AG`=開花爺爺、`1BG`=非命之王佛挪。
  - 換軌落點：藏在 G 格 `<a href>` 的 `seed`/`last` 參數（保證抽後的新種子與位置），**非箭頭字元**。
- fixture `gu-banner-forced11.html` 即 `event=2026-04-24_1047&force_guaranteed=11` 擷取。

## 稀有度／型別 class 完整清單
`rare`｜`supa`｜`supa_fest`｜`uber`｜`uber_fest`｜`exclusive`（`legend` 亦可能出現，未在此 fixture 觀察到）。
`_fest` 為 fest 限定升級格；`exclusive` 為特定 uber 集。

## 對計畫的影響（修訂）
- `buildEventUrl`（Task 1）：新增可選 `forceGuaranteed` 參數。
- Task 4（解析 Result 欄）：稀有度清單擴充為 `legend, exclusive, uber_fest, uber, supa_fest, supa, rare`；Result 格 = pick id **無 G 字尾**者。
- Task 6（解析保證欄）：改用 `gu-banner-forced11.html`，解析 pick id **帶 G 字尾**的 `td.cat` → `Cell.guaranteed = {rarity, name}`。
- Task 10（view）：抓取時加 `force_guaranteed=11`（v1 預設）。
- **原 v1「含保證」範疇維持不變**，問題已由 `force_guaranteed` 解決。
