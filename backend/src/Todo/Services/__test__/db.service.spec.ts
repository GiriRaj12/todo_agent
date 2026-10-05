import { ConfigService } from '@nestjs/config';
import { MongoClient } from 'mongodb';
import { DbService } from '../db.service';

const mockToArray = jest.fn();
const mockSort = jest.fn(() => ({ toArray: mockToArray }));
const mockCollection = {
  createIndex: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(() => ({ sort: mockSort })),
  insertOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
};
const mockCommand = jest.fn();
const mockDb = {
  collection: jest.fn(() => mockCollection),
  command: mockCommand,
};
const mockClient = {
  connect: jest.fn(),
  close: jest.fn(),
  db: jest.fn(() => mockDb),
};

jest.mock('mongodb', () => ({
  MongoClient: jest.fn(() => mockClient),
}));

const baseEnv: Record<string, string> = {
  MONGO_URL: 'mongodb://localhost:27017',
  MONGO_USERNAME: 'user',
  MONGO_PASSWORD: 'pass',
};

function makeConfig(env: Record<string, string> = baseEnv): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (env[key] === undefined) throw new Error(`Missing config: ${key}`);
      return env[key];
    },
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
}

const SESSION = 'session-1';
const BAD_SESSIONS: Array<[string, unknown]> = [
  ['empty string', ''],
  ['whitespace', '   '],
  ['undefined', undefined],
  ['null', null],
  ['number', 42],
];

