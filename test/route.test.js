import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullOutcome, UNCERTAIN, planRoutes } from '../extension/lib/route.js';

// 測試工具：合成 merged
function C(pos, name, rarity = 'rare', extra = {}) {
  return { pos, track: pos.endsWith('A') ? 'A' : 'B', n: parseInt(pos, 10), rarity, name, isNext: false, ...extra };
}
function M(cellsByBanner) {
  const byPos = new Map();
  const nums = new Set();
  for (const [bid, cells] of Object.entries(cellsByBanner)) {
    for (const c of cells) {
      nums.add(c.n);
      if (!byPos.has(c.pos)) byPos.set(c.pos, new Map());
      byPos.get(c.pos).set(bid, c);
    }
  }
  return { numbers: [...nums].sort((a, b) => a - b), byPos };
}

test('pullOutcome：無資料回 null', () => {
  const m = M({ X: [C('1A', 'a', 'supa')] });
  assert.equal(pullOutcome(m, '特麗希', 2, 'A', null, 'X', false), null);
});

test('pullOutcome：一般前進不換軌', () => {
  const m = M({ X: [C('2A', 'b', 'supa')] });
  const o = pullOutcome(m, '特麗希', 2, 'A', 'z', 'X', false);
  assert.equal(o.switched, false);
  assert.equal(o.nextN, 3); assert.equal(o.nextTrack, 'A');
  assert.equal(o.gotName, 'b'); assert.equal(o.ticket, null);
});

test('pullOutcome：重複稀有（名字相符）換軌，用 godfat dupe', () => {
  const m = M({ X: [C('2A', 'Gun', 'rare', { dupe: { name: 'Tin', rarity: 'rare', to: '3B' } })] });
  const o = pullOutcome(m, '特麗希', 2, 'A', 'Gun', 'X', false);
  assert.equal(o.switched, true); assert.equal(o.uncertain, false);
  assert.equal(o.nextTrack, 'B'); assert.equal(o.nextN, 3);
  assert.equal(o.gotName, 'Tin');
});

test('pullOutcome：重複稀有但 godfat 未標 → uncertain', () => {
  const m = M({ X: [C('2A', 'Gun', 'rare')] });
  const o = pullOutcome(m, '特麗希', 2, 'A', 'Gun', 'X', false);
  assert.equal(o.switched, true); assert.equal(o.uncertain, true);
  assert.equal(o.gotName, UNCERTAIN);
});

test('pullOutcome：B 軌重抽落點用 godfat dupe.to（B→A 為 n+2）', () => {
  const m = M({ X: [C('43B', 'Gun', 'rare', { dupe: { name: 'Pirate', rarity: 'rare', to: '45A' } })] });
  const o = pullOutcome(m, '特麗希', 43, 'B', 'Gun', 'X', false);
  assert.equal(o.switched, true);
  assert.equal(o.nextN, 45); assert.equal(o.nextTrack, 'A');
});

test('pullOutcome：落點帶 R 字尾（連鎖重複）正確解析', () => {
  const m = M({ X: [C('133A', 'Gun', 'rare', { dupe: { name: 'Sniper', rarity: 'rare', to: '134BR' } })] });
  const o = pullOutcome(m, '特麗希', 133, 'A', 'Gun', 'X', false);
  assert.equal(o.nextN, 134); assert.equal(o.nextTrack, 'B');
});

test('pullOutcome：uncertain 重抽落點按規則 A→(n+1)B、B→(n+2)A', () => {
  const mA = M({ X: [C('7A', 'Gun', 'rare')] });
  const a = pullOutcome(mA, '特麗希', 7, 'A', 'Gun', 'X', false);
  assert.equal(a.uncertain, true);
  assert.equal(a.nextN, 8); assert.equal(a.nextTrack, 'B');
  const mB = M({ X: [C('7B', 'Gun', 'rare')] });
  const b = pullOutcome(mB, '特麗希', 7, 'B', 'Gun', 'X', false);
  assert.equal(b.uncertain, true);
  assert.equal(b.nextN, 9); assert.equal(b.nextTrack, 'A');
});

