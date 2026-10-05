# ADR-0004: Session-scoped data via `x-session-id` header

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The app has no user accounts, but each visitor should see only their own todos, and the AI must never read or change another visitor's data.

## Decision
A `session_id` is created when the browser logs in. The client sends it on every request as an `x-session-id` header. Every `DbService` create, get, update and delete operation requires the session ID and filters by it. The AI tools run through the same service, so they inherit the same scoping.

## Alternatives considered
- **Cookie-based session:** adds cookie, CORS and CSRF concerns, and complicates the proxy setup.
- **No scoping (shared list):** simplest, but every visitor would see and change everyone's todos.
- **Full authentication:** the right choice for a production app, but out of scope here.

## Consequences
- Data isolation is enforced in one place, the data layer, instead of being repeated in each route.
- The session ID is an identifier, not a credential. Anyone holding it can access that session's todos, so this is not a substitute for real authentication.
- Clearing browser storage creates a new session, and the old todos are no longer reachable from that browser.
