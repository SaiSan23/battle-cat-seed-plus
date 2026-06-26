// godfat 網址組裝與種子參數解析（純函式）
const GODFAT_ORIGIN = 'https://bc.godfat.org/';
const PARAM_ORDER = ['seed', 'last', 'event', 'lang', 'count', 'force_guaranteed'];

export function buildEventUrl({ seed, event, count, lang, last, forceGuaranteed } = {}) {
  const values = { seed, last, event, lang, count, force_guaranteed: forceGuaranteed };
  const qs = PARAM_ORDER
    .filter((k) => values[k] !== undefined && values[k] !== null && values[k] !== '')
    .map((k) => `${k}=${encodeURIComponent(values[k])}`)
    .join('&');
  return `${GODFAT_ORIGIN}?${qs}`;
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
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}
