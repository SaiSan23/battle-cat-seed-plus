import { buildEventUrl } from '../lib/godfat.js';
import { parseRollTable } from '../lib/parser.js';
import { mergeBanners } from '../lib/merge.js';
import { mapWithLimit } from '../lib/concurrency.js';
import { shortBannerName, bannerDateRange } from '../lib/banner-names.js';
import { cacheKey, cacheGet, cacheSet, clearCache } from '../lib/cache.js';

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

// 目前工具列的有效參數（count／模擬保證）；供「在 godfat 開啟」連結與重抓共用，
// 確保連結畫面與目前顯示的（含模擬保證）一致
function currentParams() {
  const useCount = Math.max(10, Math.min(500, Number(document.querySelector('#count').value) || 100));
  const force = document.querySelector('#guar').value;
  return { useCount, force, forceGuaranteed: force ? Number(force) : undefined };
}

function renderError(id, message) {
  const { useCount, forceGuaranteed } = currentParams();
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
  const { useCount, forceGuaranteed } = currentParams();

  // 單格：某位置（如 12B）× 卡池 → <td>；無資料回空格
  function cellHtml(pos, e, bi) {
    const c = merged.byPos.get(pos)?.get(e.banner.id);
    if (!c) return '<td></td>';
    // 重複稀有：真正拿到的是重抽結果，並換軌；天然那隻放 title 供參考
    const cls = [c.dupe ? c.dupe.rarity : c.rarity];
    if (c.isNext) cls.push('next');
    if (c.dupe) cls.push('dupe');
    if (pos.endsWith('B')) cls.push('btrack');
    const mainName = c.dupe ? c.dupe.name : c.name;
    const dupeNote = c.dupe ? `<div class="dupe-note">重複稀有 ↪ ${esc(c.dupe.to)}</div>` : '';
    const guarTo = c.guaranteed?.to ? ` ↪ ${esc(c.guaranteed.to)}` : '';
    const guar = c.guaranteed ? `<div class="guar">保證: ${esc(c.guaranteed.name)}${guarTo}</div>` : '';
    const title = c.dupe ? ` title="天然 ${esc(c.name)}（重複）→ 實得 ${esc(c.dupe.name)}"` : '';
    const rr = c.dupe ? c.dupe.rarity : c.rarity;
    return (
      `<td class="${cls.join(' ')}"${title} data-r="${esc(rr)}" data-n="${esc(mainName)}"` +
      ` data-pos="${esc(pos)}" data-bi="${bi}">${esc(mainName)}${dupeNote}${guar}</td>`
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
    const link = buildEventUrl({ seed, event: e.banner.id, count: useCount, lang, last, forceGuaranteed });
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
}

// Find/高亮：依稀有度與貓名在表中標記符合的格子
const RARITY_GROUP = {
  rare: ['rare'],
  supa: ['supa', 'supa_fest'],
  uber: ['uber', 'uber_fest', 'exclusive', 'legend'], // 超激稀有以上：含 exclusive 與 傳說(legend)，其餘(稀有/激稀有)留空
  exclusive: ['exclusive'],
  legend: ['legend'],
};

// 票抽卡池：只能用特殊票抽，貓咪皆為超激稀有以上（godfat 為對齊種子位置仍標天然稀有度）
const ALWAYS_SHORTS = new Set(['白金', '黑金']);
// 白金/黑金 的「稀有/激稀有」格一律視為超激（傳說/Exclusive 等高階維持原樣），供搜尋與顯示用
function effRarity(td) {
  const r = td.getAttribute('data-r');
  const short = lastVisibleShorts[Number(td.getAttribute('data-bi'))];
  if (ALWAYS_SHORTS.has(short) && (r === 'rare' || r === 'supa' || r === 'supa_fest')) return 'uber';
  return r;
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
    const label = document.createElement('label');
    label.title = e.banner.name;
    label.innerHTML = `<input type="checkbox" checked data-id="${esc(e.banner.id)}"> ${esc(e.banner.short)}`;
    label.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) hidden.delete(e.banner.id);
      else hidden.add(e.banner.id);
      renderTable(entries);
    });
    box.appendChild(label);
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
  const { useCount, force } = currentParams();
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
      const r = await fetchBanner(id, useCount, force);
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
  progress.textContent = `完成（${entries.length}/${eventIds.length}）`;
  currentEntries = entries;
  renderToggles(entries);
  renderTable(entries);
  // 進度為載入指示，完成後收起（錯誤另在 #errors 顯示）
  document.querySelector('#progress-list').innerHTML = '';
  document.querySelector('#progress-bar').hidden = true;
}

document.querySelector('#count').addEventListener('change', () => load());
document.querySelector('#guar').addEventListener('change', () => load());
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
