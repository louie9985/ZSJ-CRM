export function normalizeReturnTo(candidate: string): string {
  if (candidate.length === 0 || candidate.length > 512 || !candidate.startsWith("/") || candidate.startsWith("//") || /[\0\r\n\\]/u.test(candidate)) {
    return "/applications";
  }
  if (candidate === "/status" || candidate.startsWith("/status/")) return "/applications";
  return candidate;
}

export function pcLoginUrl(returnTo: string): string {
  const params = new URLSearchParams({ returnTo: normalizeReturnTo(returnTo) });
  return `/auth/pc/login?${params.toString()}`;
}
