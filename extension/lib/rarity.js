// 實際稀有度判定（純函式，供稀有度過濾與撞名重抽判定用）。
//
// godfat 格子底色（class）是「全站固定的 score 區間」（6470/6970/9070/9470/9970 分界），
// 而實際稀有度依各場次自己的機率分界——兩者在機率非標準 6970 的卡池會脫鉤：
// 祭典機率（rare=6470）不只祭典在用（伊邪那岐等限定池同為 6470），
// 超國王祭（rare=6770）的 (祭) 帶甚至「前段稀有、後段激稀有」分裂，光靠 class 換算必錯。
// 因此優先以 /cats 對照表（lib/catlist.js，貓本身的稀有度）判定；
// 查無對照（未載入、離線、未來貓）時退回下方名單法近似。
export const FEST_SHORTS = new Set(['超級祭', '特級祭', '超極祭', '超國王祭', '女王祭']);
export const TICKET_SHORTS = new Set(['白金', '黑金']);

const GACHA_RARITIES = new Set(['rare', 'supa', 'uber', 'legend']);

// 名單法近似（fallback）：(祭) 格只在祭典卡池才是該稀有度，非祭典降一級；
// 票池（白金/黑金）抽出必為超激以上。
export function effectiveRarity(rarity, bannerShort) {
  if (TICKET_SHORTS.has(bannerShort)) {
    // 票抽必超激（黑金另含傳說）；exclusive/legend 維持原樣。優先於祭典降級。
    return rarity === 'exclusive' || rarity === 'legend' ? rarity : 'uber';
  }
  const fest = FEST_SHORTS.has(bannerShort);
  if (rarity === 'supa_fest') return fest ? 'supa' : 'rare';
  if (rarity === 'uber_fest') return fest ? 'uber' : 'supa';
  return rarity;
}

// 實際稀有度：catRarity（/cats 對照表，Map 貓名→{rarity,id}）命中即為準；
// 未來超激佔位名（godfat 以「(id?)」顯示尚未實裝的超激）視為超激；其餘退回名單法。
export function actualRarity(name, rarity, bannerShort, catRarity) {
  const hit = catRarity?.get(name)?.rarity;
  if (hit && GACHA_RARITIES.has(hit)) return hit;
  if (/^\(\d+\?\)$/.test(name || '')) return 'uber';
  return effectiveRarity(rarity, bannerShort);
}
