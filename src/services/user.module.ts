import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { UserService } from './user.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
