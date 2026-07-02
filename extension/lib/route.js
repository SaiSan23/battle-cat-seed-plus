// 從 1A 規劃收齊目標貓的抽卡路線（純函式，不自算種子）
export const UNCERTAIN = ' UNCERTAIN';
const SPECIAL = { '白金': 'plat', '黑金': 'legend' };

function opposite(t) { return t === 'A' ? 'B' : 'A'; }

// 一次單抽的結果。isStart=true 時（n===1）以 godfat 已標的 1A dupe 判定撞 last 的換軌。
export function pullOutcome(merged, bannerShort, n, track, lastName, bannerId, isStart) {
  const posStr = `${n}${track}`;
  const cell = merged.byPos.get(posStr)?.get(bannerId);
  if (!cell) return null;
  const ticket = SPECIAL[bannerShort] || null;
  const isSpecial = !!ticket;
  const dupe = !isSpecial && (
    (cell.rarity === 'rare' && lastName != null && cell.name === lastName) ||
    (isStart && !!cell.dupe)
  );
  if (dupe) {
    if (cell.dupe) {
      return { posStr, nextN: n + 1, nextTrack: opposite(track), gotName: cell.dupe.name,
        gotRarity: cell.dupe.rarity || 'rare', switched: true, uncertain: false, ticket };
    }
    return { posStr, nextN: n + 1, nextTrack: opposite(track), gotName: UNCERTAIN,
      gotRarity: null, switched: true, uncertain: true, ticket };
  }
  return { posStr, nextN: n + 1, nextTrack: track, gotName: cell.name,
    gotRarity: cell.rarity, switched: false, uncertain: false, ticket };
}

