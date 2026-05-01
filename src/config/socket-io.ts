import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { RedisClientType } from 'redis';
import type { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly baseClient: RedisClientType,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = this.baseClient.duplicate() as RedisClientType;
    const subClient = this.baseClient.duplicate() as RedisClientType;
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server: { adapter: (a: unknown) => void } = super.createIOServer(
      port,
      options,
    ) as { adapter: (a: unknown) => void };
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
