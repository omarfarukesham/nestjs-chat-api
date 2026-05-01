import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { AuthGuard } from '../common/guards/auth.guard';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { UserModule } from '../services/user.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [DatabaseModule, RedisModule, UserModule, ChatModule],
  controllers: [RoomsController],
  providers: [RoomsService, AuthGuard],
  exports: [RoomsService],
})
export class RoomsModule {}
