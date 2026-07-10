// 從 1A 規劃收齊目標貓的抽卡路線（純函式，不自算種子）
import { actualRarity } from './rarity.js';

export const MAX_TARGETS = 12; // planRoutes 目標數上限（組合爆炸防護）

export const UNCERTAIN = ' UNCERTAIN';
const SPECIAL = { '白金': 'plat', '黑金': 'legend' };

const TO_RE = /^(\d+)([AB])R?$/; // godfat 落點（R 字尾＝抵達時仍處重複狀態）

// 落點字串（如 "69B"、"134BR"）解析為 {n, track}；解析失敗回 null。
// dupeLanding（重抽，耗整輪 2 顆種子）與 simulateGuaranteed（保證抽，僅耗 1 顆種子）
// 的 fallback 公式不同、不可共用，但兩者的「箭頭字串格式」相同，共用這個解析函式。
function parsePos(to) {
  const m = to ? TO_RE.exec(to) : null;
  return m ? { n: Number(m[1]), track: m[2] } : null;
}

// 重抽換軌落點：優先用 godfat 標的 dupe.to；未標時按規則 A→(n+1)B、B→(n+2)A。
// A/B 軌是同一種子序列的交錯編號（nB 夾在 nA 與 (n+1)A 之間），重抽多耗一顆種子，
// 從 A 軌看位置號 +1、從 B 軌看 +2（godfat 箭頭資料 14/14 零例外）。
function dupeLanding(n, track, to) {
  const p = parsePos(to);
  if (p) return { nextN: p.n, nextTrack: p.track };
  return track === 'A' ? { nextN: n + 1, nextTrack: 'B' } : { nextN: n + 2, nextTrack: 'A' };
}

// 一次單抽的結果。isStart=true 時（n===1）以 godfat 已標的 1A dupe 判定撞 last 的換軌。
// catRarity＝/cats 對照表（可省略），撞名觸發僅在「實際稀有」發生（godfat duped? 限定 Rare）。
export function pullOutcome(merged, bannerShort, n, track, lastName, bannerId, isStart, catRarity) {
  const posStr = `${n}${track}`;
  const cell = merged.byPos.get(posStr)?.get(bannerId);
  if (!cell) return null;
  const ticket = SPECIAL[bannerShort] || null;
  const isSpecial = !!ticket;
  const dupe = !isSpecial && (
    (actualRarity(cell.name, cell.rarity, bannerShort, catRarity) === 'rare' && lastName != null && cell.name === lastName) ||
    (isStart && !!cell.dupe)
  );
  if (dupe) {
    const land = dupeLanding(n, track, cell.dupe?.to);
    if (cell.dupe) {
      return { posStr, ...land, gotName: cell.dupe.name,
        gotRarity: cell.dupe.rarity || 'rare', switched: true, uncertain: false, ticket };
    }
    return { posStr, ...land, gotName: UNCERTAIN,
      gotRarity: null, switched: true, uncertain: true, ticket };
  }
  return { posStr, nextN: n + 1, nextTrack: track, gotName: cell.name,
    gotRarity: cell.rarity, switched: false, uncertain: false, ticket };
}

// 確定連抽模擬（size=7/11/15）：size-1 次單抽 + 保證抽（僅耗一顆種子 → 半步位移）。
// 落點以 godfat G/RG 格箭頭為準；撞名起手（抵達即與上一抽同名重複，或 isStart 時
// godfat 已依 last 標好的 1A dupe）用 RG 資料——規則與 pullOutcome 的觸發條件一致。
// 已以 dupe-forced11-banner fixture 的 591 個保證格全數驗證（見 test/route.gu.test.js）。
export function simulateGuaranteed(merged, bannerShort, n, track, lastName, bannerId, size, isStart, catRarity) {
  if (SPECIAL[bannerShort]) return null; // 票池無確定連抽
  const startCell = merged.byPos.get(`${n}${track}`)?.get(bannerId);
  if (!startCell) return null;
  const dupStart =
    (actualRarity(startCell.name, startCell.rarity, bannerShort, catRarity) === 'rare' && lastName != null && startCell.name === lastName) ||
    (isStart && !!startCell.dupe);
  const gcell = dupStart ? startCell.dupeGuaranteed : startCell.guaranteed;
  if (!gcell?.name) return null;
  const steps = [];
  let curN = n, curT = track, last = lastName;
  for (let i = 0; i < size - 1; i++) {
    const o = pullOutcome(merged, bannerShort, curN, curT, last, bannerId, i === 0 && !!isStart, catRarity);
    if (!o) return null; // 中間格超出載入範圍
    steps.push(o);
    curN = o.nextN; curT = o.nextTrack; last = o.gotName;
  }
  // 保證抽只耗一顆種子（稀有度已鎖定 Uber，只抽單位）→ 半步位移：A 軌→同號 B、B 軌→+1 A。
  // 與重抽（耗整輪 2 顆種子）的 dupeLanding 公式不同，不可共用；箭頭解析共用 parsePos。
  const simLand = curT === 'A' ? { n: curN, track: 'B' } : { n: curN + 1, track: 'A' };
  const arrow = parsePos(gcell.to);
  const landing = arrow || simLand;
  const uncertain = !!arrow && (arrow.n !== simLand.n || arrow.track !== simLand.track);
  return { landing, gotName: gcell.name, gotRarity: gcell.rarity || 'uber', steps, uncertain };
}

