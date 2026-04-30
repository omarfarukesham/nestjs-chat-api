import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly sql: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    this.sql = postgres(databaseUrl ?? '', { max: 5 });
    this.db = drizzle(this.sql, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.sql.end();
  }
}
