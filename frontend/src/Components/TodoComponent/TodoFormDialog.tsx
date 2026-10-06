import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { createTodo, updateTodo, type Todo, type TodoPayload } from "../TodoComponent/hooks/todos";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

interface Props {
  todo?: Todo;
  onClose: () => void;
}

export default function TodoFormDialog({ todo, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEdit = todo !== undefined;

  const [title, setTitle] = useState(todo?.title ?? '');
  const [description, setDescription] = useState(todo?.description ?? '');
  const [dueDate, setDueDate] = useState<Dayjs | null>(todo?.dueDate ? dayjs(todo.dueDate) : null);
  const [dateInvalid, setDateInvalid] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: TodoPayload) => (todo ? updateTodo(todo.id, payload) : createTodo(payload)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['todos'] });
      onClose();
    },
  });

  const canSave = title.trim().length > 0 && !dateInvalid && !mutation.isPending;

  const handleSave = () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const dueValue = dueDate?.isValid() ? dueDate.format('YYYY-MM-DD') : null;

    mutation.mutate(
      isEdit
        ?
          { title: trimmedTitle, description: trimmedDescription || null, dueDate: dueValue }
        : {
            title: trimmedTitle,
            ...(trimmedDescription ? { description: trimmedDescription } : {}),
            ...(dueValue ? { dueDate: dueValue } : {}),
          },
    );
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={mutation.isPending ? undefined : onClose}>
      <DialogTitle>{isEdit ? 'Edit todo' : 'Create todo'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}

          <TextField
            autoFocus
            required
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            helperText={`${title.length}/${TITLE_MAX}`}
            slotProps={{ htmlInput: { maxLength: TITLE_MAX } }}
          />

          <TextField
            label="Description"
            multiline
            minRows={3}
            maxRows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            helperText={`${description.length}/${DESCRIPTION_MAX}`}
            slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX } }}
          />

          <DatePicker
            label="Due date"
            format="YYYY-MM-DD"
            value={dueDate}
            onChange={(value) => setDueDate(value)}
            onError={(error) => setDateInvalid(error !== null)}
            slotProps={{
              textField: { fullWidth: true, helperText: 'Optional' },
              field: { clearable: true },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