// 收集判定：位置在 accept 內，且（目標有帶 name 時）實得貓名須相符——dupe 觸發與否
// 會改變實得貓，僅憑位置會把「拿到別隻」誤計為收集。單抽與 GU 中間步共用同一規則。
function collectAtCell(cellIdx, targets, T, bannerId, posStr, gotName, uncertain, mask) {
  const atCell = uncertain ? 0 : (cellIdx.get(`${bannerId}|${posStr}`) || 0);
  if (!atCell) return { mask, collected: [] };
  let got = 0;
  for (let i = 0; i < T; i++) {
    if ((atCell & (1 << i)) && (targets[i].name == null || targets[i].name === gotName)) got |= 1 << i;
  }
  const collected = [];
  for (let i = 0; i < T; i++) if ((got & (1 << i)) && !(mask & (1 << i))) collected.push(targets[i].id);
  return { mask: mask | got, collected };
}

// 保證 Uber 無格子位置，只滿足名字相符的 cat 目標。
function collectGuaranteedUber(targets, T, gotName, mask) {
  let got = 0;
  for (let i = 0; i < T; i++) {
    if (targets[i].kind === 'cat' && targets[i].name === gotName) got |= 1 << i;
  }
  const collected = [];
  for (let i = 0; i < T; i++) if ((got & (1 << i)) && !(mask & (1 << i))) collected.push(targets[i].id);
  return { mask: mask | got, collected };
}

