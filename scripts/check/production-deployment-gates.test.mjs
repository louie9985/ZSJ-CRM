import assert from "node:assert/strict";
import test from "node:test";
import {
  parseComposeDurationMilliseconds,
  validateRenderedWorkerDrain,
} from "./production-deployment-gates.mjs";

test("parses Compose durations numerically including compound and subsecond units", () => {
  assert.equal(parseComposeDurationMilliseconds("1h2m3.5s4ms500us"), 3_723_504.5);
  assert.equal(parseComposeDurationMilliseconds("30s"), 30_000);
  assert.equal(parseComposeDurationMilliseconds("250ms"), 250);
});

test("rejects unresolved, unitless, zero, negative, spaced, and unknown durations", () => {
  for (const value of ["${STOP:?required}", "30", "0s", "-1s", " 30s", "30s ", "1d", "1sbad", ""]) {
    assert.equal(parseComposeDurationMilliseconds(value), undefined, value);
  }
});

test("accepts only a rendered positive integer drain strictly below stop grace", () => {
  assert.deepEqual(validateRenderedWorkerDrain({
    services: { worker: { environment: { AI_CRM_WORKER_DRAIN_TIMEOUT_SECONDS: "29" }, stop_grace_period: "30s" } },
  }), []);
  assert.deepEqual(validateRenderedWorkerDrain({
    services: { worker: { environment: { AI_CRM_WORKER_DRAIN_TIMEOUT_SECONDS: 1 }, stop_grace_period: "1001ms" } },
  }), []);
});

test("fails closed when drain equals/exceeds grace or either value is not concretely parseable", () => {
  for (const [drain, grace, expected] of [
    [30, "30s", "strictly less"],
    [31, "30s", "strictly less"],
    ["${DRAIN:?required}", "30s", "positive integer"],
    ["29.5", "30s", "positive integer"],
    [29, "${GRACE:?required}", "explicit units"],
  ]) {
    assert.ok(validateRenderedWorkerDrain({ services: { worker: {
      environment: { AI_CRM_WORKER_DRAIN_TIMEOUT_SECONDS: drain }, stop_grace_period: grace,
    } } }).some((error) => error.includes(expected)));
  }
});
