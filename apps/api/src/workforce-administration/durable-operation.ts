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
      try {
        return await database.withTransaction(async () => {
          const insert = await database.execute(
            "insert into workforce_access.operations(operation_id,account_id,fingerprint,status,trace_id,recorded_at) values($1,$1,$2,'pending',$3,now()) on conflict(operation_id) do nothing",
            [input.operationId, input.fingerprint, input.traceId],
          );
          if (insert.rowCount !== 1) {
            const existing = (await database.execute<OperationRow>(
              "select fingerprint,status,result from workforce_access.operations where operation_id=$1 for update",
              [input.operationId],
            )).rows[0];
            if (existing === undefined || existing.fingerprint !== input.fingerprint) throw new Error("idempotency_conflict");
            if (existing.status === "succeeded") return Object.freeze({ replayed: true, value: result(existing.result) as Readonly<T> });
            await database.execute("update workforce_access.operations set status='pending',error_code=null,trace_id=$2 where operation_id=$1", [input.operationId, input.traceId]);
          }
          const completed = await work();
          await database.execute("update workforce_access.operations set status='succeeded',result=$2::jsonb,error_code=null where operation_id=$1", [input.operationId, JSON.stringify(completed)]);
          return Object.freeze({ replayed: false, value: completed });
        });
      } catch (error) {
        await database.execute(
          "insert into workforce_access.operations(operation_id,account_id,fingerprint,status,trace_id,error_code,recorded_at) values($1,$1,$2,'failed',$3,'operation_failed',now()) on conflict(operation_id) do update set status='failed',error_code='operation_failed',trace_id=excluded.trace_id where workforce_access.operations.status<>'succeeded'",
          [input.operationId, input.fingerprint, input.traceId],
        ).catch(() => undefined);
        throw error;
      }
    },
  });
}
