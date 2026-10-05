import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAuthError } from '../Utils/llm.clients.utils';
import type {
  ChatMessage,
  LlmClient,
  LlmOptions,
  LlmResponse,
  ToolDefinition,
} from '../Utils/llm.clients.utils';
import { DEFAULT_GROQ_MODEL, DEFAULT_LLM_URL } from '../Utils/llm.constants.utils';

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function: { name: string; arguments: string | Record<string, unknown> };
      }[];
    };
  }[];
  error?: { code?: number | string; message?: string };
}

@Injectable()
export class GroqLlmClient implements LlmClient {
  private readonly logger = new Logger(GroqLlmClient.name);

  constructor(private readonly config: ConfigService) {}

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: LlmOptions = {},
  ): Promise<LlmResponse> {
    const apiKey = this.config.get<string>('LLM_API_KEY')?.trim();
    if (!apiKey) throw new LlmAuthError('LLM_API_KEY is not configured');

    const model = this.config.get<string>('GROQ_MODEL', DEFAULT_GROQ_MODEL);
    const timeoutMs = Number(this.config.get<string>('GROQ_TIMEOUT_MS', '30000'));
    const hasTools = tools.length > 0;

    let response: Response;
    try {
      response = await fetch(`${DEFAULT_LLM_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(toOpenAiMessage),
          tools: hasTools ? tools.map(toOpenAiTool) : undefined,
          tool_choice: hasTools ? (options.toolChoice ?? 'auto') : undefined,
          temperature: 0,
          stream: false,
          max_completion_tokens: 216,
          reasoning_effort: "medium"
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('Could not reach the AI provider');
    }

    if (!response.ok) {
      const upstream = await response.text().catch(() => '');
      throw this.toError(response.status, upstream);
    }

    const data = (await response.json()) as ChatCompletionResponse;

    if (data.error) {
      throw this.toError(Number(data.error.code) || 502, data.error.message ?? '');
    }

    const message = data.choices?.[0]?.message;
    if (!message) throw new ServiceUnavailableException('The AI provider returned an empty response');

    return {
      content: message.content ?? '',
      toolCalls: (message.tool_calls ?? []).map((call, index) => ({
        id: call.id ?? `call_${index}`,
        name: call.function.name,
        arguments: parseArguments(call.function.arguments),
      })),
    };
  }

  private toError(status: number, upstream: string): Error {
    this.logger.warn(`Groq error ${status}: ${upstream.slice(0, 300)}`);

    if (status === 401 || status === 403) return new LlmAuthError();
    if (status === 429) {
      return new HttpException(
        'The AI model is rate limited right now. Please try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return new ServiceUnavailableException(`The AI provider returned an error (${status})`);
  }
}

function parseArguments(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toOpenAiMessage(message: ChatMessage): Record<string, unknown> {
  switch (message.role) {
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.arguments) },
              })),
            }
          : {}),
      };
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        name: message.toolName,
        content: message.content,
      };
    default:
      return { role: message.role, content: message.content };
  }
}

function toOpenAiTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}