import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import compression from 'compression';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { RedisIoAdapter } from './config/socket-io';
import { RedisService } from './redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsEnv = process.env.CORS_ORIGIN?.trim();
  const corsOrigin =
    !corsEnv || corsEnv === '*'
      ? true
      : corsEnv.split(',').map((s) => s.trim());
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.use(helmet());
  app.use(compression());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
      forbidUnknownValues: false,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  const redisService = app.get(RedisService);
  const ioAdapter = new RedisIoAdapter(app, redisService.client);
  await ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
