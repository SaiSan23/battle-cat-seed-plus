import { buildEventUrl } from '../lib/godfat.js';
import { parseRollTable } from '../lib/parser.js';
import { mergeBanners } from '../lib/merge.js';
import { mapWithLimit } from '../lib/concurrency.js';
import { shortBannerName, bannerDateRange, BUSTER_SHORTS } from '../lib/banner-names.js';
import { cacheKey, cacheGet, cacheSet, clearCache } from '../lib/cache.js';
import { planRoutes } from '../lib/route.js';
import { effectiveRarity, TICKET_SHORTS } from '../lib/rarity.js';

// 外開連結圖示（Feather 風 stroke，內嵌 SVG，CSP 安全）
const GF_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M14 4h6v6"/><path d="M20 4 10 14"/>' +
  '<path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>';

const CONCURRENCY = 5;
const qp = new URLSearchParams(location.search);
const seed = Number(qp.get('seed'));
const count = Number(qp.get('count')) || 100;
const lang = qp.get('lang') || 'tw';
const last = qp.get('last') || undefined; // 影響 1A 是否為重複稀有
const eventIds = (qp.get('events') || '').split(',').filter(Boolean);

document.querySelector('#seed-label').textContent = `（種子 ${seed}）`;
document.querySelector('#count').value = count;

const hidden = new Set(); // 被隱藏的 bannerId
let currentEntries = []; // 目前已載入的 entries（供開關重繪，不需重抓）
const routeTargets = new Map(); // id -> { id, kind, label, accept:Set<'bid|pos'> }
let lastPlanResult = null; // 最近一次規劃結果

// 逐卡池保證型式（無/7/11/15）：每卡池自己的值是唯一生效來源，localStorage 持久化。
// 初始自動預設：一般卡池→11、Buster 系→15、票池→無；全域下拉僅為批次設定工具。
const GU_KEY = 'bcsp:gu-values';
let guValues = new Map();
try { guValues = new Map(Object.entries(JSON.parse(localStorage.getItem(GU_KEY) || '{}'))); } catch { /* 壞值 → 空 */ }
function autoGu(short) {
  if (TICKET_SHORTS.has(short)) return '';
  return BUSTER_SHORTS.has(short) ? '15' : '11';
}
function saveGu() { localStorage.setItem(GU_KEY, JSON.stringify(Object.fromEntries(guValues))); }
function guFor(id) { return guValues.get(id) ?? ''; }

function makeEntry(id, name, parsed, cached) {
  const date = bannerDateRange(name);
  return {
    banner: { id, name, short: shortBannerName(name), date, start: date.split('~')[0] || '' },
    parsed,
    cached,
  };
}

async function fetchBanner(id, useCount, force) {
  const key = cacheKey({ seed, event: id, count: useCount, force, last });
  const hit = cacheGet(key);
  if (hit) return makeEntry(id, hit.name, hit.parsed, true);

  // force 為空字串時不傳 forceGuaranteed（不模擬 → 保證欄空）
  const forceGuaranteed = force ? Number(force) : undefined;
  const url = buildEventUrl({ seed, event: id, count: useCount, lang, last, forceGuaranteed });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parsed = parseRollTable(doc);
  const name = doc.querySelector('#event_select option[selected]')?.textContent.trim() || id;
  cacheSet(key, { name, parsed });
  return makeEntry(id, name, parsed, false);
}

function currentParams() {
  const useCount = Math.max(10, Math.min(500, Number(document.querySelector('#count').value) || 100));
  return { useCount };
}

function renderError(id, message) {
  const { useCount } = currentParams();
  const forceGuaranteed = Number(guFor(id)) || undefined;
  const div = document.createElement('div');
  div.className = 'err';
  div.innerHTML =
    `卡池 ${id} 載入失敗：${message} ` +
    `<a href="${buildEventUrl({ seed, event: id, count: useCount, lang, last, forceGuaranteed })}" target="_blank">在 godfat 開啟</a>`;
  document.querySelector('#errors').appendChild(div);
}

