import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import type { RequestUser } from '../common/types/request-user.type';
import { CreateRoomDto } from './dto/create-room.dto';
import {
  type CreateRoomResponse,
  type RoomDto,
  RoomsService,
} from './rooms.service';

@Controller('api/v1/rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  listRooms(): Promise<{ rooms: RoomDto[] }> {
    return this.roomsService.listRooms();
  }

  @Post()
  createRoom(
    @Body() payload: CreateRoomDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CreateRoomResponse> {
    return this.roomsService.createRoom(payload, user.username);
  }

  @Get(':id')
  getRoomById(@Param('id') id: string): Promise<RoomDto> {
    return this.roomsService.getRoomById(id);
  }

  @Delete(':id')
  deleteRoom(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ deleted: true }> {
    return this.roomsService.deleteRoom(id, user.username);
  }
}
