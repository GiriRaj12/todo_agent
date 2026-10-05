import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GroqLlmClient } from '../groq.llm.client'
import { LlmAuthError } from '../../Utils/llm.clients.utils';
import type { ChatMessage, ToolDefinition } from '../../Utils/llm.clients.utils';
import { DEFAULT_LLM_URL } from '../../Utils/llm.constants.utils';

describe('GroqLlmClient', () => {
  let client: GroqLlmClient;
  let configServiceMock: jest.Mocked<Partial<ConfigService>>;

  const mockApiKey = 'sk-groq-mock-key';
  const mockModel = 'llama-3.3-70b-versatile';
  const mockTimeoutMs = '30000';

  beforeEach(async () => {
    global.fetch = jest.fn();

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'LLM_API_KEY') return mockApiKey;
        if (key === 'GROQ_MODEL') return mockModel;
        if (key === 'GROQ_TIMEOUT_MS') return mockTimeoutMs;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroqLlmClient,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    client = module.get<GroqLlmClient>(GroqLlmClient);

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('chat', () => {
    const sampleMessages: ChatMessage[] = [
      { role: 'user', content: 'Hello AI' },
    ];

    it('should throw LlmAuthError when LLM_API_KEY is missing or empty', async () => {
      configServiceMock.get = jest.fn().mockReturnValue(undefined);

      await expect(client.chat(sampleMessages, [])).rejects.toThrow(LlmAuthError);
      await expect(client.chat(sampleMessages, [])).rejects.toThrow(
        'LLM_API_KEY is not configured',
      );
    });

    it('should successfully make API call and return parsed completion', async () => {
      const mockResponseData = {
        choices: [
          {
            message: {
              content: 'Hello human!',
              tool_calls: [],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponseData),
      });

      const result = await client.chat(sampleMessages, []);

      expect(result).toEqual({
        content: 'Hello human!',
        toolCalls: [],
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${DEFAULT_LLM_URL}/chat/completions`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: mockModel,
            messages: [{ role: 'user', content: 'Hello AI' }],
            tools: undefined,
            tool_choice: undefined,
            temperature: 0,
            stream: false,
            max_completion_tokens: 216,
            reasoning_effort: 'medium',
          }),
        }),
      );
    });

    it('should correctly format messages, tools, and options in payload', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Get current weather' },
        {
          role: 'assistant',
          content: 'Checking...',
          toolCalls: [
            { id: 'call_1', name: 'get_weather', arguments: { city: 'London' } },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          toolName: 'get_weather',
          content: '{"temp": 15}',
        },
      ];

      const tools: ToolDefinition[] = [
        {
          name: 'get_weather',
          description: 'Fetches current weather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      ];

      const mockResponseData = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_2',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"Paris"}',
                  },
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponseData),
      });

      const result = await client.chat(messages, tools);

      expect(global.fetch).toHaveBeenCalledWith(
        `${DEFAULT_LLM_URL}/chat/completions`,
        expect.objectContaining({
          body: JSON.stringify({
            model: mockModel,
            messages: [
              { role: 'user', content: 'Get current weather' },
              {
                role: 'assistant',
                content: 'Checking...',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'get_weather',
                      arguments: '{"city":"London"}',
                    },
                  },
                ],
              },
              {
                role: 'tool',
                tool_call_id: 'call_1',
                name: 'get_weather',
                content: '{"temp": 15}',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'get_weather',
                  description: 'Fetches current weather',
                  parameters: {
                    type: 'object',
                    properties: { city: { type: 'string' } },
                  },
                },
              },
            ],
            tool_choice: 'auto',
            temperature: 0,
            stream: false,
            max_completion_tokens: 216,
            reasoning_effort: 'medium',
          }),
        }),
      );

      expect(result).toEqual({
        content: '',
        toolCalls: [
          {
            id: 'call_2',
            name: 'get_weather',
            arguments: { city: 'Paris' },
          },
        ],
      });
    });

    it('should generate fallback ID when tool call id is missing', async () => {
      const mockResponseData = {
        choices: [
          {
            message: {
              content: 'Tool executed',
              tool_calls: [
                {
                  function: {
                    name: 'test_func',
                    arguments: '{"key": "val"}',
                  },
                },
              ],
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponseData),
      });

      const result = await client.chat(sampleMessages, []);

      expect(result.toolCalls[0].id).toBe('call_0');
    });

    describe('argument parsing', () => {
      it('should return empty object for invalid JSON string in tool call arguments', async () => {
        const mockResponseData = {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    function: {
                      name: 'invalid_json_func',
                      arguments: 'invalid-json-string',
                    },
                  },
                ],
              },
            },
          ],
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(mockResponseData),
        });

        const result = await client.chat(sampleMessages, []);

        expect(result.toolCalls[0].arguments).toEqual({});
      });

      it('should handle non-string argument payload (e.g. object directly)', async () => {
        const mockResponseData = {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    function: {
                      name: 'object_arg_func',
                      arguments: { parsed: true } as unknown as string,
                    },
                  },
                ],
              },
            },
          ],
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(mockResponseData),
        });

        const result = await client.chat(sampleMessages, []);

        expect(result.toolCalls[0].arguments).toEqual({ parsed: true });
      });
    });

    describe('error handling & response statuses', () => {
      it('should throw ServiceUnavailableException on network/fetch failure', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

        await expect(client.chat(sampleMessages, [])).rejects.toThrow(
          ServiceUnavailableException,
        );
      });

      it('should throw ServiceUnavailableException when response choices array is missing', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce({ choices: [] }),
        });

        await expect(client.chat(sampleMessages, [])).rejects.toThrow(
          'The AI provider returned an empty response',
        );
      });

      it('should throw error contained within payload response data', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce({
            error: { code: 429, message: 'Rate limit exceeded' },
          }),
        });

        await expect(client.chat(sampleMessages, [])).rejects.toThrow(HttpException);
      });

      it('should map status 401/403 to LlmAuthError', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: jest.fn().mockResolvedValueOnce('Unauthorized request'),
        });

        await expect(client.chat(sampleMessages, [])).rejects.toThrow(LlmAuthError);
      });

      it('should map status 429 to rate limit HttpException', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: jest.fn().mockResolvedValueOnce('Too many requests'),
        });

        const promise = client.chat(sampleMessages, []);
        await expect(promise).rejects.toThrow(HttpException);
        await expect(promise).rejects.toThrow(
          'The AI model is rate limited right now. Please try again shortly.',
        );
      });

      it('should map generic HTTP status errors to ServiceUnavailableException', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValueOnce('Internal Server Error'),
        });

        await expect(client.chat(sampleMessages, [])).rejects.toThrow(
          'The AI provider returned an error (500)',
        );
      });
    });
  });
});