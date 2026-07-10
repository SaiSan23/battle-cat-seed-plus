// 擁有清單頁：資料來源＝/cats 每日快取（全站目錄，與卡池無關）。
// 勾選即存（oDirty，換碼延後到要用時）；篩選列（稀有度／擁有／召喚）僅影響顯示，不影響統計。
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

// 貓咪圖示：BC 資訊網（https://battlecatsinfo.github.io，圖檔編號＝godfat 貓 id − 1）
// 型態索引 0基本/1二階/2三階/3四階；無該階 404 → onerror 退純文字
const ICON_BASE = 'https://battlecatsinfo.github.io/img/u';
const FORM_KEY = 'bcsp:owned-form';
const iconUrl = (id, fi) => `${ICON_BASE}/${id - 1}/${fi}.png`;
// 每貓實際顯示階 = min(全域選擇, 該貓最高階)
function formIndexFor(id) {
  const n = formsById.get(id)?.length || 1;
  return Math.min(Number($('#form-sel').value) || 0, n - 1);
}

let owned = loadOwned();
let byId = null; // Map id → { name, rarity }（代表名＝目前顯示型態）
let formsById = new Map(); // id → 有序型態名陣列（搜尋用）

function renderStats() {
  const per = new Map(RARITY_ORDER.map(([r]) => [r, { own: 0, all: 0 }]));
  let own = 0;
  let all = 0;
  for (const [id, { rarity }] of byId) {
    const c = per.get(rarity);
    if (!c) continue;
    c.all++;
    all++;
    if (owned.ids.has(id)) { c.own++; own++; }
  }
  $('#stats').textContent = `總收藏 ${own}/${all}`;
  // 各分組標題的計數與進度列（分組不重繪，勾選後只更新這裡）
  for (const [r] of RARITY_ORDER) {
    const det = document.querySelector(`#groups details.g-${r}`);
    if (!det) continue;
    const { own: o, all: a } = per.get(r);
    det.querySelector('.g-cnt').textContent = `${o}/${a}`;
    det.querySelector('.g-bar i').style.width = a ? `${(o / a) * 100}%` : '0';
  }
}

function renderGroups() {
  const box = $('#groups');
  box.innerHTML = '';
  for (const [rarity, label] of RARITY_ORDER) {
    const cats = [...byId].filter(([, v]) => v.rarity === rarity);
    if (!cats.length) continue;
    const det = document.createElement('details');
    det.className = `g-${rarity}`; // 稀有度強調色（色點/進度列/擁有色條）由此接色
    det.open = rarity === 'legend' || rarity === 'uber'; // 抽卡主對象預設展開
    det.innerHTML = `<summary><i class="dot"></i>${label}<span class="g-bar"><i></i></span><span class="g-cnt"></span></summary>`;
    const ul = document.createElement('ul');
    for (const [id, { name }] of cats) {
      const li = document.createElement('li');
      li.dataset.id = id;
      const forms = formsById.get(id) || [name];
      li.dataset.forms = forms.join('|');
      if (owned.ids.has(id)) li.className = 'owned';
      const fi = formIndexFor(id);
      li.innerHTML =
        `<label title="${esc(forms.join(' | '))}"><input type="checkbox" value="${id}"${owned.ids.has(id) ? ' checked' : ''}>` +
        ` <img class="icon" loading="lazy" alt="" src="${iconUrl(id, fi)}">` +
        ` <span class="nm">${esc(forms[fi] || name)}</span></label>` +
        `<a href="${buildCatUrl(id, lang)}" target="_blank" title="在 godfat 查看">🐾</a>`;
      ul.appendChild(li);
    }
    det.appendChild(ul);
    box.appendChild(det);
  }
  applyFilters();
}

const SUMMON_RE = /^\d+[-_]\d+$/; // 召喚單位（貓咪附帶的召喚屬性，無獨立譯名、僅編號如 817-1）
let rarityFilter = ''; // '' = 全部

function applyFilters() {
  const q = $('#search').value.trim();
  const ownState = $('#own-state').value; // ''/1/0
  const sumState = $('#summon-state').value; // ''/hide/only
  for (const det of document.querySelectorAll('#groups details')) {
    det.hidden = !!rarityFilter && !det.classList.contains(`g-${rarityFilter}`);
  }
  for (const li of document.querySelectorAll('#groups li')) {
    const id = Number(li.dataset.id);
    const isSummon = SUMMON_RE.test((formsById.get(id) || [''])[0]);
    const okQ = !q || li.dataset.forms.includes(q);
    const okOwn = !ownState || (ownState === '1') === owned.ids.has(id);
    const okSum = !sumState || (sumState === 'only') === isSummon;
    li.hidden = !(okQ && okOwn && okSum);
  }
  if (q) for (const det of document.querySelectorAll('#groups details')) det.open = true; // 搜尋時展開全部
}

// 稀有度 chips：「全部」＋六稀有度，單選高亮，切換整組顯示/隱藏
{
  const rf = $('#rarity-filter');
  rf.innerHTML = '<button type="button" class="on" data-r="">全部</button>' +
    RARITY_ORDER.map(([r, label]) => `<button type="button" data-r="${r}" class="g-${r}">${label}</button>`).join('');
  rf.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-r]');
    if (!btn) return;
    rarityFilter = btn.dataset.r;
    for (const b of rf.querySelectorAll('button')) b.classList.toggle('on', b === btn);
    applyFilters();
  });
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
  cb.closest('li').classList.toggle('owned', cb.checked); // godfat 同款擁有底色即時反映
  owned.oDirty = true; // 本地改動後短碼過期，要用時再換
  saveOwned(owned);
  renderStats();
  if ($('#own-state').value) applyFilters();
});
$('#search').addEventListener('input', applyFilters);
$('#own-state').addEventListener('change', applyFilters);
$('#summon-state').addEventListener('change', applyFilters);

// 型態切換就地更新，不重繪分組——保留收合與捲動
function applyForm() {
  localStorage.setItem(FORM_KEY, $('#form-sel').value);
  for (const li of document.querySelectorAll('#groups li')) {
    const id = Number(li.dataset.id);
    const forms = formsById.get(id);
    if (!forms) continue;
    const fi = formIndexFor(id);
    li.querySelector('.nm').textContent = forms[fi] || forms[0];
    const img = li.querySelector('img.icon');
    img.hidden = false; // 換階重試（前一階可能 404 被隱藏）
    img.src = iconUrl(id, fi);
  }
}
$('#form-sel').addEventListener('change', applyForm);
try { $('#form-sel').value = localStorage.getItem(FORM_KEY) || '0'; } catch { /* 無 localStorage → 預設 */ }

// 圖 404／外站掛 → 隱藏圖留文字（error 不冒泡，capture 委派）
$('#groups').addEventListener('error', (ev) => {
  if (ev.target?.matches?.('img.icon')) ev.target.hidden = true;
}, true);

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
  const data = await loadCatList(lang);
  if (!data) {
    $('#status').textContent = '無法取得 /cats 目錄（離線且無快取）；連上網後重新整理即可';
    return;
  }
  byId = catsById(data.catMap);
  formsById = data.formsById;
  $('#status').textContent = '';
  renderGroups();
  renderStats();
  // ?import=<o>：view 提示／popup 導流入口——自動預填並跑預覽
  const imp = qp.get('import');
  if (imp) { $('#import-input').value = imp; $('#import-preview').click(); }
})();
