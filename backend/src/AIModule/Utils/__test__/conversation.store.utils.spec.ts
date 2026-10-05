import { ConversationStore } from '../converstation.store.utils'
import type { ChatMessage } from '../llm.clients.utils';

const msg = (role: string, content: string): ChatMessage =>
  ({ role, content }) as unknown as ChatMessage;

const user = (content: string) => msg('user', content);
const assistant = (content: string) => msg('assistant', content);

const alternating = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? user(`u${i}`) : assistant(`a${i}`),
  );

describe('ConversationStore', () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  describe('get', () => {
    it('returns an empty array for an unknown session', () => {
      expect(store.get('unknown')).toEqual([]);
    });

    it('returns a copy, so mutating the result does not change the store', () => {
      store.append('s1', [user('hi')]);

      const result = store.get('s1');
      result.push(assistant('injected'));

      expect(store.get('s1')).toEqual([user('hi')]);
    });
  });

  describe('append', () => {
    it('stores messages in order', () => {
      store.append('s1', [user('hi'), assistant('hello')]);
      expect(store.get('s1')).toEqual([user('hi'), assistant('hello')]);
    });

    it('accumulates messages across calls', () => {
      store.append('s1', [user('one')]);
      store.append('s1', [assistant('two'), user('three')]);

      expect(store.get('s1')).toEqual([
        user('one'),
        assistant('two'),
        user('three'),
      ]);
    });

    it('keeps sessions isolated from each other', () => {
      store.append('a', [user('from a')]);
      store.append('b', [user('from b')]);

      expect(store.get('a')).toEqual([user('from a')]);
      expect(store.get('b')).toEqual([user('from b')]);
    });

    it('does nothing harmful when appending an empty list', () => {
      store.append('s1', [user('hi')]);
      store.append('s1', []);
      expect(store.get('s1')).toEqual([user('hi')]);
    });
  });

  describe('history trimming (max 40 messages)', () => {
    it('does not trim when at or below the limit', () => {
      store.append('s1', alternating(40));
      expect(store.get('s1')).toHaveLength(40);
    });

    it('trims to at most 40 messages, keeping the most recent', () => {
      store.append('s1', alternating(50));

      const history = store.get('s1');
      expect(history.length).toBeLessThanOrEqual(40);
      expect(history[history.length - 1]).toEqual(assistant('a49'));
    });

    it('always starts the trimmed history on a user message', () => {
      // 51 messages -> naive cut lands on an assistant message (index 11)
      store.append('s1', alternating(51));

      const history = store.get('s1');
      expect(history[0]).toEqual(user('u12'));
      expect(history.every((m) => m !== undefined)).toBe(true);
    });

    it('drops leading non-user messages even when under the limit', () => {
      store.append('s1', [assistant('orphan'), user('hi'), assistant('hello')]);
      expect(store.get('s1')).toEqual([user('hi'), assistant('hello')]);
    });

    it('results in an empty history if no user message remains', () => {
      store.append('s1', [assistant('a'), assistant('b')]);
      expect(store.get('s1')).toEqual([]);
    });

    it('trims correctly across multiple appends', () => {
      store.append('s1', alternating(30));
      store.append('s1', alternating(30));

      const history = store.get('s1');
      expect(history.length).toBeLessThanOrEqual(40);
      expect(history[0]).toEqual(expect.objectContaining({ role: 'user' }));
    });
  });

  describe('session eviction (max 1000 sessions)', () => {
    const fill = (count: number) => {
      for (let i = 0; i < count; i++) store.append(`s${i}`, [user(`m${i}`)]);
    };

    it('keeps all sessions up to the limit', () => {
      fill(1000);
      expect(store.get('s0')).toEqual([user('m0')]);
      expect(store.get('s999')).toEqual([user('m999')]);
    });

    it('evicts the oldest session when the limit is exceeded', () => {
      fill(1001);

      expect(store.get('s0')).toEqual([]);
      expect(store.get('s1')).toEqual([user('m1')]);
      expect(store.get('s1000')).toEqual([user('m1000')]);
    });

    it('treats a recently appended session as newest (not evicted first)', () => {
      fill(1000);
      store.append('s0', [assistant('still active')]);
      store.append('new', [user('new session')]);

      expect(store.get('s0').length).toBeGreaterThan(0);
      expect(store.get('s1')).toEqual([]); // oldest untouched session evicted
      expect(store.get('new')).toEqual([user('new session')]);
    });

    it('does not evict when appending to an existing session at the limit', () => {
      fill(1000);
      store.append('s500', [assistant('more')]);

      expect(store.get('s0')).toEqual([user('m0')]);
    });
  });

  describe('clear', () => {
    it('removes a session history', () => {
      store.append('s1', [user('hi')]);
      store.clear('s1');
      expect(store.get('s1')).toEqual([]);
    });

    it('only clears the given session', () => {
      store.append('a', [user('a')]);
      store.append('b', [user('b')]);

      store.clear('a');

      expect(store.get('a')).toEqual([]);
      expect(store.get('b')).toEqual([user('b')]);
    });

    it('does not throw for an unknown session', () => {
      expect(() => store.clear('nope')).not.toThrow();
    });
  });
});