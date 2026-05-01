import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { ChatPubSubService } from '../chat/chat-pubsub.service';
import { AppException } from '../common/exceptions/app.exception';
import { DatabaseService } from '../database/database.service';
import { messages, rooms } from '../database/schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';

const idAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

const MAX_MESSAGE_LENGTH = 1000;

export interface MessageDto {
  id: string;
  roomId: string;
  username: string;
  content: string;
  createdAt: number;
}

export interface ListMessagesResponse {
  messages: MessageDto[];
  hasMore: boolean;
  nextCursor: string | null;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pubsub: ChatPubSubService,
  ) {}

  async listMessages(
    roomId: string,
    query: ListMessagesDto,
  ): Promise<ListMessagesResponse> {
    await this.assertRoomExists(roomId);

    const limit = query.limit ?? 50;
    const fetchLimit = limit + 1;

    let cursorCreatedAt: number | null = null;
    let cursorId: string | null = null;
    if (query.before) {
      const cursorRow = await this.database.db
        .select({ id: messages.id, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.roomId, roomId), eq(messages.id, query.before)))
        .limit(1);
      if (cursorRow.length > 0) {
        cursorCreatedAt = cursorRow[0].createdAt;
        cursorId = cursorRow[0].id;
      }
    }

    const whereClause =
      cursorCreatedAt !== null && cursorId !== null
        ? and(
            eq(messages.roomId, roomId),
            or(
              lt(messages.createdAt, cursorCreatedAt),
              and(
                eq(messages.createdAt, cursorCreatedAt),
                lt(messages.id, cursorId),
              ),
            ),
          )
        : eq(messages.roomId, roomId);

    const rows = await this.database.db
      .select()
      .from(messages)
      .where(whereClause)
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(fetchLimit);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    return {
      messages: sliced.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        username: m.username,
        content: m.content,
        createdAt: m.createdAt,
      })),
      hasMore,
      nextCursor,
    };
  }

  async createMessage(
    roomId: string,
    payload: CreateMessageDto,
    username: string,
  ): Promise<MessageDto> {
    await this.assertRoomExists(roomId);

    const raw = typeof payload.content === 'string' ? payload.content : '';
    const content = raw.trim();

    if (!content) {
      throw new AppException(
        'INVALID_CONTENT',
        'Message content must not be empty',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new AppException(
        'MESSAGE_TOO_LONG',
        `Message content exceeds ${MAX_MESSAGE_LENGTH} characters`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const id = `msg_${idAlphabet()}`;
    const createdAt = Date.now();

    await this.database.db.insert(messages).values({
      id,
      roomId,
      username,
      content,
      createdAt,
    });

    const message: MessageDto = { id, roomId, username, content, createdAt };

    await this.pubsub.publishMessage(roomId, message);

    return message;
  }

  private async assertRoomExists(roomId: string): Promise<void> {
    const exists = await this.database.db
      .select({ one: sql<number>`1` })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (exists.length === 0) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
    }
  }
}
