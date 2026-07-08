import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ok, type ApiResponse } from '@zsj/shared-core';

/**
 * 统一响应拦截器：把 controller 返回值包成 {code,message,data,trace_id}（对齐后端规范）。
 * trace_id 取自 RequestIdMiddleware 注入的 req.traceId。
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { traceId?: string }>();
    const traceId = req.traceId ?? '';
    return next.handle().pipe(map((data) => ok(data, traceId)));
  }
}
