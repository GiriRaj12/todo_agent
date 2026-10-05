import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Collection, Filter, MongoClient } from 'mongodb';

export interface TodoDocument {
  _id: string;
  session_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_at: Date;
  deleted_at: Date | null;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  due_date?: string;
}

export type UpdateTodoInput = Partial<
  Pick<TodoDocument, 'title' | 'description' | 'due_date' | 'is_completed'>
>;

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly client: MongoClient;
  private readonly todos: Collection<TodoDocument>;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('MONGO_URL');
    const username = config.getOrThrow<string>('MONGO_USERNAME');
    const password = config.getOrThrow<string>('MONGO_PASSWORD');
    const dbName = config.get<string>('MONGO_DB_NAME', 'todos');
    const authSource = config.get<string>('MONGO_AUTH_SOURCE', 'admin');

    this.client = new MongoClient(url, {
      auth: { username, password },
      authSource,
    });
    this.todos = this.client.db(dbName).collection<TodoDocument>('todos');
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    await this.client.db().command({ ping: 1 });
    await this.todos.createIndex({ session_id: 1, deleted_at: 1, created_at: -1 });
    await this.todos.createIndex({ session_id: 1, title: 1 });
    this.logger.log('Connected to MongoDB');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  private scope(sessionId: string, extra: Filter<TodoDocument> = {}): Filter<TodoDocument> {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      throw new Error('sessionId is required');
    }
    return { ...extra, session_id: sessionId, deleted_at: null };
  }

  async getById(sessionId: string, id: string): Promise<TodoDocument | null> {
    return this.todos.findOne(this.scope(sessionId, { _id: id }));
  }

  async getByTitle(sessionId: string, title: string): Promise<TodoDocument[]> {
    return this.todos
      .find(this.scope(sessionId, { title }), {
        collation: { locale: 'en', strength: 2 },
      })
      .sort({ created_at: -1 })
      .toArray();
  }

  async getAll(sessionId: string): Promise<TodoDocument[]> {
    return this.todos
      .find(this.scope(sessionId))
      .sort({ created_at: -1 })
      .toArray();
  }

  async createOne(sessionId: string, input: CreateTodoInput): Promise<TodoDocument> {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      throw new Error('sessionId is required');
    }
    const doc: TodoDocument = {
      _id: randomUUID(),
      session_id: sessionId,
      title: input.title,
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      is_completed: false,
      created_at: new Date(),
      deleted_at: null,
    };
    await this.todos.insertOne(doc);
    return doc;
  }

  async updateOne(
    sessionId: string,
    id: string,
    updates: UpdateTodoInput,
  ): Promise<TodoDocument | null> {
    const $set: Partial<TodoDocument> = {};
    if (updates.title !== undefined) $set.title = updates.title;
    if (updates.description !== undefined) $set.description = updates.description;
    if (updates.due_date !== undefined) $set.due_date = updates.due_date;
    if (updates.is_completed !== undefined) $set.is_completed = updates.is_completed;

    if (Object.keys($set).length === 0) {
      throw new Error(
        'updateOne requires at least one of: title, description, due_date, is_completed',
      );
    }

    return this.todos.findOneAndUpdate(
      this.scope(sessionId, { _id: id }),
      { $set },
      { returnDocument: 'after' },
    );
  }

  /** Soft delete: sets deleted_at. Returns false if not found, already deleted, or other session. */
  async deleteOne(sessionId: string, id: string): Promise<boolean> {
    const result = await this.todos.updateOne(
      this.scope(sessionId, { _id: id }),
      { $set: { deleted_at: new Date() } },
    );
    return result.modifiedCount === 1;
  }
}