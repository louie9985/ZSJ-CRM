import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * X-Request-Id 幂等键中间件（骨架阶段：只透传/生成 trace_id，不做服务端去重）。
 * 去重（AP-18：幂等键+端点 维度）留待鉴权/业务阶段实现。
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('X-Request-Id');
    const traceId = incoming && incoming.trim() !== '' ? incoming : uuidv4();
    (req as Request & { traceId: string }).traceId = traceId;
    res.setHeader('X-Request-Id', traceId);
    next();
  }
}
