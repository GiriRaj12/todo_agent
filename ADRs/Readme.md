# Architecture Decision Records

Short records of the key decisions behind Todo Agent, with the reasoning and trade-offs.

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-llm-provider.md) | LLM provider behind an OpenAI-compatible API | Accepted |
| [0002](0002-tool-calling-agent.md) | Tool-calling agent with a bounded loop | Accepted |
| [0003](0003-one-action-per-message.md) | One action per chat message | Accepted |
| [0004](0004-session-scoped-data.md) | Session-scoped data via `x-session-id` header | Accepted |
| [0005](0005-mongodb-soft-delete.md) | MongoDB persistence with soft delete | Accepted |
| [0006](0006-ai-optional-and-key-handling.md) | AI is optional; API key stays on the backend | Accepted |
| [0007](0007-frontend-proxy-without-nginx.md) | Frontend serves and proxies with Vite (no nginx) | Accepted |

To add a record, copy the structure of an existing one and use the next number. Do not edit an accepted ADR to change history; add a new ADR that supersedes it.