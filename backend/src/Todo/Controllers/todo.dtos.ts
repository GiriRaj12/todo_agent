import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type {
  SortOrder,
  TodoSortBy,
  TodoStatusFilter,
} from '../Services/todoapp.service'
import type { Todo } from '../Utils/todo.entity'

export const TODO_STATUSES = ['all', 'completed', 'incomplete', 'overdue'] as const;
export const TODO_SORT_FIELDS = ['createdAt', 'dueDate', 'title'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;


export class CreateTodoDto {
  @ApiProperty({ example: 'Buy milk', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Semi-skimmed, 2 litres', maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'YYYY-MM-DD', nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be in YYYY-MM-DD format' })
  dueDate?: string;
}

export class UpdateTodoDto extends PartialType(CreateTodoDto) {}

export class ListTodosQueryDto {
  @ApiPropertyOptional({ enum: TODO_STATUSES, default: 'all' })
  @IsOptional()
  @IsIn(TODO_STATUSES)
  status?: TodoStatusFilter;

  @ApiPropertyOptional({ enum: TODO_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(TODO_SORT_FIELDS)
  sortBy?: TodoSortBy;

  @ApiPropertyOptional({
    enum: SORT_ORDERS,
    description: "Defaults to 'desc' for createdAt and 'asc' otherwise",
  })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}

export class TodoResponseDto implements Todo {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-31' })
  dueDate!: string | null;

  @ApiProperty()
  isCompleted!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}