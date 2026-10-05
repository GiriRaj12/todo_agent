import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiStatusService } from '../Services/agent.status.service';
import { AiStatusResponseDto } from './ai.dtos';

@ApiTags('ai')
@Controller('ai')
export class AiStatusController {
  constructor(private readonly status: AiStatusService) {}

  @Get('status')
  @ApiOperation({ summary: 'Is the AI assistant available?' })
  @ApiOkResponse({ type: AiStatusResponseDto })
  async getStatus(): Promise<AiStatusResponseDto> {
    return { enabled: await this.status.isEnabled() };
  }
}