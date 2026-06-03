# CeloMind MCP: Full Team Plan

## Current Repository Structure
CeloMind is now organized as two top-level applications:

- `frontend/` - the self-contained Next.js dashboard and chat UI.
- `backend/` - the canonical mainnet-only API, MCP server, shared packages, docs knowledge, dashboard metrics module, tests, and build scripts.

Run the backend locally with `cd backend && npm run dev` on port `3001`, then run the frontend with `cd frontend && npm run dev` on port `3000`. The frontend reads `NEXT_PUBLIC_API_BASE_URL` and defaults to `http://localhost:3001`.

The project now targets Celo mainnet (`celo`, chain ID `42220`) only. Write actions are prepared by the backend and must be signed by the connected wallet in the frontend.

## 1. Product Summary
CeloMind MCP is an **investor-pitch-ready full dashboard + open-source TypeScript MCP server** for Celo.

It gives AI agents and users one place to:
- Connect Celo wallets.
- Ask chatbots to perform Celo actions.
- Read wallet balances, portfolios, transactions, and token data.
- Prepare swaps, sends, Aave lending, Self verification, agent-ID checks, and x402 payments.
- Explain/demystify Celo docs for builders.
- Detect risky tokens, suspicious transactions, whale movements, and copy-wallet opportunities.

Main pitch: **“CeloMind MCP turns Celo into AI-agent-ready blockchain infrastructure.”**

Core references/data sources:
- Celo docs: https://docs.celo.org
- MCP SDK docs: https://modelcontextprotocol.io/docs/sdk
- Blockscout API: https://docs.blockscout.com/devs/apis/rest
- GeckoTerminal/CoinGecko data: https://www.geckoterminal.com/dex-api/
- DefiLlama API/docs: https://defillama.com/docs/api

## 2. Main Requirements
- Build an open-source **TypeScript MCP server** for Celo.
- Build a **full frontend dashboard**, not just a landing page.
- Build multiple chatbot surfaces, all sharing the same backend intelligence.
- Bot must connect to Celo wallets and support wallet-aware actions.
- Bot must explain Celo docs in simple language.
- Use free/open-source tools as much as possible.
- Demo should use **Celo mainnet** with wallet confirmation for every write action.
- Every write action must require confirmation.
- Copy-wallet features must analyze/prepare first, never auto-trade.
- Final output must support investor pitch, demo video, and team presentation.

## 3. Product Pages
- **Landing Page:** investor story, hero, product preview, chat preview, problem, solution, Celo opportunity, supported tools, demo CTA.
- **Dashboard Page:** wallet balance, MCP calls, transactions, market metrics, whale alerts, risk alerts, active tools.
- **Full Chatbot Page:** main AI assistant for all Celo actions, docs, wallet intelligence, and market/security questions.
- **Mini Side Chatbot:** floating compact assistant across dashboard pages with the same backend abilities.
- **Wallet Page:** connect wallet, show Celo network, CELO/cUSD/cEUR balances, portfolio, wrong-network state.
- **Tools Page:** blockchain tools, market tools, risk tools, whale tools, docs tools.
- **Docs Assistant Page:** explains Celo docs, viem, RPC, wallets, stablecoins, Self, x402, Aave, MCP setup.
- **Transactions Page:** recent txs, tx hash explanations, risk checks, status.
- **Whale Watch Page:** tracked wallets, high-value transfers, whale activity.
- **Copy Wallet Page:** analyze wallet strategy, compare wallets, prepare copy action.
- **Integrations Page:** Claude Desktop MCP config, install steps, API examples.
- **Pitch/Demo Page:** architecture, screenshots, demo script, final story.

## 4. Tech Stack
- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react.
- **Wallet:** wagmi, viem, WalletConnect/Web3Modal.
- **Backend API:** Node.js, TypeScript, Fastify or Express.
- **MCP Server:** official MCP TypeScript SDK.
- **Blockchain:** viem, Celo RPC, Celo mainnet only.
- **Validation:** zod.
- **Docs Assistant:** curated Celo Markdown docs + simple RAG/context search.
- **Data/logs:** SQLite locally or Supabase free tier.
- **Market/on-chain data:** Celo RPC, Blockscout, GeckoTerminal/CoinGecko, DefiLlama.
- **Testing:** Vitest, React Testing Library, Playwright.
- **Deployment:** Vercel free tier for frontend; Render/Railway/Fly free tier for backend if available.
- **Video:** OBS Studio, CapCut or DaVinci Resolve free version.

