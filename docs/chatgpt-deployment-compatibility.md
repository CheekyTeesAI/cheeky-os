# ChatGPT Actions Deployment Compatibility Note

## Entrypoint and Hosting

- Server entrypoint for hosted runtime: `render-http.js`
- Runtime app loaded: `email-intake/cheeky-os/server.js`
- Expected HTTPS host in production: `PUBLIC_BASE_URL`

## Base URL Compatibility

- Local dev base URL: `http://localhost:3000`
- Production base URL: `PUBLIC_BASE_URL` (must be set)
- Action-safe base path: `/api/chatgpt`

## Route and Spec Availability

- ChatGPT routes exist under `/api/chatgpt/*`
- OpenAPI spec exists at `docs/chatgpt-openapi.json`

## Auth and Proxy Notes

- GPT Actions auth uses API key via `x-api-key` (or bearer token in `Authorization` header).
- Protected routes fail closed when `CHATGPT_ACTION_API_KEY` is missing or invalid.
- Reverse proxy/pathing should preserve `/api/chatgpt/*`.
