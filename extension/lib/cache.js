// 比較頁資料快取：以 (seed, event, force, last) 為鍵，存到 localStorage。
// 條件未改→刷新頁面也直接套用、不重抓。純函式（key/序列化）可測；localStorage 存取做防呆。

// v2：快取鍵納入 last（last 影響 1A 是否為重複稀有），舊版 v1（無 last）一律失效
// v3：guaranteed 新增換軌落點 to，舊快取無此欄位 → 升版使其失效，確保拿到落點
// v4：新增 dupeGuaranteed（撞名起手保證，RG 格），舊快取無此欄位 → 升版使其失效
// v5：count 移出鍵、改記在值裡（一池一份、就大不就小）：需求 ≤ 快取 count → 沿用
//     （顯示端裁切）；需求更大 → 重抓覆蓋同一份。避免每個 count 各存一份副本。
const NS = 'bcsp:v5:';

export function cacheKey({ seed, event, force, last }) {
  return `${NS}${seed}|${event}|${force || ''}|${last || ''}`;
}

// parseRollTable 結果含 Map，需轉成可 JSON 化的形式
export function serializeParsed(parsed) {
  return { hasGuaranteed: parsed.hasGuaranteed, cells: [...parsed.cells.entries()] };
}

export function deserializeParsed(obj) {
  return { hasGuaranteed: obj.hasGuaranteed, cells: new Map(obj.cells) };
}

function store() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

// 讀取快取：回傳 { name, count, parsed } 或 null
export function cacheGet(key) {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return { name: obj.name, count: Number(obj.count) || 0, parsed: deserializeParsed(obj.parsed) };
  } catch {
    return null;
  }
}

// 寫入快取；配額滿時清掉本命名空間再試一次
export function cacheSet(key, { name, count, parsed }) {
  const s = store();
  if (!s) return;
  const payload = JSON.stringify({ name, count, parsed: serializeParsed(parsed) });
  try {
    s.setItem(key, payload);
  } catch {
    try {
      clearNamespace(s);
      s.setItem(key, payload);
    } catch {
      /* 放棄快取，不影響功能 */
    }
  }
}

// 使用者設定鍵：清快取（手動清除或配額滿自動騰空間）時保留，只清資料快取
const SETTINGS_KEYS = new Set(['bcsp:gu-force', 'bcsp:route-popup-pos']);

function clearNamespace(s) {
  const keys = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith('bcsp:') && !SETTINGS_KEYS.has(k)) keys.push(k); // 含舊版本孤兒
  }
  keys.forEach((k) => s.removeItem(k));
}

// 移除舊版本命名空間的孤兒鍵（升版後不再讀取，主動釋放空間；設定鍵不含 v 前綴不受影響）
export function purgeOldCaches() {
  const s = store();
  if (!s) return;
  const keys = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith('bcsp:v') && !k.startsWith(NS)) keys.push(k);
  }
  keys.forEach((k) => s.removeItem(k));
}

// 清除本擴充的所有快取（localStorage 不存在時為 no-op）；回傳是否成功
export function clearCache() {
  const s = store();
  if (!s) return false;
  try {
    clearNamespace(s);
    return true;
  } catch {
    return false;
  }
}
