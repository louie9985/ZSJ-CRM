import type { ApiResponse } from './response';

/**
 * 统一请求封装：解信封 {code,message,data,trace_id}、透传 X-Request-Id 幂等键（AP-18）。
 * 逻辑下沉 shared-core，Web / 移动端共用；仅依赖全局 fetch，无 DOM 依赖（Taro 兼容）。
 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly traceId: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** 写操作幂等键（X-Request-Id）；调用方生成并传入。 */
  requestId?: string;
  baseUrl?: string;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, requestId, baseUrl = '', headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (requestId) {
    finalHeaders.set('X-Request-Id', requestId);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const envelope = (await res.json()) as ApiResponse<T>;
  if (envelope.code !== 0) {
    throw new ApiError(envelope.code, envelope.message, envelope.trace_id);
  }
  return envelope.data;
}
