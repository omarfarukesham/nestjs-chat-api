import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { RedisService } from '../redis/redis.service';

export const messageChannel = (roomId: string) => `room:message:${roomId}`;
export const roomDeletedChannel = (roomId: string) => `room:deleted:${roomId}`;

const MESSAGE_PATTERN = 'room:message:*';
const ROOM_DELETED_PATTERN = 'room:deleted:*';

export type MessageHandler = (
  roomId: string,
  payload: unknown,
) => void | Promise<void>;
export type RoomDeletedHandler = (roomId: string) => void | Promise<void>;

@Injectable()
export class ChatPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPubSubService.name);
  private subscriber: RedisClientType | null = null;
  private readonly messageHandlers: MessageHandler[] = [];
  private readonly roomDeletedHandlers: RoomDeletedHandler[] = [];

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    const subscriber = this.redis.client.duplicate() as RedisClientType;
    subscriber.on('error', (err) =>
      this.logger.error('Pubsub subscriber error', err as Error),
    );
    await subscriber.connect();
    this.subscriber = subscriber;

    await subscriber.pSubscribe(MESSAGE_PATTERN, (raw, channel) => {
      const roomId = channel.slice(MESSAGE_PATTERN.length - 1);
      void this.dispatchMessage(roomId, raw);
    });

    await subscriber.pSubscribe(ROOM_DELETED_PATTERN, (raw, channel) => {
      const roomId = channel.slice(ROOM_DELETED_PATTERN.length - 1);
      void this.dispatchRoomDeleted(roomId);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber?.isOpen) {
      await this.subscriber.quit();
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onRoomDeleted(handler: RoomDeletedHandler): void {
    this.roomDeletedHandlers.push(handler);
  }

  async publishMessage(roomId: string, payload: unknown): Promise<void> {
    try {
      await this.redis.client.publish(
        messageChannel(roomId),
        JSON.stringify(payload),
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish message for room ${roomId}`,
        err as Error,
      );
    }
  }

  async publishRoomDeleted(roomId: string): Promise<void> {
    try {
      await this.redis.client.publish(
        roomDeletedChannel(roomId),
        JSON.stringify({ roomId }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish room-deleted for room ${roomId}`,
        err as Error,
      );
    }
  }

  private async dispatchMessage(roomId: string, raw: string): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.logger.warn(`Invalid JSON on ${messageChannel(roomId)}`);
      return;
    }
    for (const handler of this.messageHandlers) {
      try {
        await handler(roomId, payload);
      } catch (err) {
        this.logger.error('message handler threw', err as Error);
      }
    }
  }

  private async dispatchRoomDeleted(roomId: string): Promise<void> {
    for (const handler of this.roomDeletedHandlers) {
      try {
        await handler(roomId);
      } catch (err) {
        this.logger.error('room-deleted handler threw', err as Error);
      }
    }
  }
}