describe('DbService', () => {
  let service: DbService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSort.mockImplementation(() => ({ toArray: mockToArray }));
    mockCollection.find.mockImplementation(() => ({ sort: mockSort }));
    service = new DbService(makeConfig());
  });

  describe('constructor', () => {
    it('creates the client with url, credentials and default authSource', () => {
      expect(MongoClient).toHaveBeenCalledWith('mongodb://localhost:27017', {
        auth: { username: 'user', password: 'pass' },
        authSource: 'admin',
      });
    });

    it('uses default db name "todos" and the "todos" collection', () => {
      expect(mockClient.db).toHaveBeenCalledWith('todos');
      expect(mockDb.collection).toHaveBeenCalledWith('todos');
    });

    it('respects MONGO_DB_NAME and MONGO_AUTH_SOURCE overrides', () => {
      jest.clearAllMocks();
      new DbService(
        makeConfig({ ...baseEnv, MONGO_DB_NAME: 'custom', MONGO_AUTH_SOURCE: 'auth' }),
      );
      expect(MongoClient).toHaveBeenCalledWith(
        'mongodb://localhost:27017',
        expect.objectContaining({ authSource: 'auth' }),
      );
      expect(mockClient.db).toHaveBeenCalledWith('custom');
    });

    it.each(['MONGO_URL', 'MONGO_USERNAME', 'MONGO_PASSWORD'])(
      'throws when %s is missing',
      (key) => {
        const env = { ...baseEnv };
        delete env[key];
        expect(() => new DbService(makeConfig(env))).toThrow(key);
      },
    );
  });

  describe('lifecycle', () => {
    it('onModuleInit connects, pings and creates indexes', async () => {
      await service.onModuleInit();

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      expect(mockCommand).toHaveBeenCalledWith({ ping: 1 });
      expect(mockCollection.createIndex).toHaveBeenCalledWith({
        session_id: 1,
        deleted_at: 1,
        created_at: -1,
      });
      expect(mockCollection.createIndex).toHaveBeenCalledWith({
        session_id: 1,
        title: 1,
      });
    });

    it('onModuleInit propagates connection failures and skips index creation', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('connect failed'));
      await expect(service.onModuleInit()).rejects.toThrow('connect failed');
      expect(mockCollection.createIndex).not.toHaveBeenCalled();
    });

    it('onModuleInit propagates ping failures', async () => {
      mockCommand.mockRejectedValueOnce(new Error('ping failed'));
      await expect(service.onModuleInit()).rejects.toThrow('ping failed');
    });

    it('onModuleDestroy closes the client', async () => {
      await service.onModuleDestroy();
      expect(mockClient.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('session scoping (all operations)', () => {
    const ops: Array<[string, (s: any) => Promise<unknown>]> = [
      ['getById', (s) => service.getById(s, 'id-1')],
      ['getByTitle', (s) => service.getByTitle(s, 'title')],
      ['getAll', (s) => service.getAll(s)],
      ['createOne', (s) => service.createOne(s, { title: 't' })],
      ['updateOne', (s) => service.updateOne(s, 'id-1', { title: 'x' })],
      ['deleteOne', (s) => service.deleteOne(s, 'id-1')],
    ];

    describe.each(ops)('%s', (_name, run) => {
      it.each(BAD_SESSIONS)('rejects a %s sessionId', async (_label, bad) => {
        await expect(run(bad)).rejects.toThrow('sessionId is required');
      });
    });

    it('never touches the collection when sessionId is invalid', async () => {
      for (const [, run] of ops) {
        await run('').catch(() => undefined);
      }
      expect(mockCollection.findOne).not.toHaveBeenCalled();
      expect(mockCollection.find).not.toHaveBeenCalled();
      expect(mockCollection.insertOne).not.toHaveBeenCalled();
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('filters by _id, session_id and non-deleted', async () => {
      const doc = { _id: 'id-1' };
      mockCollection.findOne.mockResolvedValueOnce(doc);

      await expect(service.getById(SESSION, 'id-1')).resolves.toBe(doc);
      expect(mockCollection.findOne).toHaveBeenCalledWith({
        _id: 'id-1',
        session_id: SESSION,
        deleted_at: null,
      });
    });

    it('returns null when nothing matches', async () => {
      mockCollection.findOne.mockResolvedValueOnce(null);
      await expect(service.getById(SESSION, 'missing')).resolves.toBeNull();
    });
  });

  describe('getByTitle', () => {
    it('uses a case-insensitive collation, scope filter and newest-first sort', async () => {
      const docs = [{ _id: 'a' }, { _id: 'b' }];
      mockToArray.mockResolvedValueOnce(docs);

      await expect(service.getByTitle(SESSION, 'Buy Milk')).resolves.toBe(docs);

      expect(mockCollection.find).toHaveBeenCalledWith(
        { title: 'Buy Milk', session_id: SESSION, deleted_at: null },
        { collation: { locale: 'en', strength: 2 } },
      );
      expect(mockSort).toHaveBeenCalledWith({ created_at: -1 });
    });

    it('returns an empty array when nothing matches', async () => {
      mockToArray.mockResolvedValueOnce([]);
      await expect(service.getByTitle(SESSION, 'nope')).resolves.toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  describe('getAll', () => {
    it('returns only the session\'s non-deleted todos, newest first', async () => {
      const docs = [{ _id: 'a' }];
      mockToArray.mockResolvedValueOnce(docs);

      await expect(service.getAll(SESSION)).resolves.toBe(docs);
      expect(mockCollection.find).toHaveBeenCalledWith({
        session_id: SESSION,
        deleted_at: null,
      });
      expect(mockSort).toHaveBeenCalledWith({ created_at: -1 });
    });
  });

  describe('createOne', () => {
    it('applies defaults for optional fields', async () => {
      const before = Date.now();
      const doc = await service.createOne(SESSION, { title: 'Write tests' });
      const after = Date.now();

      expect(doc).toEqual({
        _id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
        session_id: SESSION,
        title: 'Write tests',
        description: null,
        due_date: null,
        is_completed: false,
        created_at: expect.any(Date),
        deleted_at: null,
      });
      expect(doc.created_at.getTime()).toBeGreaterThanOrEqual(before);
      expect(doc.created_at.getTime()).toBeLessThanOrEqual(after);
    });

    it('stores provided description and due_date', async () => {
      const doc = await service.createOne(SESSION, {
        title: 'Pay rent',
        description: 'Before the 1st',
        due_date: '2026-11-01',
      });
      expect(doc.description).toBe('Before the 1st');
      expect(doc.due_date).toBe('2026-11-01');
    });

    it('persists the same document it returns', async () => {
      const doc = await service.createOne(SESSION, { title: 'x' });
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
      expect(mockCollection.insertOne).toHaveBeenCalledWith(doc);
    });

    it('generates a unique _id per todo', async () => {
      const a = await service.createOne(SESSION, { title: 'a' });
      const b = await service.createOne(SESSION, { title: 'b' });
      expect(a._id).not.toBe(b._id);
    });

    it('propagates insert failures', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('insert failed'));
      await expect(service.createOne(SESSION, { title: 'x' })).rejects.toThrow(
        'insert failed',
      );
    });
  });

  describe('updateOne', () => {
    it('sets only the provided fields and returns the updated doc', async () => {
      const updated = { _id: 'id-1', title: 'New' };
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(updated);

      await expect(
        service.updateOne(SESSION, 'id-1', { title: 'New' }),
      ).resolves.toBe(updated);

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'id-1', session_id: SESSION, deleted_at: null },
        { $set: { title: 'New' } },
        { returnDocument: 'after' },
      );
    });

    it('supports updating every allowed field at once', async () => {
      await service.updateOne(SESSION, 'id-1', {
        title: 't',
        description: 'd',
        due_date: '2026-12-31',
        is_completed: true,
      });
      expect(mockCollection.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $set: {
          title: 't',
          description: 'd',
          due_date: '2026-12-31',
          is_completed: true,
        },
      });
    });

    it('allows is_completed: false (falsy but defined)', async () => {
      await service.updateOne(SESSION, 'id-1', { is_completed: false });
      expect(mockCollection.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $set: { is_completed: false },
      });
    });

    it('allows clearing description and due_date with null', async () => {
      await service.updateOne(SESSION, 'id-1', {
        description: null,
        due_date: null,
      });
      expect(mockCollection.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $set: { description: null, due_date: null },
      });
    });

    it('ignores fields that are undefined', async () => {
      await service.updateOne(SESSION, 'id-1', {
        title: 'only',
        description: undefined,
      });
      expect(mockCollection.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $set: { title: 'only' },
      });
    });

    it('does not let callers overwrite protected fields', async () => {
      await service.updateOne(SESSION, 'id-1', {
        title: 'x',
        session_id: 'other',
        deleted_at: new Date(),
        _id: 'hijack',
      } as any);
      expect(mockCollection.findOneAndUpdate.mock.calls[0][1]).toEqual({
        $set: { title: 'x' },
      });
    });

    it.each([
      ['an empty object', {}],
      ['only undefined values', { title: undefined }],
      ['only unknown keys', { foo: 'bar' }],
    ])('throws when given %s', async (_label, updates) => {
      await expect(
        service.updateOne(SESSION, 'id-1', updates as any),
      ).rejects.toThrow(/at least one of/);
      expect(mockCollection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('returns null when the todo is missing, deleted or in another session', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
      await expect(
        service.updateOne(SESSION, 'missing', { title: 'x' }),
      ).resolves.toBeNull();
    });
  });

  describe('deleteOne (soft delete)', () => {
    it('sets deleted_at and returns true when a document was modified', async () => {
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

      await expect(service.deleteOne(SESSION, 'id-1')).resolves.toBe(true);

      const [filter, update] = mockCollection.updateOne.mock.calls[0];
      expect(filter).toEqual({
        _id: 'id-1',
        session_id: SESSION,
        deleted_at: null,
      });
      expect(update.$set.deleted_at).toBeInstanceOf(Date);
    });

    it('never hard-deletes', async () => {
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
      await service.deleteOne(SESSION, 'id-1');
      expect((mockCollection as any).deleteOne).toBeUndefined();
    });

    it('returns false when not found, already deleted, or owned by another session', async () => {
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
      await expect(service.deleteOne(SESSION, 'id-1')).resolves.toBe(false);
    });

    it('filters on deleted_at: null so a second delete is a no-op', async () => {
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });

      await expect(service.deleteOne(SESSION, 'id-1')).resolves.toBe(true);
      await expect(service.deleteOne(SESSION, 'id-1')).resolves.toBe(false);

      for (const [filter] of mockCollection.updateOne.mock.calls) {
        expect(filter.deleted_at).toBeNull();
      }
    });
  });
});