test('planRoutes：B→A 換軌跳過位置號、抽數與位置脫鉤', () => {
  // 1A Gun → 2A Gun 重複(→Tin 落 3B) → 3B Tin 重複(→Pop 落 5A，跳過 4) → 5A end
  const m = M({ X: [
    C('1A', 'Gun', 'rare'),
    C('2A', 'Gun', 'rare', { dupe: { name: 'Tin', rarity: 'rare', to: '3B' } }),
    C('3B', 'Tin', 'rare', { dupe: { name: 'Pop', rarity: 'rare', to: '5A' } }),
    C('5A', 'end', 'supa'),
  ] });
  const banners = [{ id: 'X', short: '特麗希' }];
  const r = planRoutes({ merged: m, banners,
    targets: [{ id: 't', kind: 'cell', name: 'end', accept: new Set(['X|5A']) }] });
  assert.equal(r.feasible, true);
  assert.equal(r.plans[0].cost.pulls, 4); // 位置 5 但只抽 4 次（跳過 4）
  assert.deepEqual(r.plans[0].steps.map((s) => s.pos), ['1A', '2A', '3B', '5A']);
  assert.deepEqual(r.plans[0].steps.map((s) => s.k), [1, 2, 3, 4]); // k = 第幾抽
  assert.equal(r.plans[0].cost.switches, 2);
  // 被跳過的位置 4 不可收集
  const skipped = planRoutes({ merged: m, banners,
    targets: [{ id: 't4', kind: 'cell', accept: new Set(['X|4A']) }] });
  assert.equal(skipped.feasible, false);
});

test('pullOutcome：白金必不換軌並記票', () => {
  const m = M({ P: [C('2A', 'Gun', 'rare', { dupe: { name: 'Tin', rarity: 'rare', to: '3B' } })] });
  const o = pullOutcome(m, '白金', 2, 'A', 'Gun', 'P', false);
  assert.equal(o.switched, false); assert.equal(o.ticket, 'plat');
  assert.equal(o.gotName, 'Gun'); assert.equal(o.nextTrack, 'A');
});

test('pullOutcome：起點以 godfat 1A dupe 判定（撞 last）', () => {
  const m = M({ X: [C('1A', 'Mer', 'rare', { dupe: { name: 'Sci', rarity: 'rare', to: '2B' } })] });
  const o = pullOutcome(m, '特麗希', 1, 'A', null, 'X', true);
  assert.equal(o.switched, true); assert.equal(o.gotName, 'Sci'); assert.equal(o.nextTrack, 'B');
});

test('planRoutes：直線收集，最少抽數=最遠目標位置', () => {
  const m = M({ X: [C('1A','a','supa'),C('2A','b','supa'),C('3A','c','supa'),C('4A','d','supa'),C('5A','e','supa')] });
  const targets = [
    { id: 't3', kind: 'cell', accept: new Set(['X|3A']) },
    { id: 't5', kind: 'cell', accept: new Set(['X|5A']) },
  ];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }] });
  assert.equal(r.feasible, true);
  assert.equal(r.plans.length, 1);
  assert.equal(r.plans[0].cost.pulls, 5);
  assert.equal(r.plans[0].cost.plat, 0);
  assert.equal(r.plans[0].cost.switches, 0);
});

test('planRoutes：需換軌才能收 B 軌目標', () => {
  const m = M({ X: [
    C('1A','Gun','rare'),
    C('2A','Gun','rare',{ dupe:{ name:'Tin', rarity:'rare', to:'3B' } }),
    C('3B','z','supa'),
  ] });
  const targets = [{ id: 't', kind: 'cell', accept: new Set(['X|3B']) }];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }] });
  assert.equal(r.feasible, true);
  assert.equal(r.plans[0].cost.pulls, 3);
  assert.equal(r.plans[0].cost.switches, 1);
});

test('planRoutes：抽數 vs 白金券的 Pareto 兩方案', () => {
  const xs = [];
  for (let i = 1; i <= 20; i++) xs.push(C(`${i}A`, i === 20 ? 'star' : `x${i}`, 'supa'));
  const m = M({ X: xs, P: [C('4A', 'star', 'supa')] });
  const targets = [{ id: 'star', kind: 'cat', accept: new Set(['P|4A', 'X|20A']) }];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }, { id: 'P', short: '白金' }] });
  assert.equal(r.feasible, true);
  const costs = r.plans.map((p) => `${p.cost.pulls}/${p.cost.plat}`).sort();
  assert.deepEqual(costs, ['20/0', '4/1']);
});

