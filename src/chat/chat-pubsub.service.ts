import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatPubSubService {
  // TODO: Implement Redis pub/sub fan-out and Socket.io adapter integration.
  publish(_channel: string, _payload: unknown): void {
    // Placeholder no-op.
  }
}