function esc(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

let lastVisibleShorts = []; // 目前可見卡池的簡稱（欄順序），供 Find 矩陣表頭使用

function renderTable(entries) {
  const merged = mergeBanners(entries);
  const visible = entries.filter((e) => !hidden.has(e.banner.id));
  lastVisibleShorts = visible.map((e) => e.banner.short);
  const showB = document.querySelector('#show-b').checked;
  const sub = showB ? 2 : 1; // 每卡池子欄數
  const table = document.querySelector('#grid');
  const { useCount } = currentParams();

  // 單格：某位置（如 12B）× 卡池 → <td>；無資料回空格
  function cellHtml(pos, e, bi) {
    const c = merged.byPos.get(pos)?.get(e.banner.id);
    if (!c) return '<td></td>';
    // 重複稀有：主格顯示天然結果（與 godfat 一致）。重抽格只在「以重複狀態抵達」時觸發
    // （前一隻與本格天然同名），故降為附註：重抽實得＋換軌落點（帶 R 字尾＝落點仍處重複狀態）。
    const cls = [c.rarity];
    if (c.isNext) cls.push('next');
    if (c.dupe) cls.push('dupe');
    if (pos.endsWith('B')) cls.push('btrack');
    const mainName = c.name;
    // 換軌方向：落點在 A 軌＝回溯 ↩（B→A）、B 軌＝前進 ↪（A→B），與 godfat 的 <-/-> 對應
    const dir = (to) => (/^\d+A/.test(to) ? '↩' : '↪');
    const dupeTo = c.dupe?.to ? ` ${dir(c.dupe.to)} ${esc(c.dupe.to)}` : '';
    const dupeNote = c.dupe ? `<div class="dupe-note">重複→ ${esc(c.dupe.name)}${dupeTo}</div>` : '';
    const guarTo = c.guaranteed?.to ? ` ${dir(c.guaranteed.to)} ${esc(c.guaranteed.to)}` : '';
    let guar = c.guaranteed ? `<div class="guar">保證: ${esc(c.guaranteed.name)}${guarTo}</div>` : '';
    if (c.dupeGuaranteed) {
      const dgTo = c.dupeGuaranteed.to ? ` ${dir(c.dupeGuaranteed.to)} ${esc(c.dupeGuaranteed.to)}` : '';
      guar += `<div class="guar">保證(撞名): ${esc(c.dupeGuaranteed.name)}${dgTo}</div>`;
    }
    const title = c.dupe
      ? ` title="前一隻同為 ${esc(c.name)} 時視為重複，改抽 ${esc(c.dupe.name)}${c.dupe.to ? `，下一抽 ${esc(c.dupe.to)}` : ''}"`
      : '';
    const rr = c.rarity;
    if (routeTargets.has(`cell:${e.banner.id}|${pos}`)) cls.push('target');
    return (
      `<td class="${cls.join(' ')}"${title} data-r="${esc(rr)}" data-n="${esc(mainName)}"` +
      ` data-pos="${esc(pos)}" data-bi="${bi}" data-bid="${esc(e.banner.id)}">${esc(mainName)}${dupeNote}${guar}</td>`
    );
  }

  // 第 1 列：位置（跨表頭列）＋日期（相鄰相同者跨欄合併，colspan × 子欄數）
  const dateRow = [`<th class="pos" rowspan="${showB ? 3 : 2}">位置</th>`];
  for (let i = 0; i < visible.length; ) {
    const d = visible[i].banner.date;
    let span = 1;
    while (i + span < visible.length && visible[i + span].banner.date === d) span++;
    dateRow.push(`<th class="date" colspan="${span * sub}">${esc(d) || '—'}</th>`);
    i += span;
  }

  // 第 2 列：簡稱（colspan=子欄數，title 掛完整名稱）＋在 godfat 開啟
  const nameRow = [];
  for (const e of visible) {
    const link = buildEventUrl({ seed, event: e.banner.id, count: useCount, lang, last,
      forceGuaranteed: Number(guFor(e.banner.id)) || undefined });
    nameRow.push(
      `<th colspan="${sub}" title="${esc(e.banner.name)}">${esc(e.banner.short)}` +
        `<a class="gf" href="${link}" target="_blank" title="在 godfat 開啟此卡池">${GF_ICON}</a></th>`
    );
  }

  // 表頭：B 軌開啟時多第 3 列 A/B 子標；最後一列掛 .hend 供底線
  const headRows = [`<tr>${dateRow.join('')}</tr>`];
  if (showB) {
    headRows.push(`<tr>${nameRow.join('')}</tr>`);
    const abRow = visible.map(() => '<th class="ab">A</th><th class="ab btrack">B</th>').join('');
    headRows.push(`<tr class="hend">${abRow}</tr>`);
  } else {
    headRows.push(`<tr class="hend">${nameRow.join('')}</tr>`);
  }

  const out = [`<thead>${headRows.join('')}</thead>`];
  const body = [];
  for (const n of merged.numbers) {
    const posLabel = showB ? String(n) : `${n}A`;
    const tds = [`<td class="pos">${posLabel}</td>`];
    for (let bi = 0; bi < visible.length; bi++) {
      const e = visible[bi];
      tds.push(cellHtml(`${n}A`, e, bi));
      if (showB) tds.push(cellHtml(`${n}B`, e, bi));
    }
    body.push(`<tr>${tds.join('')}</tr>`);
  }
  out.push(`<tbody>${body.join('')}</tbody>`);
  table.innerHTML = out.join('');
  applyFind(); // 重新渲染後重套高亮
  if (selectedPlan) showPlanPath(selectedPlan); // 路線高亮同樣重套（B 軌開關/卡池顯隱後不消失）
}

// Find/高亮：依稀有度與貓名在表中標記符合的格子
const RARITY_GROUP = {
  rare: ['rare'],
  supa: ['supa'],
  uber: ['uber', 'exclusive', 'legend'], // 超激稀有以上：含 exclusive 與 傳說(legend)；有效稀有度已把 (祭) 換算成基本值
  exclusive: ['exclusive'],
  legend: ['legend'],
};

// 有效稀有度（過濾用）：(祭) 格依卡池是否祭典換算、票池必超激——規則見 lib/rarity.js
function effRarity(td) {
  const short = lastVisibleShorts[Number(td.getAttribute('data-bi'))];
  return effectiveRarity(td.getAttribute('data-r'), short);
}

let findMatches = []; // [{td, pos, bi, name, rarity}]，供矩陣與跳轉用
function applyFind() {
  const n = document.querySelector('#find-name').value.trim();
  const grp = document.querySelector('#find-rarity').value ? RARITY_GROUP[document.querySelector('#find-rarity').value] : null;
  const active = grp || n;
  findMatches = [];
  for (const td of document.querySelectorAll('#grid tbody td[data-r]')) {
    const er = effRarity(td);
    const okR = !grp || grp.includes(er);
    const okN = !n || td.getAttribute('data-n').includes(n);
    const hit = !!active && okR && okN;
    td.classList.toggle('found', hit);
    if (hit) {
      findMatches.push({
        td,
        pos: td.getAttribute('data-pos'),
        bi: Number(td.getAttribute('data-bi')),
        name: td.getAttribute('data-n'),
        rarity: er, // 有效稀有度（白金/黑金 已視為 uber）：供比對/篩選
        origRarity: td.getAttribute('data-r'), // 原始天然稀有度：色條沿用 godfat 底色
      });
    }
  }
  renderFindPopup(!!active);
}

// 矩陣：列＝命中的位置、欄＝命中的卡池、格＝貓名（可點擊跳轉）
let findWasActive = false;
function renderFindPopup(active) {
  const popup = document.querySelector('#find-popup');
  popup.hidden = false; // 底部 bar 一直在
  document.querySelector('#find-count').textContent = findMatches.length;
  if (!active) {
    popup.classList.add('collapsed'); // 清空搜尋 → 自動收成底部 bar
    findWasActive = false;
    updateFindToggle();
    return;
  }
  if (!findWasActive) popup.classList.remove('collapsed'); // 由無搜尋 → 有搜尋自動展開
  findWasActive = true;
  updateFindToggle();

  const showB = document.querySelector('#show-b').checked;
  const sub = showB ? 2 : 1;
  // 列＝命中的抽數（A/B 合併為同一列）；欄＝命中的卡池（B 軌開啟時各拆 A|B 子欄，對齊主表）
  const rows = [...new Set(findMatches.map((m) => parseInt(m.pos, 10)))].sort((a, b) => a - b);
  const cols = [...new Set(findMatches.map((m) => m.bi))].sort((a, b) => a - b);
  const matchByCell = new Map(); // `${n}|${bi}|${track}` -> match index
  findMatches.forEach((m, i) => {
    const track = m.pos.endsWith('B') ? 'B' : 'A';
    matchByCell.set(`${parseInt(m.pos, 10)}|${m.bi}|${track}`, i);
  });

  if (!rows.length) {
    document.querySelector('#find-body').innerHTML = '<p class="empty">無符合</p>';
    return;
  }

  const cellFor = (n, bi, track) => {
    const b = track === 'B' ? ' btrack' : '';
    const mi = matchByCell.get(`${n}|${bi}|${track}`);
    if (mi == null) return `<td class="${b.trim()}"></td>`; // 該子欄此抽數非命中 → 留空
    const m = findMatches[mi];
    // 色條用原始天然稀有度（保留 godfat 可分辨的底色），比對仍依有效稀有度
    return `<td class="hit r-${esc(m.origRarity)}${b}" data-i="${mi}" title="${esc(m.name)}">${esc(m.name)}</td>`;
  };

  const head1 =
    `<tr><th rowspan="${sub}">位置</th>` +
    cols.map((bi) => `<th colspan="${sub}">${esc(lastVisibleShorts[bi] ?? '?')}</th>`).join('') +
    '</tr>';
  const head2 = showB
    ? '<tr>' + cols.map(() => '<th class="ab">A</th><th class="ab btrack">B</th>').join('') + '</tr>'
    : '';

  const body = rows
    .map((n) => {
      const label = showB ? String(n) : `${n}A`;
      const tds = cols
        .map((bi) => (showB ? cellFor(n, bi, 'A') + cellFor(n, bi, 'B') : cellFor(n, bi, 'A')))
        .join('');
      return `<tr><td class="p">${esc(label)}</td>${tds}</tr>`;
    })
    .join('');

  document.querySelector('#find-body').innerHTML = `<table class="find-grid"><thead>${head1}${head2}</thead><tbody>${body}</tbody></table>`;
}

function jumpToMatch(i) {
  const m = findMatches[i];
  if (!m) return;
  m.td.scrollIntoView({ block: 'center', inline: 'center' });
  m.td.classList.add('flash');
  setTimeout(() => m.td.classList.remove('flash'), 1300);
}

function renderToggles(entries) {
  const box = document.querySelector('#banner-toggles');
  box.innerHTML = '';
  for (const e of entries) {
    const wrap = document.createElement('span');
    wrap.className = 'banner-chip';
    const label = document.createElement('label');
    label.title = e.banner.name;
    label.innerHTML = `<input type="checkbox" checked data-id="${esc(e.banner.id)}"> ${esc(e.banner.short)}`;
    label.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) hidden.delete(e.banner.id);
      else hidden.add(e.banner.id);
      renderTable(entries);
    });
    // 逐卡池保證型式（放 label 外，避免點擊誤觸顯示開關）
    const sel = document.createElement('select');
    sel.className = 'gu-sel';
    sel.title = '確定連抽（保證）型式';
    sel.innerHTML = '<option value="">無保證</option><option value="7">7連</option><option value="11">11連</option><option value="15">15連</option>';
    sel.value = guFor(e.banner.id);
    sel.addEventListener('change', () => {
      guValues.set(e.banner.id, sel.value);
      saveGu();
      load();
    });
    wrap.appendChild(label);
    wrap.appendChild(sel);
    box.appendChild(wrap);
  }
}

