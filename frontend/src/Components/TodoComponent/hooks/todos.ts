import { api } from '../../Utils/client';

export type TodoStatusFilter = 'all' | 'completed' | 'incomplete' | 'overdue';
export type TodoSortBy = 'createdAt' | 'dueDate' | 'title';
export type SortOrder = 'asc' | 'desc';

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  createdAt: string;
}

export interface TodoPayload {
  title: string;
  description?: string | null;
  dueDate?: string | null;
}

export interface ListTodosParams {
  status: TodoStatusFilter;
  sortBy: TodoSortBy;
  order: SortOrder;
}

export const listTodos = (params: ListTodosParams) =>
  api<Todo[]>(`/todos?${new URLSearchParams({ ...params })}`);

export const createTodo = (payload: TodoPayload) =>
  api<Todo>('/todos', { method: 'POST', body: JSON.stringify(payload) });

export const updateTodo = (id: string, payload: TodoPayload) =>
  api<Todo>(`/todos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const setCompleted = (id: string, completed: boolean) =>
  api<Todo>(`/todos/${id}/${completed ? 'complete' : 'incomplete'}`, { method: 'PATCH' });

export const deleteTodo = (id: string) => api<void>(`/todos/${id}`, { method: 'DELETE' });
