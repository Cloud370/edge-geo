import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateBatchChunkSize } from '../src/index.ts';

test('calculateBatchChunkSize defaults to 100 for D1', () => {
  assert.equal(calculateBatchChunkSize(), 100);
});

test('calculateBatchChunkSize never returns below 1', () => {
  assert.equal(calculateBatchChunkSize(0, 2), 1);
  assert.equal(calculateBatchChunkSize(1, 2), 1);
});
