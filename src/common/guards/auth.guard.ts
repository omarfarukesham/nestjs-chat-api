import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../types/request-user.type';

type RequestWithUser = Request & { user?: RequestUser };

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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

    // TODO: Validate session token from Redis and resolve the real user.
    request.user = {
      userId: 'placeholder-user-id',
      sessionToken,
    };

    return true;
  }
}
