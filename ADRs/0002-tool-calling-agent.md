# ADR-0002: Tool-calling agent with a bounded loop

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The assistant must change real data (add, update, complete, delete todos) from natural language. The same operations already exist in `TodosService`, and the UI uses them too.

## Decision
Expose the `TodosService` methods to the model as tools. The AI module runs a loop: send the conversation, execute any tool call the model returns through `TodosService`, return the result to the model, and stop when it produces a final reply. The loop is capped by `AI_MAX_ITERATIONS` (5), and each LLM call has a timeout.

## Alternatives considered
- **Parse free text with rules or regex:** brittle and hard to extend.
- **Ask the model to return raw JSON commands and parse them:** less reliable than native tool calling and needs custom validation for every shape.
- **Let the model call the database directly:** bypasses validation and session scoping.

## Consequences
- The AI and the UI share one business-logic path, so validation and session scoping apply equally to both.
- The iteration cap and timeout stop runaway loops and bound cost and latency.
- Tool arguments from the model are treated as untrusted input and validated like any request.
- When the loop fails or times out, the user gets a generic error reply and the todo list is not changed.
