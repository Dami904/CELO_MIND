# CeloMind Dashboard Metrics

In-process metrics module for global dashboard analytics. It stores counters in Upstash Redis so every API server instance contributes to one shared set of numbers.

## Environment

Set these variables before running the API:

```sh
UPSTASH_REDIS_URL=https://your-redis.upstash.io
UPSTASH_REDIS_TOKEN=your-token
```

If either variable is missing, record helpers silently skip writes and read endpoints return empty/zero metrics.

## Exports

- `recordChatRequest(input)` records chat usage, intent, provider/model counts, latency, and privacy-safe unique wallet/session counts.
- `recordToolCall(input)` records tool calls and failed tool calls.
- `metricsRoutes(app)` registers:
  - `GET /api/metrics/overview`
  - `GET /api/metrics/tools`
  - `GET /api/metrics/models`
  - `GET /api/metrics/timeseries?days=30`

## Local Test

1. Add your Upstash env vars.
2. Run the API with `npm run dev -w apps/api`.
3. Send chat/tool requests, or call the record helpers from a scratch script.
4. Open the four `/api/metrics/*` endpoints and confirm counts increase.

Run two API processes with the same Redis env vars to verify the counts are global.
