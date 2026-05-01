import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from '../../services/user.service';
import type { RequestUser } from '../types/request-user.type';

type RequestWithUser = Request & { user?: RequestUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly userService: UserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Bearer token',
      });
    }

    const sessionToken = authHeader.slice('Bearer '.length).trim();
    if (!sessionToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing session token',
      });
    }

    const user = await this.userService.getUserFromToken(sessionToken);
    request.user = {
      userId: user.userId,
      username: user.username,
      sessionToken,
    };

    return true;
  }
}
