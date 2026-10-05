# ADR-0003: One action per chat message

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
Requests such as "delete my first two todos and add a new one" involve several changes. Smaller or free-tier models handle multi-step requests inconsistently, and a partly applied request is confusing and hard to undo.

## Decision
The assistant performs at most one action per message. If a request needs more than one action, it declines and asks the user to send the actions one by one. The system prompt states this rule, and the agent flow enforces it so it does not depend on the model alone.

## Alternatives considered
- **Allow multi-action requests:** more convenient, but needs transaction-like handling, partial-failure reporting and undo.
- **Split requests automatically:** adds a planning step and more LLM calls, with more room for mistakes.

## Consequences
- Every chat message maps to one visible, predictable change.
- Failures are simple to explain and to recover from.
- Users with several changes must send several messages. This can be revisited later with a new ADR if multi-step support is added.
