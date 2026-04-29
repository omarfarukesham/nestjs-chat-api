import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatPubSubService } from './chat-pubsub.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [ChatGateway, ChatPubSubService],
  exports: [ChatPubSubService],
})
export class ChatModule {}
