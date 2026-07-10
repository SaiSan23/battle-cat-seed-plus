// godfat /cats 清單頁解析（純函式，接受 Document）：
// 建「貓名 → 實際稀有度＋貓 id」對照表。貓的稀有度是貓本身的屬性（與卡池機率無關），
// 供稀有度過濾與撞名重抽判定使用——godfat 表格底色是全站固定 score 區間，
// 機率特殊的卡池光靠 class 換算必錯（詳見 lib/rarity.js）。
// 群組標題為英文（不隨 lang 參數變動），格式如「Uber Rare Cat (327)」。
const GROUP_RARITY = new Map([
  ['Legend Rare Cat', 'legend'],
  ['Uber Rare Cat', 'uber'],
  ['Super Rare Cat', 'supa'],
  ['Rare Cat', 'rare'],
  ['Special Cat', 'special'],
  ['Normal Cat', 'normal'],
]);

export function parseCatList(doc) {
  const map = new Map();
  for (const group of doc.querySelectorAll('.cats_by_rarity')) {
    const head = (group.previousElementSibling?.textContent || '').replace(/\s*\(\d+\)\s*$/, '').trim();
    const rarity = GROUP_RARITY.get(head);
    if (!rarity) continue;
    for (const a of group.querySelectorAll('a[href*="/cats/"]')) {
      const id = Number((a.getAttribute('href') || '').match(/\/cats\/(\d+)/)?.[1]);
      if (!id) continue;
      // 表格格子可能顯示任一型態名 → 全部索引。title 第一行列出所有型態
      // （「*名A | 名B | 名C」，* 標記目前顯示的型態），連結文字為其中之一。
      const firstLine = (a.getAttribute('title') || '').split('\n')[0];
      const forms = firstLine.replace(/\*/g, '').split('|').map((s) => s.trim());
      for (const name of new Set([a.textContent.trim(), ...forms])) {
        if (name) map.set(name, { rarity, id });
      }
    }
  }
  return map;
}

// localStorage 快取用的序列化（Map ↔ 精簡 JSON 物件 {名: [稀有度, id]}）
export function serializeCatList(map) {
  return Object.fromEntries([...map].map(([name, v]) => [name, [v.rarity, v.id]]));
}

export function deserializeCatList(obj) {
  return new Map(Object.entries(obj).map(([name, [rarity, id]]) => [name, { rarity, id }]));
}

// id → { name, rarity } 反向索引：同 id 有多個型態名，以首見名為代表
// （parseCatList 對每隻貓先插入連結文字＝目前顯示型態，Map 迭代序保留首見）
export function catsById(map) {
  const byId = new Map();
  for (const [name, { rarity, id }] of map) {
    if (!byId.has(id)) byId.set(id, { name, rarity });
  }
  return byId;
}