test('planRoutes：並列取最少換軌為代表', () => {
  const m = M({
    X: [C('1A','Gun','rare'), C('2A','Gun','rare',{ dupe:{ name:'Tin', rarity:'rare', to:'3B' } }),
        C('3A','p','supa'), C('4A','q','supa'), C('5A','z','supa'),
        C('3B','r','supa'), C('4B','s','supa'), C('5B','z','supa')],
    Y: [C('1A','Gun','rare'), C('2A','other','supa'), C('3A','p','supa'), C('4A','q','supa'), C('5A','z','supa')],
  });
  const targets = [{ id: 'z', kind: 'cat', accept: new Set(['X|5A', 'Y|5A', 'X|5B']) }];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }, { id: 'Y', short: '史塔爾' }] });
  assert.equal(r.feasible, true);
  const p5 = r.plans.filter((p) => p.cost.pulls === 5 && p.cost.plat === 0 && p.cost.legend === 0);
  assert.equal(p5.length, 1);
  assert.equal(p5[0].cost.switches, 0);
});

test('planRoutes：同位置互斥 → 不可行並列出未達目標', () => {
  const m = M({ X: [C('1A','a','supa'),C('2A','b','supa'),C('3A','c','supa')],
                Y: [C('1A','a','supa'),C('2A','b','supa'),C('3A','d','supa')] });
  const targets = [
    { id: 'tx', kind: 'cell', accept: new Set(['X|3A']) },
    { id: 'ty', kind: 'cell', accept: new Set(['Y|3A']) },
  ];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }, { id: 'Y', short: '史塔爾' }] });
  assert.equal(r.feasible, false);
  assert.equal(r.unreachable.length, 1);
  assert.equal(r.unreachable[0].reason, 'conflict');
  assert.equal(r.plans.length >= 1, true);
});

test('planRoutes：目標超出載入抽數 → beyond-count', () => {
  const m = M({ X: [C('1A','a','supa'),C('2A','b','supa')] });
  const targets = [{ id: 'far', kind: 'cell', accept: new Set(['X|9A']) }];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }], options: { maxPos: 2 } });
  assert.equal(r.feasible, false);
  assert.equal(r.unreachable[0].reason, 'beyond-count');
});

test('planRoutes：目標只在已結束卡池 → time-conflict', () => {
  const m = M({ A: [C('1A', 'a', 'supa')] });
  const targets = [{ id: 't', kind: 'cell', accept: new Set(['A|1A']) }];
  const r = planRoutes({ merged: m, targets,
    banners: [{ id: 'A', short: '特麗希', start: '2026-06-01', end: '2026-06-30' }],
    options: { today: '2026-07-02' } });
  assert.equal(r.feasible, false);
  assert.equal(r.unreachable[0].reason, 'time-conflict');
});

test('planRoutes：先抽晚開始卡池後回不去早結束的舊卡池', () => {
  const mk = (names) => names.map((nm, i) => C(`${i + 1}A`, nm, 'supa'));
  const m = M({ A: mk(['a1', 'a2', 'a3']), B: mk(['b1', 'b2', 'b3']) });
  const banners = [
    { id: 'A', short: '特麗希', start: '2026-07-01', end: '2026-07-05' },
    { id: 'B', short: '史塔爾', start: '2026-07-10', end: '2026-07-15' },
  ];
  // 需「先 B(位置2)後 A(位置3)」→ 抽 B 後 lb=07-10 > A.end → 不可行
  const bad = planRoutes({ merged: m, banners, options: { today: '2026-07-02' },
    targets: [
      { id: 'tb', kind: 'cell', accept: new Set(['B|2A']) },
      { id: 'ta', kind: 'cell', accept: new Set(['A|3A']) },
    ] });
  assert.equal(bad.feasible, false);
  // 對照組「先 A 後 B」可行
  const ok = planRoutes({ merged: m, banners, options: { today: '2026-07-02' },
    targets: [
      { id: 'ta', kind: 'cell', accept: new Set(['A|2A']) },
      { id: 'tb', kind: 'cell', accept: new Set(['B|3A']) },
    ] });
  assert.equal(ok.feasible, true);
  assert.equal(ok.plans[0].cost.pulls, 3);
});

