import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthController } from '../dist/platform/health/health.controller.js';

test('GET /health 返回 status ok', () => {
  const controller = new HealthController();
  assert.deepEqual(controller.check(), { status: 'ok' });
});
