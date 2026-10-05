# ADR-0005: MongoDB persistence with soft delete

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The assignment calls for persistent storage, with file-based persistence as the baseline. The app also runs in Docker Compose with a backend and frontend, and the AI can delete data, which makes accidental loss a concern.

## Decision
Store todos in MongoDB 7, run as a Compose service with a named volume and a health check. Credentials come from environment variables. Deletes are soft: the record gets a `deleted_at` timestamp and is excluded from queries.

## Alternatives considered
- **JSON file on disk:** the simplest option, but poor for concurrent requests and session filtering, and awkward in containers.
- **SQLite or PostgreSQL:** both work, but add schema and migration overhead for a small document-shaped model.

## Consequences
- Data survives container restarts through the `mongo-data` volume.
- Deleted todos can be recovered by clearing `deleted_at`, which limits the damage from a wrong AI action.
- Soft-deleted records accumulate, so a cleanup job may be needed later.
- The root user is created in the `admin` database, so the backend connection needs `authSource=admin`.
- `MONGO_INITDB_*` values apply only when the volume is first created.
