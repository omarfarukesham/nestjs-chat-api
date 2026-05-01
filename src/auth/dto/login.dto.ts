import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'username must contain only letters, digits, or underscores',
  })
  username!: string;
}
