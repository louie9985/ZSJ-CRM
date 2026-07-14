import { request } from '@zsj/shared-core';

/**
 * Web 端请求：走 shared-core 统一封装，baseUrl 空 → 由 Vite dev proxy 转发 /api/v1。
 */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}
