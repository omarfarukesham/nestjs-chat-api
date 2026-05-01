import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'name must contain only letters, digits, or hyphens',
  })
  name!: string;
}