function buildCellIndex(targets) {
  const idx = new Map();
  targets.forEach((t, i) => { for (const key of t.accept) idx.set(key, (idx.get(key) || 0) | (1 << i)); });
  return idx;
}
function stateKey(n, track, mask, lastName, lb) {
  return `${n}|${track}|${mask}|${lastName == null ? '' : lastName}|${lb}`;
}
// 成本軸單一來源：新增資源軸（例如未來細分券種）時只需改這裡與產生成本欄位處。
// 標籤域含 k（已抽次數）；方案域以 pulls 計 Pareto、switches 僅作 tie-break。
const LABEL_AXES = ['k', 'plat', 'legend', 'gu', 'switches'];
const PLAN_AXES = ['pulls', 'plat', 'legend', 'gu'];
const PLAN_TIE_AXES = [...PLAN_AXES, 'switches'];
function eqCost(a, b, axes) { return axes.every((f) => a[f] === b[f]); }
function dominates(b, a, axes) { // b 支配 a：各軸皆 ≤ 且至少一軸 <
  let strict = false;
  for (const f of axes) {
    if (b[f] > a[f]) return false;
    if (b[f] < a[f]) strict = true;
  }
  return strict;
}
function compareLex(a, b, axes) { // 依軸序字典比較（皆越小越好）
  for (const f of axes) if (a[f] !== b[f]) return a[f] - b[f];
  return 0;
}
function insertLabel(map, key, label) {
  const arr = map.get(key);
  if (!arr) { map.set(key, [label]); return; }
  for (const e of arr) if (eqCost(label, e, LABEL_AXES) || dominates(e, label, LABEL_AXES)) return;
  const kept = arr.filter((e) => !dominates(label, e, LABEL_AXES));
  kept.push(label);
  map.set(key, kept);
}
function toPlan(c) {
  return { cost: Object.fromEntries(PLAN_TIE_AXES.map((f) => [f, c[f]])),
    steps: c.steps, collectedMask: c.mask };
}
function paretoPlans(cands) {
  const nd = cands.filter((c) => !cands.some((o) => o !== c && dominates(o, c, PLAN_AXES)));
  const byKey = new Map();
  for (const c of nd) {
    const k = PLAN_AXES.map((f) => c[f]).join('|');
    const cur = byKey.get(k);
    if (!cur || c.switches < cur.switches) byKey.set(k, c);
  }
  // 白金優先：同抽數同 GU 且同總券數者，只留傳說券最少的（白金券較便宜）
  const byGroup = new Map();
  for (const c of byKey.values()) {
    const g = `${c.pulls}|${c.gu}|${c.plat + c.legend}`;
    const cur = byGroup.get(g);
    if (!cur || c.legend < cur.legend) byGroup.set(g, c);
  }
  return [...byGroup.values()]
    .sort((a, b) => compareLex(a, b, PLAN_AXES))
    .map(toPlan);
}
function popcount(x) { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; }
function reasonFor(target, maxPos, bannerById, today) {
  let allBeyond = true, allEnded = true, allHidden = true;
  for (const key of target.accept) {
    const [bid, posStr] = key.split('|');
    if (parseInt(posStr, 10) <= maxPos) allBeyond = false;
    const b = bannerById.get(bid);
    if (!(b?.end && today && b.end < today)) allEnded = false;
    if (!b?.hidden) allHidden = false;
  }
  if (allBeyond) return 'beyond-count';
  if (allEnded) return 'time-conflict'; // 已結束比隱藏更根本（取消隱藏也救不回）
  if (allHidden) return 'hidden';
  return 'conflict';
}
function selectPlans(candidates, full, targets, maxPos, bannerById, today) {
  const done = candidates.filter((c) => c.mask === full);
  if (done.length) return { feasible: true, plans: paretoPlans(done), unreachable: [] };
  // 不可行：取可收集數最多的子集。同數量可能有多種「收集組合」（mask），
  // 各組合分別取 Pareto、選最省的一組為代表——確保列出的方案與 unreachable 一致，
  // 不會出現「方案其實有收到、卻被標為不可達」的矛盾。
  let best = 0;
  for (const c of candidates) best = Math.max(best, popcount(c.mask));
  const byMask = new Map();
  for (const c of candidates) {
    if (popcount(c.mask) !== best) continue;
    if (!byMask.has(c.mask)) byMask.set(c.mask, []);
    byMask.get(c.mask).push(c);
  }
  let plans = [];
  for (const [, group] of byMask) {
    const p = paretoPlans(group);
    if (!plans.length) { plans = p; continue; }
    if (compareLex(p[0].cost, plans[0].cost, PLAN_TIE_AXES) < 0) plans = p;
  }
  const coveredMask = plans.length ? plans[0].collectedMask : 0;
  const unreachable = targets
    .filter((t, i) => !(coveredMask & (1 << i)))
    .map((t) => ({ id: t.id, reason: reasonFor(t, maxPos, bannerById, today) }));
  return { feasible: false, plans, unreachable };
}

