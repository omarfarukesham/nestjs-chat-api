import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { eq } from 'drizzle-orm';
import type { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import { DatabaseService } from '../database/database.service';
import { rooms } from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { UserService, type UserRecord } from '../services/user.service';
import { ChatPubSubService } from './chat-pubsub.service';

const roomUsersKey = (roomId: string) => `room:${roomId}:users`;

interface SocketData {
  userId?: string;
  username?: string;
  roomId?: string;
}

type ChatSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private readonly server!: Namespace;

  constructor(
    private readonly userService: UserService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly pubsub: ChatPubSubService,
  ) {}

  afterInit(): void {
    this.pubsub.onMessage((roomId, payload) => {
      const m = payload as {
        id: string;
        username: string;
        content: string;
        createdAt: string;
      };
      this.server.local.to(roomId).emit('message:new', {
        id: m.id,
        username: m.username,
        content: m.content,
        createdAt: m.createdAt,
      });
    });

    this.pubsub.onRoomDeleted(async (roomId) => {
      this.server.local.to(roomId).emit('room:deleted', { roomId });
      const sockets = await this.server.local.in(roomId).fetchSockets();
      for (const socket of sockets) {
        socket.disconnect(true);
      }
      await this.redis.client.del(roomUsersKey(roomId));
    });
  }

  async handleConnection(client: ChatSocket): Promise<void> {
    const token = this.firstString(client.handshake.query.token);
    const roomId = this.firstString(client.handshake.query.roomId);

    if (!token) {
      this.rejectAndDisconnect(client, 'UNAUTHORIZED', 401, 'Missing token');
      return;
    }
    if (!roomId) {
      this.rejectAndDisconnect(
        client,
        'INVALID_ROOM',
        400,
        'Missing roomId in handshake',
      );
      return;
    }

    let user: UserRecord;
    try {
      user = await this.userService.getUserFromToken(token);
    } catch {
      this.rejectAndDisconnect(
        client,
        'UNAUTHORIZED',
        401,
        'Invalid or expired session token',
      );
      return;
    }

    const roomRow = await this.database.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);
    if (roomRow.length === 0) {
      this.rejectAndDisconnect(client, 'ROOM_NOT_FOUND', 404, 'Room not found');
      return;
    }

    client.data.userId = user.userId;
    client.data.username = user.username;
    client.data.roomId = roomId;

    await client.join(roomId);

    await this.redis.client.sAdd(roomUsersKey(roomId), user.username);
    const activeUsers = await this.redis.client.sMembers(roomUsersKey(roomId));

    client.emit('room:joined', { activeUsers });
    client.to(roomId).emit('room:user_joined', {
      username: user.username,
      activeUsers,
    });
  }

  async handleDisconnect(client: ChatSocket): Promise<void> {
    const { roomId, username } = client.data;
    if (!roomId || !username) return;

    await this.cleanupAndBroadcast(client, roomId, username);
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(@ConnectedSocket() client: ChatSocket): Promise<void> {
    const { roomId, username } = client.data;
    if (!roomId || !username) return;

    await this.cleanupAndBroadcast(client, roomId, username);
    client.disconnect(true);
  }

  private async cleanupAndBroadcast(
    client: ChatSocket,
    roomId: string,
    username: string,
  ): Promise<void> {
    try {
      await this.redis.client.sRem(roomUsersKey(roomId), username);
      const activeUsers = await this.redis.client.sMembers(
        roomUsersKey(roomId),
      );
      client.to(roomId).emit('room:user_left', { username, activeUsers });
    } catch (err) {
      this.logger.error(
        `Failed to cleanup user ${username} from room ${roomId}`,
        err as Error,
      );
    } finally {
      client.data.roomId = undefined;
      client.data.username = undefined;
    }
  }

  private rejectAndDisconnect(
    client: ChatSocket,
    code: string,
    status: number,
    message: string,
  ): void {
    client.emit('error', { code, status, message });
    client.disconnect(true);
  }

  private firstString(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
  }
}
