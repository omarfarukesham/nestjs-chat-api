import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import type { RequestUser } from '../common/types/request-user.type';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import {
  type ListMessagesResponse,
  type MessageDto,
  MessagesService,
} from './messages.service';

@Controller('api/v1/rooms/:roomId/messages')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  listMessages(
    @Param('roomId') roomId: string,
    @Query() query: ListMessagesDto,
  ): Promise<ListMessagesResponse> {
    return this.messagesService.listMessages(roomId, query);
  }

  @Post()
  createMessage(
    @Param('roomId') roomId: string,
    @Body() payload: CreateMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MessageDto> {
    return this.messagesService.createMessage(roomId, payload, user.username);
  }
}
