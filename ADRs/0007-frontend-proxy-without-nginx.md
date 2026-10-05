# ADR-0007: Frontend serves and proxies with Vite (no nginx)

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The browser needs to reach the backend inside Docker. Running the frontend needs a way to serve the built app and forward `/api` calls, without exposing the backend address in the browser bundle.

## Decision
Run the built frontend with `vite preview` in a single-stage Docker image and use Vite's proxy to forward `/api` to the backend. The target comes from `process.env.BACKEND_URL` in `vite.config.ts`, which is read when the container starts, so Compose can set it to `http://backend:3000`. The server listens on `0.0.0.0:8080`.

## Alternatives considered
- **Multi-stage build with nginx:** smaller image and the usual production choice, but adds another config file and template step.
- **Browser calls the backend directly with a build-time `VITE_API_URL`:** requires CORS and rebuilding the image to change the address.

## Consequences
- One image, one port in the browser, and the backend address is changeable at runtime.
- `vite preview` is not designed for production traffic. Moving to nginx would be a small change if this is deployed beyond a demo.
- Access through a hostname other than `localhost` may require `preview.allowedHosts`.
