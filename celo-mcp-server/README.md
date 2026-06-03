# Celo MCP Server

Open-source MCP server giving any LLM read + write access to Celo.

## Packages
- \packages/server\        — Core MCP server (publishable npm package)
- \packages/demo-dashboard\ — Next.js visual demo (Vercel-deployable)

## Quick Start
\\\ash
cp .env.example .env          # fill in your private key
npm install
npm run build
npm run dev
\\\

## Tools
| Tool                 | Description                          |
|----------------------|--------------------------------------|
| get_balance          | Check CELO / cUSD / ERC-20 balance   |
| send_tokens          | Transfer any token                   |
| swap_tokens          | Swap via Ubeswap V3                  |
| lend_on_aave         | Supply / borrow / withdraw on Aave   |
| self_verify          | Verify Self Protocol ZK proof        |
| self_agent_id_check  | Check agent ID via ai.self.xyz       |
| x402_pay             | HTTP 402 micropayment flow           |
| get_transaction      | Fetch tx receipt + status            |
| get_token_price      | Live price via CoinGecko free tier   |
