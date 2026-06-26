// 限制並發的 map，保留順序、隔離單一錯誤（純函式，僅用標準 API）
export async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: 'ok', value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { status: 'error', error };
      }
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, runner));
  return results;
}
