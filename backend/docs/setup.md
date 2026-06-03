# CeloMind Backend Setup Guide

## Prerequisites
- Node.js >= 20
- npm >= 10
- One or more AI provider API keys (see AI Providers below)

## Quick Start

```bash
# 1. Clone and install (backend lives in the backend/ folder)
git clone <repo>
cd celomind/backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your keys

# 3. Build all packages
npm run build

# 4. Start the API server
npm run dev
# API available at http://localhost:3001
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CELO_NETWORK` | No | `celo` (mainnet-only) |
| `CELO_RPC_URL` | No | Override the default RPC endpoint |
| `ANTHROPIC_API_KEY` | For Claude | Claude AI responses |
| `OPENAI_API_KEY` | For ChatGPT | OpenAI / ChatGPT responses |
| `GEMINI_API_KEY` | For Gemini | Google Gemini responses |
| `DEEPSEEK_API_KEY` | For DeepSeek | DeepSeek responses |
| `AI_PROVIDER` | No | Force a provider: `claude`, `openai`, `gemini`, `deepseek` |
| `CELO_PRIVATE_KEY` | Write tools only | Wallet private key — never commit this |
| `BLOCKSCOUT_API_KEY` | No | Increases Celoscan rate limits |
| `PORT` | No | API port (default: 3001) |
| `DATABASE_URL` | No | SQLite path (default: `./celomind.db`) |

## AI Providers

CeloMind auto-detects which provider to use based on which API key is set.
Override with `AI_PROVIDER=<name>` in your `.env`.

| Provider | Env Key | Default Model |
|---|---|---|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| ChatGPT (OpenAI) | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |

Override model with `CLAUDE_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`, or `DEEPSEEK_MODEL`.

## API Routes

```
GET  /api/health                     Health check
GET  /api/dashboard/metrics          Celo price, TVL, trending tokens
GET  /api/wallet/:address/balances   CELO + token balances for a wallet
GET  /api/transactions?address=0x..  Recent transactions for a wallet
POST /api/chat                       Unified chatbot for all surfaces
POST /api/docs/ask                   Celo documentation assistant
POST /api/risk/check                 Contract / token / tx risk analysis
POST /api/whales/watch               Track a whale wallet
GET  /api/whales/:address/analyze    Copy-wallet analysis
POST /api/tools/:tool/run            Run a specific tool directly
```

### POST /api/chat — Request Body

```json
{
  "message": "What is my CELO balance?",
  "walletAddress": "0x...",
  "chatbotType": "full",
  "pageContext": "dashboard",
  "selectedTool": null,
  "conversationId": "uuid-optional"
}
```

`chatbotType` values: `full` | `mini` | `landing` | `docs` | `tool`

### Standard Response Shape

```json
{
  "success": true,
  "action": "chat",
  "network": "celo",
  "data": { ... },
  "error": null,
  "timestamp": "2026-06-02T12:00:00.000Z",
  "uiHints": { "type": "result_card" }
}
```

`uiHints.type` values for frontend rendering:
- `result_card` — general result
- `portfolio_card` — wallet balances / portfolio
- `transaction_card` — transaction list
- `risk_card` — risk report
- `token_card` — token info
- `docs_answer` — documentation response
- `confirmation_required` — write action needs user approval
- `error_card` — error state

## Claude Desktop MCP Setup

1. Build the MCP server (bundles the whole project to runnable `dist/`):
   ```bash
   npm run build
   ```

2. Copy `docs/claude-desktop-config.json` to your Claude Desktop config:
   - macOS: `~/.claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

3. Update the absolute path in the config:
   ```json
   "args": ["/absolute/path/to/celomind/backend/packages/mcp-server/dist/index.js"]
   ```

4. Add your API key and restart Claude Desktop.

5. In Claude Desktop, type: **"Use celomind to check my Celo balance"**

## MCP Tools Available in Claude Desktop

**Balances:** `celo_get_balance`, `celo_get_token_balance`  
**Send:** `celo_send`  
**Swap:** `celo_swap_quote`, `celo_swap_execute`, `prepare_celo_swap`  
**Aave:** `celo_aave_position`, `celo_aave_supply`  
**Identity:** `self_verify`, `self_agent_id_check`, `x402_pay`  
**Docs:** `celo_docs_explain`  
**Market:** `get_trending_celo_tokens`, `get_celo_token_info`, `get_celo_token_price`, `get_celo_wallet_portfolio`, `get_celo_recent_transactions`, `get_recently_launched_celo_tokens`  
**Risk:** `check_malicious_transaction`, `check_contract_risk`, `check_token_risk`, `explain_transaction_risk`, `get_portfolio_risk_score`  
**Whale:** `watch_whale_wallet`, `get_whale_wallet_activity`, `compare_wallets`, `analyze_copy_wallet_strategy`, `prepare_copy_wallet_action`

## Running Tests

```bash
npm test
```

## Demo Flow

```bash
# Health check
curl http://localhost:3001/api/health

# Dashboard metrics (live prices + TVL)
curl http://localhost:3001/api/dashboard/metrics

# Wallet balances
curl http://localhost:3001/api/wallet/0xYOUR_ADDRESS/balances

# Chat
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is Celo?","chatbotType":"docs"}'

# Risk check
curl -X POST http://localhost:3001/api/risk/check \
  -H "Content-Type: application/json" \
  -d '{"type":"contract","target":"0xCONTRACT_ADDRESS","network":"celo"}'

# Docs assistant
curl -X POST http://localhost:3001/api/docs/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"How do I pay gas fees with cUSD?"}'
```

## Security Rules

- Mainnet-only: all reads and writes are on Celo mainnet. Use small amounts for write actions.
- Read tools work without a private key.
- Write tools (`celo_send`, `celo_swap_execute`, `celo_aave_supply`) require `CELO_PRIVATE_KEY`.
- The landing chatbot never executes write operations.
- Copy-wallet actions are prepared for review only — never auto-executed.
- Private keys are never stored in the database or returned in API responses.