function setChip(id, state, label, cached) {
  const el = document.querySelector(`#progress-list .pchip[data-id="${id}"]`);
  if (!el) return;
  el.className = `pchip ${state}`;
  const icon = state === 'ok' ? '✓' : state === 'err' ? '✗' : '';
  const suffix = state === 'ok' && cached ? '（快取）' : '';
  el.innerHTML =
    `<span class="picon">${icon}</span>` +
    `<span class="pname">${esc(label)}${suffix}</span>` +
    `<span class="pbar"></span>`;
}

async function load() {
  const { useCount } = currentParams();
  const progress = document.querySelector('#progress');
  document.querySelector('#errors').innerHTML = '';
  hidden.clear();
  // 個別進度：每個卡池一列（先以 ID 顯示，抓到後換成簡稱）
  document.querySelector('#progress-list').innerHTML = eventIds
    .map(
      (id) =>
        `<div class="pchip loading" data-id="${esc(id)}">` +
        `<span class="picon"></span><span class="pname">${esc(id)}</span><span class="pbar"></span></div>`
    )
    .join('');
  const bar = document.querySelector('#progress-bar');
  const fill = document.querySelector('#progress-fill');
  bar.hidden = false;
  fill.style.width = '0';
  progress.textContent = `載入中 0/${eventIds.length}…`;
  let done = 0;
  const tick = () => {
    progress.textContent = `載入中 ${++done}/${eventIds.length}…`;
    fill.style.width = `${(done / eventIds.length) * 100}%`;
  };
  const results = await mapWithLimit(eventIds, CONCURRENCY, async (id) => {
    try {
      const r = await fetchBanner(id, useCount, guFor(id));
      setChip(id, 'ok', r.banner.short, r.cached);
      tick();
      return r;
    } catch (e) {
      setChip(id, 'err', id);
      tick();
      throw e;
    }
  });
  const entries = [];
  results.forEach((r, i) => {
    if (r.status === 'ok') entries.push(r.value);
    else renderError(eventIds[i], r.error.message);
  });
  // 依開始日期升冪排序（穩定排序：相同日期維持原順序）
  entries.sort((a, b) => (a.banner.start < b.banner.start ? -1 : a.banner.start > b.banner.start ? 1 : 0));
  // 首次見到的卡池：依名稱設定保證自動預設；有新值時重載一次帶入保證資料（其餘命中快取）
  let needReload = false;
  for (const e of entries) {
    if (!guValues.has(e.banner.id)) {
      const v = autoGu(e.banner.short);
      guValues.set(e.banner.id, v);
      if (v) needReload = true;
    }
  }
  saveGu();
  if (needReload) return load();
  progress.textContent = `完成（${entries.length}/${eventIds.length}）`;
  currentEntries = entries;
  renderToggles(entries);
  renderTable(entries);
  // 進度為載入指示，完成後收起（錯誤另在 #errors 顯示）
  document.querySelector('#progress-list').innerHTML = '';
  document.querySelector('#progress-bar').hidden = true;
}

