# ADR-0006: AI is optional; the API key stays on the backend

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The chatbot depends on an external service and a secret key that is shared privately. The core todo features should not break when the key is missing, the provider is down, or AI is switched off.

## Decision
- The LLM key lives only in backend environment variables (`.env`, passed through Docker Compose) and is never sent to the browser or committed to Git.
- The backend exposes an AI status endpoint. The frontend calls it (`isAiEnabled`) and shows the chat panel only when AI is enabled. A failed status call counts as disabled.
- `AI_ENABLED` turns the feature off without code changes.
- The browser never calls the LLM directly. It calls the backend chat endpoint, and the backend calls the provider.

## Alternatives considered
- **Call the LLM from the browser:** exposes the key.
- **Always show the chat panel:** confusing when no key is configured.

## Consequences
- The app is fully usable without an API key.
- Data sent to the provider is limited to the user's chat message, the conversation context and tool results, which can include todo titles and descriptions. This should be stated in the project documentation.
- Rotating the key means editing `.env` and restarting the backend.
