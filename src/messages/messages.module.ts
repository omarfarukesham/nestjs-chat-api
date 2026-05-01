import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { AuthGuard } from '../common/guards/auth.guard';
import { DatabaseModule } from '../database/database.module';
import { UserModule } from '../services/user.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [DatabaseModule, UserModule, ChatModule],
  controllers: [MessagesController],
  providers: [MessagesService, AuthGuard],
  exports: [MessagesService],
})
export class MessagesModule {}
