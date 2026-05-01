import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, type LoginResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('api/v1')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() payload: LoginDto): Promise<LoginResponse> {
    return this.authService.login(payload);
  }
}
