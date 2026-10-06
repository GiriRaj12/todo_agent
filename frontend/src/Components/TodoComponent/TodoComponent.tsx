import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import EventIcon from '@mui/icons-material/Event';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Stack from '@mui/material/Stack';
import { amber, red } from '@mui/material/colors';
import dayjs from 'dayjs';
import TodoFormDialog from '../TodoComponent/TodoFormDialog';
import { SortOrder, Todo, TodoSortBy, TodoStatusFilter } from './hooks/todos';
import { useMemo, useState } from 'react';
import { useTodoActions } from './hooks/useTodoActions';

const DATE_FORMAT = 'YYYY-MM-DD';

const STATUS_OPTIONS: { value: TodoStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
];

const SORT_OPTIONS: { value: TodoSortBy; label: string }[] = [
  { value: 'createdAt', label: 'Created' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'title', label: 'Title' },
];

type DueState = 'overdue' | 'soon' | 'normal';

function getDueState(todo: Todo, today: string, tomorrow: string): DueState {
  if (todo.isCompleted || !todo.dueDate) return 'normal';
  if (todo.dueDate < today) return 'overdue';
  if (todo.dueDate === today || todo.dueDate === tomorrow) return 'soon';
  return 'normal';
}

export default function TodoComponent() {
  const [status, setStatus] = useState<TodoStatusFilter>('all');
  const [sortBy, setSortBy] = useState<TodoSortBy>('createdAt');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ todo?: Todo } | null>(null);

  const {
    todosQuery,
    toggleMutation,
    deleteMutation,
  } = useTodoActions({
    status,
    sortBy,
    order,
  });

  const visibleTodos = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (todosQuery.data ?? []).filter((todo) =>
      todo.title.toLowerCase().includes(term)
    );
  }, [todosQuery.data, search]);

  const handleSortByChange = (value: TodoSortBy) => {
    setSortBy(value);
    setOrder(value === 'createdAt' ? 'desc' : 'asc');
  };

  const handleDelete = (todo: Todo) => {
    if (window.confirm(`Delete "${todo.title}"?`)) {
      deleteMutation.mutate(todo);
    }
  };

  const actionError = toggleMutation.error ?? deleteMutation.error;
  const today = dayjs().format(DATE_FORMAT);
  const tomorrow = dayjs().add(1, 'day').format(DATE_FORMAT);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', minHeight: 420 }}
    >
      <Stack direction="row" spacing={2} sx={{mb: 2}}>
        <Typography variant="h5">My todos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>
          Create todo
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: '1 1 180px' }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />

        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TodoStatusFilter)}
          sx={{ minWidth: 130 }}
        >
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Sort by"
          value={sortBy}
          onChange={(e) => handleSortByChange(e.target.value as TodoSortBy)}
          sx={{ minWidth: 130 }}
        >
          {SORT_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        <Tooltip title={order === 'asc' ? 'Ascending' : 'Descending'}>
          <IconButton
            aria-label={`Sort order: ${order === 'asc' ? 'ascending' : 'descending'}. Click to reverse.`}
            onClick={() => setOrder((current) => (current === 'asc' ? 'desc' : 'asc'))}
          >
            {order === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
          </IconButton>
        </Tooltip>
      </Stack>

      {actionError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => {
            toggleMutation.reset();
            deleteMutation.reset();
          }}
        >
          {actionError.message}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
        {todosQuery.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {todosQuery.isError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => todosQuery.refetch()}>
                Retry
              </Button>
            }
          >
            {todosQuery.error.message}
          </Alert>
        )}

        {todosQuery.isSuccess && visibleTodos.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No todos found.
          </Typography>
        )}

        {visibleTodos.map((todo) => {
          const state = getDueState(todo, today, tomorrow);
          return (
            <Card
              key={todo.id}
              variant="outlined"
              sx={{
                mb: 1,
                bgcolor: state === 'overdue' ? red[100] : state === 'soon' ? amber[100] : 'background.paper',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5 }}>
                <Checkbox
                  checked={todo.isCompleted}
                  disabled={toggleMutation.isPending}
                  onChange={() => toggleMutation.mutate(todo)}
                  slotProps={{
                    input: { 'aria-label': todo.isCompleted ? 'Mark as not completed' : 'Mark as completed' },
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 600,
                      wordBreak: 'break-word',
                      textDecoration: todo.isCompleted ? 'line-through' : 'none',
                    }}
                  >
                    {todo.title}
                  </Typography>
                  {todo.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                      {todo.description}
                    </Typography>
                  )}
                  {todo.dueDate && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Chip size="small" variant="outlined" icon={<EventIcon />} label={`Due ${todo.dueDate}`} />
                      {state === 'overdue' && <Chip size="small" color="error" label="Overdue" />}
                      {state === 'soon' && (
                        <Chip
                          size="small"
                          color="warning"
                          label={todo.dueDate === today ? 'Due today' : 'Due tomorrow'}
                        />
                      )}
                    </Stack>
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexShrink: 0 }}>
                  <Tooltip title="Edit">
                    <IconButton aria-label="Edit todo" onClick={() => setDialog({ todo })}>
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      aria-label="Delete todo"
                      disabled={deleteMutation.isPending}
                      onClick={() => handleDelete(todo)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Card>
          );
        })}
      </Box>

      {dialog && <TodoFormDialog todo={dialog.todo} onClose={() => setDialog(null)} />}
    </Paper>
  );
}
