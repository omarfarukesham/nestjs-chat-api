import { Injectable } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  listRooms(): Record<string, unknown> {
    // TODO: Fetch rooms from PostgreSQL.
    return { rooms: [] };
  }

  createRoom(room: CreateRoomDto): Record<string, unknown> {
    // TODO: Persist room in PostgreSQL and initialize room state in Redis.
    return {
      id: 'placeholder-room-id',
      ...room,
    };
  }

  getRoomById(id: string): Record<string, unknown> {
    // TODO: Fetch room details by id.
    return {
      id,
      exists: true,
    };
  }

  deleteRoom(id: string): Record<string, unknown> {
    // TODO: Delete room and publish room:deleted event.
    return {
      id,
      deleted: true,
    };
  }
}
