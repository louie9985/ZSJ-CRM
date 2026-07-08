/**
 * 统一响应信封（{code, message, data, trace_id}）。
 * 前后端 single source：server 拦截器与前端 API client 共用此形状。
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  trace_id: string;
}

export function ok<T>(data: T, trace_id: string): ApiResponse<T> {
  return { code: 0, message: 'ok', data, trace_id };
}
