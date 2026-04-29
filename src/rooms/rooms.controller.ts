import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';

@Controller('api/v1/rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  listRooms(): Record<string, unknown> {
    return this.roomsService.listRooms();
  }

  @Post()
  createRoom(@Body() payload: CreateRoomDto): Record<string, unknown> {
    return this.roomsService.createRoom(payload);
  }

  @Get(':id')
  getRoomById(@Param('id') id: string): Record<string, unknown> {
    return this.roomsService.getRoomById(id);
  }

  @Delete(':id')
  deleteRoom(@Param('id') id: string): Record<string, unknown> {
    return this.roomsService.deleteRoom(id);
  }
}
