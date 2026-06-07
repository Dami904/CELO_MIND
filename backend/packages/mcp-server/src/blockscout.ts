/**
 * Blockscout REST API v2 client — the primary on-chain data source (Sim API replacement).
 *
 * Free, Celo-native, and returns USD-valued balances + holders. Endpoints live at
 * `${blockscoutHost}/api/v2/...`. An optional BLOCKSCOUT_API_KEY raises rate limits.
 *
 * All responses are normalized to small typed shapes and cached briefly via the shared cache
 * (Upstash Redis when configured, in-memory otherwise).
 */
import { getNetwork, cached, type Network } from "@celomind/shared";

function v2Base(network: Network): string {
  return `${getNetwork(network).blockscoutHost}/api/v2`;
}

function withKey(url: string): string {
  const key = process.env.BLOCKSCOUT_API_KEY;
  if (!key) return url;
  return url + (url.includes("?") ? "&" : "?") + `apikey=${key}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(withKey(url), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

// ─── Normalized shapes ────────────────────────────────────────────────────────
export type TokenBalanceV2 = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: string;
  balanceRaw: string;
  usdPrice: string | null;
  usdValue: string | null;
  type: string;
  iconUrl: string | null;
};

export type AddressInfoV2 = {
  address: string;
  nativeBalance: string;
  nativeBalanceRaw: string;
  celoUsdPrice: string | null;
  isContract: boolean;
  hasTokens: boolean;
};

export type TokenInfoV2 = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  usdPrice: string | null;
  holdersCount: string | null;
  circulatingMarketCap: string | null;
  totalSupply: string | null;
  iconUrl: string | null;
  volume24h: string | null;
};

export type TokenHolderV2 = {
  address: string;
  value: string;
  isContract: boolean;
  isScam: boolean;
  label: string | null;
};

// ─── Raw response types (partial) ─────────────────────────────────────────────
type RawTokenBalance = {
  value: string;
  token: {
    address_hash?: string;
    address?: string;
    decimals: string | null;
    exchange_rate: string | null;
    symbol: string | null;
    name: string | null;
    type: string | null;
    icon_url: string | null;
  };
};

function fmtUnits(raw: string, decimals: number): string {
  try {
    const d = BigInt(10) ** BigInt(decimals);
    const v = BigInt(raw);
    const whole = v / d;
    const frac = (v % d).toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch {
    return "0";
  }
}

function usdValue(raw: string, decimals: number, rate: string | null): string | null {
  if (!rate) return null;
  try {
    const amount = Number(BigInt(raw)) / 10 ** decimals;
    return (amount * Number(rate)).toFixed(2);
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function getTokenBalancesV2(address: string, network: Network, forceRefresh = false): Promise<TokenBalanceV2[]> {
  const fetcher = async () => {
    const items = await fetchJson<RawTokenBalance[]>(`${v2Base(network)}/addresses/${address}/token-balances`);
    if (!Array.isArray(items)) return [];
    return items
      .filter((i) => i.token?.type === "ERC-20" || !i.token?.type)
      .map((i) => {
        const decimals = Number(i.token.decimals ?? "18");
        const addr = i.token.address_hash ?? i.token.address ?? "";
        return {
          symbol: i.token.symbol ?? "?",
          name: i.token.name ?? "Unknown",
          address: addr,
          decimals,
          balance: fmtUnits(i.value, decimals),
          balanceRaw: i.value,
          usdPrice: i.token.exchange_rate,
          usdValue: usdValue(i.value, decimals, i.token.exchange_rate),
          type: i.token.type ?? "ERC-20",
          iconUrl: i.token.icon_url,
        };
      });
  };

  if (forceRefresh) return fetcher();
  return cached(`bs:v2:balances:${network}:${address.toLowerCase()}`, 10, fetcher);
}

export async function getAddressV2(address: string, network: Network): Promise<AddressInfoV2> {
  return cached(`bs:v2:address:${network}:${address.toLowerCase()}`, 10, async () => {
    const raw = await fetchJson<{
      coin_balance: string | null;
      exchange_rate: string | null;
      is_contract?: boolean;
      has_tokens?: boolean;
    }>(`${v2Base(network)}/addresses/${address}`);
    const balanceRaw = raw.coin_balance ?? "0";
    return {
      address,
      nativeBalance: fmtUnits(balanceRaw, 18),
      nativeBalanceRaw: balanceRaw,
      celoUsdPrice: raw.exchange_rate,
      isContract: Boolean(raw.is_contract),
      hasTokens: Boolean(raw.has_tokens),
    };
  });
}

export async function getAddressTxsV2(address: string, network: Network, limit = 10): Promise<unknown[]> {
  return cached(`bs:v2:txs:${network}:${address.toLowerCase()}:${limit}`, 30, async () => {
    const raw = await fetchJson<{ items?: unknown[] }>(`${v2Base(network)}/addresses/${address}/transactions`);
    return (raw.items ?? []).slice(0, limit);
  });
}

export async function getTokenInfoV2(tokenAddress: string, network: Network): Promise<TokenInfoV2 | null> {
  return cached(`bs:v2:token:${network}:${tokenAddress.toLowerCase()}`, 300, async () => {
    try {
      const raw = await fetchJson<{
        address_hash?: string;
        address?: string;
        symbol: string | null;
        name: string | null;
        decimals: string | null;
        exchange_rate: string | null;
        holders_count: string | null;
        circulating_market_cap: string | null;
        total_supply: string | null;
        icon_url: string | null;
        volume_24h: string | null;
      }>(`${v2Base(network)}/tokens/${tokenAddress}`);
      return {
        address: raw.address_hash ?? raw.address ?? tokenAddress,
        symbol: raw.symbol ?? "?",
        name: raw.name ?? "Unknown",
        decimals: Number(raw.decimals ?? "18"),
        usdPrice: raw.exchange_rate,
        holdersCount: raw.holders_count,
        circulatingMarketCap: raw.circulating_market_cap,
        totalSupply: raw.total_supply,
        iconUrl: raw.icon_url,
        volume24h: raw.volume_24h,
      };
    } catch {
      return null;
    }
  });
}

export async function getTokenHoldersV2(tokenAddress: string, network: Network, limit = 20): Promise<TokenHolderV2[]> {
  return cached(`bs:v2:holders:${network}:${tokenAddress.toLowerCase()}:${limit}`, 300, async () => {
    const raw = await fetchJson<{
      items?: { address: { hash: string; is_contract: boolean; is_scam: boolean; name: string | null }; value: string }[];
    }>(`${v2Base(network)}/tokens/${tokenAddress}/holders`);
    return (raw.items ?? []).slice(0, limit).map((h) => ({
      address: h.address.hash,
      value: h.value,
      isContract: h.address.is_contract,
      isScam: h.address.is_scam,
      label: h.address.name,
    }));
  });
}

export type TxV2 = {
  hash: string;
  status: string | null; // "ok" | "error" | null (pending)
  method: string | null;
  decodedCall: string | null;
  from: string | null;
  to: string | null;
  toIsContract: boolean;
  value: string;
  rawInput: string;
  timestamp: string | null;
  exists: boolean;
};

/** Fetch + decode a transaction by hash (powers transaction_explain / malicious_tx_check). */
export async function getTransactionV2(hash: string, network: Network): Promise<TxV2> {
  try {
    const raw = await fetchJson<{
      hash?: string;
      status?: string | null;
      result?: string | null;
      method?: string | null;
      decoded_input?: { method_call?: string } | null;
      from?: { hash?: string } | null;
      to?: { hash?: string; is_contract?: boolean } | null;
      value?: string | null;
      raw_input?: string | null;
      timestamp?: string | null;
    }>(`${v2Base(network)}/transactions/${hash}`);
    return {
      hash: raw.hash ?? hash,
      status: raw.status ?? raw.result ?? null,
      method: raw.method ?? null,
      decodedCall: raw.decoded_input?.method_call ?? null,
      from: raw.from?.hash ?? null,
      to: raw.to?.hash ?? null,
      toIsContract: Boolean(raw.to?.is_contract),
      value: raw.value ?? "0",
      rawInput: raw.raw_input ?? "0x",
      timestamp: raw.timestamp ?? null,
      exists: true,
    };
  } catch {
    return { hash, status: null, method: null, decodedCall: null, from: null, to: null, toIsContract: false, value: "0", rawInput: "0x", timestamp: null, exists: false };
  }
}

// ─── New data functions ───────────────────────────────────────────────────────

export type NFTBalanceV2 = {
  name: string | null;
  symbol: string | null;
  address: string;
  tokenId: string;
  type: string;
  iconUrl: string | null;
  imageUrl: string | null;
};

export async function getAddressNFTsV2(address: string, network: Network, limit = 20): Promise<NFTBalanceV2[]> {
  return cached(`bs:v2:nfts:${network}:${address.toLowerCase()}:${limit}`, 120, async () => {
    try {
      const raw = await fetchJson<{
        items?: {
          token?: { name: string | null; symbol: string | null; address?: string; address_hash?: string; type: string | null; icon_url: string | null };
          id?: string; token_id?: string; image_url?: string | null;
        }[];
      }>(`${v2Base(network)}/addresses/${address}/nft?type=ERC-721,ERC-1155`);
      return (raw.items ?? []).slice(0, limit).map((i) => ({
        name: i.token?.name ?? null,
        symbol: i.token?.symbol ?? null,
        address: i.token?.address_hash ?? i.token?.address ?? "",
        tokenId: i.id ?? i.token_id ?? "0",
        type: i.token?.type ?? "ERC-721",
        iconUrl: i.token?.icon_url ?? null,
        imageUrl: i.image_url ?? null,
      }));
    } catch { return []; }
  });
}

export type NetworkStatsV2 = {
  totalBlocks: number;
  totalAddresses: number;
  totalTransactions: number;
  transactionsToday: number;
  averageBlockTimeMs: number;
  coinPriceUsd: string | null;
};

export async function getNetworkStatsV2(network: Network): Promise<NetworkStatsV2 | null> {
  return cached(`bs:v2:netstats:${network}`, 60, async () => {
    try {
      const raw = await fetchJson<{
        total_blocks?: string | number;
        total_addresses?: string | number;
        total_transactions?: string | number;
        transactions_today?: string | number;
        average_block_time?: string | number;
        coin_price?: string | null;
      }>(`${v2Base(network)}/stats`);
      return {
        totalBlocks: Number(raw.total_blocks ?? 0),
        totalAddresses: Number(raw.total_addresses ?? 0),
        totalTransactions: Number(raw.total_transactions ?? 0),
        transactionsToday: Number(raw.transactions_today ?? 0),
        averageBlockTimeMs: Number(raw.average_block_time ?? 0),
        coinPriceUsd: typeof raw.coin_price === "string" ? raw.coin_price : null,
      };
    } catch { return null; }
  });
}

export type AddressStatsV2 = {
  address: string;
  nativeBalance: string;
  txCount: number;
  tokenTransfersCount: number;
  isContract: boolean;
  hasTokens: boolean;
};

export async function getAddressStatsV2(address: string, network: Network): Promise<AddressStatsV2 | null> {
  return cached(`bs:v2:addrstats:${network}:${address.toLowerCase()}`, 120, async () => {
    try {
      const raw = await fetchJson<{
        coin_balance?: string | null;
        transaction_count?: string | number | null;
        token_transfers_count?: string | number | null;
        is_contract?: boolean;
        has_tokens?: boolean;
      }>(`${v2Base(network)}/addresses/${address}`);
      return {
        address,
        nativeBalance: fmtUnits(raw.coin_balance ?? "0", 18),
        txCount: Number(raw.transaction_count ?? 0),
        tokenTransfersCount: Number(raw.token_transfers_count ?? 0),
        isContract: Boolean(raw.is_contract),
        hasTokens: Boolean(raw.has_tokens),
      };
    } catch { return null; }
  });
}

export async function searchTokensV2(query: string, network: Network, limit = 10): Promise<TokenInfoV2[]> {
  return cached(`bs:v2:tokensearch:${network}:${encodeURIComponent(query.toLowerCase())}`, 120, async () => {
    try {
      const raw = await fetchJson<{
        items?: {
          address_hash?: string; address?: string; symbol: string | null; name: string | null;
          decimals: string | null; exchange_rate: string | null; holders_count: string | null;
          circulating_market_cap: string | null; total_supply: string | null; icon_url: string | null;
          volume_24h?: string | null;
        }[];
      }>(`${v2Base(network)}/tokens?q=${encodeURIComponent(query)}&type=ERC-20`);
      return (raw.items ?? []).slice(0, limit).map((t) => ({
        address: t.address_hash ?? t.address ?? "",
        symbol: t.symbol ?? "?",
        name: t.name ?? "Unknown",
        decimals: Number(t.decimals ?? "18"),
        usdPrice: t.exchange_rate,
        holdersCount: t.holders_count,
        circulatingMarketCap: t.circulating_market_cap,
        totalSupply: t.total_supply,
        iconUrl: t.icon_url,
        volume24h: t.volume_24h ?? null,
      }));
    } catch { return []; }
  });
}

/** Whether a contract is verified on Blockscout (used by risk checks). */
export async function isContractVerifiedV2(address: string, network: Network): Promise<boolean | null> {
  try {
    const raw = await fetchJson<{ is_verified?: boolean }>(`${v2Base(network)}/smart-contracts/${address}`);
    return Boolean(raw.is_verified);
  } catch {
    // 404 => not a verified contract (or not a contract). Caller treats null as "unknown".
    return false;
  }
}