// ── 路線目標選取 ──────────────────────────────────────────────
function catAccept(name) {
  const acc = new Set();
  const merged = mergeBanners(currentEntries);
  for (const [pos, byBanner] of merged.byPos) {
    for (const [bid, c] of byBanner) if (c.name === name || c.dupe?.name === name) acc.add(`${bid}|${pos}`);
  }
  return acc;
}
function toggleCellTarget(bid, pos, name) {
  const id = `cell:${bid}|${pos}`;
  if (routeTargets.has(id)) routeTargets.delete(id);
  else routeTargets.set(id, { id, kind: 'cell', name, label: `${pos} ${name}`, accept: new Set([`${bid}|${pos}`]) });
  renderTargetChips();
  renderTable(currentEntries);
}
function addFindAsTargets() {
  const names = [...new Set(findMatches.map((m) => m.name))];
  for (const name of names) {
    const id = `cat:${name}`;
    if (!routeTargets.has(id)) routeTargets.set(id, { id, kind: 'cat', name, label: name, accept: catAccept(name) });
  }
  renderTargetChips();
  renderTable(currentEntries);
}
function renderTargetChips() {
  const box = document.querySelector('#route-targets');
  box.innerHTML = '';
  for (const t of routeTargets.values()) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${esc(t.label)} <button title="移除" data-id="${esc(t.id)}">×</button>`;
    box.appendChild(chip);
  }
  document.querySelector('#plan-route').disabled = routeTargets.size === 0;
}

function toggleCatTarget(name) {
  const id = `cat:${name}`;
  if (routeTargets.has(id)) routeTargets.delete(id);
  else routeTargets.set(id, { id, kind: 'cat', name, label: name, accept: catAccept(name) });
  renderTargetChips();
  renderTable(currentEntries);
}

// ── 格子選單（左鍵開啟；右鍵不攔截維持瀏覽器預設） ──
const cellMenu = document.querySelector('#cell-menu');
let menuCtx = null; // { bid, pos, name }

function closeCellMenu() { cellMenu.hidden = true; menuCtx = null; }

function openCellMenu(td, x, y) {
  menuCtx = { bid: td.getAttribute('data-bid'), pos: td.getAttribute('data-pos'), name: td.getAttribute('data-n') };
  const hasCell = routeTargets.has(`cell:${menuCtx.bid}|${menuCtx.pos}`);
  const hasCat = routeTargets.has(`cat:${menuCtx.name}`);
  cellMenu.innerHTML =
    `<button data-act="cell">${hasCell ? '移除此位置目標' : '加入此位置目標'}</button>` +
    `<button data-act="cat">${hasCat ? '移除此貓目標' : '加入此貓目標（所有出現）'}</button>` +
    `<button data-act="find">搜尋此貓</button>` +
    `<button data-act="copy">複製貓咪名稱</button>`;
  cellMenu.hidden = false;
  // 先顯示取得尺寸再定位（防超出視窗右/下緣）
  cellMenu.style.left = `${Math.min(x, window.innerWidth - cellMenu.offsetWidth - 8)}px`;
  cellMenu.style.top = `${Math.min(y, window.innerHeight - cellMenu.offsetHeight - 8)}px`;
}

cellMenu.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn || !menuCtx) return;
  const { bid, pos, name } = menuCtx;
  const act = btn.getAttribute('data-act');
  if (act === 'cell') toggleCellTarget(bid, pos, name);
  else if (act === 'cat') toggleCatTarget(name);
  else if (act === 'find') {
    document.querySelector('#find-rarity').value = ''; // 清空稀有度篩選，避免濾掉此貓
    document.querySelector('#find-name').value = name;
    applyFind();
    document.querySelector('#find-popup').classList.remove('collapsed'); // 展開結果抽屜
    updateFindToggle();
  }
  else if (act === 'copy') navigator.clipboard?.writeText(name).catch(() => {});
  closeCellMenu();
});

// ── 規劃路線與 Pareto 呈現 ────────────────────────────────────
function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
function clearPath() {
  for (const td of document.querySelectorAll('#grid td.on-path')) {
    if (td.classList.contains('path-gu')) {
      // GU 起點格的 title 被動態改寫過；還原格子原生 title（如天然重複稀有附註），沒有則移除
      const orig = td.getAttribute('data-orig-title');
      if (orig) td.setAttribute('title', orig); else td.removeAttribute('title');
      td.removeAttribute('data-orig-title');
    }
    td.classList.remove('on-path', 'path-switch', 'path-ticket', 'path-target', 'path-gu');
    td.removeAttribute('data-step');
  }
}
let selectedPlan = null; // 目前高亮的方案（renderTable 重繪後重套）
function showPlanPath(plan) {
  clearPath();
  selectedPlan = plan || null;
  if (!plan) return;
  let missing = 0; // 不在目前 DOM 的步（B 軌未顯示或卡池被隱藏）
  for (const s of plan.steps) {
    const td = document.querySelector(`#grid td[data-bid="${cssq(s.bannerId)}"][data-pos="${cssq(s.pos)}"]`);
    if (!td) { missing++; continue; }
    if (s.gu) {
      // 保證步：標 GU 起點格（步序號由該格的中間第一抽標）；備份原 title 供 clearPath 還原
      td.classList.add('on-path', 'path-gu');
      if (s.collected.length) td.classList.add('path-target');
      td.setAttribute('data-orig-title', td.getAttribute('title') || '');
      td.title = `開確定連抽：保證 ${s.gotName}`;
      continue;
    }
    td.classList.add('on-path');
    if (s.switched) td.classList.add('path-switch');
    if (s.ticket) td.classList.add('path-ticket');
    if (s.collected.length) td.classList.add('path-target');
    td.setAttribute('data-step', s.k);
  }
  const note = document.querySelector('#route-note');
  if (note) {
    note.textContent = missing
      ? `⚠ 有 ${missing} 步不在目前畫面（B 軌未顯示或卡池被隱藏），開啟「顯示 B 軌」／卡池後即可看到完整路徑`
      : '';
  }
}
function renderPlanList(result) {
  const popup = document.querySelector('#route-popup');
  popup.hidden = false;
  const body = document.querySelector('#route-body');
  const REASON_LABEL = {
    'beyond-count': '超出載入抽數',
    'time-conflict': '卡池已結束',
    'hidden': '卡池已隱藏',
    'conflict': '互斥/軌道或時間不可達',
  };
  const tail = result.plans.length ? '。以下為可行子集方案。' : '，且無可行子集方案。';
  const warn = result.feasible ? '' :
    `<div class="err">無法收齊全部：${result.unreachable
      .map((u) => `${esc(routeTargets.get(u.id)?.label || u.id)}（${REASON_LABEL[u.reason] || u.reason}）`)
      .join('、')}${tail}</div>`;
  if (!result.plans.length) { body.innerHTML = warn || '<p class="empty">無方案</p>'; return; }
  const rows = result.plans.map((p, i) =>
    `<tr data-i="${i}"><td>${i + 1}</td><td>${p.cost.pulls}</td><td>${p.cost.gu}</td><td>${p.cost.plat}</td>` +
    `<td>${p.cost.legend}</td><td>${p.cost.switches}</td></tr>`).join('');
  body.innerHTML = warn + '<div id="route-note" class="hint"></div>' +
    `<table class="plan-grid"><thead><tr><th>#</th><th>抽數</th><th>GU</th><th>白金券</th><th>傳說券</th><th>換軌</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
  showPlanPath(result.plans[0]);
}
function runPlan() {
  const btn = document.querySelector('#plan-route');
  btn.disabled = true;
  btn.textContent = '規劃中…';
  // rAF 回呼在繪製前執行，其中排入的 timeout 會在繪製後才跑——
  // 確保「規劃中…」真的畫出來後才開始同步計算（setTimeout(0) 常趕在下一次繪製前執行）
  requestAnimationFrame(() => setTimeout(() => {
    try {
      // 傳入全部卡池（含隱藏者標 hidden）：隱藏卡池不入路線，但 reasonFor 能正確判讀
      const banners = currentEntries.map((e) => {
        const [start = '', end = ''] = (e.banner.date || '').split('~');
        return { id: e.banner.id, short: e.banner.short, start, end,
          hidden: hidden.has(e.banner.id), gu: Number(guFor(e.banner.id)) || null };
      });
      const merged = mergeBanners(currentEntries);
      const targets = [...routeTargets.values()];
      const today = new Date().toLocaleDateString('sv'); // sv 地區格式即 YYYY-MM-DD（本地時區）
      lastPlanResult = planRoutes({ merged, targets, banners, options: { lastName: null, today } });
      renderPlanList(lastPlanResult);
    } catch (err) {
      document.querySelector('#route-popup').hidden = false;
      document.querySelector('#route-body').innerHTML = `<div class="err">${esc(err.message)}</div>`;
    } finally {
      btn.textContent = '規劃路線';
      btn.disabled = routeTargets.size === 0;
    }
  }, 0));
}

document.querySelector('#grid').addEventListener('click', (ev) => {
  const td = ev.target.closest('td[data-bid]');
  if (!td) { closeCellMenu(); return; }
  openCellMenu(td, ev.clientX, ev.clientY);
});
document.addEventListener('click', (ev) => {
  if (!cellMenu.hidden && !ev.target.closest('#cell-menu') && !ev.target.closest('#grid td[data-bid]')) closeCellMenu();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeCellMenu(); });
document.querySelector('#table-wrap').addEventListener('scroll', closeCellMenu);
document.querySelector('#route-targets').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-id]');
  if (!btn) return;
  routeTargets.delete(btn.getAttribute('data-id'));
  renderTargetChips();
  renderTable(currentEntries);
});
document.querySelector('#find-add-targets').addEventListener('click', (ev) => {
  ev.stopPropagation();
  addFindAsTargets();
});
document.querySelector('#plan-route').addEventListener('click', runPlan);
document.querySelector('#route-close').addEventListener('click', () => {
  document.querySelector('#route-popup').hidden = true;
  showPlanPath(null); // 清高亮並取消重繪時的重套
});
document.querySelector('#route-body').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-i]');
  if (tr && lastPlanResult) showPlanPath(lastPlanResult.plans[Number(tr.getAttribute('data-i'))]);
});

document.querySelector('#count').addEventListener('change', () => load());
// 保證批次工具：一次改所有卡池的個別值後回到 placeholder（不存在持續生效的全域值）
document.querySelector('#guar').addEventListener('change', (ev) => {
  const v = ev.target.value;
  if (!v) return;
  if (v === 'auto') {
    for (const e of currentEntries) guValues.set(e.banner.id, autoGu(e.banner.short));
  } else {
    for (const id of eventIds) guValues.set(id, v === 'none' ? '' : v);
  }
  saveGu();
  ev.target.value = '';
  load();
});
document.querySelector('#show-b').addEventListener('change', () => renderTable(currentEntries));
document.querySelector('#find-rarity').addEventListener('change', applyFind);
document.querySelector('#find-name').addEventListener('input', applyFind);
document.querySelector('#find-body').addEventListener('click', (ev) => {
  const cell = ev.target.closest('td[data-i]');
  if (cell) jumpToMatch(Number(cell.getAttribute('data-i')));
});
function updateFindToggle() {
  const collapsed = document.querySelector('#find-popup').classList.contains('collapsed');
  document.querySelector('#find-toggle').textContent = collapsed ? '▲' : '▼';
}
// 點整條 head/bar 即切換收合（收合鈕只是視覺指示，點它會冒泡到 head）
document.querySelector('#find-popup-head').addEventListener('click', () => {
  document.querySelector('#find-popup').classList.toggle('collapsed');
  updateFindToggle();
});

// 底部抽屜可拖曳調整高度
(() => {
  const popup = document.querySelector('#find-popup');
  const handle = document.querySelector('#find-resize');
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const h = Math.min(Math.max(window.innerHeight - e.clientY, 90), window.innerHeight * 0.88);
    popup.style.height = `${h}px`;
  });
  const stop = () => (dragging = false);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
})();

// 路線面板：標題列拖曳移動＋位置記憶（超出視窗自動夾回）
(() => {
  const POS_KEY = 'bcsp:route-popup-pos';
  const popup = document.querySelector('#route-popup');
  const head = document.querySelector('#route-popup-head');
  const apply = (left, top) => {
    const w = popup.offsetWidth || 320;
    const headH = head.offsetHeight || 36;
    popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(top, window.innerHeight - headH - 8))}px`;
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
  };
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY));
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) apply(saved.left, saved.top);
  } catch { /* 壞值 → 用預設位置 */ }

  let drag = null; // { dx, dy }：指標與面板左上角的偏移
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#route-close')) return; // 關閉鈕不啟動拖曳
    const r = popup.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
    head.classList.add('dragging');
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    apply(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    head.classList.remove('dragging');
    const r = popup.getBoundingClientRect();
    localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top }));
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);
})();
document.querySelector('#clear-cache').addEventListener('click', (ev) => {
  clearCache();
  const btn = ev.currentTarget;
  btn.textContent = '已清除 ✓';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = '清除快取';
    btn.disabled = false;
  }, 1500);
});

if (!seed || eventIds.length === 0) {
  document.querySelector('#progress').textContent = '缺少 seed 或卡池參數。';
} else {
  load();
}