## 5. Suggested Repo Structure
```text
apps/web                 # landing, dashboard, chatbots, wallet UI
apps/api                 # backend API for dashboard, chat, logs
packages/mcp-server      # Celo MCP server tools
packages/shared          # shared zod schemas, types, constants
packages/docs-knowledge  # curated Celo docs/context
docs                     # pitch docs, setup guide, demo script
```

Core flow:
```text
Any chatbot UI -> /api/chat -> intent router -> MCP tool/docs assistant/security module
Wallet UI -> wagmi/viem -> Celo confirmation
MCP server -> Celo/Blockscout/GeckoTerminal/DefiLlama/Self/x402/Aave -> structured response
```

## 6. Chatbot Requirements
All chatbot types must support the same features:
- Celo docs explanation.
- Wallet connection awareness.
- Balance and token balance checks.
- Send, swap, Aave position/supply.
- Self verify and Self agent-ID check.
- x402 payment.
- Trending Celo tokens.
- Token info, price, volume, liquidity, market cap, holder/risk notes where available.
- Wallet portfolio.
- Recent wallet transactions.
- Prepare swap quote.
- Recently launched Celo tokens.
- Malicious transaction check.
- Contract/token risk check.
- Whale wallet watch.
- Copy-wallet analysis and prepare-only action.
- Transaction hash explanation.
- MCP setup and Claude Desktop setup help.

Chatbot surfaces:
- **Full Chatbot:** complete workflows and detailed answers.
- **Mini Chatbot:** same features, shorter compact UI.
- **Landing Chat Preview:** demo-safe; no live write actions.
- **Docs Assistant Chat:** docs-first, but can route to wallet/tools.
- **Tool Embedded Chat:** contextual help, but can route to all features.

## 7. MCP / Backend Tools
Core Celo tools:
```text
celo_get_balance
celo_get_token_balance
celo_send
celo_swap_quote
celo_swap_execute
celo_aave_position
celo_aave_supply
self_verify
self_agent_id_check
x402_pay
celo_docs_explain
```

Celo market intelligence tools:
```text
get_trending_celo_tokens
get_celo_token_info
get_celo_token_price
get_celo_wallet_portfolio
get_celo_recent_transactions
prepare_celo_swap
get_recently_launched_celo_tokens
```

Security, whale, and copy-wallet tools:
```text
check_malicious_transaction
check_contract_risk
check_token_risk
watch_whale_wallet
get_whale_wallet_activity
compare_wallets
analyze_copy_wallet_strategy
prepare_copy_wallet_action
detect_suspicious_wallet_behavior
explain_transaction_risk
monitor_new_token_launches
find_high_activity_wallets
get_wallet_profit_loss
get_wallet_behavior_summary
get_portfolio_risk_score
get_defi_yield_opportunities
```

Backend API routes:
```text
GET  /api/health
GET  /api/dashboard/metrics
GET  /api/wallet/:address/balances
GET  /api/transactions
POST /api/tools/:tool/run
POST /api/chat
POST /api/docs/ask
POST /api/risk/check
POST /api/whales/watch
```

Every backend response:
```text
success, action, network, data, error, timestamp, uiHints
```

## 8. Role Guide: Frontend Developer
1. Set up Next.js, TypeScript, Tailwind, shadcn/ui, lucide icons, wagmi, viem, WalletConnect/Web3Modal.
2. Build app shell: sidebar, top wallet bar, responsive layout.
3. Build landing page with product preview and chat preview.
4. Build dashboard with metrics, wallet summary, activity feed, market cards, whale alerts, risk alerts.
5. Build wallet page with connect wallet, network state, balances, portfolio.
6. Build shared chatbot component system for full chat, mini chat, docs chat, landing preview, and embedded tool chat.
7. Build tools page with blockchain, market, risk, whale, and copy-wallet tools.
8. Build docs assistant, transactions, whale watch, copy wallet, integrations, and pitch/demo pages.
9. Add loading, empty, error, success, confirmation, and fallback states.
10. Make frontend demo-ready by Friday, then only critical fixes Saturday.

