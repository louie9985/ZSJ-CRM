import type { DatabaseRuntime } from "@ai-crm/database";

import type { DurableAdministrationOperationPort } from "./types.js";

interface OperationRow {
  readonly fingerprint: string;
  readonly result: unknown;
  readonly status: "failed" | "pending" | "succeeded";
}

function result(value: unknown): Readonly<{ credentialRedirectUrl?: string }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("administration_operation_result_invalid");
  const url = Reflect.get(value, "credentialRedirectUrl") as unknown;
  if (url === undefined) return Object.freeze({});
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.length > 2048) throw new Error("administration_operation_result_invalid");
  return Object.freeze({ credentialRedirectUrl: url });
}

export function createDurableAdministrationOperationPort(database: Pick<DatabaseRuntime, "execute" | "withTransaction">): Readonly<DurableAdministrationOperationPort> {
  return Object.freeze({
    async execute<T>(input: Readonly<{ fingerprint: string; operationId: string; traceId: string }>, work: () => Promise<Readonly<T>>) {
      const claimed = await database.withTransaction(async () => {
        const insert = await database.execute(
          "insert into workforce_access.operations(operation_id,account_id,fingerprint,status,trace_id,recorded_at) values($1,$1,$2,'pending',$3,now()) on conflict(operation_id) do nothing",
          [input.operationId, input.fingerprint, input.traceId],
        );
        if (insert.rowCount === 1) return undefined;
        const existing = (await database.execute<OperationRow>(
          "select fingerprint,status,result from workforce_access.operations where operation_id=$1 for update",
          [input.operationId],
        )).rows[0];
        if (existing === undefined || existing.fingerprint !== input.fingerprint) throw new Error("idempotency_conflict");
        if (existing.status === "succeeded") return result(existing.result);
        await database.execute("update workforce_access.operations set status='pending',error_code=null,trace_id=$2 where operation_id=$1", [input.operationId, input.traceId]);
        return undefined;
      });
      if (claimed !== undefined) return Object.freeze({ replayed: true, value: claimed as Readonly<T> });
      try {
        const value = await database.withTransaction(async () => {
          const completed = await work();
          await database.execute("update workforce_access.operations set status='succeeded',result=$2::jsonb,error_code=null where operation_id=$1", [input.operationId, JSON.stringify(completed)]);
          return completed;
        });
        return Object.freeze({ replayed: false, value });
      } catch (error) {
        await database.execute("update workforce_access.operations set status='failed',error_code='operation_failed' where operation_id=$1", [input.operationId]).catch(() => undefined);
        throw error;
      }
    },
  });
}
