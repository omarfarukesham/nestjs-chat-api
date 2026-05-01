import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { ChatPubSubService } from '../chat/chat-pubsub.service';
import { DatabaseService } from '../database/database.service';
import { messages, rooms } from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { CreateRoomDto } from './dto/create-room.dto';

const idAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

const roomUsersKey = (roomId: string) => `room:${roomId}:users`;

export interface RoomDto {
  id: string;
  name: string;
  createdBy: string;
  activeUsers: number;
  createdAt: number;
}

export interface CreateRoomResponse {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly pubsub: ChatPubSubService,
  ) {}

  async listRooms(): Promise<{ rooms: RoomDto[] }> {
    const allRooms = await this.database.db.select().from(rooms);
    const enriched = await Promise.all(
      allRooms.map(async (room) => ({
        id: room.id,
        name: room.name,
        createdBy: room.createdBy,
        activeUsers: await this.redis.client.sCard(roomUsersKey(room.id)),
        createdAt: room.createdAt,
      })),
    );
    return { rooms: enriched };
  }

  async createRoom(
    payload: CreateRoomDto,
    createdByUsername: string,
  ): Promise<CreateRoomResponse> {
    const name = payload.name.trim();

    const existing = await this.database.db
      .select()
      .from(rooms)
      .where(eq(rooms.name, name))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException({
        code: 'ROOM_NAME_TAKEN',
        message: `Room name "${name}" is already taken`,
      });
    }

    const id = `room_${idAlphabet()}`;
    const createdAt = Date.now();

    try {
      await this.database.db.insert(rooms).values({
        id,
        name,
        createdBy: createdByUsername,
        createdAt,
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'ROOM_NAME_TAKEN',
          message: `Room name "${name}" is already taken`,
        });
      }
      throw err;
    }

    return { id, name, createdBy: createdByUsername, createdAt };
  }

  async getRoomById(id: string): Promise<RoomDto> {
    const rows = await this.database.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
    }

    const room = rows[0];
    return {
      id: room.id,
      name: room.name,
      createdBy: room.createdBy,
      activeUsers: await this.redis.client.sCard(roomUsersKey(room.id)),
      createdAt: room.createdAt,
    };
  }

  async deleteRoom(
    id: string,
    requestingUsername: string,
  ): Promise<{ deleted: true }> {
    const rows = await this.database.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
    }

    const room = rows[0];
    if (room.createdBy !== requestingUsername) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the room creator can delete this room',
      });
    }

    await this.pubsub.publishRoomDeleted(id);

    await this.database.db.transaction(async (tx) => {
      await tx.delete(messages).where(eq(messages.roomId, id));
      await tx.delete(rooms).where(eq(rooms.id, id));
    });

    await this.redis.client.del(roomUsersKey(id));

    return { deleted: true };
  }
}