## 9. Role Guide: Backend / Blockchain / Integration Developer
1. Set up Node.js/TypeScript backend and MCP server.
2. Add Celo RPC, testnet/mainnet config, token constants, env vars, zod schemas.
3. Build shared `/api/chat` route used by all chatbot surfaces.
4. Build intent router for docs, wallet, market, risk, whale, copy-wallet, MCP setup, and tx explanation.
5. Implement core Celo MCP tools.
6. Implement Celo market intelligence tools.
7. Implement malicious transaction, token risk, contract risk, whale watch, and copy-wallet analysis tools.
8. Add docs assistant using curated Celo docs/context.
9. Ensure read-only tools work without signer.
10. Ensure write tools require wallet/signer confirmation.
11. Add Claude Desktop MCP config and README setup.
12. Add tests for validation, routing, Celo reads, risk fallback, and failed RPC cases.

## 10. Role Guide: Software Tester
1. Create checklist for every page and every chatbot type.
2. Test wallet connect, wrong network, balances, portfolio, and transactions.
3. Test all chatbot prompts from full chat, mini chat, docs chat, landing preview, and tool chats.
4. Test docs explanation quality and uncertainty behavior.
5. Test market tools: trending tokens, token price, token info, recent launches.
6. Test risk tools: malicious tx, token risk, contract risk.
7. Test whale and copy-wallet tools.
8. Confirm no write/copy action executes without confirmation.
9. Run final demo flow and report critical bugs before Friday night.

## 11. Role Guide: Videographer / Demo Team
1. Write a 2-3 minute investor demo script.
2. Show the problem: Celo needs AI-agent rails.
3. Show landing page, dashboard, wallet connect, full chatbot, mini chatbot, docs assistant.
4. Show bot explaining Celo docs.
5. Show token intelligence, whale watch, malicious transaction check, and copy-wallet analysis.
6. Show one safe Celo testnet action with transaction result.
7. Add captions/zooms around wallet connect, MCP call, risk check, and tx hash.
8. End with: “CeloMind MCP turns Celo into AI-agent-ready infrastructure.”

## 12. Timeline: Tuesday To Saturday
### Tuesday, June 2, 2026
- **Frontend, 9 AM-5 PM:** setup, app shell, landing, dashboard shell, chatbot shells.
- **Backend, 9 AM-6 PM:** API/MCP skeleton, zod schemas, shared chat contract.
- **Tester, 4 PM-7 PM:** QA checklist.
- **Video, 5 PM-8 PM:** investor script outline.

### Wednesday, June 3, 2026
- **Frontend, 9 AM-6 PM:** wallet UI, dashboard metrics, chat prompts, market cards.
- **Backend, 9 AM-7 PM:** Celo balance, token balance, token price, wallet portfolio, recent tx tools.
- **Tester, 5 PM-8 PM:** test wallet, dashboard, chatbot shells, first APIs.
- **Video, 6 PM-8 PM:** rough demo sequence.

### Thursday, June 4, 2026
- **Frontend, 9 AM-6 PM:** tools page, docs assistant, whale page, copy-wallet page, all chatbot variants connected.
- **Backend, 9 AM-7 PM:** send, swap quote, Aave, trending tokens, token info, docs assistant, whale watch.
- **Tester, 5 PM-9 PM:** test docs, wallet, market, whale, copy-wallet prompts.
- **Video, 6 PM-9 PM:** final shot list.

### Friday, June 5, 2026
- **Frontend, 9 AM-5 PM:** polish UI, mobile, risk cards, confirmation states, demo data.
- **Backend, 9 AM-5 PM:** malicious tx checker, contract risk, token risk, Self, x402, agent-ID, Claude config.
- **Tester, 3 PM-8 PM:** full regression and critical bug list.
- **Video, 5 PM-9 PM:** first full recording.

### Saturday, June 6, 2026
- **Frontend, 9 AM-11 AM:** critical UI/demo fixes only.
- **Backend, 9 AM-11 AM:** critical backend/demo fixes only.
- **Tester, 11 AM-1 PM:** final smoke test and sign-off.
- **Video, 1 PM-5 PM:** final recording, captions, export.
- **Whole team, 5 PM-7 PM:** README, pitch/demo page, submission package, final rehearsal.

