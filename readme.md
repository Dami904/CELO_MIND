# CeloMind

**[Live demo](https://celomind.vercel.app/) · [GitHub](https://github.com/Dami904/CELO_MIND)**

**CeloMind turns Celo into AI-agent-ready blockchain infrastructure.**

It's an open-source TypeScript **MCP (Model Context Protocol) server** for Celo, paired with a full **Next.js dashboard + chat UI**. Plug it into Claude Desktop (or any MCP client) and your agent can read on-chain data, prepare transactions, catch risky tokens and whale moves, and explain Celo docs in plain English — all on Celo **mainnet** (`celo`, chain ID `42220`).

Every write action is **prepare-only**: the backend builds the transaction, the user's wallet signs it in the frontend. Nothing auto-executes. Copy-wallet analyzes and prepares — it never auto-trades.

---

## Repository layout

CeloMind is two top-level apps:

```text
backend/    # Fastify API + MCP server + shared packages + docs knowledge + dashboard metrics + tests
frontend/   # Next.js dashboard and chat UI
```

### backend (`npm workspaces`)

```text
apps/api                 # Fastify REST API (port 3001) — chat, dashboard, risk, whales, wallet, MCP-over-HTTP
packages/mcp-server      # The Celo MCP server (70+ tools) — stdio transport for Claude Desktop
packages/shared          # zod schemas, types, token constants, network config, Redis cache
packages/docs-knowledge  # live Celo doc fetching + static fallback summaries
dashboard/               # dashboard metrics module
contracts/               # CeloMindTokens.sol (token-launcher support)
scripts/                 # esbuild bundler (build.mjs), smoke test, 8004 registration
tests/                   # Vitest suite
```

### frontend (`Next.js`)

```text
src/app/          # pages: landing (/), dashboard, chat
src/components/    # UI (shadcn/ui, radix, recharts, framer-motion)
src/lib/          # API client, wallet config
```

The frontend reads `NEXT_PUBLIC_API_BASE_URL` and defaults to `http://localhost:3001`.

---

## Quick start

```bash
# 1. Backend (port 3001)
cd backend
npm install
npm run dev

# 2. Frontend (port 3000), in a second terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The dashboard and chat call the backend at `http://localhost:3001`.

CeloMind runs with **zero required API keys** — without them it falls back to public RPC, public data sources, and a deterministic source-labeled answer formatter. Add keys (below) to unlock AI synthesis, caching, and richer market/whale data.

### Use it as an MCP server (Claude Desktop)

Build and point Claude Desktop at the stdio server:

```bash
cd backend
npm run build
```

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "celomind": {
      "command": "node",
      "args": ["/absolute/path/to/CELO_MIND/backend/packages/mcp-server/dist/index.js"]
    }
  }
}
```

---

## What the agent can do — 70+ MCP tools

| Area | Examples |
| --- | --- |
| **Wallet & accounts** | `celo_get_balance`, `celo_get_token_balance`, `get_celo_wallet_portfolio`, `get_celo_wallet_stats`, `resolve_ens_name`, `reverse_ens_lookup` |
| **Market & tokens** | `get_celo_token_price`, `get_celo_token_info`, `get_celo_token_holders`, `get_trending_celo_tokens`, `get_recently_launched_celo_tokens`, `search_celo_tokens`, `get_celo_top_tokens_by_market_cap`, `get_celo_top_pools`, `get_celo_price_history`, `get_celo_market_cap` |
| **Network & chain** | `get_celo_network_stats`, `get_celo_latest_blocks`, `get_celo_block`, `get_celo_transaction`, `get_celo_recent_transactions`, `get_celo_gas_price`, `get_celo_fee_data`, `estimate_celo_transaction`, `call_celo_contract` |
| **Transactions (prepare-only)** | `celo_send`, `prepare_celo_swap`, `celo_swap_quote`, `celo_swap_execute` |
| **DeFi** | Aave (`get_aave_reserves`, `celo_aave_position`, `celo_aave_supply`, `get_celo_yield_opportunities`), Mento (`get_mento_rates`), Carbon (`find_carbon_opportunities`, `get_carbon_trade_quote`, `simulate_carbon_strategy`, …), `get_celo_defi_protocols` |
| **Risk & security** | `check_token_risk`, `check_contract_risk`, `check_malicious_transaction`, `explain_transaction_risk`, `get_portfolio_risk_score` |
| **Whales & copy-wallet** | `get_whale_wallet_activity`, `analyze_copy_wallet_strategy`, `compare_wallets` |
| **Identity & payments** | Self (`self_verify`, `self_agent_id_check`), x402 payments, GoodDollar UBI (`claim_daily_gooddollar_ubi`, reserve swaps) |
| **Governance & staking** | `get_governance_proposals`, `get_validator_groups`, `get_staking_balances`, `get_total_staking_info` |
| **NFTs** | `get_nft_balance`, `get_celo_nft_balances`, `get_nft_token_info` |
| **Token launcher** | `launch_celo_token` |
| **Docs** | `celo_docs_explain` — plain-English answers from live Celo docs |

---

## REST API (apps/api)

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/chat` | Main chat: intent router → MCP tools / docs / risk |
| `GET` | `/api/chat/history` | Chat history |
| `POST` | `/api/docs/ask` | Docs assistant |
| `POST` | `/api/risk/check` | Token / contract / tx risk |
| `POST` | `/api/whales/watch` | Track a whale wallet |
| `GET` | `/api/dashboard/metrics` | Dashboard metrics |
| `GET` | `/api/health`, `/api/health/config` | Health + config status |
| `GET`/`POST` | `/mcp`, `/mcp/info` | MCP over HTTP |

