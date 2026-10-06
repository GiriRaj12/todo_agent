import SendIcon from '@mui/icons-material/Send';
import { Box, IconButton, Paper, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useAIChatMessages } from './hooks/useAiChatMessages';

export default function AiComponent() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const { messages, isLoading, sendMessage } = useAIChatMessages();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const send = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInput('');
  };

  return (
    <Paper
      variant="outlined"
      sx={{ display: 'flex', flexDirection: 'column', height: { xs: 480, lg: 'calc(100vh - 48px)' }, minHeight: 420 }}
    >
      <Typography variant="h6" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        AI assistant
      </Typography>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              px: 1.5,
              py: 1,
              borderRadius: 2,
              bgcolor: message.role === 'user' ? 'primary.main' : 'grey.200',
              color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <Typography variant="body2">{message.text}</Typography>
          </Box>
        ))}
        {isLoading && (
          <Box sx={{ alignSelf: 'flex-start', px: 1.5, py: 1, borderRadius: 2, bgcolor: 'grey.200' }}>
            <Typography variant="body2" color="text.secondary">
              Thinking…
            </Typography>
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, p: 2, borderTop: 1, borderColor: 'divider' }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          size="small"
          placeholder="Ask for one thing at a time…"
          value={input}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />
        <IconButton color="primary" aria-label="Send message" disabled={!input.trim() || isLoading} onClick={send}>
          <SendIcon />
        </IconButton>
      </Box>
    </Paper>
  );
}