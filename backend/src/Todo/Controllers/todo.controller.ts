import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SessionId } from '../../Decorators/sessionId.decorator';
import { TodosService } from '../Services/todoapp.service';
import type { Todo } from '../Utils/todo.entity';
import { CreateTodoDto } from './todo.dtos';
import { ListTodosQueryDto } from './todo.dtos';
import { TodoResponseDto } from './todo.dtos';
import { UpdateTodoDto } from './todo.dtos';

@ApiTags('todos')
@ApiSecurity('session-id')
@ApiBadRequestResponse({ description: 'Validation failed or x-session-id header missing/invalid' })
@Controller('todos')
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Post()
  @ApiOperation({ summary: 'Create a todo' })
  @ApiCreatedResponse({ type: TodoResponseDto })
  create(@SessionId() sessionId: string, @Body() dto: CreateTodoDto): Promise<Todo> {
    return this.todos.create(sessionId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List todos, optionally filtered and sorted' })
  @ApiOkResponse({ type: TodoResponseDto, isArray: true })
  list(@SessionId() sessionId: string, @Query() query: ListTodosQueryDto): Promise<Todo[]> {
    return this.todos.list(sessionId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a todo by id' })
  @ApiOkResponse({ type: TodoResponseDto })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  get(@SessionId() sessionId: string, @Param('id') id: string): Promise<Todo> {
    return this.todos.get(sessionId, id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update title, description and/or dueDate',
    description: 'Only the provided fields change. Send null to clear description or dueDate.',
  })
  @ApiOkResponse({ type: TodoResponseDto })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  update(
    @SessionId() sessionId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ): Promise<Todo> {
    return this.todos.update(sessionId, id, dto);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark a todo as completed (idempotent)' })
  @ApiOkResponse({ type: TodoResponseDto })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  complete(@SessionId() sessionId: string, @Param('id') id: string): Promise<Todo> {
    return this.todos.complete(sessionId, id);
  }

  @Patch(':id/incomplete')
  @ApiOperation({ summary: 'Mark a todo as not completed (idempotent)' })
  @ApiOkResponse({ type: TodoResponseDto })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  incomplete(@SessionId() sessionId: string, @Param('id') id: string): Promise<Todo> {
    return this.todos.incomplete(sessionId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a todo (soft delete)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Todo not found' })
  remove(@SessionId() sessionId: string, @Param('id') id: string): Promise<void> {
    return this.todos.delete(sessionId, id);
  }
}