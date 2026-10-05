import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatRequestDto {
  @ApiProperty({ example: 'Add a task to buy milk tomorrow', maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}

export class ChatResponseDto {
  @ApiProperty()
  reply!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The data-changing action performed for this message, if any',
    example: 'create_todo',
  })
  action!: string | null;
}

export class AiStatusResponseDto {
  @ApiProperty({
    description:
      'true only when the AI feature is switched on, an API key is configured and OpenRouter accepted it',
  })
  enabled!: boolean;
}