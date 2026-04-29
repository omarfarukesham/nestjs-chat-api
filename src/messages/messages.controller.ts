import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';

@Controller('api/v1/rooms/:roomId/messages')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  listMessages(
    @Param('roomId') roomId: string,
    @Query() query: ListMessagesDto,
  ): Record<string, unknown> {
    return this.messagesService.listMessages(roomId, query);
  }

  @Post()
  createMessage(
    @Param('roomId') roomId: string,
    @Body() payload: CreateMessageDto,
  ): Record<string, unknown> {
    return this.messagesService.createMessage(roomId, payload);
  }
}