---

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind, shadcn/ui + Radix, recharts, framer-motion. Wallet via **wagmi + viem + Reown AppKit (WalletConnect)**.
- **Backend API:** Node 20, TypeScript, **Fastify**. zod validation.
- **MCP server:** official MCP TypeScript SDK, stdio + HTTP transports.
- **AI layer (multi-provider, auto-detected from env):** Groq, Cohere, OpenRouter, Gemini via the Vercel **AI SDK**. Set `AI_PROVIDER` to force one; `AI_SYNTH_PROVIDER`/`AI_SYNTH_MODEL` to route the final answer through a stronger model. If no provider is reachable, a deterministic source-labeled fallback formatter is used.
- **On-chain & market data:** Celo RPC (viem), **Blockscout v2** (balances, holders, token info, txs), **GeckoTerminal / CoinGecko** (prices, DEX), **DefiLlama** (TVL/yield), **Dune Analytics** (trending tokens, whale leaderboards via saved-query IDs).
- **Caching:** Upstash Redis REST with in-memory fallback (`cached(key, ttl, fn)`).
- **Storage/logs:** SQLite locally (tool calls, transactions, chat messages, watched wallets, risk checks, portfolio snapshots); optional libSQL/Turso via `DATABASE_URL`.
- **Build:** esbuild-bundled to runnable `dist/` (`npm run build`); per-package tsconfigs are typecheck-only.
- **Deploy:** backend on Render (`render.yaml`, free tier); frontend on Vercel.

---

## Configuration

All keys are **optional** — CeloMind degrades gracefully. Set what you need in `backend/.env`:

```bash
# Network
CELO_NETWORK=celo                 # mainnet only
CELO_RPC_URL=                     # optional custom RPC (CELO_MAINNET_RPC_URL also honored)

# AI providers (set any; auto-detected). Optional — fallback formatter used if none.
AI_PROVIDER=                      # force one provider, otherwise auto
GROQ_API_KEY=
GROQ_MODEL_FAST=llama-3.1-8b-instant
GROQ_MODEL_SMART=llama-3.3-70b-versatile
COHERE_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=
AI_SYNTH_PROVIDER=                # optional: route final answer through a stronger model
AI_SYNTH_MODEL=

# Data sources (optional — public endpoints used if unset)
BLOCKSCOUT_API_KEY=
COINGECKO_API_KEY=
DUNE_API_KEY=                     # Analytics/SQL key (NOT Sim)
DUNE_QUERY_TRENDING_TOKENS=
DUNE_QUERY_TOP_WHALES=

# Caching (optional)
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# Storage (optional — SQLite used locally by default)
DATABASE_URL=
DATABASE_AUTH_TOKEN=
```

---

## Scripts

**Backend** (`cd backend`):

| Command | Does |
| --- | --- |
| `npm run dev` | Run the API in watch mode (port 3001) |
| `npm run build` | esbuild bundle API + MCP server to `dist/` |
| `npm start` | Run the built API |
| `npm run start:mcp` | Run the built MCP server (stdio) |
| `npm test` | Vitest suite |
| `npm run smoke` | Smoke test against a running server |
| `npm run typecheck` | Type-check only |

**Frontend** (`cd frontend`):

| Command | Does |
| --- | --- |
| `npm run dev` | Next.js dev server (port 3000) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run type-check` | Type-check only |

---

## Safety model

- Every write intent (`celo_send`, `celo_swap_execute`, `celo_aave_supply`, x402 payments, etc.) is **prepared by the backend and signed by the connected wallet** — the server never holds keys or auto-submits.
- Copy-wallet tools **analyze and prepare only**; they never auto-trade.
- The landing-page chat preview is demo-safe and blocks live write actions.

---

## License

Open source. Contributions welcome — issues and PRs from Celo builders especially.