export function planRoutes({ merged, targets, banners, options = {} }) {
  const T = targets.length;
  if (T === 0) return { feasible: true, plans: [], unreachable: [] };
  const maxTargets = options.maxTargets ?? MAX_TARGETS;
  if (T > maxTargets) throw new Error(`目標數 ${T} 超過上限 ${maxTargets}`);
  const nums = merged.numbers || [];
  const maxPos = options.maxPos ?? (nums.length ? nums[nums.length - 1] : 0);
  const full = (1 << T) - 1;
  const cellIdx = buildCellIndex(targets);
  const bannerById = new Map(banners.map((b) => [b.id, b]));
  const today = options.today ?? '';
  const catRarity = options.catRarity; // /cats 對照表（可省略 → rarity.js 名單法 fallback）

  const candidates = []; // { pulls, plat, legend, switches, mask, steps }
  // frontier 按位置索引：B→A 換軌落點為 n+2，標籤需在正確的位置輪次被處理
  const byPos = new Map(); // n -> Map(stateKey -> labels)
  const insertAt = (n, key, label) => {
    if (!byPos.has(n)) byPos.set(n, new Map());
    insertLabel(byPos.get(n), key, label);
  };
  // simulateGuaranteed 結果只依 (bannerId, n, track, lastName, catRarity) 決定（與 mask/plat/
  // legend/switches/gu 無關），不同 Pareto 標籤常共用同一組合，快取避免重複跑 size-1 次模擬。
  // catRarity 單次 planRoutes 內恆定、快取僅活在本次呼叫，故鍵不含它。
  const guCache = new Map();
  const start = { k: 0, plat: 0, legend: 0, gu: 0, switches: 0, mask: 0, track: 'A',
    lastName: options.lastName ?? null, lb: today, steps: [] };
  insertAt(1, stateKey(1, 'A', 0, start.lastName, start.lb), start);

  for (let n = 1; n <= maxPos; n++) {
    const frontier = byPos.get(n);
    if (!frontier) continue;
    for (const [, arr] of frontier) {
      for (const L of arr) {
        for (const b of banners) {
          if (b.hidden) continue; // 被隱藏的卡池不入路線（僅供 reasonFor 判讀）
          if (b.end && b.end < L.lb) continue; // 於目前時間下界已結束
          const o = pullOutcome(merged, b.short, n, L.track, L.lastName, b.id, n === 1, catRarity);
          if (!o) continue;
          const lb = b.start && b.start > L.lb ? b.start : L.lb; // 抽未來卡池 → 時間推進
          const k = L.k + 1; // 第幾抽（B→A 換軌會跳過位置號，抽數與位置脫鉤）
          const { mask: newMask, collected } = collectAtCell(cellIdx, targets, T, b.id, o.posStr, o.gotName, o.uncertain, L.mask);
          const plat = L.plat + (o.ticket === 'plat' ? 1 : 0);
          const legend = L.legend + (o.ticket === 'legend' ? 1 : 0);
          const switches = L.switches + (o.switched ? 1 : 0);
          const step = { k, pos: o.posStr, track: L.track, bannerId: b.id, gotName: o.gotName,
            gotRarity: o.gotRarity, switched: o.switched, uncertain: o.uncertain, ticket: o.ticket, collected };
          const steps = L.steps.concat([step]);
          if (newMask !== L.mask) candidates.push({ pulls: k, plat, legend, gu: L.gu, switches, mask: newMask, steps });
          if (newMask !== full && o.nextN <= maxPos) {
            insertAt(o.nextN, stateKey(o.nextN, o.nextTrack, newMask, o.gotName, lb),
              { k, plat, legend, gu: L.gu, switches, mask: newMask, track: o.nextTrack, lastName: o.gotName, lb, steps });
          }

          // 開確定連抽（該卡池有保證值時；票池/無資料由 simulateGuaranteed 回 null 排除）
          if (b.gu) {
            const gKey = `${b.id}|${n}|${L.track}|${L.lastName == null ? '' : L.lastName}`;
            let g = guCache.get(gKey);
            if (g === undefined) {
              g = simulateGuaranteed(merged, b.short, n, L.track, L.lastName, b.id, b.gu, n === 1, catRarity);
              guCache.set(gKey, g);
            }
            if (g) {
              let mask = L.mask, kk = L.k, sw = L.switches;
              const guSteps = [];
              for (const s of g.steps) {
                kk++;
                const r = collectAtCell(cellIdx, targets, T, b.id, s.posStr, s.gotName, s.uncertain, mask);
                mask = r.mask;
                if (s.switched) sw++;
                guSteps.push({ k: kk, pos: s.posStr, track: s.posStr.endsWith('A') ? 'A' : 'B', bannerId: b.id,
                  gotName: s.gotName, gotRarity: s.gotRarity, switched: s.switched, uncertain: s.uncertain,
                  ticket: null, collected: r.collected, gu: false });
              }
              kk++;
              const r2 = collectGuaranteedUber(targets, T, g.gotName, mask);
              mask = r2.mask;
              guSteps.push({ k: kk, pos: `${n}${L.track}`, track: L.track, bannerId: b.id,
                gotName: g.gotName, gotRarity: g.gotRarity, switched: true, uncertain: g.uncertain,
                ticket: null, collected: r2.collected, gu: true });
              const steps2 = L.steps.concat(guSteps);
              if (mask !== L.mask) candidates.push({ pulls: kk, plat: L.plat, legend: L.legend, gu: L.gu + 1, switches: sw, mask, steps: steps2 });
              if (mask !== full && g.landing.n <= maxPos) {
                insertAt(g.landing.n, stateKey(g.landing.n, g.landing.track, mask, g.gotName, lb),
                  { k: kk, plat: L.plat, legend: L.legend, gu: L.gu + 1, switches: sw, mask, track: g.landing.track, lastName: g.gotName, lb, steps: steps2 });
              }
            }
          }
        }
      }
    }
    byPos.delete(n); // 已處理，釋放
  }
  return selectPlans(candidates, full, targets, maxPos, bannerById, today);
}
