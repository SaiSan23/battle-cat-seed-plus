// /cats 對照表載入（每日至多抓一次，禮貌性）：瀏覽器端用預設依賴，測試注入 mock。
// 失敗退回過期快取，再不行回 null（呼叫端 fallback 名單法，見 lib/rarity.js）。
import { buildCatsUrl } from './godfat.js';
import { parseCatList, serializeCatList, deserializeCatList } from './catlist.js';

export async function loadCatList(lang, {
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  fetchFn = globalThis.fetch,
  parseDoc = (html) => new DOMParser().parseFromString(html, 'text/html'),
  today = new Date().toLocaleDateString('sv'), // sv 地區格式即 YYYY-MM-DD（本地時區）
} = {}) {
  const key = `bcsp:cats:${lang}`;
  let cached = null;
  try {
    const raw = JSON.parse(storage?.getItem(key) || 'null');
    if (raw?.names) {
      cached = deserializeCatList(raw.names);
      if (raw.date === today) return cached; // 當日已抓過 → 不重抓
    }
  } catch { /* 壞值 → 重抓 */ }
  try {
    const res = await fetchFn(buildCatsUrl(lang));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const map = parseCatList(parseDoc(await res.text()));
    if (!map.size) return cached; // 結構變動解析不到 → 用過期快取頂著
    try {
      storage?.setItem(key, JSON.stringify({ date: today, names: serializeCatList(map) }));
    } catch { /* 配額滿 → 只用不存 */ }
    return map;
  } catch {
    return cached; // 離線/失敗 → 過期快取或 null
  }
}
