// TodoComponent.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TodoComponent from '../TodoComponent';
import { useTodoActions } from '../hooks/useTodoActions';
import type { Todo } from '../hooks/todos';

vi.mock('../hooks/useTodoActions', () => ({ useTodoActions: vi.fn() }));

vi.mock('../TodoFormDialog', () => ({
  default: ({ todo, onClose }: { todo?: Todo; onClose: () => void }) => (
    <div role="dialog" data-testid="todo-dialog">
      <span>{todo ? `Editing: ${todo.title}` : 'Creating new todo'}</span>
      <button onClick={onClose}>Close dialog</button>
    </div>
  ),
}));

const mockUseTodoActions = vi.mocked(useTodoActions);

const TODAY = '2026-06-15';
const YESTERDAY = '2026-06-14';
const TOMORROW = '2026-06-16';
const NEXT_WEEK = '2026-06-22';

const makeTodo = (overrides: Partial<Todo> = {}): Todo =>
  ({
    id: "1",
    title: 'Buy milk',
    description: '',
    isCompleted: false,
    dueDate: null,
    ...overrides,
  }) as Todo;

type HookOverrides = {
  todosQuery?: Record<string, unknown>;
  toggleMutation?: Record<string, unknown>;
  deleteMutation?: Record<string, unknown>;
};

function mockHook(todos: Todo[] = [], overrides: HookOverrides = {}) {
  const todosQuery = {
    data: todos,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
    ...overrides.todosQuery,
  };
  const toggleMutation = {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
    ...overrides.toggleMutation,
  };
  const deleteMutation = {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
    ...overrides.deleteMutation,
  };

  mockUseTodoActions.mockReturnValue({
    todosQuery,
    toggleMutation,
    deleteMutation,
  } as unknown as ReturnType<typeof useTodoActions>);

  return { todosQuery, toggleMutation, deleteMutation };
}

