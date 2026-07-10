// godfat 網址組裝與種子參數解析（純函式）
const GODFAT_ORIGIN = 'https://bc.godfat.org/';
const PARAM_ORDER = ['seed', 'last', 'event', 'lang', 'count', 'force_guaranteed', 'o'];

export function buildEventUrl({ seed, event, count, lang, last, forceGuaranteed, o } = {}) {
  const values = { seed, last, event, lang, count, force_guaranteed: forceGuaranteed, o };
  const qs = PARAM_ORDER
    .filter((k) => values[k] !== undefined && values[k] !== null && values[k] !== '')
    .map((k) => `${k}=${encodeURIComponent(values[k])}`)
    .join('&');
  return `${GODFAT_ORIGIN}?${qs}`;
}

// /cats 清單頁（全貓依稀有度分組，供 lib/catlist.js 建對照表）；oCode＝擁有清單短碼
export function buildCatsUrl(lang, oCode) {
  const o = oCode ? `&o=${encodeURIComponent(oCode)}` : '';
  return `${GODFAT_ORIGIN}cats?lang=${encodeURIComponent(lang || 'tw')}${o}`;
}

// 換碼網址：godfat 收到 t=<id> 清單後 302 轉址、網址帶壓縮後的 o 短碼（fetch 跟隨後從 res.url 取回）
export function buildOwnedSyncUrl(ids, lang) {
  const t = [...new Set(ids)].sort((a, b) => a - b).map((i) => `&t=${i}`).join('');
  return `${GODFAT_ORIGIN}cats?lang=${encodeURIComponent(lang || 'tw')}${t}`;
}

// 個別貓頁
export function buildCatUrl(id, lang) {
  return `${GODFAT_ORIGIN}cats/${id}?lang=${encodeURIComponent(lang || 'tw')}`;
}

export function parseSeedParamsFromUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.hostname !== 'bc.godfat.org') return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  const seed = url.searchParams.get('seed');
  if (!seed) return null;
  const num = (v) => (v == null ? undefined : Number(v));
  const out = {
    seed: Number(seed),
    event: url.searchParams.get('event') ?? undefined,
    count: num(url.searchParams.get('count')),
    lang: url.searchParams.get('lang') ?? undefined,
    last: num(url.searchParams.get('last')),
    forceGuaranteed: num(url.searchParams.get('force_guaranteed')) || undefined, // 0＝原生，視同未帶
    o: url.searchParams.get('o') ?? undefined, // 擁有清單短碼（godfat 純顯示用，不影響計算）
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}
