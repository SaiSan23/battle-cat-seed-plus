import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithLimit } from '../extension/lib/concurrency.js';

test('mapWithLimit 不超過並發上限', async () => {
  let running = 0;
  let peak = 0;
  const worker = async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return 'ok';
  };
  await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 3, worker);
  assert.ok(peak <= 3, `peak ${peak} 應 <= 3`);
});

test('mapWithLimit 保留順序並隔離錯誤', async () => {
  const res = await mapWithLimit([1, 2, 3], 2, async (x) => {
    if (x === 2) throw new Error('boom');
    return x * 10;
  });
  assert.deepEqual(res[0], { status: 'ok', value: 10 });
  assert.equal(res[1].status, 'error');
  assert.equal(res[1].error.message, 'boom');
  assert.deepEqual(res[2], { status: 'ok', value: 30 });
});
