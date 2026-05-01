import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    this.client = createClient({ url: redisUrl });
    this.client.on('error', (err) =>
      this.logger.error('Redis client error', err),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    const pong = await this.client.ping();
    if (pong !== 'PONG') {
      throw new Error(`Redis health check failed: expected PONG, got ${pong}`);
    }
    this.logger.log('Redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
