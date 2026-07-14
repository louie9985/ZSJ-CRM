import { ApiProperty } from '@nestjs/swagger';

/**
 * /health 响应 DTO——同时描述统一信封 {code,message,data,trace_id}。
 * 骨架阶段仅用于让 OpenAPI 出码管道端到端跑通。
 */
export class HealthData {
  @ApiProperty({ example: 'ok' })
  status!: string;
}

export class HealthResponse {
  @ApiProperty({ example: 0 })
  code!: number;

  @ApiProperty({ example: 'ok' })
  message!: string;

  @ApiProperty({ type: HealthData })
  data!: HealthData;

  @ApiProperty({ example: '' })
  trace_id!: string;
}
