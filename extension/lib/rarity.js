// 有效稀有度（純函式，供稀有度過濾用）：
// (祭) 格只在祭典卡池才是該稀有度，非祭典降一級；票池（白金/黑金）抽出必為超激以上。
export const FEST_SHORTS = new Set(['超級祭', '特級祭', '超極祭', '超國王祭', '女王祭']);
export const TICKET_SHORTS = new Set(['白金', '黑金']);

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
