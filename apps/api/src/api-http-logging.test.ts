import { EventEmitter } from "node:events";
import type { ApplicationLogger } from "@ai-crm/observability";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createApiHttpRequestLoggingMiddleware } from "./api-http-logging.js";

function fixture(path: string, statusCode: number) {
  const log = vi.fn<ApplicationLogger["log"]>();
  const logger: ApplicationLogger = { log };
  const request = { body: { password: "never-log" }, headers: { cookie: "never-log" }, method: "GET", path } as unknown as Request;
  const response = new EventEmitter() as unknown as Response;
  Object.assign(response, { getHeader: vi.fn(() => "1".repeat(32)), statusCode });
  const next = vi.fn() as unknown as NextFunction;
  let now = 100;
  createApiHttpRequestLoggingMiddleware(logger, () => now)(request, response, next);
  now = 125;
  (response as unknown as EventEmitter).emit("finish");
  return { log, next };
}

describe("API HTTP request logging", () => {
  it("records a bounded Workbench failure without request data", () => {
    const { log, next } = fixture("/workbench/bootstrap", 503);
    expect(next).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("error", {
      errorCode: "api_http_request_failed",
      fields: { duration_ms: 25, method: "GET", status_code: 503 },
      operation: "api.http.workbench",
      outcome: "failed",
      traceId: "1".repeat(32),
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("never-log");
  });

  it("uses fixed authentication route groups and rejection semantics", () => {
    const { log } = fixture("/auth/pc/login", 401);
    expect(log).toHaveBeenCalledWith("warn", expect.objectContaining({
      errorCode: "api_http_request_rejected",
      operation: "api.http.authentication.pc",
      outcome: "rejected",
    }));
  });

  it("keeps logger failures outside request correctness", () => {
    const logger: ApplicationLogger = { log: () => { throw new Error("logger unavailable"); } };
    const response = new EventEmitter() as unknown as Response;
    Object.assign(response, { getHeader: () => undefined, statusCode: 200 });
    const next = vi.fn() as unknown as NextFunction;
    createApiHttpRequestLoggingMiddleware(logger)({ method: "GET", path: "/health/live" } as Request, response, next);
    expect(() => { (response as unknown as EventEmitter).emit("finish"); }).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });
});
