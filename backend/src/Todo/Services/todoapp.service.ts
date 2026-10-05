import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../Utils/clock.utils';
import {
  CreateTodoInput as DbCreateInput,
  DbService,
  TodoDocument,
  UpdateTodoInput as DbUpdateInput,
} from './db.service'
import { Todo } from '../Utils/todo.entity';


const todoNotFound = (id: string) => new NotFoundException(`Todo "${id}" was not found`);
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;

export interface CreateTodoParams {
  title: string;
  description?: string | null;
  dueDate?: string | null;
}

export interface UpdateTodoParams {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
}

export type TodoStatusFilter = 'all' | 'completed' | 'incomplete' | 'overdue';
export type TodoSortBy = 'createdAt' | 'dueDate' | 'title';
export type SortOrder = 'asc' | 'desc';

export interface ListTodosOptions {
  status?: TodoStatusFilter;
  sortBy?: TodoSortBy;
  order?: SortOrder;
}

@Injectable()
export class TodosService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  async create(sessionId: string, params: CreateTodoParams): Promise<Todo> {
    const input: DbCreateInput = { title: this.normalizeTitle(params.title) };

    const description = this.normalizeDescription(params.description);
    if (description) input.description = description;

    const dueDate = this.normalizeDueDate(params.dueDate);
    if (dueDate) input.due_date = dueDate;

    return toTodo(await this.db.createOne(sessionId, input));
  }

  async list(sessionId: string, options: ListTodosOptions = {}): Promise<Todo[]> {
    const { status = 'all', sortBy = 'createdAt' } = options;
    const order = options.order ?? (sortBy === 'createdAt' ? 'desc' : 'asc');

    const todos = (await this.db.getAll(sessionId)).map(toTodo);
    return this.sort(todos.filter((t) => this.matches(t, status)), sortBy, order);
  }

  async get(sessionId: string, id: string): Promise<Todo> {
    const doc = await this.db.getById(sessionId, id);
    if (!doc) throw todoNotFound(id);
    return toTodo(doc);
  }

  async findByTitle(sessionId: string, title: string): Promise<Todo[]> {
    const docs = await this.db.getByTitle(sessionId, this.normalizeTitle(title));
    return docs.map(toTodo);
  }

  async update(sessionId: string, id: string, params: UpdateTodoParams): Promise<Todo> {
    const patch: DbUpdateInput = {};
    if (params.title !== undefined) patch.title = this.normalizeTitle(params.title);
    if (params.description !== undefined) {
      patch.description = this.normalizeDescription(params.description);
    }
    if (params.dueDate !== undefined) patch.due_date = this.normalizeDueDate(params.dueDate);

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(
        'Provide at least one of: title, description, dueDate',
      );
    }
    return this.applyPatch(sessionId, id, patch);
  }

  complete(sessionId: string, id: string): Promise<Todo> {
    return this.applyPatch(sessionId, id, { is_completed: true });
  }

  incomplete(sessionId: string, id: string): Promise<Todo> {
    return this.applyPatch(sessionId, id, { is_completed: false });
  }

  async delete(sessionId: string, id: string): Promise<void> {
    const deleted = await this.db.deleteOne(sessionId, id);
    if (!deleted) throw todoNotFound(id);
  }


  private async applyPatch(sessionId: string, id: string, patch: DbUpdateInput): Promise<Todo> {
    const doc = await this.db.updateOne(sessionId, id, patch);
    if (!doc) throw todoNotFound(id);
    return toTodo(doc);
  }

  private matches(todo: Todo, status: TodoStatusFilter): boolean {
    switch (status) {
      case 'completed':
        return todo.isCompleted;
      case 'incomplete':
        return !todo.isCompleted;
      case 'overdue':
        return (
          !todo.isCompleted &&
          todo.dueDate !== null &&
          todo.dueDate < this.clock.today()
        );
      default:
        return true;
    }
  }

  private sort(todos: Todo[], sortBy: TodoSortBy, order: SortOrder): Todo[] {
    const dir = order === 'asc' ? 1 : -1;
    return [...todos].sort((a, b) => {
      if (sortBy === 'dueDate') {
        if (a.dueDate === b.dueDate) return 0;
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate < b.dueDate ? -dir : dir;
      }
      const av = sortBy === 'title' ? a.title.toLowerCase() : a.createdAt;
      const bv = sortBy === 'title' ? b.title.toLowerCase() : b.createdAt;
      return av === bv ? 0 : av < bv ? -dir : dir;
    });
  }

  private normalizeTitle(title: unknown): string {
    if (typeof title !== 'string' || title.trim() === '') {
      throw new BadRequestException('title is required');
    }
    const trimmed = title.trim();
    if (trimmed.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException(`title must be at most ${MAX_TITLE_LENGTH} characters`);
    }
    return trimmed;
  }

  private normalizeDescription(description: unknown): string | null {
    if (description === undefined || description === null) return null;
    if (typeof description !== 'string') {
      throw new BadRequestException('description must be a string');
    }
    const trimmed = description.trim();
    if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
      throw new BadRequestException(
        `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      );
    }
    return trimmed === '' ? null : trimmed;
  }

  private normalizeDueDate(dueDate: unknown): string | null {
    if (dueDate === undefined || dueDate === null) return null;
    if (typeof dueDate !== 'string' || !isRealCalendarDate(dueDate)) {
      throw new BadRequestException('dueDate must be a real calendar date in YYYY-MM-DD format');
    }
    return dueDate;
  }
}

function toTodo(doc: TodoDocument): Todo {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    dueDate: doc.due_date,
    isCompleted: doc.is_completed,
    createdAt: doc.created_at.toISOString(),
  };
}

function isRealCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}