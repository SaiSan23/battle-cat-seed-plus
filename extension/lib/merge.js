// 合併多卡池解析結果為對齊模型（純函式）
function posSortKey(pos) {
  const n = parseInt(pos, 10);
  const track = pos.endsWith('A') ? 0 : 1; // 先 A 後 B
  return track * 1e6 + n;
}

export function mergeBanners(entries) {
  const byPos = new Map();
  let anyGuaranteed = false;
  for (const { banner, parsed } of entries) {
    if (parsed.hasGuaranteed) anyGuaranteed = true;
    for (const [pos, c] of parsed.cells) {
      if (!byPos.has(pos)) byPos.set(pos, new Map());
      byPos.get(pos).set(banner.id, c);
    }
  }
  const positions = [...byPos.keys()].sort((p, q) => posSortKey(p) - posSortKey(q));
  return { positions, anyGuaranteed, byPos };
}
