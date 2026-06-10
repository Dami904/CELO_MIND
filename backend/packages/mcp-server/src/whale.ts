import { marketNetwork, type Network } from "@celomind/shared";
import { getAddressV2, getAddressTxsV2, getTokenBalancesV2, getTokenHoldersV2 } from "./blockscout.js";
import { getDuneTopWhales } from "./dune.js";

export type WhaleProfile = {
  address: string;
  label?: string;
  nativeBalance: string;
  nativeUsdPrice: string | null;
  txCount: number;
  recentActivity: unknown[];
  tokenHoldings: unknown[];
  network: Network;
  watchedAt: string;
  source: string;
};

export async function getWhaleWalletActivity(
  address: string,
  network: Network = marketNetwork(),
  label?: string
): Promise<WhaleProfile> {
  const [info, txs, tokens] = await Promise.allSettled([
    getAddressV2(address, network),
    getAddressTxsV2(address, network, 20),
    getTokenBalancesV2(address, network),
  ]);

  const recentActivity = txs.status === "fulfilled" ? txs.value : [];

  return {
    address,
    label,
    nativeBalance: info.status === "fulfilled" ? info.value.nativeBalance : "0",
    nativeUsdPrice: info.status === "fulfilled" ? info.value.celoUsdPrice : null,
    txCount: recentActivity.length,
    recentActivity,
    tokenHoldings: tokens.status === "fulfilled" ? tokens.value : [],
    network,
    watchedAt: new Date().toISOString(),
    source: "Blockscout",
  };
}

/** Top Celo whales via a Dune Analytics leaderboard query, falling back to cUSD holders on Blockscout. */
export async function getTopCeloWhales(): Promise<{ data: unknown[]; source: string }> {
  // Top holders of cUSD on mainnet as a proxy for whales (the fallback when Dune has nothing).
  const CUSD_MAINNET = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
  // Start both in parallel so a cold call never pays Dune's timeout AND then Blockscout's
  // serially (that ~27s worst case is what trips the MCP client's tool-call timeout).
  const dunePromise = getDuneTopWhales().catch(() => null);
  const holdersPromise = getTokenHoldersV2(CUSD_MAINNET, "celo", 20).catch(() => null);

  const dune = await dunePromise;
  if (dune && dune.rows.length > 0) return { data: dune.rows, source: "Dune Analytics" };

  const holders = await holdersPromise;
  if (holders && holders.length > 0) return { data: holders, source: "Blockscout (cUSD holders)" };
  return { data: [], source: "unavailable" };
}

export type CopyWalletAnalysis = {
  sourceWallet: string;
  myWallet: string;
  sourceTokens: string[];
  myTokens: string[];
  tokensToAdd: string[];
  tokensToRemove: string[];
  strategyNotes: string[];
  preparedActions: PreparedAction[];
  warning: string;
  source: string;
};

export type PreparedAction = {
  type: "swap" | "send" | "approve";
  token: string;
  amount: string;
  description: string;
  status: "pending_review";
};

export async function analyzeCopyWallet(
  sourceAddress: string,
  myAddress: string,
  network: Network = marketNetwork()
): Promise<CopyWalletAnalysis> {
  const [sourceBalances, myBalances] = await Promise.allSettled([
    getTokenBalancesV2(sourceAddress, network),
    getTokenBalancesV2(myAddress, network),
  ]);

  const sourceSymbols = new Set<string>(
    sourceBalances.status === "fulfilled" ? sourceBalances.value.map((t) => t.symbol).filter(Boolean) : []
  );
  const mySymbols = new Set<string>(
    myBalances.status === "fulfilled" ? myBalances.value.map((t) => t.symbol).filter(Boolean) : []
  );

  const tokensToAdd = [...sourceSymbols].filter((t) => !mySymbols.has(t));
  const tokensToRemove = [...mySymbols].filter((t) => !sourceSymbols.has(t));

  const preparedActions: PreparedAction[] = tokensToAdd.slice(0, 5).map((token) => ({
    type: "swap",
    token,
    amount: "0",
    description: `Consider acquiring ${token} — present in source wallet but not yours. Research before acting.`,
    status: "pending_review",
  }));

  return {
    sourceWallet: sourceAddress,
    myWallet: myAddress,
    sourceTokens: [...sourceSymbols],
    myTokens: [...mySymbols],
    tokensToAdd,
    tokensToRemove,
    strategyNotes: [
      "Analysis is based on current token balances (Blockscout), not historical performance.",
      "Copy trading does NOT guarantee profits.",
      "Always research each token independently.",
      "Actions are prepared for review — nothing is executed automatically.",
    ],
    preparedActions,
    warning: "IMPORTANT: CeloMind never auto-executes copy trades. These are prepared actions for your review only.",
    source: "Blockscout",
  };
}
