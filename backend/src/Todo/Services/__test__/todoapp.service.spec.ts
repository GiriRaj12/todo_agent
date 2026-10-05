import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  TodosService,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from '../todoapp.service';
import { DbService, TodoDocument } from '../db.service';
import { Clock } from '../../Utils/clock.utils';

describe('TodosService', () => {
  let service: TodosService;
  let dbService: jest.Mocked<DbService>;
  let clock: jest.Mocked<Clock>;

  const mockSessionId = 'session-123';

  const mockDoc: TodoDocument = {
    _id: 'todo-1',
    title: 'Test Todo',
    description: 'Test Description',
    due_date: '2026-10-10',
    is_completed: false,
    created_at: new Date('2026-10-01T10:00:00.000Z'),
  } as TodoDocument;

  const expectedTodo = {
    id: 'todo-1',
    title: 'Test Todo',
    description: 'Test Description',
    dueDate: '2026-10-10',
    isCompleted: false,
    createdAt: '2026-10-01T10:00:00.000Z',
  };

  beforeEach(async () => {
    const dbMock = {
      createOne: jest.fn(),
      getAll: jest.fn(),
      getById: jest.fn(),
      getByTitle: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
    };

    const clockMock = {
      today: jest.fn().mockReturnValue('2026-10-05'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TodosService,
        { provide: DbService, useValue: dbMock },
        { provide: Clock, useValue: clockMock },
      ],
    }).compile();

    service = module.get<TodosService>(TodosService);
    dbService = module.get(DbService);
    clock = module.get(Clock);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================
  // CREATE
  // ==========================================
  describe('create', () => {
    it('should create a todo successfully with valid inputs', async () => {
      dbService.createOne.mockResolvedValue(mockDoc);

      const result = await service.create(mockSessionId, {
        title: '  Test Todo  ',
        description: '  Test Description  ',
        dueDate: '2026-10-10',
      });

      expect(dbService.createOne).toHaveBeenCalledWith(mockSessionId, {
        title: 'Test Todo',
        description: 'Test Description',
        due_date: '2026-10-10',
      });
      expect(result).toEqual(expectedTodo);
    });

    it('should throw BadRequestException if title is missing or empty', async () => {
      await expect(
        service.create(mockSessionId, { title: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if title exceeds MAX_TITLE_LENGTH', async () => {
      const longTitle = 'a'.repeat(MAX_TITLE_LENGTH + 1);
      await expect(
        service.create(mockSessionId, { title: longTitle }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if description is not a string', async () => {
      await expect(
        service.create(mockSessionId, {
          title: 'Valid Title',
          description: 123 as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if description exceeds MAX_DESCRIPTION_LENGTH', async () => {
      const longDesc = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1);
      await expect(
        service.create(mockSessionId, {
          title: 'Valid Title',
          description: longDesc,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if dueDate is invalid or non-existent calendar date', async () => {
      await expect(
        service.create(mockSessionId, {
          title: 'Valid Title',
          dueDate: '2026-02-30', // Invalid Feb 30th
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(mockSessionId, {
          title: 'Valid Title',
          dueDate: 'invalid-date',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('get', () => {
    it('should return a todo if found', async () => {
      dbService.getById.mockResolvedValue(mockDoc);

      const result = await service.get(mockSessionId, 'todo-1');
      expect(result).toEqual(expectedTodo);
      expect(dbService.getById).toHaveBeenCalledWith(mockSessionId, 'todo-1');
    });

    it('should throw NotFoundException if todo does not exist', async () => {
      dbService.getById.mockResolvedValue(null);

      await expect(service.get(mockSessionId, 'todo-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByTitle', () => {
    it('should return mapped todos matching title', async () => {
      dbService.getByTitle.mockResolvedValue([mockDoc]);

      const result = await service.findByTitle(mockSessionId, ' Test Todo ');
      expect(dbService.getByTitle).toHaveBeenCalledWith(mockSessionId, 'Test Todo');
      expect(result).toEqual([expectedTodo]);
    });
  });

  describe('list', () => {
    const docs: TodoDocument[] = [
      {
        _id: '1',
        title: 'B Todo',
        description: null,
        due_date: '2026-10-01',
        is_completed: false,
        created_at: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        _id: '2',
        title: 'A Todo',
        description: null,
        due_date: '2026-10-10',
        is_completed: true,
        created_at: new Date('2026-09-02T00:00:00.000Z'),
      },
      {
        _id: '3',
        title: 'C Todo',
        description: null,
        due_date: null,
        is_completed: false,
        created_at: new Date('2026-09-03T00:00:00.000Z'),
      },
    ] as TodoDocument[];

    beforeEach(() => {
      dbService.getAll.mockResolvedValue(docs);
    });

    it('should list all todos sorted by createdAt desc by default', async () => {
      const result = await service.list(mockSessionId);
      expect(result.map((t) => t.id)).toEqual(['3', '2', '1']);
    });

    it('should filter completed todos', async () => {
      const result = await service.list(mockSessionId, { status: 'completed' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter incomplete todos', async () => {
      const result = await service.list(mockSessionId, { status: 'incomplete' });
      expect(result.map((t) => t.id)).toEqual(['3', '1']);
    });

    it('should filter overdue todos relative to clock.today()', async () => {
      clock.today.mockReturnValue('2026-10-05'); // todo 1 due_date is 2026-10-01
      const result = await service.list(mockSessionId, { status: 'overdue' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should sort by title asc', async () => {
      const result = await service.list(mockSessionId, {
        sortBy: 'title',
        order: 'asc',
      });
      expect(result.map((t) => t.title)).toEqual(['A Todo', 'B Todo', 'C Todo']);
    });

    it('should sort by dueDate with null values placed last', async () => {
      const result = await service.list(mockSessionId, {
        sortBy: 'dueDate',
        order: 'asc',
      });
      expect(result.map((t) => t.id)).toEqual(['1', '2', '3']);
    });
  });

  // ==========================================
  // UPDATE, COMPLETE, INCOMPLETE
  // ==========================================
  describe('update', () => {
    it('should update todo successfully', async () => {
      dbService.updateOne.mockResolvedValue({
        ...mockDoc,
        title: 'Updated Title',
      });

      const result = await service.update(mockSessionId, 'todo-1', {
        title: 'Updated Title',
      });

      expect(dbService.updateOne).toHaveBeenCalledWith(mockSessionId, 'todo-1', {
        title: 'Updated Title',
      });
      expect(result.title).toBe('Updated Title');
    });

    it('should throw BadRequestException if no fields are provided in update', async () => {
      await expect(
        service.update(mockSessionId, 'todo-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if update target is not found', async () => {
      dbService.updateOne.mockResolvedValue(null);

      await expect(
        service.update(mockSessionId, 'todo-999', { title: 'New Title' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('complete & incomplete', () => {
    it('should set is_completed to true on complete', async () => {
      dbService.updateOne.mockResolvedValue({ ...mockDoc, is_completed: true });

      const result = await service.complete(mockSessionId, 'todo-1');

      expect(dbService.updateOne).toHaveBeenCalledWith(mockSessionId, 'todo-1', {
        is_completed: true,
      });
      expect(result.isCompleted).toBe(true);
    });

    it('should set is_completed to false on incomplete', async () => {
      dbService.updateOne.mockResolvedValue({ ...mockDoc, is_completed: false });

      const result = await service.incomplete(mockSessionId, 'todo-1');

      expect(dbService.updateOne).toHaveBeenCalledWith(mockSessionId, 'todo-1', {
        is_completed: false,
      });
      expect(result.isCompleted).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing todo', async () => {
      dbService.deleteOne.mockResolvedValue(true);

      await expect(
        service.delete(mockSessionId, 'todo-1'),
      ).resolves.not.toThrow();
      expect(dbService.deleteOne).toHaveBeenCalledWith(mockSessionId, 'todo-1');
    });

    it('should throw NotFoundException if todo to delete does not exist', async () => {
      dbService.deleteOne.mockResolvedValue(false);

      await expect(service.delete(mockSessionId, 'todo-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});