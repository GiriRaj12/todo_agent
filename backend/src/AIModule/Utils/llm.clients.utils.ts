/** Injection token for the language model client (the "port"). */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string };

export interface LlmResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface LlmOptions {
  toolChoice?: 'auto' | 'none';
}

export interface LlmClient {
  chat(messages: ChatMessage[], tools: ToolDefinition[], options?: LlmOptions): Promise<LlmResponse>;
}

export class LlmAuthError extends Error {
  constructor(message = 'The language model provider rejected the API key') {
    super(message);
    this.name = 'LlmAuthError';
  }
}