function buildCellIndex(targets) {
  const idx = new Map();
  targets.forEach((t, i) => { for (const key of t.accept) idx.set(key, (idx.get(key) || 0) | (1 << i)); });
  return idx;
}
function stateKey(n, track, mask, lastName, lb) {
  return `${n}|${track}|${mask}|${lastName == null ? '' : lastName}|${lb}`;
}
function eqCost(a, b) { return a.plat === b.plat && a.legend === b.legend && a.switches === b.switches; }
function dominated(a, b) { // b 支配 a?（plat,legend,switches 皆 ≤ 且至少一 <）
  return b.plat <= a.plat && b.legend <= a.legend && b.switches <= a.switches &&
    (b.plat < a.plat || b.legend < a.legend || b.switches < a.switches);
}
function insertLabel(map, key, label) {
  const arr = map.get(key);
  if (!arr) { map.set(key, [label]); return; }
  for (const e of arr) if (eqCost(label, e) || dominated(label, e)) return;
  const kept = arr.filter((e) => !dominated(e, label));
  kept.push(label);
  map.set(key, kept);
}
function dom3(o, c) { // o 支配 c（pulls,plat,legend）
  return o.pulls <= c.pulls && o.plat <= c.plat && o.legend <= c.legend &&
    (o.pulls < c.pulls || o.plat < c.plat || o.legend < c.legend);
}
function toPlan(c) {
  return { cost: { pulls: c.pulls, plat: c.plat, legend: c.legend, switches: c.switches },
    steps: c.steps, collectedMask: c.mask };
}
function paretoPlans(cands) {
  const nd = cands.filter((c) => !cands.some((o) => o !== c && dom3(o, c)));
  const byKey = new Map();
  for (const c of nd) {
    const k = `${c.pulls}|${c.plat}|${c.legend}`;
    const cur = byKey.get(k);
    if (!cur || c.switches < cur.switches) byKey.set(k, c);
  }
  // 白金優先：同抽數且同總券數者，只留傳說券最少的（白金券較便宜）
  const byGroup = new Map();
  for (const c of byKey.values()) {
    const g = `${c.pulls}|${c.plat + c.legend}`;
    const cur = byGroup.get(g);
    if (!cur || c.legend < cur.legend) byGroup.set(g, c);
  }
  return [...byGroup.values()]
    .sort((a, b) => a.pulls - b.pulls || a.plat - b.plat || a.legend - b.legend)
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
    const a = p[0].cost, b = plans[0].cost;
    if (a.pulls - b.pulls || a.plat - b.plat || a.legend - b.legend || a.switches - b.switches) {
      if (a.pulls < b.pulls || (a.pulls === b.pulls && (a.plat < b.plat ||
        (a.plat === b.plat && (a.legend < b.legend ||
        (a.legend === b.legend && a.switches < b.switches)))))) plans = p;
    }
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
  const maxTargets = options.maxTargets ?? 12;
  if (T > maxTargets) throw new Error(`目標數 ${T} 超過上限 ${maxTargets}`);
  const nums = merged.numbers || [];
  const maxPos = options.maxPos ?? (nums.length ? nums[nums.length - 1] : 0);
  const full = (1 << T) - 1;
  const cellIdx = buildCellIndex(targets);
  const bannerById = new Map(banners.map((b) => [b.id, b]));
  const today = options.today ?? '';

  const candidates = []; // { pulls, plat, legend, switches, mask, steps }
  let frontier = new Map();
  const start = { plat: 0, legend: 0, switches: 0, mask: 0, track: 'A',
    lastName: options.lastName ?? null, lb: today, steps: [] };
  frontier.set(stateKey(1, 'A', 0, start.lastName, start.lb), [start]);

  for (let n = 1; n <= maxPos && frontier.size; n++) {
    const next = new Map();
    for (const [, arr] of frontier) {
      for (const L of arr) {
        for (const b of banners) {
          if (b.hidden) continue; // 被隱藏的卡池不入路線（僅供 reasonFor 判讀）
          if (b.end && b.end < L.lb) continue; // 於目前時間下界已結束
          const o = pullOutcome(merged, b.short, n, L.track, L.lastName, b.id, n === 1);
          if (!o) continue;
          const lb = b.start && b.start > L.lb ? b.start : L.lb; // 抽未來卡池 → 時間推進
          // 收集判定：位置在 accept 內，且（目標有帶 name 時）實得貓名須相符——
          // dupe 觸發與否會改變實得貓，僅憑位置會把「拿到別隻」誤計為收集
          const atCell = o.uncertain ? 0 : (cellIdx.get(`${b.id}|${o.posStr}`) || 0);
          let got = 0;
          if (atCell) {
            for (let i = 0; i < T; i++) {
              if ((atCell & (1 << i)) && (targets[i].name == null || targets[i].name === o.gotName)) got |= 1 << i;
            }
          }
          const newMask = L.mask | got;
          const plat = L.plat + (o.ticket === 'plat' ? 1 : 0);
          const legend = L.legend + (o.ticket === 'legend' ? 1 : 0);
          const switches = L.switches + (o.switched ? 1 : 0);
          const collected = [];
          for (let i = 0; i < T; i++) if ((got & (1 << i)) && !(L.mask & (1 << i))) collected.push(targets[i].id);
          const step = { k: n, pos: o.posStr, track: L.track, bannerId: b.id, gotName: o.gotName,
            gotRarity: o.gotRarity, switched: o.switched, uncertain: o.uncertain, ticket: o.ticket, collected };
          const steps = L.steps.concat([step]);
          if (newMask !== L.mask) candidates.push({ pulls: n, plat, legend, switches, mask: newMask, steps });
          if (newMask === full) continue; // 收齊即停止延伸
          insertLabel(next, stateKey(o.nextN, o.nextTrack, newMask, o.gotName, lb),
            { plat, legend, switches, mask: newMask, track: o.nextTrack, lastName: o.gotName, lb, steps });
        }
      }
    }
    frontier = next;
  }
  return selectPlans(candidates, full, targets, maxPos, bannerById, today);
}
