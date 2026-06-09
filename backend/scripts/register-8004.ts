/**
 * Register the CeloMind agent on the ERC-8004 Identity Registry (Celo Mainnet).
 *
 * ERC-8004 ("Trustless Agents") mints an ERC-721 identity NFT for your agent and
 * points it at an "agent card" JSON describing its capabilities + endpoints.
 * 8004scan.io then indexes the agent from the on-chain Registered event.
 *
 * Registry (Celo mainnet, chainId 42220): 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   function register(string agentURI) returns (uint256 agentId)
 *   function setAgentURI(uint256 agentId, string agentURI)
 *   event Registered(uint256 indexed agentId, string agentURI, address indexed owner)
 *
 * The agent card is embedded directly on-chain as a base64 `data:` URI — no IPFS/hosting
 * needed, one transaction. (Set AGENT_URI to use a hosted https/ipfs URI instead.)
 *
 * Run (from backend/):
 *   CELO_PRIVATE_KEY=0x... npx tsx scripts/register-8004.ts
 *   DRY_RUN=1 npx tsx scripts/register-8004.ts        # build + print card, no tx
 *   FINALIZE=1 CELO_PRIVATE_KEY=0x... npx tsx scripts/register-8004.ts  # also embed self-reference
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEventLogs,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ─── On-chain constants (Celo Mainnet) ──────────────────────────────────────
const CHAIN_ID = 42220;
const IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REGISTRY_CAIP = `eip155:${CHAIN_ID}:${IDENTITY_REGISTRY}`;
const DEFAULT_RPC = "https://forno.celo.org";
const EXPLORER = "https://celo.blockscout.com";
const SCAN_URL = "https://8004scan.io";
const MIN_CELO = 0.01; // soft balance warning threshold

// ─── ABI (only what we call) ─────────────────────────────────────────────────
const REGISTRY_ABI = [
  { type: "function", name: "register", stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "agentId", type: "uint256" }] },
  { type: "function", name: "setAgentURI", stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "uint256" }, { name: "agentURI", type: "string" }], outputs: [] },
  { type: "event", name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ] },
] as const;

// ─── Config (env-driven, CeloMind defaults) ──────────────────────────────────
const PK = process.env.CELO_PRIVATE_KEY;
const RPC_URL = process.env.CELO_MAINNET_RPC_URL || process.env.CELO_RPC_URL || DEFAULT_RPC;
const DRY_RUN = !!process.env.DRY_RUN;
const FINALIZE = !!process.env.FINALIZE;

const AGENT_NAME = process.env.AGENT_NAME || "CeloMind";
const AGENT_DESCRIPTION = process.env.AGENT_DESCRIPTION ||
  "AI assistant for the Celo network. 75 MCP tools for wallet intelligence, token/DeFi " +
  "market data, swaps & sends (wallet-confirmed), Aave & Mento, GoodDollar UBI, governance, " +
  "Carbon DeFi, whale tracking, and token/contract risk checks.";
const AGENT_IMAGE = process.env.AGENT_IMAGE ||
  "https://raw.githubusercontent.com/Dami904/CELO_MIND/main/frontend/public/logo-icon.png";
const MCP_ENDPOINT = process.env.MCP_ENDPOINT || "https://celo-mind-nmk2.onrender.com/mcp";
const WEB_ENDPOINT = process.env.WEB_ENDPOINT || ""; // optional public frontend URL

// ─── Build the ERC-8004 agent card (registration-v1) ─────────────────────────
function buildCard(agentId?: bigint) {
  const services: Array<{ name: string; endpoint: string; version?: string }> = [
    { name: "MCP", endpoint: MCP_ENDPOINT, version: "2025-06-18" },
  ];
  if (WEB_ENDPOINT) services.push({ name: "web", endpoint: WEB_ENDPOINT });

  const card: Record<string, unknown> = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: AGENT_NAME,
    description: AGENT_DESCRIPTION,
    image: AGENT_IMAGE,
    services,
    x402Support: true, // CeloMind exposes the x402_pay tool
    active: true,
    supportedTrust: ["reputation"],
  };
  // Self-reference only makes sense once the id is known (FINALIZE pass).
  if (agentId !== undefined) {
    card.registrations = [{ agentId: Number(agentId), agentRegistry: REGISTRY_CAIP }];
  }
  return card;
}

function toDataUri(card: object): string {
  const json = JSON.stringify(card);
  return `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
}

// ─── Inline chain config (matches packages/mcp-server/src/celo-client.ts) ─────
const celoChain = {
  id: CHAIN_ID,
  name: "Celo Mainnet",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

async function main() {
  const card = buildCard();
  const agentURI = process.env.AGENT_URI || toDataUri(card);

  console.log("ERC-8004 agent registration — CeloMind");
  console.log("  network        :", celoChain.name, `(chainId ${CHAIN_ID})`);
  console.log("  registry       :", IDENTITY_REGISTRY);
  console.log("  rpc            :", RPC_URL);
  console.log("  agentURI bytes :", agentURI.length, process.env.AGENT_URI ? "(hosted)" : "(on-chain data: URI)");
  console.log("  card           :\n" + JSON.stringify(card, null, 2));

  if (DRY_RUN) {
    console.log("\nDRY_RUN set — built the card and exited without sending a transaction.");
    return;
  }
  if (!PK || !/^0x[0-9a-fA-F]{64}$/.test(PK)) {
    throw new Error("CELO_PRIVATE_KEY must be set to a 0x-prefixed 32-byte hex key.");
  }

  const account = privateKeyToAccount(PK as `0x${string}`);
  const publicClient = createPublicClient({ chain: celoChain, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: celoChain, transport: http(RPC_URL) });

  // Balance sanity check
  const balance = await publicClient.getBalance({ address: account.address });
  const balCelo = Number(formatEther(balance));
  console.log(`\n  signer         : ${account.address}`);
  console.log(`  balance        : ${balCelo.toFixed(4)} CELO`);
  if (balCelo < MIN_CELO) {
    throw new Error(`Signer has ${balCelo} CELO — fund it with at least ${MIN_CELO} CELO for gas.`);
  }

  // Simulate first: reverts surface here, and the return value is the agentId-to-be.
  const { request, result: simulatedId } = await publicClient.simulateContract({
    account,
    address: IDENTITY_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [agentURI],
  });
  console.log(`  simulated id   : ${simulatedId}`);

  console.log("\nSending register() …");
  const hash = await walletClient.writeContract({ ...request, chain: null });
  console.log("  tx hash        :", hash);
  console.log("  explorer       :", `${EXPLORER}/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);

  // Authoritative agentId from the Registered event.
  const events = parseEventLogs({ abi: REGISTRY_ABI, eventName: "Registered", logs: receipt.logs });
  const agentId = events[0]?.args.agentId ?? simulatedId;

  console.log("\n✅ Registered.");
  console.log("  agentId        :", agentId.toString());
  console.log("  block          :", receipt.blockNumber.toString());
  console.log("  gas used       :", receipt.gasUsed.toString());
  console.log("  8004scan       :", `${SCAN_URL}/agents/celo/${agentId}`);
  console.log("  (also browse   :", `${SCAN_URL}/agents )`);

  // Optional: re-point the card at a self-referential version that includes the
  // on-chain agentId (fully spec-compliant `registrations` field). Costs a 2nd tx.
  if (FINALIZE && !process.env.AGENT_URI) {
    console.log("\nFINALIZE set — embedding self-reference via setAgentURI() …");
    const finalUri = toDataUri(buildCard(agentId));
    const finalHash = await walletClient.writeContract({
      account, chain: null,
      address: IDENTITY_REGISTRY, abi: REGISTRY_ABI,
      functionName: "setAgentURI", args: [agentId, finalUri],
    });
    await publicClient.waitForTransactionReceipt({ hash: finalHash });
    console.log("  setAgentURI tx :", `${EXPLORER}/tx/${finalHash}`);
  }
}

main().catch((e) => {
  console.error("\n❌ Registration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
