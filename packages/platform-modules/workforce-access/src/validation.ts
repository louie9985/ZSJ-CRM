import { WorkforceAccessError } from "./errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const USERNAME = /^[A-Za-z0-9._-]{4,32}$/u;
const PHONE = /^\+?\d{6,20}$/u;

export function requireId(value: string): void {
  if (!UUID.test(value)) throw new WorkforceAccessError("input_invalid");
}

export function requireText(value: string, maximum = 500): void {
  if (value.trim().length === 0 || value.length > maximum) throw new WorkforceAccessError("input_invalid");
}

export function requireTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new WorkforceAccessError("input_invalid");
}

export function normalizeUsername(value: string): string {
  if (!USERNAME.test(value)) throw new WorkforceAccessError("input_invalid");
  return value.toLowerCase();
}

export function normalizePhone(value: string): string {
  const normalized = value.replace(/[ -]/gu, "");
  if (!PHONE.test(normalized)) throw new WorkforceAccessError("input_invalid");
  return normalized;
}
