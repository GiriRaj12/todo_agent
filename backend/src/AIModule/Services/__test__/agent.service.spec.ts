import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  AGENT_FALLBACK_MESSAGE,
  AgentService,
  CHANGE_APPLIED_MESSAGE,
  MULTI_ACTION_MESSAGE,
} from '../agent.service';
import { LlmAuthError } from '../../Utils/llm.clients.utils';
import { buildTodoTools } from '../../Utils/todo.tools.utils';
import { buildSystemPrompt } from '../../Utils/system.prompt';

jest.mock('../../Utils/todo.tools.utils', () => ({ buildTodoTools: jest.fn() }));
jest.mock('../../Utils/system.prompt', () => ({
  buildSystemPrompt: jest.fn(() => 'SYSTEM_PROMPT'),
}));

const SESSION = 'session-1';

const makeTool = (name: string, mutates: boolean, execute = jest.fn()) => ({
  definition: { name, description: `${name} tool`, parameters: {} },
  mutates,
  execute,
});

const call = (id: string, name: string, args: Record<string, unknown> = {}) => ({
  id,
  name,
  arguments: args,
});

const reply = (content: string, toolCalls: ReturnType<typeof call>[] = []) => ({
  content,
  toolCalls,
});

describe('AgentService', () => {
  let llm: { chat: jest.Mock };
  let todos: object;
  let store: { get: jest.Mock; append: jest.Mock; clear: jest.Mock };
  let config: { get: jest.Mock };
  let clock: { today: jest.Mock };
  let status: { isEnabled: jest.Mock; markInvalid: jest.Mock };
  let service: AgentService;

  let listTool: ReturnType<typeof makeTool>;
  let addTool: ReturnType<typeof makeTool>;
  let deleteTool: ReturnType<typeof makeTool>;

  beforeEach(() => {
    jest.clearAllMocks();

    llm = { chat: jest.fn() };
    todos = {};
    store = { get: jest.fn().mockReturnValue([]), append: jest.fn(), clear: jest.fn() };
    config = { get: jest.fn((_key: string, fallback?: string) => fallback) };
    clock = { today: jest.fn().mockReturnValue('2026-10-06') };
    status = { isEnabled: jest.fn().mockResolvedValue(true), markInvalid: jest.fn() };

    listTool = makeTool('list_todos', false, jest.fn().mockResolvedValue([{ id: '1' }]));
    addTool = makeTool('add_todo', true, jest.fn().mockResolvedValue({ id: '2' }));
    deleteTool = makeTool('delete_todo', true, jest.fn().mockResolvedValue(true));
    (buildTodoTools as jest.Mock).mockReturnValue([listTool, addTool, deleteTool]);

    service = new AgentService(
      llm as any,
      todos as any,
      store as any,
      config as any,
      clock as any,
      status as any,
    );
  });

  // --------------------------------------------------------------------------
  describe('availability', () => {
    it('throws ServiceUnavailableException when the AI is disabled', async () => {
      status.isEnabled.mockResolvedValue(false);

      await expect(service.chat(SESSION, 'hi')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(llm.chat).not.toHaveBeenCalled();
      expect(store.append).not.toHaveBeenCalled();
    });
  });

  describe('plain replies (no tool calls)', () => {
    it('returns the trimmed model reply with a null action', async () => {
      llm.chat.mockResolvedValueOnce(reply('  Hello there!  '));

      await expect(service.chat(SESSION, 'hi')).resolves.toEqual({
        reply: 'Hello there!',
        action: null,
      });
      expect(llm.chat).toHaveBeenCalledTimes(1);
    });

    it('falls back when the model returns empty content', async () => {
      llm.chat.mockResolvedValueOnce(reply('   '));

      const result = await service.chat(SESSION, 'hi');
      expect(result.reply).toBe(AGENT_FALLBACK_MESSAGE);
      expect(result.action).toBeNull();
    });

    it('stores the user message and final reply in the conversation', async () => {
      llm.chat.mockResolvedValueOnce(reply('Hello!'));

      await service.chat(SESSION, 'hi');

      expect(store.append).toHaveBeenCalledWith(SESSION, [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'Hello!' },
      ]);
    });
  });

  describe('LLM context', () => {
    it('sends system prompt (dated), stored history, then the new user message', async () => {
      const history = [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
      ];
      store.get.mockReturnValue(history);
      llm.chat.mockResolvedValueOnce(reply('ok'));

      await service.chat(SESSION, 'new question');

      expect(store.get).toHaveBeenCalledWith(SESSION);
      expect(buildSystemPrompt).toHaveBeenCalledWith('2026-10-06');
      expect(llm.chat.mock.calls[0][0]).toEqual([
        { role: 'system', content: 'SYSTEM_PROMPT' },
        ...history,
        { role: 'user', content: 'new question' },
      ]);
    });

    it('builds tools for the session and passes their definitions to the LLM', async () => {
      llm.chat.mockResolvedValueOnce(reply('ok'));

      await service.chat(SESSION, 'hi');

      expect(buildTodoTools).toHaveBeenCalledWith(todos, SESSION);
      expect(llm.chat.mock.calls[0][1]).toEqual([
        listTool.definition,
        addTool.definition,
        deleteTool.definition,
      ]);
    });
  });

  // --------------------------------------------------------------------------
  describe('read-only tool calls', () => {
    it('executes the tool, feeds the result back and returns the next reply', async () => {
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'list_todos', { status: 'open' })]))
        .mockResolvedValueOnce(reply('You have 1 task.'));

      const result = await service.chat(SESSION, 'what are my tasks?');

      expect(listTool.execute).toHaveBeenCalledWith({ status: 'open' });
      expect(llm.chat).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ reply: 'You have 1 task.', action: null });

      const secondCallMessages = llm.chat.mock.calls[1][0];
      expect(secondCallMessages).toContainEqual({
        role: 'tool',
        toolCallId: 'c1',
        toolName: 'list_todos',
        content: JSON.stringify({ ok: true, result: [{ id: '1' }] }),
      });
    });

    it('does not request a "no tools" summary call for reads', async () => {
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'list_todos')]))
        .mockResolvedValueOnce(reply('done'));

      await service.chat(SESSION, 'list');

      for (const [, , options] of llm.chat.mock.calls) {
        expect(options).toBeUndefined();
      }
    });

    it('stores the full turn (assistant tool call + tool result + final reply)', async () => {
      const toolCalls = [call('c1', 'list_todos')];
      llm.chat
        .mockResolvedValueOnce(reply('', toolCalls))
        .mockResolvedValueOnce(reply('You have 1 task.'));

      await service.chat(SESSION, 'list');

      expect(store.append).toHaveBeenCalledWith(SESSION, [
        { role: 'user', content: 'list' },
        { role: 'assistant', content: '', toolCalls },
        {
          role: 'tool',
          toolCallId: 'c1',
          toolName: 'list_todos',
          content: JSON.stringify({ ok: true, result: [{ id: '1' }] }),
        },
        { role: 'assistant', content: 'You have 1 task.' },
      ]);
    });
  });

  describe('mutating tool calls', () => {
    it('executes the write, sets action, and asks for a summary with toolChoice "none"', async () => {
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'add_todo', { title: 'Milk' })]))
        .mockResolvedValueOnce(reply('Added "Milk".'));

      const result = await service.chat(SESSION, 'add milk');

      expect(addTool.execute).toHaveBeenCalledWith({ title: 'Milk' });
      expect(llm.chat).toHaveBeenCalledTimes(2);
      expect(llm.chat.mock.calls[1][2]).toEqual({ toolChoice: 'none' });
      expect(result).toEqual({ reply: 'Added "Milk".', action: 'add_todo' });
    });

    it('falls back to CHANGE_APPLIED_MESSAGE when the summary is empty', async () => {
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'add_todo', { title: 'Milk' })]))
        .mockResolvedValueOnce(reply('  '));

      const result = await service.chat(SESSION, 'add milk');

      expect(result).toEqual({ reply: CHANGE_APPLIED_MESSAGE, action: 'add_todo' });
    });

    it('falls back to CHANGE_APPLIED_MESSAGE when the summary call fails', async () => {
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'add_todo', { title: 'Milk' })]))
        .mockRejectedValueOnce(new Error('network down'));

      const result = await service.chat(SESSION, 'add milk');

      expect(result).toEqual({ reply: CHANGE_APPLIED_MESSAGE, action: 'add_todo' });
      expect(store.append).toHaveBeenCalled(); // the change is still recorded
    });

    it('allows one write alongside read calls in the same response', async () => {
      llm.chat
        .mockResolvedValueOnce(
          reply('', [call('c1', 'list_todos'), call('c2', 'add_todo', { title: 'Milk' })]),
        )
        .mockResolvedValueOnce(reply('Done.'));

      const result = await service.chat(SESSION, 'check and add milk');

      expect(listTool.execute).toHaveBeenCalledTimes(1);
      expect(addTool.execute).toHaveBeenCalledTimes(1);
      expect(result.action).toBe('add_todo');
    });
  });

  describe('one-action-per-message rule', () => {
    it('refuses when the model requests more than one write', async () => {
      llm.chat.mockResolvedValueOnce(
        reply('', [call('c1', 'add_todo', { title: 'A' }), call('c2', 'delete_todo', { id: '1' })]),
      );

      const result = await service.chat(SESSION, 'add A and delete 1');

      expect(result).toEqual({ reply: MULTI_ACTION_MESSAGE, action: null });
      expect(addTool.execute).not.toHaveBeenCalled();
      expect(deleteTool.execute).not.toHaveBeenCalled();
      expect(llm.chat).toHaveBeenCalledTimes(1);
    });

    it('stores only the user message and the refusal for a multi-action request', async () => {
      llm.chat.mockResolvedValueOnce(
        reply('', [call('c1', 'add_todo'), call('c2', 'delete_todo')]),
      );

      await service.chat(SESSION, 'do two things');

      expect(store.append).toHaveBeenCalledWith(SESSION, [
        { role: 'user', content: 'do two things' },
        { role: 'assistant', content: MULTI_ACTION_MESSAGE },
      ]);
    });

    it('refuses two calls to the same write tool', async () => {
      llm.chat.mockResolvedValueOnce(
        reply('', [call('c1', 'add_todo', { title: 'A' }), call('c2', 'add_todo', { title: 'B' })]),
      );

      const result = await service.chat(SESSION, 'add A and B');

      expect(result.reply).toBe(MULTI_ACTION_MESSAGE);
      expect(addTool.execute).not.toHaveBeenCalled();
    });
  });

  describe('tool errors', () => {
    it('reports unknown tools back to the model and keeps going', async () => {
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'make_coffee')]))
        .mockResolvedValueOnce(reply('Sorry, I can\'t do that.'));

      const result = await service.chat(SESSION, 'make coffee');

      expect(llm.chat.mock.calls[1][0]).toContainEqual({
        role: 'tool',
        toolCallId: 'c1',
        toolName: 'make_coffee',
        content: JSON.stringify({ ok: false, error: 'Unknown tool "make_coffee"' }),
      });
      expect(result).toEqual({ reply: "Sorry, I can't do that.", action: null });
    });

    it('passes HttpException messages to the model and does not set action', async () => {
      addTool.execute.mockRejectedValueOnce(new BadRequestException('title is required'));
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'add_todo', {})]))
        .mockResolvedValueOnce(reply('Please give the task a title.'));

      const result = await service.chat(SESSION, 'add something');

      expect(llm.chat.mock.calls[1][0]).toContainEqual({
        role: 'tool',
        toolCallId: 'c1',
        toolName: 'add_todo',
        content: JSON.stringify({ ok: false, error: 'title is required' }),
      });
      expect(result).toEqual({ reply: 'Please give the task a title.', action: null });
      expect(llm.chat).toHaveBeenCalledTimes(2);
      expect(llm.chat.mock.calls[1][2]).toBeUndefined();
    });

    it('hides unexpected error details from the model', async () => {
      listTool.execute.mockRejectedValueOnce(new Error('mongo connection string leaked'));
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'list_todos')]))
        .mockResolvedValueOnce(reply('Something went wrong.'));

      await service.chat(SESSION, 'list');

      const toolMessage = llm.chat.mock.calls[1][0].find((m: any) => m.role === 'tool');
      expect(toolMessage.content).toBe(JSON.stringify({ ok: false, error: 'Unexpected error' }));
      expect(toolMessage.content).not.toContain('mongo');
    });
  });

  describe('iteration limit', () => {
    it('defaults to 5 iterations, then returns the fallback message', async () => {
      llm.chat.mockResolvedValue(reply('', [call('c1', 'list_todos')]));

      const result = await service.chat(SESSION, 'loop forever');

      expect(llm.chat).toHaveBeenCalledTimes(5);
      expect(result).toEqual({ reply: AGENT_FALLBACK_MESSAGE, action: null });
    });

    it('respects AI_MAX_ITERATIONS from config', async () => {
      config.get.mockImplementation((key: string, fallback?: string) =>
        key === 'AI_MAX_ITERATIONS' ? '2' : fallback,
      );
      llm.chat.mockResolvedValue(reply('', [call('c1', 'list_todos')]));

      await service.chat(SESSION, 'loop');

      expect(llm.chat).toHaveBeenCalledTimes(2);
    });
  });

  describe('LLM errors', () => {
    it('marks the AI invalid and throws ServiceUnavailable on LlmAuthError', async () => {
      llm.chat.mockRejectedValueOnce(new LlmAuthError('bad api key'));

      await expect(service.chat(SESSION, 'hi')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(status.markInvalid).toHaveBeenCalledTimes(1);
      expect(store.append).not.toHaveBeenCalled();
    });

    it('rethrows other LLM errors unchanged without marking invalid', async () => {
      const error = new Error('rate limited');
      llm.chat.mockRejectedValueOnce(error);

      await expect(service.chat(SESSION, 'hi')).rejects.toBe(error);
      expect(status.markInvalid).not.toHaveBeenCalled();
      expect(store.append).not.toHaveBeenCalled();
    });

    it('also handles an auth error raised during the summary call as unavailable fallback', async () => {
      llm.chat
        .mockResolvedValueOnce(reply('', [call('c1', 'add_todo', { title: 'Milk' })]))
        .mockRejectedValueOnce(new LlmAuthError('key revoked'));

      const result = await service.chat(SESSION, 'add milk');

      expect(status.markInvalid).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ reply: CHANGE_APPLIED_MESSAGE, action: 'add_todo' });
    });
  });

  describe('reset', () => {
    it('clears the conversation for the session', () => {
      service.reset(SESSION);
      expect(store.clear).toHaveBeenCalledWith(SESSION);
    });
  });
});