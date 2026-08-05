const DURATION_PART = /([0-9]+(?:\.[0-9]+)?)(us|ms|s|m|h)/gyu;
const UNIT_MILLISECONDS = { us: 0.001, ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

export const parseComposeDurationMilliseconds = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.startsWith("${")) return undefined;
  let position = 0;
  let milliseconds = 0;
  DURATION_PART.lastIndex = 0;
  for (;;) {
    const match = DURATION_PART.exec(value);
    if (!match) break;
    if (match.index !== position) return undefined;
    milliseconds += Number(match[1]) * UNIT_MILLISECONDS[match[2]];
    position = DURATION_PART.lastIndex;
  }
  return position === value.length && position > 0 && Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
};

export const validateRenderedWorkerDrain = (compose) => {
  const errors = [];
  const worker = compose?.services?.worker;
  if (!worker || typeof worker !== "object") return ["Rendered Compose must contain the worker service."];
  const drain = worker.environment?.AI_CRM_WORKER_DRAIN_TIMEOUT_SECONDS;
  const drainSeconds = typeof drain === "number" ? drain : (typeof drain === "string" && /^[1-9][0-9]*$/u.test(drain) ? Number(drain) : undefined);
  if (!Number.isSafeInteger(drainSeconds) || drainSeconds <= 0) {
    errors.push("Worker drain timeout must render as a positive integer number of seconds.");
  }
  const stopGraceMilliseconds = parseComposeDurationMilliseconds(worker.stop_grace_period);
  if (stopGraceMilliseconds === undefined) errors.push("Worker stop_grace_period must render as a positive Compose duration with explicit units.");
  if (Number.isSafeInteger(drainSeconds) && drainSeconds > 0 && stopGraceMilliseconds !== undefined && drainSeconds * 1_000 >= stopGraceMilliseconds) {
    errors.push("Worker drain timeout must be strictly less than stop_grace_period.");
  }
  return errors;
};
