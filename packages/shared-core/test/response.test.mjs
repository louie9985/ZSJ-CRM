import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok } from '../dist/index.js';

test('ok() 包装统一响应信封', () => {
  const res = ok({ hello: 'world' }, 'trace-123');
  assert.equal(res.code, 0);
  assert.equal(res.message, 'ok');
  assert.deepEqual(res.data, { hello: 'world' });
  assert.equal(res.trace_id, 'trace-123');
});
