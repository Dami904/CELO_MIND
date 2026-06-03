# Dashboard Metrics API — Frontend Contract

For the **frontend dev**: these are the four endpoints that feed the usage/analytics dashboard
cards. You can build the whole UI now against the shapes + mock fixtures below — you don't need a
running backend. Numbers are **all-time global counts** (every user, device, and server combined),
except the time-series which is per-day.

> Heads-up: this is **counts only** — no token usage, no dollar cost. Don't design cards that need
> per-token or spend data.

---

## Common response envelope
Every endpoint returns this wrapper. Read your payload from `data`; check `success` first.

```json
{
  "success": true,
  "action": "metrics_overview",
  "network": "celo",
  "data": { "...": "endpoint-specific (see below)" },
  "error": null,
  "timestamp": "2026-06-03T12:00:00.000Z"
}
```

On failure: `success: false`, `data: null`, and `error: { code, message }`.

Base URL (local dev): `http://localhost:3001`

---

## 1. `GET /api/metrics/overview`
Top-of-dashboard summary cards (big numbers).

```json
{
  "data": {
    "totals": {
      "chatRequests": 1280,
      "toolCalls": 940,
      "modelCalls": 1180,
      "fallbacks": 42,
      "errors": 7
    },
    "uniqueUsers": 215,
    "uniqueSessions": 690,
    "fallbackRate": 0.033,
    "topTool": "celo_get_balance",
    "topIntent": "balance",
    "topProvider": "claude"
  }
}
```

| Field | Meaning |
|---|---|
| `totals.chatRequests` | Total chatbot messages handled |
| `totals.toolCalls` | Total tool/data-fetch invocations |
| `totals.modelCalls` | Total AI model calls |
| `totals.fallbacks` | Times no AI provider answered (deterministic fallback used) |
| `totals.errors` | Recorded errors |
| `uniqueUsers` | Distinct wallets seen (privacy-safe estimate) |
| `uniqueSessions` | Distinct conversations/sessions |
| `fallbackRate` | `fallbacks / chatRequests` (0–1) — show as % |
| `topTool` / `topIntent` / `topProvider` | Most-used of each (for "headline" chips) |

---

## 2. `GET /api/metrics/tools`
Bar/list card: which tools get used most. Pre-sorted, most-used first.

```json
{
  "data": {
    "tools": [
      { "tool": "celo_get_balance", "count": 410 },
      { "tool": "token_risk", "count": 188 },
      { "tool": "get_trending_celo_tokens", "count": 143 },
      { "tool": "swap_quote", "count": 96 }
    ]
  }
}
```

---

## 3. `GET /api/metrics/models`
AI provider/model breakdown + average response speed.

```json
{
  "data": {
    "providers": [
      { "provider": "claude", "count": 900 },
      { "provider": "gemini", "count": 280 }
    ],
    "models": [
      { "model": "claude/claude-sonnet-4-6", "count": 900 },
      { "model": "gemini/gemini-1.5-flash", "count": 280 }
    ],
    "avgLatencyMs": { "claude": 1830, "gemini": 1120 }
  }
}
```

- `providers` → donut/pie of provider share.
- `models` → detailed list (the `provider/model` string is the key).
- `avgLatencyMs` → keyed by provider; show as "avg response time".

---

## 4. `GET /api/metrics/timeseries?days=30`
Line/area chart of activity over time. `days` query param (default 30). One entry per day, oldest→newest.

```json
{
  "data": {
    "series": [
      { "date": "2026-06-01", "chatRequests": 40, "toolCalls": 31, "modelCalls": 38 },
      { "date": "2026-06-02", "chatRequests": 55, "toolCalls": 44, "modelCalls": 51 }
    ]
  }
}
```

Missing days may be omitted or zero-filled — handle both (treat absent as 0).

---

## TypeScript types (paste into your app)

```ts
export interface ApiEnvelope<T> {
  success: boolean;
  action: string;
  network: "alfajores" | "celo" | "sepolia";
  data: T | null;
  error: { code: string; message: string } | null;
  timestamp: string;
}

export interface MetricsOverview {
  totals: { chatRequests: number; toolCalls: number; modelCalls: number; fallbacks: number; errors: number };
  uniqueUsers: number;
  uniqueSessions: number;
  fallbackRate: number;
  topTool: string;
  topIntent: string;
  topProvider: string;
}

export interface MetricsTools { tools: { tool: string; count: number }[] }

export interface MetricsModels {
  providers: { provider: string; count: number }[];
  models: { model: string; count: number }[];
  avgLatencyMs: Record<string, number>;
}

export interface MetricsTimeseries {
  series: { date: string; chatRequests: number; toolCalls: number; modelCalls: number }[];
}
```

---

## Suggested dashboard cards → endpoint mapping
| Card | Endpoint | Field(s) |
|---|---|---|
| Big stat tiles (requests, tool calls, model calls, users) | `/overview` | `totals.*`, `uniqueUsers` |
| Fallback-rate gauge | `/overview` | `fallbackRate` |
| "Top tools" bar list | `/tools` | `tools[]` |
| Provider share donut | `/models` | `providers[]` |
| Avg response time | `/models` | `avgLatencyMs` |
| Activity-over-time chart | `/timeseries` | `series[]` |

## Practical notes
- **Polling:** these are cheap reads; refresh every 15–30s (or a manual refresh button). No websockets needed.
- **Empty state:** a brand-new system returns zeros / empty arrays — design a graceful "no data yet" state.
- **Build now with mocks:** the JSON blocks above are valid fixtures — drop them into your mock layer and
  build the cards today; swap to live `fetch` when the endpoints are up.
- **Provider values** you'll see: `claude`, `openai`, `gemini`, `deepseek`, `ollama`, `fallback`.
- **Numbers are cumulative** (all-time) except `/timeseries` (per-day). There's no per-user filtering in v1.
