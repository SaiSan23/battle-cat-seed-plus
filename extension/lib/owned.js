// 擁有貓咪清單（使用者資料，localStorage 鍵 bcsp:owned，列入 SETTINGS_KEYS 清快取不清）。
// 以貓 id 為準（貓名隨型態/語言變動）。o 短碼是 godfat 伺服器端編碼：
// 解碼＝解析 /cats?o=… 頁的 checked，編碼＝fetch ?t=<id>… 讓 godfat 302 轉出短碼。
import { buildOwnedSyncUrl } from './godfat.js';
import { clearCache } from './cache.js';

const OWNED_KEY = 'bcsp:owned';

function store() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

// 讀取清單：永遠回傳完整形狀（無資料/壞值 → 空清單）
export function loadOwned() {
  const empty = { ids: new Set(), oCode: null, oDirty: false, updated: null };
  const s = store();
  if (!s) return empty;
  try {
    const obj = JSON.parse(s.getItem(OWNED_KEY) || 'null');
    if (!obj || !Array.isArray(obj.ids)) return empty;
    return {
      ids: new Set(obj.ids.map(Number).filter(Boolean)),
      oCode: obj.oCode || null,
      oDirty: !!obj.oDirty,
      updated: obj.updated || null,
    };
  } catch {
    return empty;
  }
}

// 寫入清單；updated＝最後異動日，每次存檔一律蓋當日（呼叫端不需帶）。
// 配額滿時清資料快取（設定鍵不受影響）騰空間再試一次
export function saveOwned({ ids, oCode = null, oDirty = false }) {
  const s = store();
  if (!s) return false;
  const payload = JSON.stringify({
    ids: [...ids].sort((a, b) => a - b),
    oCode,
    oDirty,
    updated: new Date().toLocaleDateString('sv'), // sv 地區格式即 YYYY-MM-DD（本地時區）
  });
  try {
    s.setItem(OWNED_KEY, payload);
    return true;
  } catch {
    try {
      clearCache();
      s.setItem(OWNED_KEY, payload);
      return true;
    } catch {
      return false;
    }
  }
}

// /cats 頁每貓一個 <input type="checkbox" name="t" value="<id>">；帶 o 開頁時已擁有者有 checked 屬性
export function parseOwnedFromCatsDoc(doc) {
  return [...doc.querySelectorAll('input[name="t"][checked]')]
    .map((el) => Number(el.getAttribute('value')))
    .filter(Boolean)
    .sort((a, b) => a - b);
}

// 寬容解析匯入輸入：任何含 o= 的網址，或裸短碼
export function extractOCode(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/[?&]o=([^&#\s]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return null; } // 壞編碼＝垃圾輸入
  }
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

// 換碼：把 id 清單交給 godfat（302 → res.url 帶新 o 短碼）。失敗回 null，呼叫端退回不帶 o。
export async function fetchOCode(ids, lang, fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(buildOwnedSyncUrl([...ids], lang));
    return new URL(res.url).searchParams.get('o') || null;
  } catch {
    return null;
  }
}
