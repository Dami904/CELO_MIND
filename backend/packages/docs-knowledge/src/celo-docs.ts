export type DocEntry = {
  topic: string;
  keywords: string[];
  content: string;
};

export const CELO_DOCS: DocEntry[] = [
  {
    topic: "What is Celo?",
    keywords: ["celo", "what is", "overview", "introduction", "layer 1", "blockchain"],
    content: `Celo is an EVM-compatible layer-1 blockchain optimized for mobile-first DeFi and real-world payments.
It uses a Proof-of-Stake consensus (via PBFT/Tendermint), with validators elected by CELO holders through on-chain governance.
Native stablecoins (cUSD, cEUR, cREAL) are backed by a collateral reserve managed on-chain.
Gas fees can be paid in any Celo stablecoin — not just CELO — making it uniquely user-friendly.
Celo Mainnet Chain ID: 42220. Alfajores Testnet Chain ID: 44787.`,
  },
  {
    topic: "Celo vs Ethereum",
    keywords: ["celo vs ethereum", "differences", "evm compatible", "gas token"],
    content: `Celo is EVM-compatible but with key differences:
- Gas fees can be paid in cUSD, cEUR, or other stablecoins (not just native CELO).
- Mobile-first phone number mapping via SocialConnect (formerly ODIS).
- On-chain governance for protocol upgrades.
- Native stablecoin reserve (collateralized basket of assets).
- Faster block times (~5 seconds) and lower fees than Ethereum mainnet.`,
  },
  {
    topic: "Celo Stablecoins",
    keywords: ["stablecoin", "cusd", "ceur", "creal", "celo dollar", "celo euro", "stable"],
    content: `Celo has native stablecoins maintained by the Mento protocol:
- cUSD (Celo Dollar): pegged to USD. Mainnet: 0x765DE816845861e75A25fCA122bb6898B8B1282a
- cEUR (Celo Euro): pegged to EUR. Mainnet: 0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73
- cREAL (Celo Brazilian Real): pegged to BRL. Mainnet: 0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787
They are ERC-20 tokens and can be used to pay gas.
All stablecoins are backed by the Celo Reserve, a basket of assets including BTC, ETH, CELO, and DAI.`,
  },
  {
    topic: "Celo Wallets",
    keywords: ["wallet", "metamask", "valora", "celo wallet", "setup", "connect"],
    content: `Popular wallets for Celo:
- Valora: Mobile-first wallet built for Celo, supports phone number mapping.
- MetaMask: Add Celo by setting RPC URL to https://forno.celo.org, Chain ID 42220.
- Coinbase Wallet: Supports Celo natively.
- MiniPay (Opera): Embedded stablecoin wallet in Opera browser.
For Alfajores testnet: RPC https://alfajores-forno.celo-testnet.org, Chain ID 44787.
Get testnet CELO from the faucet at faucet.celo.org.`,
  },
  {
    topic: "Sending CELO",
    keywords: ["send", "transfer", "celo", "transaction", "viem", "ethers"],
    content: `Sending CELO is identical to sending ETH on Ethereum due to EVM compatibility.
Using viem:
  const hash = await walletClient.sendTransaction({ to, value: parseEther(amount) });
CELO token address on mainnet: 0x471EcE3750Da237f93B8E339c536989b8978a438 (also native).
Alfajores faucet: https://faucet.celo.org (get testnet CELO).
Always confirm gas fees before sending; gas can be paid in cUSD by setting feeCurrency.`,
  },
  {
    topic: "Mento Swap / DEX",
    keywords: ["swap", "exchange", "mento", "dex", "uniswap", "trade", "quote"],
    content: `Mento is Celo's built-in AMM for stablecoin swaps (e.g., CELO ↔ cUSD).
For token swaps, Uniswap V3 is also deployed on Celo mainnet.
Uniswap V3 Router on Celo: 0xE592427A0AEce92De3Edee1F18E0157C05861564
Mento Broker (mainnet): 0x6a0eEF2bed4C30Dc2CB42fe6c5f01F80f7EF16d
Swap flow: get quote → user confirms → execute swap.
For testnet swaps use Mento app at app.mento.finance (switch to Alfajores).`,
  },
  {
    topic: "Aave on Celo",
    keywords: ["aave", "lending", "borrow", "supply", "collateral", "defi", "interest"],
    content: `Aave V3 is deployed on Celo mainnet, enabling lending and borrowing of CELO assets.
Key contracts (Celo mainnet):
- Pool: 0x3E59A31363E6b6d5E4BF2b15D01Fc8a52f1De78
- Pool Addresses Provider: 0xd496aE879B4c8E39fAA64CFb73Fd79aB14a7F28
Supported assets: CELO, cUSD, cEUR, USDC, WETH.
Supply assets to earn interest; borrow against collateral.
Health factor must stay above 1.0 to avoid liquidation.`,
  },
  {
    topic: "Self Protocol",
    keywords: ["self", "identity", "kyc", "verification", "passport", "selfxyz", "human"],
    content: `Self (selfxyz.com) is a privacy-preserving identity protocol built on Celo.
It enables on-chain proof of humanity using real-world documents (passport, ID) via ZK proofs.
Key concepts:
- Users scan their passport/ID with the Self mobile app.
- ZK proof generated locally — raw data never leaves the device.
- On-chain verification via Self smart contracts on Celo.
- Use cases: Sybil resistance, KYC-gating, undercollateralized lending.
Verification endpoint: check Self SDK docs at docs.selfxyz.com.`,
  },
  {
    topic: "x402 Payment Protocol",
    keywords: ["x402", "payment", "http", "402", "micropayment", "paywall"],
    content: `x402 is a Coinbase-backed HTTP payment protocol built on top of the HTTP 402 status code.
It enables machine-to-machine micropayments for API access.
Flow:
1. Server returns HTTP 402 with payment requirements in headers.
2. Client sends a signed payment transaction.
3. Server verifies and unlocks content.
On Celo: x402 uses USDC or cUSD for payments.
Useful for AI agents that need to pay for API access autonomously.`,
  },
  {
    topic: "MCP and Claude Desktop",
    keywords: ["mcp", "claude", "desktop", "model context protocol", "tool", "agent", "setup"],
    content: `CeloMind MCP lets Claude Desktop use Celo tools directly.
Setup:
1. Run the MCP server: node packages/mcp-server/dist/index.js
2. Add to Claude Desktop config (~/.claude/claude_desktop_config.json):
{
  "mcpServers": {
    "celomind": {
      "command": "node",
      "args": ["/path/to/celomind/packages/mcp-server/dist/index.js"],
      "env": {
        "CELO_NETWORK": "alfajores",
        "ANTHROPIC_API_KEY": "your-key"
      }
    }
  }
}
3. Restart Claude Desktop. Type "use celomind" to activate tools.`,
  },
  {
    topic: "Gas Fees on Celo",
    keywords: ["gas", "fee", "feecurrency", "gwei", "cost", "pay gas"],
    content: `Celo gas fees are very low — typically under $0.001 per transaction.
Unique feature: gas can be paid in any whitelisted token (cUSD, cEUR, CELO).
To pay gas in cUSD with viem:
  const tx = await walletClient.sendTransaction({
    to, value, feeCurrency: '0x765DE816...' // cUSD address
  });
Alfajores testnet gas is free (testnet CELO from faucet).`,
  },
  {
    topic: "Celo Governance",
    keywords: ["governance", "vote", "proposal", "cgp", "on-chain", "validator"],
    content: `Celo uses on-chain governance for all protocol upgrades (Celo Governance Proposals / CGPs).
CELO holders vote on proposals. Locked CELO has voting power.
Validators are elected by CELO holders; there are up to 110 elected validators.
Governance contract (mainnet): 0xD533Ca259b330c7A88f74E000a3FaEa2d63B7972
All protocol fee changes, reserve allocations, and new features go through governance.`,
  },
  {
    topic: "Blockscout / Celoscan",
    keywords: ["explorer", "blockscout", "celoscan", "transaction", "verify", "scan"],
    content: `Celo has two block explorers:
- Celoscan (mainnet): https://celoscan.io — Etherscan-style interface.
- Celoscan (Alfajores): https://alfajores.celoscan.io
API endpoint for Alfajores: https://alfajores.celoscan.io/api?module=...
Use the API key (optional for free tier) from celoscan.io/myapikey.
Blockscout also runs at https://explorer.celo.org (mainnet).`,
  },
  {
    topic: "DeFi on Celo",
    keywords: ["defi", "protocol", "yield", "liquidity", "farming", "tvl", "ecosystem"],
    content: `Key DeFi protocols on Celo:
- Mento: Native stablecoin AMM (swap CELO ↔ cUSD, cEUR, cREAL).
- Uniswap V3: Full V3 deployment on Celo mainnet.
- Aave V3: Lending/borrowing with CELO assets.
- Curve Finance: Stablecoin pool (cUSD/USDC etc.).
- Mobius Money: Celo-native stableswap.
- GoodDollar: Universal basic income on Celo.
TVL data available from DefiLlama: https://defillama.com/chain/Celo`,
  },
  {
    topic: "Token Risk Assessment",
    keywords: ["risk", "rug", "scam", "honeypot", "contract", "audit", "safe"],
    content: `When evaluating token/contract risk on Celo:
- Check contract verification on Celoscan (unverified = high risk).
- Check liquidity lock and LP ownership.
- Look for ownership renounced or multisig.
- Check token holder concentration (top 10 holders > 50% = risky).
- Review contract for mint/pause functions.
- Check age: new contracts (<7 days) with no audit = high risk.
- Cross-reference on GeckoTerminal for liquidity depth.
Never invest more than you can lose in unaudited contracts.`,
  },
  {
    topic: "Whale Wallets",
    keywords: ["whale", "large", "holder", "track", "watch", "copy", "follow"],
    content: `Whale wallets on Celo are large CELO or stablecoin holders.
You can track them via:
- Celoscan API: /api?module=account&action=balance&address=...
- DefiLlama for protocol-level whale positions.
- On-chain token transfer events.
Copy-wallet analysis: compare your portfolio to a whale's and identify gaps.
IMPORTANT: Never blindly copy trades. Always simulate first and understand the rationale.
CeloMind never auto-executes copy-wallet trades — it only prepares transaction data for user review.`,
  },
];

export function searchDocs(query: string): DocEntry[] {
  const q = query.toLowerCase();
  const scored = CELO_DOCS.map((entry) => {
    const topicMatch = entry.topic.toLowerCase().includes(q) ? 3 : 0;
    const keywordMatches = entry.keywords.filter((k) => q.includes(k) || k.includes(q)).length;
    const contentMatch = entry.content.toLowerCase().includes(q) ? 1 : 0;
    return { entry, score: topicMatch + keywordMatches * 2 + contentMatch };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.entry);
}

export function buildDocsContext(query: string, maxEntries = 3): string {
  const results = searchDocs(query).slice(0, maxEntries);
  if (results.length === 0) {
    return "No specific Celo documentation found for this query. Answer based on general Celo knowledge.";
  }
  return results.map((r) => `### ${r.topic}\n${r.content}`).join("\n\n");
}
