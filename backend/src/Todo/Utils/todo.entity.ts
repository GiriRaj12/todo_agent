export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly isCompleted: boolean;
  readonly createdAt: string;
}