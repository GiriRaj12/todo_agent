# Todo Agent

A Todo application with an AI agent that performs actions on your todo list. Manage todos through the UI, or ask the built-in assistant in plain English, for example "add buy milk", "complete laundry" or "delete the dentist todo".

## Features

- Create, edit, delete, and complete or reopen todos
- Due dates with "Overdue", "Due today" and "Due tomorrow" indicators
- Filter by status (all, incomplete, completed, overdue), sort by created date, due date or title, and search by title
- AI chat assistant that adds, updates, completes and deletes todos. It handles **one action per message**; multi-step requests are asked to be sent one by one
- Todos are scoped per browser session (sent as an `x-session-id` header) and deleted with soft delete

## Tech stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | React, TypeScript, Vite, Material UI          |
| Backend  | NestJS, TypeScript                            |
| Database | MongoDB 7                                     |
| AI       | OpenAI-compatible LLM API (Groq by default)   |
| Runtime  | Docker and Docker Compose                     |

## Requirements

You only need **Docker** (with the Compose plugin). You do not need Node.js or MongoDB installed locally.

Check whether Docker is already installed:

```bash
docker --version
docker compose version
```

If both commands print a version, skip to [Getting started](#getting-started).

### Installing Docker

**macOS / Windows**

1. Download and install [Docker Desktop](https://docs.docker.com/get-started/get-docker/).
2. Start Docker Desktop and wait until it reports that it is running.
3. On Windows, Docker Desktop will ask you to enable WSL 2 if it is not already on. Accept the prompt and restart if asked.

**Linux (Ubuntu, Debian, Fedora, etc.)**

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in so the group change applies, then verify with `docker compose version`. For distribution-specific instructions, see the [official install guide](https://docs.docker.com/engine/install/).

## Getting started

### 1. Get the code

```bash
git clone <repository-url>
cd <repository-folder>
```

### 2. Add the AI API key

The AI assistant needs an API key, which is shared with you privately. Create a file named `.env` in the project root (next to `docker-compose.yml`):

```env
LLM_API_KEY=paste-the-key-you-were-given-here
```

Optional settings you can add to the same file:

```env
MONGO_USERNAME=todo_admin
MONGO_PASSWORD=choose-a-strong-password
MONGO_DB_NAME=todos
AI_ENABLED=true
GROQ_MODEL=openai/gpt-oss-20b
GROQ_TIMEOUT_MS=15000
```

Do not commit `.env` to Git. It is listed in `.gitignore`.

> Without a key the todo features still work, but the AI assistant will not be available.

### 3. Start the application

```bash
docker compose up -d --build
```

On the first run, Docker downloads the base images, builds the backend and frontend, and starts MongoDB, the backend and the frontend in order. This can take a few minutes. Later starts are much faster.

Check that everything is up:

```bash
docker compose ps
```

All three services (`mongo`, `backend`, `frontend`) should show as running or healthy.

### 4. Open the app

| Service  | URL                     |
| -------- | ----------------------- |
| App      | http://localhost:8080   |
| Backend  | http://localhost:3000   |

The frontend forwards `/api` requests to the backend inside the Docker network, so you only need to use port 8080 in the browser.

## Using the AI assistant

Open the chat panel and type one request at a time:

- `add buy milk, due 2026-10-10`
- `mark "buy milk" as completed`
- `rename "buy milk" to "buy oat milk"`
- `delete the laundry todo`

If a request needs more than one action (for example "add two todos and delete one"), the assistant will ask you to send them one by one. When the assistant changes your list, the todo list refreshes automatically.

## Useful commands

```bash
docker compose logs -f backend     # follow backend logs
docker compose logs -f frontend    # follow frontend logs
docker compose restart backend     # restart one service
docker compose down                # stop and remove containers (data is kept)
docker compose down -v             # stop and also delete the database volume
```

After changing code, rebuild with `docker compose up -d --build`.

## Configuration reference

| Variable           | Default                              | Description                                   |
| ------------------ | ------------------------------------ | --------------------------------------------- |
| `LLM_API_KEY`      | _(empty)_                            | API key for the AI assistant                  |
| `LLM_BASE_URL`     | `https://api.groq.com/openai/v1`     | OpenAI-compatible LLM endpoint                |
| `GROQ_MODEL`       | `openai/gpt-oss-20b`                 | Model used by the assistant                   |
| `GROQ_TIMEOUT_MS`  | `15000`                              | Timeout per LLM call                          |
| `AI_ENABLED`       | `true`                               | Turns the AI assistant on or off              |
| `MONGO_USERNAME`   | `todo_admin`                         | MongoDB root username                         |
| `MONGO_PASSWORD`   | `any_password`                       | MongoDB root password (change outside of demos) |
| `MONGO_DB_NAME`    | `todos`                              | Database name                                 |

The MongoDB credentials are applied only when the database volume is first created. If you change them later, run `docker compose down -v` to recreate the volume (this deletes all todos).

## Project structure

```
.
├── backend/              # NestJS API (todos and AI modules)
├── frontend/             # React + Material UI app
├── docker-compose.yml
└── .env                  # local secrets (not committed)
```

## Running the tests

Tests run without Docker, from inside each folder:

```bash
cd frontend && npm ci && npm test
cd backend && npm ci && npm test
```

## Troubleshooting

| Problem                                      | What to check                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `docker: command not found`                  | Docker is not installed, or Docker Desktop is not running. See [Installing Docker](#installing-docker). |
| Port 8080 or 3000 already in use             | Stop whatever uses the port, or change the left-hand port in `docker-compose.yml` (for example `"8081:8080"`). |
| Page loads but todos do not                  | Run `docker compose logs backend`. Look for MongoDB authentication errors.                              |
| AI chat panel missing or replies with errors | Confirm `LLM_API_KEY` is set in `.env`, then run `docker compose up -d` again to apply it.             |
| Backend stays "unhealthy"                    | Run `docker compose logs backend` and check that MongoDB is healthy first.                              |