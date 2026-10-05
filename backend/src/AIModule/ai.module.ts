import { Module } from '@nestjs/common';
import { AgentService } from './Services/agent.service';
import { AiStatusService } from './Services/agent.status.service';
import { ConversationStore } from './Utils/converstation.store.utils';
import { AiStatusController } from './Controllers/ai.status.controller';
import { ChatController } from './Controllers/ai.chat.controller';
import { LLM_CLIENT } from './Utils/llm.clients.utils';
import { TodoAppModule } from '../Todo/todo-app.module';
import { GroqLlmClient } from './Services/groq.llm.client';

@Module({
  imports: [TodoAppModule],
  controllers: [ChatController, AiStatusController],
  providers: [
    AgentService,
    AiStatusService,
    ConversationStore,
    { provide: LLM_CLIENT, useClass: GroqLlmClient },
  ],
})
export class AiModule {}