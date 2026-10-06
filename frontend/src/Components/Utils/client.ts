const SESSION_KEY = 'todoAgent.sessionId';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let memorySessionId: string | null = null;

function generateUuid(): string {
  return crypto.randomUUID();
}

export function ensureSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing && UUID_RE.test(existing)) return existing;
    const id = generateUuid();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    memorySessionId ??= generateUuid();
    return memorySessionId;
  }
}

async function toError(response: Response): Promise<Error> {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as {
      message?: string | string[];
      error?: { message?: string };
    };
    const message = body.message ?? body.error?.message;
    return new Error(Array.isArray(message) ? message.join('; ') : (message ?? fallback));
  } catch {
    return new Error(fallback);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': ensureSessionId(),
      ...init.headers,
    },
  });
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
