export type BrowserSessionFailureCode =
  | "authentication_csrf_rejected"
  | "authentication_dependency_unavailable"
  | "authentication_invalid_credentials"
  | "authentication_rate_limited"
  | "authentication_required";

const safeMessages: Readonly<Record<BrowserSessionFailureCode, string>> = Object.freeze({
  authentication_csrf_rejected: "The browser request failed session security validation.",
  authentication_dependency_unavailable: "A required authentication dependency is unavailable.",
  authentication_invalid_credentials: "The login identifier or password is invalid.",
  authentication_rate_limited: "Too many authentication attempts were rejected.",
  authentication_required: "Authentication is required.",
});

export class BrowserSessionFailure extends Error {
  constructor(public readonly code: BrowserSessionFailureCode, options?: ErrorOptions) {
    super(safeMessages[code], options);
    this.name = "BrowserSessionFailure";
  }
}
