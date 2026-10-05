import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../Todo/Utils/clock.utils';
import { TodosService } from '../../Todo/Services/todoapp.service';
import { ConversationStore } from '../Utils/converstation.store.utils';
import { LLM_CLIENT, LlmAuthError } from '../Utils/llm.clients.utils';
import type {
  ChatMessage,
  LlmClient,
  LlmOptions,
  LlmResponse,
  ToolDefinition,
} from '../Utils/llm.clients.utils'
import { buildTodoTools } from '../Utils/todo.tools.utils';
import type { AgentTool } from '../Utils/todo.tools.utils';
import { AiStatusService } from './agent.status.service';
import { buildSystemPrompt } from '../Utils/system.prompt';

export const MULTI_ACTION_MESSAGE =
  'I can only do one thing at a time. Please ask for one action (add, update, complete, reopen or delete a single task) and then send the next one separately.';
export const AGENT_FALLBACK_MESSAGE =
  "Sorry, I couldn't finish that. Please try rephrasing your request.";
export const CHANGE_APPLIED_MESSAGE = 'Done: the change was applied.';

export interface ChatResult {
  reply: string;
  action: string | null;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly todos: TodosService,
    private readonly store: ConversationStore,
    private readonly config: ConfigService,
    private readonly clock: Clock,
    private readonly status: AiStatusService,
  ) {}

  async chat(sessionId: string, userMessage: string): Promise<ChatResult> {
    if (!(await this.status.isEnabled())) {
      throw new ServiceUnavailableException('The AI assistant is not available');
    }
    const maxIterations = Number(this.config.get<string>('AI_MAX_ITERATIONS', '5'));

    const tools = buildTodoTools(this.todos, sessionId);
    const toolsByName = new Map(tools.map((t) => [t.definition.name, t]));
    const definitions = tools.map((t) => t.definition);

    const turn: ChatMessage[] = [{ role: 'user', content: userMessage }];
    const context = (): ChatMessage[] => [
      { role: 'system', content: buildSystemPrompt(this.clock.today()) },
      ...this.store.get(sessionId),
      ...turn,
    ];

    let action: string | null = null;
    let reply: string | null = null;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.ask(context(), definitions);

      if (response.toolCalls.length === 0) {
        reply = response.content.trim() || AGENT_FALLBACK_MESSAGE;
        break;
      }

      const writes = response.toolCalls.filter((c) => toolsByName.get(c.name)?.mutates);
      if (writes.length > 1) {
        reply = MULTI_ACTION_MESSAGE;
        break;
      }

      turn.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });

      for (const call of response.toolCalls) {
        const tool = toolsByName.get(call.name);
        const outcome = tool
          ? await this.run(tool, call.arguments)
          : { ok: false, content: JSON.stringify({ ok: false, error: `Unknown tool "${call.name}"` }) };
        turn.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: outcome.content });
        if (tool?.mutates && outcome.ok) action = call.name;
      }

      if (action) {
        try {
          const summary = await this.ask(context(), definitions, { toolChoice: 'none' });
          reply = summary.content.trim() || CHANGE_APPLIED_MESSAGE;
        } catch (error) {
          this.logger.warn(`Summary call failed after "${action}": ${String(error)}`);
          reply = CHANGE_APPLIED_MESSAGE;
        }
        break;
      }
    }

    const finalReply = reply ?? AGENT_FALLBACK_MESSAGE;
    this.store.append(sessionId, [...turn, { role: 'assistant', content: finalReply }]);
    return { reply: finalReply, action };
  }

  reset(sessionId: string): void {
    this.store.clear(sessionId);
  }

  private async ask(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    try {
      return await this.llm.chat(messages, tools, options);
    } catch (error) {
      if (error instanceof LlmAuthError) {
        this.logger.error(error.message);
        this.status.markInvalid();
        throw new ServiceUnavailableException('The AI assistant is not available');
      }
      throw error;
    }
  }

  private async run(
    tool: AgentTool,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; content: string }> {
    try {
      const result = await tool.execute(args);
      return { ok: true, content: JSON.stringify({ ok: true, result }) };
    } catch (error) {
      if (error instanceof HttpException) {
        return { ok: false, content: JSON.stringify({ ok: false, error: error.message }) };
      }
      this.logger.error(error);
      return { ok: false, content: JSON.stringify({ ok: false, error: 'Unexpected error' }) };
    }
  }
}