export function normalizeReturnTo(candidate: string): string {
  if (candidate.length === 0 || candidate.length > 512 || !candidate.startsWith("/") || candidate.startsWith("//") || /[\0\r\n\\]/u.test(candidate)) {
    return "/crm/workspace";
  }
  if (candidate === "/status" || candidate.startsWith("/status/")) return "/crm/workspace";
  return candidate;
}
