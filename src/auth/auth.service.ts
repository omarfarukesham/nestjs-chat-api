import { Injectable } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  login(payload: LoginDto): Record<string, unknown> {
    // TODO: Create session token, persist session in Redis, and return login response contract.
    return {
      sessionToken: 'placeholder-session-token',
      user: {
        id: 'placeholder-user-id',
      },
      payloadEcho: payload,
    };
  }
}