describe('TodoComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
    mockUseTodoActions.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initial render', () => {
    it('renders the heading, create button and filter controls', () => {
      mockHook();
      render(<TodoComponent />);

      expect(screen.getByText('My todos')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create todo/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search by title')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sort order/i })).toBeInTheDocument();
    });

    it('starts with status=all, sortBy=createdAt, order=desc', () => {
      mockHook();
      render(<TodoComponent />);

      expect(mockUseTodoActions).toHaveBeenLastCalledWith({
        status: 'all',
        sortBy: 'createdAt',
        order: 'desc',
      });
    });
  });

  describe('query states', () => {
    it('shows a spinner while loading', () => {
      mockHook([], { todosQuery: { isLoading: true, isSuccess: false, data: undefined } });
      render(<TodoComponent />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByText('No todos found.')).not.toBeInTheDocument();
    });

    it('shows the error message and retries on click', async () => {
      const user = userEvent.setup();
      const { todosQuery } = mockHook([], {
        todosQuery: {
          isError: true,
          isSuccess: false,
          data: undefined,
          error: new Error('Failed to load todos'),
        },
      });
      render(<TodoComponent />);

      expect(screen.getByText('Failed to load todos')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(todosQuery.refetch).toHaveBeenCalledTimes(1);
    });

    it('shows the empty state when there are no todos', () => {
      mockHook([]);
      render(<TodoComponent />);

      expect(screen.getByText('No todos found.')).toBeInTheDocument();
    });

    it('treats undefined data as an empty list', () => {
      mockHook([], { todosQuery: { data: undefined } });
      render(<TodoComponent />);

      expect(screen.getByText('No todos found.')).toBeInTheDocument();
    });

    it('renders a card for each todo with title and description', () => {
      mockHook([
        makeTodo({ id: "1", title: 'Buy milk', description: 'Two litres' }),
        makeTodo({ id: "2", title: 'Walk dog', description: '' }),
      ]);
      render(<TodoComponent />);

      expect(screen.getByText('Buy milk')).toBeInTheDocument();
      expect(screen.getByText('Two litres')).toBeInTheDocument();
      expect(screen.getByText('Walk dog')).toBeInTheDocument();
      expect(screen.queryByText('No todos found.')).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    const todos = [
      makeTodo({ id: "1", title: 'Buy milk' }),
      makeTodo({ id: "2", title: 'Walk dog' }),
      makeTodo({ id: "3", title: 'Milk the cow' }),
    ];

    it('filters todos by title, case-insensitively', async () => {
      const user = userEvent.setup();
      mockHook(todos);
      render(<TodoComponent />);

      await user.type(screen.getByPlaceholderText('Search by title'), 'MILK');

      expect(screen.getByText('Buy milk')).toBeInTheDocument();
      expect(screen.getByText('Milk the cow')).toBeInTheDocument();
      expect(screen.queryByText('Walk dog')).not.toBeInTheDocument();
    });

    it('trims surrounding whitespace in the search term', async () => {
      const user = userEvent.setup();
      mockHook(todos);
      render(<TodoComponent />);

      await user.type(screen.getByPlaceholderText('Search by title'), '  dog  ');

      expect(screen.getByText('Walk dog')).toBeInTheDocument();
      expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
    });

    it('shows the empty state when nothing matches', async () => {
      const user = userEvent.setup();
      mockHook(todos);
      render(<TodoComponent />);

      await user.type(screen.getByPlaceholderText('Search by title'), 'zzz');

      expect(screen.getByText('No todos found.')).toBeInTheDocument();
    });

    it('does not pass the search term to the hook (filtering is client-side)', async () => {
      const user = userEvent.setup();
      mockHook(todos);
      render(<TodoComponent />);

      await user.type(screen.getByPlaceholderText('Search by title'), 'milk');

      expect(mockUseTodoActions).toHaveBeenLastCalledWith({
        status: 'all',
        sortBy: 'createdAt',
        order: 'desc',
      });
    });
  });

  describe('status filter', () => {
    it('lists all status options', async () => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('combobox', { name: 'Status' }));

      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['All', 'Incomplete', 'Completed', 'Overdue']);
    });

    it.each([
      ['Incomplete', 'incomplete'],
      ['Completed', 'completed'],
      ['Overdue', 'overdue'],
    ])('passes status "%s" to the hook', async (label, value) => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('combobox', { name: 'Status' }));
      await user.click(screen.getByRole('option', { name: label }));

      expect(mockUseTodoActions).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: value }),
      );
    });
  });

  describe('sorting', () => {
    it('lists all sort options', async () => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('combobox', { name: 'Sort by' }));

      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['Created', 'Due date', 'Title']);
    });

    it.each([
      ['Due date', 'dueDate'],
      ['Title', 'title'],
    ])('switching to "%s" sets sortBy=%s and order=asc', async (label, value) => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('combobox', { name: 'Sort by' }));
      await user.click(screen.getByRole('option', { name: label }));

      expect(mockUseTodoActions).toHaveBeenLastCalledWith({
        status: 'all',
        sortBy: value,
        order: 'asc',
      });
    });

    it('switching back to Created resets order to desc', async () => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('combobox', { name: 'Sort by' }));
      await user.click(screen.getByRole('option', { name: 'Title' }));
      await user.click(screen.getByRole('combobox', { name: 'Sort by' }));
      await user.click(screen.getByRole('option', { name: 'Created' }));

      expect(mockUseTodoActions).toHaveBeenLastCalledWith({
        status: 'all',
        sortBy: 'createdAt',
        order: 'desc',
      });
    });

    it('toggles the sort order with the arrow button', async () => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('button', { name: /sort order: descending/i }));

      expect(mockUseTodoActions).toHaveBeenLastCalledWith(
        expect.objectContaining({ order: 'asc' }),
      );
      expect(
        screen.getByRole('button', { name: /sort order: ascending/i }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /sort order: ascending/i }));

      expect(mockUseTodoActions).toHaveBeenLastCalledWith(
        expect.objectContaining({ order: 'desc' }),
      );
    });
  });

  describe('due date indicators', () => {
    it('shows no due chip when there is no due date', () => {
      mockHook([makeTodo({ dueDate: null })]);
      render(<TodoComponent />);

      expect(screen.queryByText(/^Due /)).not.toBeInTheDocument();
      expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    });

    it('shows the due date chip for a future todo with no warning', () => {
      mockHook([makeTodo({ dueDate: NEXT_WEEK })]);
      render(<TodoComponent />);

      expect(screen.getByText(`Due ${NEXT_WEEK}`)).toBeInTheDocument();
      expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
      expect(screen.queryByText('Due today')).not.toBeInTheDocument();
      expect(screen.queryByText('Due tomorrow')).not.toBeInTheDocument();
    });

    it('flags past-due incomplete todos as Overdue', () => {
      mockHook([makeTodo({ dueDate: YESTERDAY })]);
      render(<TodoComponent />);

      expect(screen.getByText(`Due ${YESTERDAY}`)).toBeInTheDocument();
      expect(screen.getByText('Overdue')).toBeInTheDocument();
    });

    it('flags todos due today as "Due today"', () => {
      mockHook([makeTodo({ dueDate: TODAY })]);
      render(<TodoComponent />);

      expect(screen.getByText('Due today')).toBeInTheDocument();
      expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    });

    it('flags todos due tomorrow as "Due tomorrow"', () => {
      mockHook([makeTodo({ dueDate: TOMORROW })]);
      render(<TodoComponent />);

      expect(screen.getByText('Due tomorrow')).toBeInTheDocument();
    });

    it('does not flag completed todos, even if past due', () => {
      mockHook([makeTodo({ dueDate: YESTERDAY, isCompleted: true })]);
      render(<TodoComponent />);

      expect(screen.getByText(`Due ${YESTERDAY}`)).toBeInTheDocument();
      expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    });
  });

  describe('completing todos', () => {
    it('shows an unchecked box for incomplete todos and calls toggle on click', async () => {
      const user = userEvent.setup();
      const todo = makeTodo({ id: "5", isCompleted: false });
      const { toggleMutation } = mockHook([todo]);
      render(<TodoComponent />);

      const checkbox = screen.getByRole('checkbox', { name: 'Mark as completed' });
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);

      expect(toggleMutation.mutate).toHaveBeenCalledTimes(1);
      expect(toggleMutation.mutate).toHaveBeenCalledWith(todo);
    });

    it('shows a checked box for completed todos', () => {
      mockHook([makeTodo({ isCompleted: true })]);
      render(<TodoComponent />);

      expect(screen.getByRole('checkbox', { name: 'Mark as not completed' })).toBeChecked();
    });

    it('strikes through the title of completed todos only', () => {
      mockHook([
        makeTodo({ id: "1", title: 'Done thing', isCompleted: true }),
        makeTodo({ id: "2", title: 'Open thing', isCompleted: false }),
      ]);
      render(<TodoComponent />);

      expect(screen.getByText('Done thing')).toHaveStyle('text-decoration: line-through');
      expect(screen.getByText('Open thing')).toHaveStyle('text-decoration: none');
    });

    it('disables checkboxes while a toggle is pending', () => {
      mockHook([makeTodo()], { toggleMutation: { isPending: true } });
      render(<TodoComponent />);

      expect(screen.getByRole('checkbox')).toBeDisabled();
    });
  });

  describe('deleting todos', () => {
    it('asks for confirmation with the todo title', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockHook([makeTodo({ title: 'Buy milk' })]);
      render(<TodoComponent />);

      await user.click(screen.getByRole('button', { name: 'Delete todo' }));

      expect(confirmSpy).toHaveBeenCalledWith('Delete "Buy milk"?');
    });

    it('deletes the todo when confirmed', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const todo = makeTodo({ id: "9" });
      const { deleteMutation } = mockHook([todo]);
      render(<TodoComponent />);

      await user.click(screen.getByRole('button', { name: 'Delete todo' }));

      expect(deleteMutation.mutate).toHaveBeenCalledTimes(1);
      expect(deleteMutation.mutate).toHaveBeenCalledWith(todo);
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { deleteMutation } = mockHook([makeTodo()]);
      render(<TodoComponent />);

      await user.click(screen.getByRole('button', { name: 'Delete todo' }));

      expect(deleteMutation.mutate).not.toHaveBeenCalled();
    });

    it('disables delete buttons while a delete is pending', () => {
      mockHook([makeTodo()], { deleteMutation: { isPending: true } });
      render(<TodoComponent />);

      expect(screen.getByRole('button', { name: 'Delete todo' })).toBeDisabled();
    });
  });

  describe('create / edit dialog', () => {
    it('is closed by default', () => {
      mockHook([makeTodo()]);
      render(<TodoComponent />);

      expect(screen.queryByTestId('todo-dialog')).not.toBeInTheDocument();
    });

    it('opens an empty dialog from the Create todo button', async () => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('button', { name: /create todo/i }));

      const dialog = screen.getByTestId('todo-dialog');
      expect(within(dialog).getByText('Creating new todo')).toBeInTheDocument();
    });

    it('opens the dialog with the selected todo from the Edit button', async () => {
      const user = userEvent.setup();
      mockHook([makeTodo({ id: "1", title: 'Buy milk' })]);
      render(<TodoComponent />);

      await user.click(screen.getByRole('button', { name: 'Edit todo' }));

      expect(screen.getByText('Editing: Buy milk')).toBeInTheDocument();
    });

    it('edits the correct todo when several are listed', async () => {
      const user = userEvent.setup();
      mockHook([
        makeTodo({ id: "1", title: 'First' }),
        makeTodo({ id: "2", title: 'Second' }),
      ]);
      render(<TodoComponent />);

      await user.click(screen.getAllByRole('button', { name: 'Edit todo' })[1]);

      expect(screen.getByText('Editing: Second')).toBeInTheDocument();
    });

    it('closes the dialog when onClose is called', async () => {
      const user = userEvent.setup();
      mockHook();
      render(<TodoComponent />);

      await user.click(screen.getByRole('button', { name: /create todo/i }));
      await user.click(screen.getByRole('button', { name: 'Close dialog' }));

      expect(screen.queryByTestId('todo-dialog')).not.toBeInTheDocument();
    });
  });

  describe('action errors', () => {
    it('does not show an alert when there are no action errors', () => {
      mockHook([makeTodo()]);
      render(<TodoComponent />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the toggle error message', () => {
      mockHook([makeTodo()], { toggleMutation: { error: new Error('Toggle failed') } });
      render(<TodoComponent />);

      expect(screen.getByRole('alert')).toHaveTextContent('Toggle failed');
    });

    it('shows the delete error message', () => {
      mockHook([makeTodo()], { deleteMutation: { error: new Error('Delete failed') } });
      render(<TodoComponent />);

      expect(screen.getByRole('alert')).toHaveTextContent('Delete failed');
    });

    it('prefers the toggle error when both mutations have failed', () => {
      mockHook([makeTodo()], {
        toggleMutation: { error: new Error('Toggle failed') },
        deleteMutation: { error: new Error('Delete failed') },
      });
      render(<TodoComponent />);

      expect(screen.getByRole('alert')).toHaveTextContent('Toggle failed');
      expect(screen.queryByText('Delete failed')).not.toBeInTheDocument();
    });

    it('resets both mutations when the alert is dismissed', async () => {
      const user = userEvent.setup();
      const { toggleMutation, deleteMutation } = mockHook([makeTodo()], {
        toggleMutation: { error: new Error('Toggle failed') },
      });
      render(<TodoComponent />);

      await user.click(within(screen.getByRole('alert')).getByRole('button', { name: /close/i }));

      expect(toggleMutation.reset).toHaveBeenCalledTimes(1);
      expect(deleteMutation.reset).toHaveBeenCalledTimes(1);
    });
  });
});