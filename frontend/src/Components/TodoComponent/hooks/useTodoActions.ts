import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  deleteTodo,
  listTodos,
  setCompleted,
  SortOrder,
  Todo,
  TodoSortBy,
  TodoStatusFilter,
} from './todos';

type UseTodoActionsParams = {
  status: TodoStatusFilter;
  sortBy: TodoSortBy;
  order: SortOrder;
};

export function useTodoActions({
  status,
  sortBy,
  order,
}: UseTodoActionsParams) {
  const queryClient = useQueryClient();

  const todosQuery = useQuery({
    queryKey: ['todos', { status, sortBy, order }],
    queryFn: () => listTodos({ status, sortBy, order }),
    placeholderData: keepPreviousData,
  });

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['todos'],
    });

  const toggleMutation = useMutation({
    mutationFn: (todo: Todo) =>
      setCompleted(todo.id, !todo.isCompleted),
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: (todo: Todo) => deleteTodo(todo.id),
    onSuccess: refresh,
  });

  return {
    todosQuery,
    toggleMutation,
    deleteMutation,
  };
}