// useTodoActions.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useTodoActions } from '../useTodoActions';
import { deleteTodo, listTodos, setCompleted, type Todo } from '../todos';

vi.mock('../todos', () => ({
  listTodos: vi.fn(),
  setCompleted: vi.fn(),
  deleteTodo: vi.fn(),
}));

const mockList = vi.mocked(listTodos);
const mockSetCompleted = vi.mocked(setCompleted);
const mockDelete = vi.mocked(deleteTodo);

type Params = Parameters<typeof useTodoActions>[0];

const DEFAULT_PARAMS = {
  status: 'all',
  sortBy: 'createdAt',
  order: 'asc',
} as unknown as Params;

const makeTodo = (overrides: Partial<Todo> = {}): Todo =>
  ({
    id: "1",
    title: 'Buy milk',
    isCompleted: false,
    ...overrides,
  }) as Todo;

function setup(initialParams: Params = DEFAULT_PARAMS) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const hook = renderHook((params: Params) => useTodoActions(params), {
    wrapper,
    initialProps: initialParams,
  });

  return { ...hook, queryClient, invalidateSpy };
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

describe('useTodoActions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockList.mockResolvedValue([]);
    mockSetCompleted.mockResolvedValue(undefined as never);
    mockDelete.mockResolvedValue(undefined as never);
  });

  describe('todosQuery', () => {
    it('fetches todos with the given status, sortBy and order', async () => {
      const todos = [makeTodo({ id: "1" }), makeTodo({ id: "2" })];
      mockList.mockResolvedValueOnce(todos);

      const { result } = setup();

      await waitFor(() => expect(result.current.todosQuery.isSuccess).toBe(true));

      expect(mockList).toHaveBeenCalledTimes(1);
      expect(mockList).toHaveBeenCalledWith(DEFAULT_PARAMS);
      expect(result.current.todosQuery.data).toEqual(todos);
    });

    it('is loading before the first response arrives', async () => {
      const d = deferred<Todo[]>();
      mockList.mockReturnValueOnce(d.promise);

      const { result } = setup();

      expect(result.current.todosQuery.isPending).toBe(true);
      expect(result.current.todosQuery.data).toBeUndefined();

      await act(async () => {
        d.resolve([]);
      });
      await waitFor(() => expect(result.current.todosQuery.isSuccess).toBe(true));
    });

    it('exposes the error when the fetch fails', async () => {
      const error = new Error('server down');
      mockList.mockRejectedValueOnce(error);

      const { result } = setup();

      await waitFor(() => expect(result.current.todosQuery.isError).toBe(true));
      expect(result.current.todosQuery.error).toBe(error);
    });

    it('caches under the key ["todos", { status, sortBy, order }]', async () => {
      const { result, queryClient } = setup();

      await waitFor(() => expect(result.current.todosQuery.isSuccess).toBe(true));

      const { status, sortBy, order } = DEFAULT_PARAMS;
      expect(
        queryClient.getQueryData(['todos', { status, sortBy, order }]),
      ).toBeDefined();
    });

    it('refetches when the params change', async () => {
      const { result, rerender } = setup();
      await waitFor(() => expect(result.current.todosQuery.isSuccess).toBe(true));

      const newParams = {
        ...DEFAULT_PARAMS,
        order: 'desc',
      } as unknown as Params;
      rerender(newParams);

      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
      expect(mockList).toHaveBeenLastCalledWith(newParams);
    });

    it('keeps showing the previous data while new params load (keepPreviousData)', async () => {
      const first = [makeTodo({ id: "1", title: 'old list' })];
      const second = [makeTodo({ id: "2", title: 'new list' })];
      const d = deferred<Todo[]>();

      mockList.mockResolvedValueOnce(first).mockReturnValueOnce(d.promise);

      const { result, rerender } = setup();
      await waitFor(() => expect(result.current.todosQuery.data).toEqual(first));

      rerender({ ...DEFAULT_PARAMS, order: 'desc' } as unknown as Params);

      await waitFor(() => expect(result.current.todosQuery.isFetching).toBe(true));
      expect(result.current.todosQuery.data).toEqual(first);
      expect(result.current.todosQuery.isPlaceholderData).toBe(true);

      await act(async () => {
        d.resolve(second);
      });

      await waitFor(() => expect(result.current.todosQuery.data).toEqual(second));
      expect(result.current.todosQuery.isPlaceholderData).toBe(false);
    });
  });

  describe('toggleMutation', () => {
    it('marks an incomplete todo as completed', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.toggleMutation.mutateAsync(
          makeTodo({ id: "7", isCompleted: false }),
        );
      });

      expect(mockSetCompleted).toHaveBeenCalledTimes(1);
      expect(mockSetCompleted).toHaveBeenCalledWith("7", true);
    });

    it('marks a completed todo as incomplete', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.toggleMutation.mutateAsync(
          makeTodo({ id: "7", isCompleted: true }),
        );
      });

      expect(mockSetCompleted).toHaveBeenCalledWith("7", false);
    });

    it('invalidates the todos queries on success', async () => {
      const { result, invalidateSpy } = setup();

      await act(async () => {
        await result.current.toggleMutation.mutateAsync(makeTodo());
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
    });

    it('refetches the list after a successful toggle', async () => {
      const { result } = setup();
      await waitFor(() => expect(result.current.todosQuery.isSuccess).toBe(true));
      expect(mockList).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.toggleMutation.mutateAsync(makeTodo());
      });

      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    });

    it('does not invalidate and exposes the error when the request fails', async () => {
      const error = new Error('update failed');
      mockSetCompleted.mockRejectedValueOnce(error);
      const { result, invalidateSpy } = setup();

      await act(async () => {
        await expect(
          result.current.toggleMutation.mutateAsync(makeTodo()),
        ).rejects.toThrow('update failed');
      });

      await waitFor(() => expect(result.current.toggleMutation.isError).toBe(true));
      expect(result.current.toggleMutation.error).toBe(error);
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('reports pending state while the request is in flight', async () => {
      const d = deferred<never>();
      mockSetCompleted.mockReturnValueOnce(d.promise);
      const { result } = setup();

      act(() => {
        result.current.toggleMutation.mutate(makeTodo());
      });

      await waitFor(() => expect(result.current.toggleMutation.isPending).toBe(true));

      await act(async () => {
        d.resolve(undefined as never);
      });

      await waitFor(() => expect(result.current.toggleMutation.isSuccess).toBe(true));
    });
  });

  describe('deleteMutation', () => {
    it('deletes the todo by id', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.deleteMutation.mutateAsync(makeTodo({ id: "42" }));
      });

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledWith("42");
    });

    it('invalidates the todos queries on success', async () => {
      const { result, invalidateSpy } = setup();

      await act(async () => {
        await result.current.deleteMutation.mutateAsync(makeTodo());
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
    });

    it('does not invalidate and exposes the error when the request fails', async () => {
      const error = new Error('delete failed');
      mockDelete.mockRejectedValueOnce(error);
      const { result, invalidateSpy } = setup();

      await act(async () => {
        await expect(
          result.current.deleteMutation.mutateAsync(makeTodo()),
        ).rejects.toThrow('delete failed');
      });

      await waitFor(() => expect(result.current.deleteMutation.isError).toBe(true));
      expect(result.current.deleteMutation.error).toBe(error);
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('invalidation scope', () => {
    it('invalidates every cached todos query, regardless of filter params', async () => {
      const { result, queryClient } = setup();
      await waitFor(() => expect(result.current.todosQuery.isSuccess).toBe(true));

      // Seed a query for a different filter combination
      queryClient.setQueryData(
        ['todos', { status: 'completed', sortBy: 'title', order: 'desc' }],
        [makeTodo({ id: "99" })],
      );

      await act(async () => {
        await result.current.toggleMutation.mutateAsync(makeTodo());
      });

      const other = queryClient.getQueryState([
        'todos',
        { status: 'completed', sortBy: 'title', order: 'desc' },
      ]);
      expect(other?.isInvalidated).toBe(true);
    });
  });
});