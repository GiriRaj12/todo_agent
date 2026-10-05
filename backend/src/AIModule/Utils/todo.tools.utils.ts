import { BadRequestException } from '@nestjs/common';
import type {
  CreateTodoParams,
  ListTodosOptions,
  SortOrder,
  TodoSortBy,
  TodoStatusFilter,
  TodosService,
  UpdateTodoParams,
} from '../../Todo/Services/todoapp.service'
import type { ToolDefinition } from '../Utils/llm.clients.utils'

type Args = Record<string, unknown>;

export interface AgentTool {
  definition: ToolDefinition;
  mutates: boolean;
  execute(args: Args): Promise<unknown>;
}

const STATUSES: readonly TodoStatusFilter[] = ['all', 'completed', 'incomplete', 'overdue'];
const SORT_FIELDS: readonly TodoSortBy[] = ['createdAt', 'dueDate', 'title'];
const ORDERS: readonly SortOrder[] = ['asc', 'desc'];
const MAX_LIST_RESULTS = 50;

export function buildTodoTools(todos: TodosService, sessionId: string): AgentTool[] {
  return [
    {
      mutates: true,
      definition: {
        name: 'create_todo',
        description: 'Create ONE new todo.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title of the task' },
            description: { type: 'string', description: 'Optional longer description' },
            dueDate: { type: 'string', description: 'Optional due date as YYYY-MM-DD' },
          },
          required: ['title'],
        },
      },
      execute: (args) => {
        const params: CreateTodoParams = { title: requireString(args, 'title') };
        if (args.description !== undefined) params.description = nullableString(args, 'description');
        if (args.dueDate !== undefined) params.dueDate = nullableString(args, 'dueDate');
        return todos.create(sessionId, params);
      },
    },
    {
      mutates: false,
      definition: {
        name: 'list_todos',
        description:
          'List the todos, optionally filtered by status and sorted. Use it to answer questions about the todo list.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: [...STATUSES], description: 'Filter (default all)' },
            sortBy: { type: 'string', enum: [...SORT_FIELDS] },
            order: { type: 'string', enum: [...ORDERS] },
          },
        },
      },
      execute: async (args) => {
        const options: ListTodosOptions = {};
        const status = optionalEnum(args, 'status', STATUSES);
        const sortBy = optionalEnum(args, 'sortBy', SORT_FIELDS);
        const order = optionalEnum(args, 'order', ORDERS);
        if (status) options.status = status;
        if (sortBy) options.sortBy = sortBy;
        if (order) options.order = order;

        const all = await todos.list(sessionId, options);
        return {
          count: all.length,
          todos: all.slice(0, MAX_LIST_RESULTS),
          truncated: all.length > MAX_LIST_RESULTS,
        };
      },
    },
    {
      mutates: false,
      definition: {
        name: 'get_todo',
        description: 'Get the details of one todo by its id.',
        parameters: idSchema(),
      },
      execute: (args) => todos.get(sessionId, requireString(args, 'id')),
    },
    {
      mutates: false,
      definition: {
        name: 'find_todos_by_title',
        description:
          'Find todos whose title matches exactly (case-insensitive). Use it to get the id of a todo the user refers to by name.',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
      execute: (args) => todos.findByTitle(sessionId, requireString(args, 'title')),
    },
    {
      mutates: true,
      definition: {
        name: 'update_todo',
        description:
          'Change the title, description and/or due date of ONE todo. Omit fields that should stay the same; use null to clear description or dueDate.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            dueDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
          },
          required: ['id'],
        },
      },
      execute: (args) => {
        const params: UpdateTodoParams = {};
        if (args.title !== undefined) params.title = requireString(args, 'title');
        if (args.description !== undefined) params.description = nullableString(args, 'description');
        if (args.dueDate !== undefined) params.dueDate = nullableString(args, 'dueDate');
        return todos.update(sessionId, requireString(args, 'id'), params);
      },
    },
    {
      mutates: true,
      definition: {
        name: 'complete_todo',
        description: 'Mark ONE todo as completed.',
        parameters: idSchema(),
      },
      execute: (args) => todos.complete(sessionId, requireString(args, 'id')),
    },
    {
      mutates: true,
      definition: {
        name: 'incomplete_todo',
        description: 'Mark ONE todo as not completed (reopen it).',
        parameters: idSchema(),
      },
      execute: (args) => todos.incomplete(sessionId, requireString(args, 'id')),
    },
    {
      mutates: true,
      definition: {
        name: 'delete_todo',
        description: 'Delete ONE todo.',
        parameters: idSchema(),
      },
      execute: async (args) => {
        const id = requireString(args, 'id');
        await todos.delete(sessionId, id);
        return { deleted: true, id };
      },
    },
  ];
}

function idSchema(): ToolDefinition['parameters'] {
  return {
    type: 'object',
    properties: { id: { type: 'string', description: 'The todo id' } },
    required: ['id'],
  };
}

function requireString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`"${key}" is required and must be a non-empty string`);
  }
  return value;
}

function nullableString(args: Args, key: string): string | null {
  const value = args[key];
  if (value === null || typeof value === 'string') return value;
  throw new BadRequestException(`"${key}" must be a string or null`);
}

function optionalEnum<T extends string>(args: Args, key: string, allowed: readonly T[]): T | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new BadRequestException(`"${key}" must be one of: ${allowed.join(', ')}`);
}