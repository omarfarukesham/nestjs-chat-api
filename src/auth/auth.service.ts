import { Injectable } from '@nestjs/common';
import { UserService } from '../services/user.service';
import { LoginDto } from './dto/login.dto';

export interface LoginResponse {
  sessionToken: string;
  user: {
    id: string;
    username: string;
    createdAt: string;
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly userService: UserService) {}

  async login(payload: LoginDto): Promise<LoginResponse> {
    const user = await this.userService.getOrCreateUser(payload.username);
    const sessionToken = await this.userService.generateSessionToken(
      user.userId,
    );

    return {
      sessionToken,
      user: {
        id: user.userId,
        username: user.username,
        createdAt: new Date(user.createdAt).toISOString(),
      },
    };
  }
}
