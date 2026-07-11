// 未擁有 modal 快速多選的可測邏輯（純函式；DOM 接線在 view/view.js）。

// 群組三態彙總：all=整組已勾、none=整組未勾（含空組）、partial=部分。
export function groupState(bools) {
  if (!bools.length || bools.every((b) => !b)) return 'none';
  return bools.every(Boolean) ? 'all' : 'partial';
}

// Shift 範圍選取：錨點與本次點擊之間（含兩端）的扁平 index，方向無關。
export function rangeIndices(anchor, current) {
  const [lo, hi] = anchor <= current ? [anchor, current] : [current, anchor];
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}
