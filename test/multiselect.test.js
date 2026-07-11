import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupState, rangeIndices } from '../extension/lib/multiselect.js';

test('groupState：全勾/全不勾/混合/空', () => {
  assert.equal(groupState([true, true]), 'all');
  assert.equal(groupState([true]), 'all');
  assert.equal(groupState([false, false]), 'none');
  assert.equal(groupState([true, false, true]), 'partial');
  assert.equal(groupState([]), 'none');
});

test('rangeIndices：正向、反向、同點', () => {
  assert.deepEqual(rangeIndices(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(rangeIndices(4, 1), [1, 2, 3, 4]);
  assert.deepEqual(rangeIndices(2, 2), [2]);
});
