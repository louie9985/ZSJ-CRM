import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './platform/http/response.interceptor';

function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('AI-CRM V3 API')
    .setVersion('3.0.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalInterceptors(new ResponseInterceptor());

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('api/v1/docs', app, document);

  // 生成模式：仅导出 openapi.json 后退出，供 shared-core 生成类型管道调用。
  const exportPath = process.env.OPENAPI_EXPORT;
  if (exportPath) {
    writeFileSync(exportPath, JSON.stringify(document, null, 2));
    await app.close();
    return;
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
