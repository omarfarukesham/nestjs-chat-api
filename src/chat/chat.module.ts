import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { UserModule } from '../services/user.module';
import { ChatPubSubService } from './chat-pubsub.service';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [RedisModule, DatabaseModule, UserModule],
  providers: [ChatGateway, ChatPubSubService],
  exports: [ChatPubSubService],
})
export class ChatModule {}
