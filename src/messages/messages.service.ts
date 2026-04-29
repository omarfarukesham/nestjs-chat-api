import { Injectable } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';

@Injectable()
export class MessagesService {
  listMessages(
    roomId: string,
    query: ListMessagesDto,
  ): Record<string, unknown> {
    // TODO: Fetch paginated messages from PostgreSQL.
    return {
      roomId,
      items: [],
      query,
    };
  }

  createMessage(
    roomId: string,
    payload: CreateMessageDto,
  ): Record<string, unknown> {
    // TODO: Persist message and broadcast message:new event.
    return {
      id: 'placeholder-message-id',
      roomId,
      ...payload,
    };
  }
}
