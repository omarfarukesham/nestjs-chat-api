/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly sql;
  readonly db;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    this.sql = postgres(databaseUrl ?? '', {
      max: 5,
    });
    this.db = drizzle(this.sql);
  }

  async onModuleDestroy(): Promise<void> {
    await this.sql.end();
  }
}
