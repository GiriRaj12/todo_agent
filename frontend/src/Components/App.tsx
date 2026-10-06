import { Box, Container } from '@mui/material';
import { useEffect, useState } from 'react';
import { ensureSessionId } from './Utils/client';
import AiComponent from './AiComponent/AiComponent';
import TodoComponent from './TodoComponent/TodoComponent';
import { useAIChatMessages } from './AiComponent/hooks/useAiChatMessages';

const AI_ENABLED_STUB = true;

export default function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const { isAiEnabled } = useAIChatMessages()

  useEffect(() => {
    ensureSessionId();
    setSessionReady(true);
  }, []);

  useEffect(() => {
    isAiEnabled().then((enabled) => setAiEnabled(enabled)).catch(() => setAiEnabled(false))
    setAiEnabled(AI_ENABLED_STUB);
  }, []);

  if (!sessionReady) return null;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box
        sx={{
          display: 'grid',
          columnGap: 3,
          rowGap: 3,
          gridTemplateColumns: { xs: '1fr', lg: '1fr minmax(0, 820px) 1fr' },
        }}
      >
        <Box sx={{ display: { xs: 'none', lg: 'block' } }} />
        <Box sx={{ minWidth: 0 }}>
          <TodoComponent />
        </Box>
        {aiEnabled && (
          <Box sx={{ justifySelf: { xs: 'stretch', lg: 'start' }, width: { xs: '100%', lg: 360 } }}>
            <AiComponent />
          </Box>
        )}
      </Box>
    </Container>
  );
}
