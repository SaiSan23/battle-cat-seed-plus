import { buildEventUrl } from '../lib/godfat.js';

const $ = (s) => document.querySelector(s);

function isRunningToday(name) {
  // 名稱格式："YYYY-MM-DD ~ YYYY-MM-DD: ..."
  const m = name.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return false;
  // sv 地區格式即 YYYY-MM-DD（本地時區，與 view 一致）；UTC 會在台灣早上 8 點前差一天
  const today = new Date().toLocaleDateString('sv');
  return m[1] <= today && today <= m[2];
}

async function getContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.tabs
    .sendMessage(tab.id, { type: 'GET_GODFAT_CONTEXT' })
    .catch(() => null);
  return { tab, ...(res || {}) };
}

let SEED = null;

function render(events) {
  const list = $('#banner-list');
  list.innerHTML = '';
  let lastGroup = null;
  for (const e of events) {
    if (e.group && e.group !== lastGroup) {
      const h = document.createElement('li');
      h.className = 'group-label';
      h.textContent = e.group;
      list.appendChild(h);
      lastGroup = e.group;
    }
    const li = document.createElement('li');
    const checked = isRunningToday(e.name) ? 'checked' : '';
    li.innerHTML = `<label><input type="checkbox" value="${e.id}" ${checked}> ${e.name}</label>`;
    list.appendChild(li);
  }
}

$('#filter').addEventListener('input', (ev) => {
  const q = ev.target.value.toLowerCase();
  for (const li of $('#banner-list').children) {
    if (li.classList.contains('group-label')) continue;
    li.hidden = !li.textContent.toLowerCase().includes(q);
  }
});

$('#load').addEventListener('click', () => {
  const ids = [...$('#banner-list').querySelectorAll('input:checked')].map((i) => i.value);
  if (!SEED || ids.length === 0) return;
  const params = new URLSearchParams({
    seed: SEED.seed,
    count: SEED.count ?? 100,
    lang: SEED.lang ?? 'tw',
    events: ids.join(','),
  });
  // last 影響 1A 是否為重複稀有，必須帶上
  if (SEED.last != null) params.set('last', SEED.last);
  chrome.tabs.create({ url: chrome.runtime.getURL('view/view.html') + '?' + params });
});

(async () => {
  const ctx = await getContext();
  if (!ctx.seedParams) {
    $('#status').textContent = '請先在 godfat 種子頁（含 seed 的網址）開啟本擴充。';
    return;
  }
  SEED = ctx.seedParams;
  $('#status').innerHTML = `種子 <span class="badge">${SEED.seed}</span>`;
  $('#controls').hidden = false;
  render(ctx.events || []);
})();