test('planRoutes：活動窗重疊可交錯 A→B→A', () => {
  const m = M({ A: [C('1A', 'a1', 'supa'), C('2A', 'a2', 'supa'), C('3A', 'a3', 'supa')],
                B: [C('1A', 'b1', 'supa'), C('2A', 'b2', 'supa'), C('3A', 'b3', 'supa')] });
  const banners = [
    { id: 'A', short: '特麗希', start: '2026-07-01', end: '2026-07-10' },
    { id: 'B', short: '史塔爾', start: '2026-07-03', end: '2026-07-12' },
  ];
  const r = planRoutes({ merged: m, banners, options: { today: '2026-07-02' },
    targets: [
      { id: 't1', kind: 'cell', accept: new Set(['A|1A']) },
      { id: 't2', kind: 'cell', accept: new Set(['B|2A']) },
      { id: 't3', kind: 'cell', accept: new Set(['A|3A']) },
    ] });
  assert.equal(r.feasible, true);
  assert.equal(r.plans[0].cost.pulls, 3);
});

test('planRoutes：空日期卡池不受時間約束', () => {
  const m = M({ A: [C('1A', 'a', 'supa')] });
  const r = planRoutes({ merged: m,
    banners: [{ id: 'A', short: '特麗希' }],
    options: { today: '2026-07-02' },
    targets: [{ id: 't', kind: 'cell', accept: new Set(['A|1A']) }] });
  assert.equal(r.feasible, true);
});

test('planRoutes：uncertain 換軌不計為收集', () => {
  const m = M({ X: [C('1A','Gun','rare'), C('2A','Gun','rare')] });
  const targets = [{ id: 't', kind: 'cell', accept: new Set(['X|2A']) }];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }] });
  assert.equal(r.feasible, false);
});

test('planRoutes：帶 name 的目標須實得同名貓才計收集（dupe 未觸發不credit）', () => {
  // 2A 天然 Gun(rare)、godfat 標 dupe=Tin；路徑 1A 得 'a' → 2A 不觸發重複 → 實得 Gun
  const m = M({ X: [C('1A', 'a', 'supa'), C('2A', 'Gun', 'rare', { dupe: { name: 'Tin', rarity: 'rare', to: '3B' } })] });
  const banners = [{ id: 'X', short: '特麗希' }];
  // 目標 Tin（靠 dupe 名被 accept）：路徑上 dupe 沒觸發 → 收不到
  const tin = planRoutes({ merged: m, banners,
    targets: [{ id: 'cat:Tin', kind: 'cat', name: 'Tin', accept: new Set(['X|2A']) }] });
  assert.equal(tin.feasible, false);
  // 對照：目標 Gun（天然名）→ 實得 Gun → 收到
  const gun = planRoutes({ merged: m, banners,
    targets: [{ id: 'cat:Gun', kind: 'cat', name: 'Gun', accept: new Set(['X|2A']) }] });
  assert.equal(gun.feasible, true);
});

test('planRoutes：dupe 觸發時實得重抽貓，天然名目標不credit、dupe 名目標credit', () => {
  // 1A 得 Gun → 2A 天然又是 Gun(rare) → 觸發重複 → 實得 Tin
  const m = M({ X: [C('1A', 'Gun', 'rare'), C('2A', 'Gun', 'rare', { dupe: { name: 'Tin', rarity: 'rare', to: '3B' } })] });
  const banners = [{ id: 'X', short: '特麗希' }];
  const tin = planRoutes({ merged: m, banners,
    targets: [{ id: 'cat:Tin', kind: 'cat', name: 'Tin', accept: new Set(['X|2A']) }] });
  assert.equal(tin.feasible, true);
  assert.equal(tin.plans[0].cost.pulls, 2);
  assert.equal(tin.plans[0].cost.switches, 1);
  const gun2A = planRoutes({ merged: m, banners,
    targets: [{ id: 'g', kind: 'cell', name: 'Gun', accept: new Set(['X|2A']) }] });
  assert.equal(gun2A.feasible, false); // 走到 2A 實得 Tin，拿不到 Gun
});

