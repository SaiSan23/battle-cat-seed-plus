// 擁有清單頁：資料來源＝/cats 每日快取（全站目錄，與卡池無關）。
// 勾選即存（oDirty，換碼延後到要用時）；「只看未擁有」即未擁有總覽。
import { loadCatList } from '../lib/catlist-loader.js';
import { catsById } from '../lib/catlist.js';
import { loadOwned, saveOwned, parseOwnedFromCatsDoc, extractOCode, fetchOCode } from '../lib/owned.js';
import { buildCatsUrl, buildCatUrl } from '../lib/godfat.js';

const qp = new URLSearchParams(location.search);
const lang = qp.get('lang') || 'tw';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

const RARITY_ORDER = [
  ['legend', '傳說稀有'], ['uber', '超激稀有'], ['supa', '激稀有'],
  ['rare', '稀有'], ['special', '特殊'], ['normal', '基本'],
];

let owned = loadOwned();
let byId = null; // Map id → { name, rarity }（代表名＝目前顯示型態）
const formsById = new Map(); // id → 全型態名串（搜尋用）

function renderStats() {
  const per = new Map(RARITY_ORDER.map(([r]) => [r, { own: 0, all: 0 }]));
  for (const [id, { rarity }] of byId) {
    const c = per.get(rarity);
    if (!c) continue;
    c.all++;
    if (owned.ids.has(id)) c.own++;
  }
  $('#stats').textContent = RARITY_ORDER
    .map(([r, label]) => `${label} ${per.get(r).own}/${per.get(r).all}`)
    .join('　');
}

function renderGroups() {
  const box = $('#groups');
  box.innerHTML = '';
  for (const [rarity, label] of RARITY_ORDER) {
    const cats = [...byId].filter(([, v]) => v.rarity === rarity);
    if (!cats.length) continue;
    const det = document.createElement('details');
    det.open = rarity === 'legend' || rarity === 'uber'; // 抽卡主對象預設展開
    det.innerHTML = `<summary>${label}（${cats.length}）</summary>`;
    const ul = document.createElement('ul');
    for (const [id, { name }] of cats) {
      const li = document.createElement('li');
      li.dataset.id = id;
      li.dataset.forms = formsById.get(id) || name;
      li.innerHTML =
        `<label><input type="checkbox" value="${id}"${owned.ids.has(id) ? ' checked' : ''}> ${esc(name)}</label>` +
        `<a href="${buildCatUrl(id, lang)}" target="_blank" title="在 godfat 查看">🐾</a>`;
      ul.appendChild(li);
    }
    det.appendChild(ul);
    box.appendChild(det);
  }
  applyFilters();
}

function applyFilters() {
  const q = $('#search').value.trim();
  const onlyUn = $('#only-unowned').checked;
  for (const li of document.querySelectorAll('#groups li')) {
    const okQ = !q || li.dataset.forms.includes(q);
    const okU = !onlyUn || !owned.ids.has(Number(li.dataset.id));
    li.hidden = !(okQ && okU);
  }
  if (q) for (const det of document.querySelectorAll('#groups details')) det.open = true; // 搜尋時展開全部
}

// view 等他分頁改了清單 → 重載重繪，避免本頁舊快照整包覆寫（storage 事件跨分頁同源觸發）
window.addEventListener('storage', (ev) => {
  if (ev.key !== 'bcsp:owned') return;
  owned = loadOwned();
  if (byId) { renderGroups(); renderStats(); }
});

$('#groups').addEventListener('change', (ev) => {
  const cb = ev.target.closest('input[type="checkbox"]');
  if (!cb) return;
  const id = Number(cb.value);
  if (cb.checked) owned.ids.add(id); else owned.ids.delete(id);
  owned.oDirty = true; // 本地改動後短碼過期，要用時再換
  saveOwned(owned);
  renderStats();
  if ($('#only-unowned').checked) applyFilters();
});
$('#search').addEventListener('input', applyFilters);
$('#only-unowned').addEventListener('change', applyFilters);

// ── 匯入（預覽 → 取代/合併） ──
let pendingImport = null; // { ids: number[], code: string }
$('#import-preview').addEventListener('click', async () => {
  const code = extractOCode($('#import-input').value);
  const out = $('#import-result');
  pendingImport = null;
  if (!code) { out.textContent = '看不出 o 短碼：請貼含 o= 的 godfat 網址或裸短碼'; return; }
  out.textContent = '讀取中…';
  try {
    const res = await fetch(buildCatsUrl(lang, code));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const ids = parseOwnedFromCatsDoc(doc);
    if (!ids.length) { out.textContent = '此短碼沒有勾選任何貓'; return; }
    pendingImport = { ids, code };
    out.innerHTML =
      `共 ${ids.length} 隻 → ` +
      `<button id="imp-replace" type="button">取代現有清單</button> ` +
      `<button id="imp-merge" type="button">合併進現有清單</button>`;
  } catch {
    out.textContent = '讀取失敗（離線或 godfat 無回應）';
  }
});
$('#import-result').addEventListener('click', (ev) => {
  const act = ev.target.id;
  if (!pendingImport || (act !== 'imp-replace' && act !== 'imp-merge')) return;
  if (act === 'imp-replace') {
    // 取代：內容＝匯入來源，短碼直接沿用（乾淨，不需換碼）
    owned = { ids: new Set(pendingImport.ids), oCode: pendingImport.code, oDirty: false };
  } else {
    // 合併：內容可能超出來源短碼 → 標 dirty 待換碼
    owned = { ids: new Set([...owned.ids, ...pendingImport.ids]), oCode: owned.oCode, oDirty: true };
  }
  saveOwned(owned);
  pendingImport = null;
  if (!byId) { $('#import-result').textContent = '目錄尚未載入，匯入已儲存——請重新整理頁面'; return; }
  $('#import-result').textContent = `已匯入，現有 ${owned.ids.size} 隻`;
  renderGroups();
  renderStats();
});

// ── 匯出：確保短碼最新後在 godfat 開啟 ──
$('#export').addEventListener('click', async () => {
  if (!owned.ids.size) { $('#status').textContent = '清單是空的，先勾幾隻吧'; return; }
  let code = !owned.oDirty ? owned.oCode : null;
  if (!code) {
    $('#status').textContent = '向 godfat 換取 o 短碼中…';
    code = await fetchOCode(owned.ids, lang);
    if (!code) { $('#status').textContent = '換碼失敗（離線或 godfat 無回應）'; return; }
    owned.oCode = code;
    owned.oDirty = false;
    saveOwned(owned);
  }
  $('#status').textContent = '';
  window.open(buildCatsUrl(lang, code), '_blank');
});

(async () => {
  $('#status').textContent = '載入貓咪目錄…';
  const catMap = await loadCatList(lang);
  if (!catMap) {
    $('#status').textContent = '無法取得 /cats 目錄（離線且無快取）；連上網後重新整理即可';
    return;
  }
  byId = catsById(catMap);
  for (const [name, { id }] of catMap) {
    formsById.set(id, formsById.has(id) ? `${formsById.get(id)}|${name}` : name);
  }
  $('#status').textContent = '';
  renderGroups();
  renderStats();
  // ?import=<o>：view 提示／popup 導流入口——自動預填並跑預覽
  const imp = qp.get('import');
  if (imp) { $('#import-input').value = imp; $('#import-preview').click(); }
})();
