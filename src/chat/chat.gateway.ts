import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { ChatPubSubService } from './chat-pubsub.service';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly chatPubSubService: ChatPubSubService) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.query.token;
    const roomId = client.handshake.query.roomId;

    // TODO: Validate token, authorize room join, and emit room:joined / room:user_joined.
    if (!token || !roomId) {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // TODO: Remove active socket state and emit room:user_left where needed.
  }

  @SubscribeMessage('room:leave')
  handleRoomLeave(
    @ConnectedSocket() _client: Socket,
    @MessageBody() _payload: unknown,
  ): void {
    // TODO: Process explicit room leave and emit room:user_left.
    this.chatPubSubService.publish('chat.placeholder', {
      event: 'room:leave',
    });
  }
}
