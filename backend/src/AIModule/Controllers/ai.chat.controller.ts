import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionId } from '../../Decorators/sessionId.decorator';
import { AgentService } from '../Services/agent.service';
import type { ChatResult } from '../Services/agent.service';
import { ChatRequestDto, ChatResponseDto } from './ai.dtos';

@ApiTags('chat')
@ApiSecurity('session-id')
@Controller('chat')
export class ChatController {
  constructor(private readonly agent: AgentService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send one request to the to-do assistant (one action per message)' })
  @ApiOkResponse({ type: ChatResponseDto })
  @ApiServiceUnavailableResponse({ description: 'AI disabled or the language model is unreachable' })
  chat(@SessionId() sessionId: string, @Body() dto: ChatRequestDto): Promise<ChatResult> {
    return this.agent.chat(sessionId, dto.message);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear this session\'s chat history' })
  @ApiNoContentResponse()
  reset(@SessionId() sessionId: string): void {
    this.agent.reset(sessionId);
  }
}