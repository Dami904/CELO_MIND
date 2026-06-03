# Deployment

## GitHub Actions

Backend CI runs on pushes and pull requests that touch backend, workflow, or Render config files.

It runs:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The workflow lives at `.github/workflows/backend-ci.yml`.

## Render

The repo includes a Render Blueprint at `render.yaml`.

Create the service from Render's Blueprint flow and connect this repository. Render uses:

- Root directory: `backend`
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Runtime: Node 20

## Required Render Environment Variables

Set these in Render when prompted by the Blueprint:

```sh
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

At least one AI provider should be configured for live AI answers:

```sh
AI_PROVIDER=claude
ANTHROPIC_API_KEY=
```

Optional provider/data variables are listed in `backend/.env.example` and `render.yaml`.

Do not commit real `.env` files or secrets.
