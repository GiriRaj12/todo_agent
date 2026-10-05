import { Injectable } from '@nestjs/common';
import type { ChatMessage } from './llm.clients.utils';

const MAX_MESSAGES_PER_SESSION = 40;
const MAX_SESSIONS = 1000;

@Injectable()
export class ConversationStore {
  private readonly histories = new Map<string, ChatMessage[]>();

  get(sessionId: string): ChatMessage[] {
    return [...(this.histories.get(sessionId) ?? [])];
  }

  append(sessionId: string, messages: ChatMessage[]): void {
    const combined = [...this.get(sessionId), ...messages];
    
    let start = Math.max(0, combined.length - MAX_MESSAGES_PER_SESSION);
    while (start < combined.length && combined[start]?.role !== 'user') start++;

    this.histories.delete(sessionId);
    this.histories.set(sessionId, combined.slice(start));

    if (this.histories.size > MAX_SESSIONS) {
      const oldest = this.histories.keys().next().value;
      if (oldest !== undefined) this.histories.delete(oldest);
    }
  }

  clear(sessionId: string): void {
    this.histories.delete(sessionId);
  }
}