## 13. Frontend Prompt
```text
Build an investor-ready web app called CeloMind MCP.

CeloMind MCP is a full dashboard for an open-source MCP server that lets AI agents connect to Celo wallets, run Celo blockchain tools, explain Celo docs, analyze tokens, detect risky transactions, watch whale wallets, and prepare copy-wallet actions.

Use Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, lucide icons, wagmi, viem, and WalletConnect/Web3Modal.

Design:
Premium crypto infrastructure product. Clean light UI, deep charcoal text, Celo yellow accents, green success states, subtle blue technical accents. Avoid generic SaaS, childish visuals, huge rounded cards, and one-color purple designs.

Build pages:
Landing, Dashboard, Full Chatbot, Mini Side Chatbot, Wallet, Tools, Celo Docs Assistant, Transactions, Whale Watch, Copy Wallet, Integrations, Pitch/Demo.

Every chatbot surface must support:
Celo docs explanation, wallet-aware balance checks, token balances, send, swap quote/execute, Aave, Self verify, agent-ID check, x402 payment, trending Celo tokens, token info, token price, wallet portfolio, recent transactions, malicious tx checks, token/contract risk checks, whale watch, copy-wallet analysis, MCP setup, Claude Desktop setup, and transaction explanation.

All write actions must show confirmation before execution. Copy-wallet features must analyze and prepare only; never auto-execute. Use realistic mock data until backend is ready, but structure components for real API integration.
```

## 14. Backend Prompt
```text
Build the backend API and MCP server for CeloMind MCP.

Use Node.js, TypeScript, official MCP TypeScript SDK, viem, zod, Fastify or Express, SQLite or Supabase free tier, and Vitest. Default network is Celo testnet.

All chatbot surfaces must use the same shared POST /api/chat backend. Do not build separate limited bots.

Implement intent routing for:
docs_explain, balance, token_balance, send, swap_quote, swap_execute, aave_position, aave_supply, self_verify, agent_id_check, x402_pay, market_trending, token_info, token_price, wallet_portfolio, recent_transactions, recent_launches, malicious_tx_check, contract_risk, token_risk, whale_watch, whale_activity, copy_wallet_analyze, copy_wallet_prepare, transaction_explain, mcp_setup, claude_setup, unsupported.

Implement MCP tools:
celo_get_balance, celo_get_token_balance, celo_send, celo_swap_quote, celo_swap_execute, celo_aave_position, celo_aave_supply, self_verify, self_agent_id_check, x402_pay, celo_docs_explain, get_trending_celo_tokens, get_celo_token_info, get_celo_token_price, get_celo_wallet_portfolio, get_celo_recent_transactions, prepare_celo_swap, get_recently_launched_celo_tokens, check_malicious_transaction, check_contract_risk, check_token_risk, watch_whale_wallet, get_whale_wallet_activity, compare_wallets, analyze_copy_wallet_strategy, prepare_copy_wallet_action, explain_transaction_risk, get_portfolio_risk_score.

Rules:
Read-only tools work without signer. Write tools require wallet/signer confirmation. Never store private keys in frontend. Never auto-execute copy-wallet trades. Risk scores must explain why. If data is incomplete, say so clearly.

Every response must include:
success, action, network, data, error, timestamp, uiHints.

Also add Claude Desktop MCP config, README setup, env examples, and tests for validation, invalid addresses, missing signer, failed RPC, docs fallback, and shared chatbot routing.
```

## 15. Test / Acceptance Criteria
- Wallet connects to Celo testnet.
- All chatbot surfaces use the same backend features.
- Bot explains Celo docs clearly.
- Bot can show balances, portfolio, token price, trending tokens, and recent transactions.
- Bot can prepare swaps and copy-wallet actions without auto-execution.
- Bot can check malicious transactions and risky tokens/contracts.
- Whale watch page shows tracked wallet activity.
- All write actions require confirmation.
- Demo video can show landing → dashboard → wallet → chatbot → docs explanation → risk check → market intelligence → testnet action.

## 16. Assumptions
- Scope is **Investor Pitch + Full Dashboard**.
- Celo testnet is the main demo network.
- Market/risk/launch data is best-effort based on free provider availability.
- Risk analysis is guidance, not a guarantee.
- Paid infrastructure, production custody, enterprise auth, and automatic trading are out of scope for this Tuesday-Saturday build.