test('planRoutes：不可行時 plans 全屬同一收集組合，且與 unreachable 一致', () => {
  const m = M({ X: [C('1A','a','supa'),C('2A','b','supa'),C('3A','c','supa')],
                Y: [C('1A','a','supa'),C('2A','b','supa'),C('3A','d','supa')] });
  const targets = [
    { id: 'tx', kind: 'cell', accept: new Set(['X|3A']) },
    { id: 'ty', kind: 'cell', accept: new Set(['Y|3A']) },
  ];
  const r = planRoutes({ merged: m, targets, banners: [{ id: 'X', short: '特麗希' }, { id: 'Y', short: '史塔爾' }] });
  assert.equal(r.feasible, false);
  assert.equal(r.plans.length >= 1, true);
  const mask0 = r.plans[0].collectedMask;
  assert.equal(r.plans.every((p) => p.collectedMask === mask0), true);
  // unreachable 與列出的方案一致：被標不可達者不得出現在任何方案的收集中
  const unreachIds = new Set(r.unreachable.map((u) => u.id));
  for (const p of r.plans) {
    targets.forEach((t, i) => {
      if (p.collectedMask & (1 << i)) assert.equal(unreachIds.has(t.id), false);
    });
  }
});

test('planRoutes：隱藏卡池不入路線，僅在隱藏卡池的目標回報 hidden', () => {
  const m = M({ A: [C('1A', 'a', 'supa')], B: [C('1A', 'b', 'supa')] });
  const banners = [
    { id: 'A', short: '特麗希', hidden: true },
    { id: 'B', short: '史塔爾' },
  ];
  const r = planRoutes({ merged: m, banners,
    targets: [{ id: 't', kind: 'cell', accept: new Set(['A|1A']) }] });
  assert.equal(r.feasible, false);
  assert.equal(r.unreachable[0].reason, 'hidden');
  // 已結束優先於隱藏
  const r2 = planRoutes({ merged: m,
    banners: [{ id: 'A', short: '特麗希', hidden: true, start: '2026-06-01', end: '2026-06-20' }, { id: 'B', short: '史塔爾' }],
    options: { today: '2026-07-02' },
    targets: [{ id: 't', kind: 'cell', accept: new Set(['A|1A']) }] });
  assert.equal(r2.unreachable[0].reason, 'time-conflict');
});

test('planRoutes：同抽數同總券數 → 白金優先、傳說案剔除', () => {
  const m = M({ X: [C('1A', 'x1', 'supa'), C('2A', 'x2', 'supa')],
                P: [C('2A', 'star', 'supa')], L: [C('2A', 'star', 'supa')] });
  const banners = [{ id: 'X', short: '特麗希' }, { id: 'P', short: '白金' }, { id: 'L', short: '黑金' }];
  const r = planRoutes({ merged: m, banners,
    targets: [{ id: 'star', kind: 'cat', accept: new Set(['P|2A', 'L|2A']) }] });
  assert.equal(r.feasible, true);
  assert.equal(r.plans.length, 1);
  assert.equal(r.plans[0].cost.plat, 1);
  assert.equal(r.plans[0].cost.legend, 0);
});

test('planRoutes：不同總券數（2白金 vs 1傳說）兩案並列', () => {
  const m = M({ X: [C('1A', 'x1', 'supa'), C('2A', 'x2', 'supa')],
                P: [C('1A', 'c1', 'supa'), C('2A', 'c2', 'supa')],
                L: [C('2A', 'both', 'supa')] });
  const banners = [{ id: 'X', short: '特麗希' }, { id: 'P', short: '白金' }, { id: 'L', short: '黑金' }];
  const r = planRoutes({ merged: m, banners,
    targets: [
      { id: 't1', kind: 'cat', accept: new Set(['P|1A', 'L|2A']) },
      { id: 't2', kind: 'cat', accept: new Set(['P|2A', 'L|2A']) },
    ] });
  assert.equal(r.feasible, true);
  const costs = r.plans.map((p) => `${p.cost.pulls}/${p.cost.plat}/${p.cost.legend}`).sort();
  assert.deepEqual(costs, ['2/0/1', '2/2/0']); // 1 傳說券 vs 2 白金券並列
});
