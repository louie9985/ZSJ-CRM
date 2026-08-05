import type { DatabaseRuntime } from "@ai-crm/database";

import type { DurableAdministrationOperationPort } from "./types.js";

interface OperationRow {
  readonly fingerprint: string;
  readonly result: unknown;
  readonly status: "failed" | "pending" | "succeeded";
}

function result<T extends Readonly<Record<string, unknown>>>(value: unknown): Readonly<T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("administration_operation_result_invalid");
  }
  return Object.freeze(value as T);
}

export function createDurableAdministrationOperationPort(
  database: Pick<DatabaseRuntime, "execute" | "withTransaction">,
): Readonly<DurableAdministrationOperationPort> {
  return Object.freeze({
    async execute<T extends Readonly<Record<string, unknown>>>(input: Readonly<{ fingerprint: string; operationId: string; traceId: string }>, work: () => Promise<Readonly<T>>) {
      const state = { claimed: false };
      try {
        return await database.withTransaction(async () => {
          const inserted = await database.execute(
            "insert into workforce_access.operations(operation_id,account_id,fingerprint,status,trace_id,recorded_at) values($1,$1,$2,'pending',$3,now()) on conflict(operation_id) do nothing",
            [input.operationId, input.fingerprint, input.traceId],
          );
          if (inserted.rowCount !== 1) {
            const existing = (await database.execute<OperationRow>(
              "select fingerprint,status,result from workforce_access.operations where operation_id=$1 for update",
              [input.operationId],
            )).rows[0];
            if (existing === undefined || existing.fingerprint !== input.fingerprint || existing.status !== "succeeded") throw new Error("idempotency_conflict");
            return Object.freeze({ replayed: true, value: result<T>(existing.result) });
          }
          state.claimed = true;
          const completed = await work();
          const updated = await database.execute(
            "update workforce_access.operations set status='succeeded',result=$2::jsonb,error_code=null where operation_id=$1 and status='pending'",
            [input.operationId, JSON.stringify(completed)],
          );
          if (updated.rowCount !== 1) throw new Error("idempotency_conflict");
          return Object.freeze({ replayed: false, value: completed });
        });
      } catch (error) {
        if (state.claimed) {
          await database.withTransaction(async () => {
            await database.execute(
              "insert into workforce_access.operations(operation_id,account_id,fingerprint,status,trace_id,recorded_at,error_code) values($1,$1,$2,'failed',$3,now(),'operation_failed') on conflict(operation_id) do nothing",
              [input.operationId, input.fingerprint, input.traceId],
            );
          }).catch(() => undefined);
        }
        throw error;
      }
    },
  });
}
