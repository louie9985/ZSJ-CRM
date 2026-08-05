import { createHash } from "node:crypto";

import { WorkflowError } from "@ai-crm/crm-workflow";
import { describe, expect, it, vi } from "vitest";

import type { E2ePostgresResult, E2ePostgresRuntime } from "./postgres-runtime.js";
import { createPostgresWorkflowCommandLedger } from "./postgres-workflow-ledger.js";

interface LedgerRecord {
  command_fingerprint: string;
  lease_expires_at: Date | null;
  lease_token: string | null;
  result_json: unknown;
  source_revision: number | null;
  status: "completed" | "reconciliation_required" | "running";
}

class WorkflowRuntime implements E2ePostgresRuntime {
  public failCompletedWrite = false;
  public readonly ledger = new Map<string, LedgerRecord>();
  public readonly revisions = new Map<string, number>();

  public async execute<Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<E2ePostgresResult<Row>> {
    await Promise.resolve();
    if (sql.startsWith("select pg_advisory")) return this.result<Row>();
    const key = `${String(values[0])}:${String(values[1])}`;
    if (sql.startsWith("select command_fingerprint")) {
      const record = this.ledger.get(key);
      return this.result<Row>(record === undefined ? [] : [record]);
    }
    if (sql.startsWith("insert into e2e_walking_skeleton.workflow_command_ledger")) {
      this.ledger.set(key, {
        command_fingerprint: values[2] as string,
        lease_token: values[3] as string,
        lease_expires_at: values[4] as Date,
        result_json: null,
        source_revision: null,
        status: "running",
      });
      return this.result<Row>([], 1);
    }
    if (sql.startsWith("update e2e_walking_skeleton.workflow_command_ledger set lease_token")) {
      const record = this.ledger.get(key);
      if (record === undefined || record.status !== "running" || record.command_fingerprint !== values[2]) return this.result<Row>();
      record.lease_token = values[3] as string;
      record.lease_expires_at = values[4] as Date;
      return this.result<Row>([], 1);
    }
    if (sql.includes("lease_expires_at <= $3")) {
      const record = this.ledger.get(key);
      if (record === undefined || record.status !== "running" || record.lease_expires_at === null || record.lease_expires_at > (values[2] as Date)) return this.result<Row>();
      Object.assign(record, { lease_expires_at: null, lease_token: null, status: "reconciliation_required" });
      return this.result<Row>([], 1);
    }
    if (sql.startsWith("update e2e_walking_skeleton.workflow_command_ledger set status='reconciliation_required'")) {
      const record = this.ledger.get(key);
      if (record === undefined || record.lease_token !== values[2]) return this.result<Row>();
      Object.assign(record, { lease_expires_at: null, lease_token: null, status: "reconciliation_required" });
      return this.result<Row>([], 1);
    }
    if (sql.startsWith("delete from e2e_walking_skeleton.workflow_command_ledger")) {
      const record = this.ledger.get(key);
      if (record?.lease_token === values[2]) this.ledger.delete(key);
      return this.result<Row>([], 1);
    }
    if (sql.startsWith("insert into e2e_walking_skeleton.workflow_revisions")) {
      const scope = values[0] as string;
      const revision = (this.revisions.get(scope) ?? 0) + 1;
      this.revisions.set(scope, revision);
      return this.result<Row>([{ source_revision: revision }], 1);
    }
    if (sql.startsWith("update e2e_walking_skeleton.workflow_command_ledger set status='completed'")) {
      if (this.failCompletedWrite) {
        this.failCompletedWrite = false;
        throw new Error("synthetic completed write failure");
      }
      const record = this.ledger.get(key);
      if (record === undefined || record.lease_token !== values[2]) return this.result<Row>();
      Object.assign(record, {
        lease_expires_at: null,
        lease_token: null,
        result_json: JSON.parse(values[3] as string) as unknown,
        source_revision: values[4] as number | null,
        status: "completed",
      });
      return this.result<Row>([], 1);
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }

  public withTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  private result<Row>(rows: readonly unknown[] = [], rowCount = rows.length): E2ePostgresResult<Row> {
    return { rowCount, rows: rows as readonly Row[] };
  }
}

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const input = { fingerprint: hash("complete"), idempotencyKey: "workflow:complete:synthetic", operation: "task_complete" as const, revisionScope: "task:synthetic" };

describe("PostgreSQL Workflow command ledger", () => {
  it("persists a result and monotonic revision, then replays without another remote action", async () => {
    const runtime = new WorkflowRuntime();
    const ledger = createPostgresWorkflowCommandLedger({ leaseMs: 30_000, runtime });
    const action = vi.fn(() => Promise.resolve({ status: "completed", taskId: "task:synthetic" }));

    const first = await ledger.execute(input, action);
    const duplicate = await ledger.execute(input, action);

    expect(first).toEqual({ sourceRevision: 1, value: { status: "completed", taskId: "task:synthetic" } });
    expect(duplicate).toEqual(first);
    expect(action).toHaveBeenCalledTimes(1);
    await expect(ledger.getStatus(input)).resolves.toBe("completed");
  });

  it("rejects an idempotency fingerprint conflict", async () => {
    const ledger = createPostgresWorkflowCommandLedger({ leaseMs: 30_000, runtime: new WorkflowRuntime() });
    await ledger.execute(input, () => Promise.resolve("done"));

    await expect(ledger.execute({ ...input, fingerprint: hash("changed") }, () => Promise.resolve("changed")))
      .rejects.toMatchObject({ code: "WORKFLOW_IDEMPOTENCY_CONFLICT" });
  });

  it("fails closed while another owner holds a live lease", async () => {
    const ledger = createPostgresWorkflowCommandLedger({ leaseMs: 30_000, runtime: new WorkflowRuntime() });
    let release: (() => void) | undefined;
    const pending = ledger.execute(input, () => new Promise<string>((resolve) => { release = () => { resolve("done"); }; }));
    await vi.waitFor(async () => { await expect(ledger.getStatus(input)).resolves.toBe("running"); });

    await expect(ledger.execute(input, () => Promise.resolve("duplicate"))).rejects.toMatchObject({ code: "WORKFLOW_CONFLICT", retryable: true });
    release?.();
    await pending;
  });

  it("retains reconciliation-required outcomes and releases ordinary failures", async () => {
    const runtime = new WorkflowRuntime();
    const ledger = createPostgresWorkflowCommandLedger({ leaseMs: 30_000, runtime });
    await expect(ledger.execute(input, () => Promise.reject(new WorkflowError("WORKFLOW_RECONCILIATION_REQUIRED"))))
      .rejects.toMatchObject({ code: "WORKFLOW_RECONCILIATION_REQUIRED" });
    await expect(ledger.execute(input, () => Promise.resolve("must-not-run"))).rejects.toMatchObject({ code: "WORKFLOW_RECONCILIATION_REQUIRED" });

    const retryInput = { ...input, idempotencyKey: "workflow:retry:synthetic" };
    await expect(ledger.execute(retryInput, () => Promise.reject(new Error("temporary")))).rejects.toThrow("temporary");
    await expect(ledger.getStatus(retryInput)).resolves.toBe("absent");
  });

  it("never replays an action after an expired or ambiguously persisted lease", async () => {
    let now = new Date("2026-07-30T00:00:00.000Z");
    const runtime = new WorkflowRuntime();
    const ledger = createPostgresWorkflowCommandLedger({ clock: () => now, leaseMs: 1_000, runtime });
    const expiredAction = vi.fn(() => Promise.resolve("must-not-run"));
    runtime.ledger.set(`${input.operation}:${input.idempotencyKey}`, {
      command_fingerprint: input.fingerprint,
      lease_expires_at: new Date(now.getTime() - 1),
      lease_token: "10000000-0000-4000-8000-000000000001",
      result_json: null,
      source_revision: null,
      status: "running",
    });
    await expect(ledger.execute(input, expiredAction)).rejects.toMatchObject({ code: "WORKFLOW_RECONCILIATION_REQUIRED" });
    expect(expiredAction).not.toHaveBeenCalled();

    const ambiguousRuntime = new WorkflowRuntime();
    ambiguousRuntime.failCompletedWrite = true;
    const ambiguousLedger = createPostgresWorkflowCommandLedger({ clock: () => now, leaseMs: 1_000, runtime: ambiguousRuntime });
    const ambiguousInput = { ...input, idempotencyKey: "workflow:ambiguous:synthetic" };
    const action = vi.fn(() => Promise.resolve("remote-succeeded"));
    await expect(ambiguousLedger.execute(ambiguousInput, action)).rejects.toMatchObject({ code: "WORKFLOW_RECONCILIATION_REQUIRED" });
    now = new Date(now.getTime() + 2_000);
    await expect(ambiguousLedger.execute(ambiguousInput, action)).rejects.toMatchObject({ code: "WORKFLOW_RECONCILIATION_REQUIRED" });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("fails closed when command status cannot be read", async () => {
    const runtime: E2ePostgresRuntime = {
      execute: () => Promise.reject(new Error("postgres unavailable: sensitive detail")),
      withTransaction: (work) => work(),
    };
    const ledger = createPostgresWorkflowCommandLedger({ leaseMs: 30_000, runtime });

    await expect(ledger.getStatus(input)).rejects.toMatchObject({ code: "WORKFLOW_RECONCILIATION_REQUIRED", message: "WORKFLOW_RECONCILIATION_REQUIRED" });
  });
});
