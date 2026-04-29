import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

type ErrorPayload = {
  code?: string;
  message?: string | string[];
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const fallbackCode =
      status === HttpStatus.UNAUTHORIZED ? 'UNAUTHORIZED' : 'INTERNAL_ERROR';
    const fallbackMessage =
      status === HttpStatus.UNAUTHORIZED
        ? 'Unauthorized'
        : 'Internal server error';

    let code = fallbackCode;
    let message = fallbackMessage;

    if (exception instanceof HttpException) {
      const payload = exception.getResponse() as string | ErrorPayload;
      if (typeof payload === 'string') {
        message = payload;
      } else {
        code = payload.code ?? code;
        if (Array.isArray(payload.message)) {
          message = payload.message.join(', ');
        } else if (typeof payload.message === 'string') {
          message = payload.message;
        }
      }
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
}
