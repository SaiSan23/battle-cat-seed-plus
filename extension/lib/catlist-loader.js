// /cats 對照表載入（每日至多抓一次，禮貌性）：瀏覽器端用預設依賴，測試注入 mock。
// 失敗退回過期快取，再不行回 null（呼叫端 fallback 名單法，見 lib/rarity.js）。
import { buildCatsUrl } from './godfat.js';
import {
  parseCatList, serializeCatList, deserializeCatList,
  parseCatForms, serializeForms, deserializeForms,
} from './catlist.js';

export async function loadCatList(lang, {
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  fetchFn = globalThis.fetch,
  parseDoc = (html) => new DOMParser().parseFromString(html, 'text/html'),
  today = new Date().toLocaleDateString('sv'), // sv 地區格式即 YYYY-MM-DD（本地時區）
} = {}) {
  const key = `bcsp:cats2:${lang}`; // v2：值含 forms（格式變更必換鍵版本）
  let cached = null;
  try {
    const raw = JSON.parse(storage?.getItem(key) || 'null');
    if (raw?.names) {
      cached = { catMap: deserializeCatList(raw.names), formsById: deserializeForms(raw.forms) };
      if (raw.date === today) return cached; // 當日已抓過 → 不重抓
    }
  } catch { /* 壞值 → 重抓 */ }
  try {
    const res = await fetchFn(buildCatsUrl(lang));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = parseDoc(await res.text());
    const map = parseCatList(doc);
    if (!map.size) return cached; // 結構變動解析不到 → 用過期快取頂著
    const forms = parseCatForms(doc);
    try {
      storage?.setItem(key, JSON.stringify({ date: today, names: serializeCatList(map), forms: serializeForms(forms) }));
      storage?.removeItem(`bcsp:cats:${lang}`); // v1 孤兒鍵順手釋放
    } catch { /* 配額滿 → 只用不存 */ }
    return { catMap: map, formsById: forms };
  } catch {
    return cached; // 離線/失敗 → 過期快取或 null
  }
}
