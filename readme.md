# CeloMind

**[Live demo](https://celomind.vercel.app/) · [GitHub](https://github.com/Dami904/CELO_MIND)**

CeloMind is an **AI assistant for the Celo blockchain**. You connect your wallet, ask questions in plain English, and it does the heavy lifting — checking balances, spotting risky tokens, tracking whale wallets, explaining docs,launching new tokens and preparing transactions for you to confirm.

Think of it like having a crypto-savvy assistant that knows everything happening on Celo in real time, but never touches your money without your permission.

---

## What can it actually do?

Here are real scenarios:

---

**"What's in my wallet right now?"**
> Connect your Celo wallet and ask. CeloMind pulls your CELO, cUSD, cEUR, and any other token balances plus a full portfolio breakdown — no block explorer needed.

---

**"Is this token safe to buy?"**
> Paste a contract address into the chat. CeloMind checks the token's holder distribution, liquidity, contract code risk, and recent transaction patterns, then gives you a plain-English risk verdict: safe, caution, or avoid.

---

**"I want to swap 10 CELO for cUSD — what's the best rate?"**
> Ask in the chat. CeloMind fetches live quotes from Celo DEXes, shows you the rate and fees, and prepares the swap transaction. You review it and confirm with your wallet — CeloMind never submits anything on your behalf.

---

**"Show me what the top whale wallets have been doing today."**
> CeloMind surfaces the biggest Celo wallet movements, lets you track specific addresses, and can analyze the strategy behind a wallet's recent trades — useful for spotting trends or finding copy-trade opportunities (analysis only, never auto-executes).

---

**"How do I set up Aave on Celo to earn yield?"**
> Ask the docs assistant. It reads live Celo documentation and explains it in simple terms — no need to wade through technical docs. It can also check your current Aave position and prepare a supply transaction for you to sign.

---

**"Explain this transaction hash to me."**
> Paste any tx hash and CeloMind breaks down what happened in plain English: who sent what to whom, what contract was called, whether anything looks suspicious, and what the fees were.

---

**"What tokens are trending on Celo right now?"**
> CeloMind queries live DEX data and shows you trending tokens by volume, newly launched tokens, top tokens by holders and market cap, and current prices — all in one place.

---

## How it works (the simple version)

```
You type a question or request
        ↓
CeloMind's AI figures out what you need
        ↓
It calls the right data sources (Celo blockchain, DEXes, market data, docs)
        ↓
You get a plain-English answer
        ↓
If a transaction is needed, it's prepared and shown to you — your wallet signs it
```

Your wallet keys never leave your device. CeloMind prepares; you confirm.

---

## Two ways to use it

### 1. Web dashboard (no setup needed)
Go to **[celomind.vercel.app](https://celomind.vercel.app/)**, connect your Celo wallet, and start chatting. Works in any browser.

### 2. Inside Claude Desktop (for developers)
Builders can plug CeloMind directly into Claude Desktop as an MCP server. This gives Claude 70+ Celo tools it can use autonomously — wallet reads, market data, risk checks, DeFi interactions, governance, NFTs, and more.

```bash
# Clone and build
git clone https://github.com/Dami904/CELO_MIND.git
cd CELO_MIND/backend
npm install && npm run build
```

Then add this to your `claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "celomind": {
      "command": "node",
      "args": ["/absolute/path/to/CELO_MIND/backend/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop and it now has full Celo intelligence.

---

## Running it locally (developers)

```bash
# Terminal 1 — backend API (port 3001)
cd backend
npm install
npm run dev

# Terminal 2 — frontend (port 3000)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. No API keys required to get started — CeloMind falls back to public data sources automatically. Add keys to unlock AI-powered answers and richer market data (see Configuration below).

---

## What it covers — 70+ tools

| Category | What you can ask about |
| --- | --- |
| **Your wallet** | Balances, portfolio value, transaction history, token holdings, NFTs |
| **Market data** | Token prices, trending tokens, new launches, top pools, price history, market cap |
| **Swaps & sends** | Live swap quotes, send CELO/tokens, estimate fees — all prepare-only |
| **DeFi & yield** | Aave positions and lending, Mento stablecoin rates, Carbon DEX strategies, yield opportunities |
| **Security** | Token risk scores, contract audits, malicious transaction detection, portfolio risk |
| **Whale tracking** | Big wallet movements, copy-wallet strategy analysis, wallet comparisons |
| **Identity & payments** | Self Protocol verification, x402 micropayments, GoodDollar UBI |
| **Governance & staking** | Active proposals, validator groups, your staking balances |
| **Network** | Block explorer data, gas prices, network stats, raw contract calls |
| **Celo docs** | Plain-English explanations of anything in the Celo documentation |

---

## Your money stays safe

CeloMind follows one rule: **it never touches your money without you confirming it first.**

- Every transaction — send, swap, lend, pay — is built by CeloMind and shown to you. Your wallet signs it. Nothing goes through otherwise.
- Copy-wallet features only analyze and suggest. They never place trades automatically.
- The demo on the landing page is sandboxed — no real transactions can be triggered there.

---

## Configuration (optional)

CeloMind works out of the box with zero config. If you want AI-powered answers or richer data, create `backend/.env` and add what you have:

```bash
# AI — pick any one (or more); auto-detected
GROQ_API_KEY=          # free tier available at console.groq.com
COHERE_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=

# Richer market & whale data (optional)
BLOCKSCOUT_API_KEY=
COINGECKO_API_KEY=
DUNE_API_KEY=

# Faster responses — Redis caching (optional)
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

---

## Project structure (for developers)

```text
CELO_MIND/
├── backend/                   # API server + MCP server
│   ├── apps/api/              # REST API (Fastify, Node 20)
│   ├── packages/mcp-server/   # 70+ Celo MCP tools
│   ├── packages/shared/       # shared types, caching, config
│   └── packages/docs-knowledge/  # Celo docs fetcher
└── frontend/                  # Dashboard + chat UI (Next.js, React 19)
```

Backend runs on port `3001`. Frontend on port `3000`.

---

## Built with

- **Frontend:** Next.js, React, Tailwind CSS, shadcn/ui — wallet connection via WalletConnect (Reown AppKit)
- **Backend:** Node.js, Fastify, TypeScript
- **AI:** Groq / Cohere / OpenRouter / Gemini (any one, auto-detected)
- **Blockchain:** Celo mainnet — viem, Blockscout, GeckoTerminal, CoinGecko, DefiLlama, Dune Analytics
- **Deployed:** backend on Render, frontend on Vercel

---

## License

Open source. Issues and PRs welcome — especially from Celo builders.
