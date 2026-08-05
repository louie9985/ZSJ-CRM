import type { ApplicationLogger, LogLevel } from "@ai-crm/observability";
import type { NextFunction, Request, Response } from "express";

const METHODS = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);
const ROUTE_GROUPS = Object.freeze([
  ["/auth/internal-h5", "api.http.authentication.internal-h5"],
  ["/auth/part-time", "api.http.authentication.part-time"],
  ["/auth/pc", "api.http.authentication.pc"],
  ["/workforce-administration", "api.http.workforce-administration"],
  ["/notification-templates", "api.http.notification-templates"],
  ["/form-definitions", "api.http.form-definitions"],
  ["/notifications", "api.http.notifications"],
  ["/workbench", "api.http.workbench"],
  ["/realtime", "api.http.realtime"],
  ["/health", "api.http.health"],
  ["/files", "api.http.files"],
  ["/tasks", "api.http.tasks"],
] as const);

function operationFor(path: string): string {
  for (const [prefix, operation] of ROUTE_GROUPS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return operation;
  }
  return "api.http.other";
}

function resultFor(statusCode: number): Readonly<{ errorCode?: string; level: LogLevel; outcome: "failed" | "rejected" | "succeeded" }> {
  if (statusCode >= 500) return { errorCode: "api_http_request_failed", level: "error", outcome: "failed" };
  if (statusCode >= 400) return { errorCode: "api_http_request_rejected", level: "warn", outcome: "rejected" };
  return { level: "info", outcome: "succeeded" };
}

export function createApiHttpRequestLoggingMiddleware(logger: ApplicationLogger, clock: () => number = Date.now): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next): void => {
    const startedAt = clock();
    response.once("finish", () => {
      try {
        const statusCode = response.statusCode;
        const result = resultFor(statusCode);
        const method = METHODS.has(request.method) ? request.method : "OTHER";
        const traceId = response.getHeader("X-Trace-Id");
        logger.log(result.level, {
          ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
          fields: {
            duration_ms: Math.max(0, clock() - startedAt),
            method,
            status_code: statusCode,
          },
          operation: operationFor(request.path),
          outcome: result.outcome,
          ...(typeof traceId === "string" ? { traceId } : {}),
        });
      } catch {
        // Technical telemetry must never change an HTTP response.
      }
    });
    next();
  };
}
