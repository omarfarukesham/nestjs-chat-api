import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { DatabaseService } from '../database/database.service';
import { users } from '../database/schema';
import { RedisService } from '../redis/redis.service';

const idAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

const SESSION_KEY = (token: string) => `session:${token}`;

export interface UserRecord {
  userId: string;
  username: string;
  createdAt: number;
}

@Injectable()
export class UserService {
  private readonly sessionTtlSeconds: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.sessionTtlSeconds = this.configService.get<number>(
      'SESSION_TTL_SECONDS',
      86400,
    );
  }

  async getOrCreateUser(username: string): Promise<UserRecord> {
    const trimmed = username?.trim();
    if (!trimmed) {
      throw new BadRequestException('username is required');
    }

    const existing = await this.database.db
      .select()
      .from(users)
      .where(eq(users.username, trimmed))
      .limit(1);

    if (existing.length > 0) {
      const u = existing[0];
      return { userId: u.id, username: u.username, createdAt: u.createdAt };
    }

    const userId = `usr_${idAlphabet()}`;
    const createdAt = Date.now();

    await this.database.db.insert(users).values({
      id: userId,
      username: trimmed,
      createdAt,
    });

    return { userId, username: trimmed, createdAt };
  }

  async generateSessionToken(userId: string): Promise<string> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    const sessionToken = randomBytes(32).toString('hex');
    await this.redis.client.set(SESSION_KEY(sessionToken), userId, {
      EX: this.sessionTtlSeconds,
    });
    return sessionToken;
  }

  async getUserFromToken(sessionToken: string): Promise<UserRecord> {
    if (!sessionToken) {
      throw new UnauthorizedException('Missing session token');
    }

    const userId = await this.redis.client.get(SESSION_KEY(sessionToken));
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    const rows = await this.database.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('User not found for active session');
    }

    const u = rows[0];
    return { userId: u.id, username: u.username, createdAt: u.createdAt };
  }
}
