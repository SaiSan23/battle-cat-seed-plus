// godfat HTML 解析（純函式，接受 Document）
export const PARSER_VERSION = '2026-06-22';

const EVENT_ID_RE = /^\d{4}-\d{2}-\d{2}_\d+$/;

export function parseEventList(doc) {
  const select = doc.querySelector('#event_select');
  if (!select) return [];
  const out = [];
  for (const opt of select.querySelectorAll('option')) {
    const id = (opt.getAttribute('value') || '').trim();
    if (!EVENT_ID_RE.test(id)) continue;
    const group = opt.closest('optgroup')?.getAttribute('label')?.trim() || '';
    out.push({ id, name: opt.textContent.trim(), group });
  }
  return out;
}

// 完整型別清單（由 fixture 確認）；先檢查特殊/fest 變體再到普通，避免子字串誤判
const RARITIES = ['legend', 'exclusive', 'uber_fest', 'uber', 'supa_fest', 'supa', 'rare'];
const PICK_RE = /pick\('(\d+[AB])'\)/; // 僅 Result 格：pick id 無字尾
const GUAR_RE = /pick\('(\d+[AB])G'\)/; // 保證格：pick id 帶 G 字尾（需 force_guaranteed）
const REROLL_RE = /pick\('(\d+[AB])R'\)/; // 重抽格：pick id 帶 R 字尾（重複稀有時的真正結果）
const DUPE_GUAR_RE = /pick\('(\d+[AB])RG'\)/; // 撞名起手保證格（RG 字尾）：以重複狀態開確定連抽

function rarityOf(el) {
  for (const r of RARITIES) if (el.classList.contains(r)) return r;
  return null;
}

function catName(td) {
  const a = td.querySelector('span a'); // 第一個 a 為貓名，第二個是 🐾
  return a ? a.textContent.trim() : '';
}

export function parseRollTable(doc) {
  const table = doc.querySelector('table');
  const cells = new Map();
  if (!table) return { hasGuaranteed: false, cells };

  // 注意：godfat 的「Guaranteed」表頭永遠存在，不代表卡池有必中。
  // 保證欄只有以 force_guaranteed 模擬時才會填入；故 hasGuaranteed 取決於是否真的解析到保證格。
  let hasGuaranteed = false;

  for (const td of table.querySelectorAll('td.cat[onclick]')) {
    const m = (td.getAttribute('onclick') || '').match(PICK_RE);
    if (!m) continue;
    const pos = m[1];
    const rarity = rarityOf(td);
    const name = catName(td);
    if (!rarity || !name) continue; // 空格或無法判讀者略過
    const track = pos.endsWith('A') ? 'A' : 'B';
    const n = parseInt(pos, 10);
    cells.set(pos, { pos, track, n, rarity, name, isNext: td.classList.contains('next_position') });
  }

  // 保證格（G 字尾）：掛到同位置 Cell 的 guaranteed
  for (const td of table.querySelectorAll('td.cat[onclick]')) {
    const m = (td.getAttribute('onclick') || '').match(GUAR_RE);
    if (!m) continue;
    const target = cells.get(m[1]);
    if (!target) continue;
    const rarity = rarityOf(td);
    const name = catName(td);
    if (rarity && name) {
      // 換軌落點：保證抽完後下一抽位置，藏在格子文字的箭頭後（如「-> 11B」）；可帶 R 字尾（落點仍處重複狀態）
      const arrow = td.textContent.match(/(?:->|<-)\s*(\d+[AB]R?)\b/);
      target.guaranteed = { rarity, name, to: arrow ? arrow[1] : '' };
      hasGuaranteed = true;
    }
  }

  // 重抽格（R 字尾）：重複稀有時玩家真正拿到的結果＋換軌落點，掛到同位置 Cell.dupe
  for (const td of table.querySelectorAll('td.cat[onclick]')) {
    const m = (td.getAttribute('onclick') || '').match(REROLL_RE);
    if (!m) continue;
    const target = cells.get(m[1]);
    if (!target) continue;
    const rarity = rarityOf(td);
    const name = catName(td);
    if (!name) continue;
    // 換軌落點：cell 文字內的位置（如「-> 26B」「<- 28A」）；連鎖重複時帶 R 字尾（如「-> 134BR」）
    const arrow = td.textContent.match(/(\d+[AB]R?)\b/);
    target.dupe = { name, rarity, to: arrow ? arrow[1] : '' };
  }

  // 撞名起手保證格（RG 字尾）：以重複狀態抵達該位置時開確定連抽的保證與落點
  for (const td of table.querySelectorAll('td.cat[onclick]')) {
    const m = (td.getAttribute('onclick') || '').match(DUPE_GUAR_RE);
    if (!m) continue;
    const target = cells.get(m[1]);
    if (!target) continue;
    const rarity = rarityOf(td);
    const name = catName(td);
    if (!name) continue;
    const arrow = td.textContent.match(/(?:->|<-)\s*(\d+[AB]R?)\b/);
    target.dupeGuaranteed = { rarity, name, to: arrow ? arrow[1] : '' };
  }
  return { hasGuaranteed, cells };
}
