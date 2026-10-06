import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../Utils/client';

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

interface ChatResponse {
  reply: string;
  action: unknown | null;
}

const GREETING: ChatEntry = {
  id: 0,
  role: 'assistant',
  text: 'Hi Im your Todo Assistant ! Ask me to add, update, complete or delete one todo at a time.',
};

const ERROR_REPLY = 'Something went wrong. Please try again.';

export function useAIChatMessages() {
  const queryClient = useQueryClient();
  const nextId = useRef(1);
  const [messages, setMessages] = useState<ChatEntry[]>([GREETING]);
  const [isLoading, setIsLoading] = useState(false);
  const inFlight = useRef(false);

  const sendMessage = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || inFlight.current) return;

      inFlight.current = true;
      setIsLoading(true);
      setMessages((current) => [...current, { id: nextId.current++, role: 'user', text }]);

      let reply = ERROR_REPLY;
      try {
        const data = await api<ChatResponse>('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });

        reply = data.reply;

        if (data.action) {
          await queryClient.invalidateQueries({ queryKey: ['todos'] });
        }
      } catch (err) {
        console.log("Something went wrong while posting messages", err); 
      } finally {
        setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text: reply }]);
        inFlight.current = false;
        setIsLoading(false);
      }
    },
    [queryClient],
  );

  const isAiEnabled = useCallback(async (): Promise<boolean> => {
  try {
    const { enabled } = await api<{enabled: boolean}>('/ai/status');
    return enabled === true;
  } catch {
    return false;
  }
}, []);

  return { messages, isLoading, sendMessage, isAiEnabled };
}