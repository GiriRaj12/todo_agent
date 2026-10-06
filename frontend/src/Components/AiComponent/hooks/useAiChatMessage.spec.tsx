// useAIChatMessages.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useAIChatMessages } from './useAiChatMessages';
import { api } from '../../Utils/client';

vi.mock('../../Utils/client', () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);

const GREETING_TEXT =
  'Hi Im your Todo Assistant ! Ask me to add, update, complete or delete one todo at a time.';
const ERROR_TEXT = 'Something went wrong. Please try again.';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useAIChatMessages(), { wrapper });
  return { ...hook, invalidateSpy };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAIChatMessages', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockApi.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe('initial state', () => {
    it('starts with the greeting and not loading', () => {
      const { result } = setup();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages).toEqual([
        { id: 0, role: 'assistant', text: GREETING_TEXT },
      ]);
    });
  });

  describe('sendMessage', () => {
    it('posts the message and appends user + assistant entries', async () => {
      mockApi.mockResolvedValueOnce({ reply: 'Added "Buy milk"', action: null });
      const { result } = setup();

      await act(async () => {
        await result.current.sendMessage('add buy milk');
      });

      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'add buy milk' }),
      });

      expect(result.current.messages).toEqual([
        { id: 0, role: 'assistant', text: GREETING_TEXT },
        { id: 1, role: 'user', text: 'add buy milk' },
        { id: 2, role: 'assistant', text: 'Added "Buy milk"' },
      ]);
      expect(result.current.isLoading).toBe(false);
    });

    it('trims whitespace before sending and displaying', async () => {
      mockApi.mockResolvedValueOnce({ reply: 'ok', action: null });
      const { result } = setup();

      await act(async () => {
        await result.current.sendMessage('   complete laundry   ');
      });

      expect(JSON.parse(mockApi.mock.calls[0][1]!.body as string)).toEqual({
        message: 'complete laundry',
      });
      expect(result.current.messages[1].text).toBe('complete laundry');
    });

    it.each(['', '   ', '\n\t '])('ignores empty input %j', async (input) => {
      const { result } = setup();

      await act(async () => {
        await result.current.sendMessage(input);
      });

      expect(mockApi).not.toHaveBeenCalled();
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.isLoading).toBe(false);
    });

    it('assigns unique, incrementing ids across multiple messages', async () => {
      mockApi.mockResolvedValue({ reply: 'ok', action: null });
      const { result } = setup();

      await act(async () => {
        await result.current.sendMessage('one');
      });
      await act(async () => {
        await result.current.sendMessage('two');
      });

      const ids = result.current.messages.map((m) => m.id);
      expect(ids).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('shows the user message and sets isLoading while the request is pending', async () => {
      const d = deferred<{ reply: string; action: null }>();
      mockApi.mockReturnValueOnce(d.promise);
      const { result } = setup();

      let sendPromise: Promise<void>;
      act(() => {
        sendPromise = result.current.sendMessage('add task');
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1]).toMatchObject({ role: 'user', text: 'add task' });

      await act(async () => {
        d.resolve({ reply: 'done', action: null });
        await sendPromise;
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages[2]).toMatchObject({ role: 'assistant', text: 'done' });
    });

    it('ignores a second send while one is in flight', async () => {
      const d = deferred<{ reply: string; action: null }>();
      mockApi.mockReturnValueOnce(d.promise);
      const { result } = setup();

      let first: Promise<void>;
      act(() => {
        first = result.current.sendMessage('first');
      });

      await act(async () => {
        await result.current.sendMessage('second');
      });

      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(result.current.messages.map((m) => m.text)).not.toContain('second');

      await act(async () => {
        d.resolve({ reply: 'reply to first', action: null });
        await first;
      });
    });

    it('allows sending again after the previous request finishes', async () => {
      mockApi.mockResolvedValue({ reply: 'ok', action: null });
      const { result } = setup();

      await act(async () => {
        await result.current.sendMessage('first');
      });
      await act(async () => {
        await result.current.sendMessage('second');
      });

      expect(mockApi).toHaveBeenCalledTimes(2);
    });
  });

  describe('query invalidation', () => {
    it('invalidates the todos query when the response contains an action', async () => {
      mockApi.mockResolvedValueOnce({
        reply: 'Added',
        action: { type: 'create', title: 'Buy milk' },
      });
      const { result, invalidateSpy } = setup();

      await act(async () => {
        await result.current.sendMessage('add buy milk');
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
    });

    it('does not invalidate when action is null', async () => {
      mockApi.mockResolvedValueOnce({ reply: 'Which todo?', action: null });
      const { result, invalidateSpy } = setup();

      await act(async () => {
        await result.current.sendMessage('update it');
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('still shows the reply if invalidation fails', async () => {
      mockApi.mockResolvedValueOnce({ reply: 'Deleted', action: { type: 'delete' } });
      const { result, invalidateSpy } = setup();
      invalidateSpy.mockRejectedValueOnce(new Error('refetch failed'));

      await act(async () => {
        await result.current.sendMessage('delete laundry');
      });

      expect(result.current.messages[result.current.messages.length - 1]).toMatchObject({
        role: 'assistant',
        text: 'Deleted',
      });
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('error handling', () => {
    it('shows the fallback reply when the API call fails', async () => {
      const error = new Error('network down');
      mockApi.mockRejectedValueOnce(error);
      const { result } = setup();

      await act(async () => {
        await result.current.sendMessage('add task');
      });

      expect(result.current.messages).toEqual([
        { id: 0, role: 'assistant', text: GREETING_TEXT },
        { id: 1, role: 'user', text: 'add task' },
        { id: 2, role: 'assistant', text: ERROR_TEXT },
      ]);
      expect(logSpy).toHaveBeenCalledWith(
        'Something went wrong while posting messages',
        error,
      );
    });

    it('resets loading and in-flight state after a failure so the user can retry', async () => {
      mockApi
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ reply: 'worked', action: null });
      const { result } = setup();

      await act(async () => {
        await result.current.sendMessage('try 1');
      });
      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        await result.current.sendMessage('try 2');
      });

      expect(mockApi).toHaveBeenCalledTimes(2);
      expect(result.current.messages[result.current.messages.length - 1]).toMatchObject({ text: 'worked' });
    });

    it('does not invalidate queries when the request fails', async () => {
      mockApi.mockRejectedValueOnce(new Error('boom'));
      const { result, invalidateSpy } = setup();

      await act(async () => {
        await result.current.sendMessage('add task');
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('isAiEnabled', () => {
    it('returns true when the server reports enabled: true', async () => {
      mockApi.mockResolvedValueOnce({ enabled: true });
      const { result } = setup();

      await expect(result.current.isAiEnabled()).resolves.toBe(true);
      expect(mockApi).toHaveBeenCalledWith('/ai/status');
    });

    it('returns false when the server reports enabled: false', async () => {
      mockApi.mockResolvedValueOnce({ enabled: false });
      const { result } = setup();

      await expect(result.current.isAiEnabled()).resolves.toBe(false);
    });

    it('returns false for truthy non-boolean values (strict === true check)', async () => {
      mockApi.mockResolvedValueOnce({ enabled: 'true' });
      const { result } = setup();

      await expect(result.current.isAiEnabled()).resolves.toBe(false);
    });

    it('returns false when the request throws', async () => {
      mockApi.mockRejectedValueOnce(new Error('503'));
      const { result } = setup();

      await expect(result.current.isAiEnabled()).resolves.toBe(false);
    });
  });

  describe('referential stability', () => {
    it('keeps sendMessage and isAiEnabled stable across re-renders', () => {
      const { result, rerender } = setup();
      const { sendMessage, isAiEnabled } = result.current;

      rerender();

      expect(result.current.sendMessage).toBe(sendMessage);
      expect(result.current.isAiEnabled).toBe(isAiEnabled);
    });
  });
});