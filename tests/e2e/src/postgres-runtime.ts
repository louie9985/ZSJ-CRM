export interface E2ePostgresResult<Row = Record<string, unknown>> {
  readonly rowCount: number;
  readonly rows: readonly Row[];
}

export interface E2ePostgresRuntime {
  execute<Row = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
    signal?: AbortSignal,
  ): Promise<E2ePostgresResult<Row>>;
  withTransaction<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export class E2ePersistenceError extends Error {
  public constructor(public readonly code: "e2e_persistence_invalid" | "e2e_persistence_unavailable", options: { readonly cause?: unknown } = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "E2ePersistenceError";
  }
}

export function requireE2ePostgresRuntime(runtime: E2ePostgresRuntime): E2ePostgresRuntime {
  if (typeof runtime.execute !== "function" || typeof runtime.withTransaction !== "function") {
    throw new E2ePersistenceError("e2e_persistence_invalid");
  }
  return runtime;
}
