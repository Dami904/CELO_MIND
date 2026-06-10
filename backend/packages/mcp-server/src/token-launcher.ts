/**
 * Token launcher — prepares a signable contract-creation transaction for a new ERC-20 on Celo.
 *
 * Nothing is deployed here: it returns the deploy calldata for the user's wallet to sign (same
 * "prepare, you sign" model as swaps/transfers). Two templates (see contracts/CeloMindTokens.sol,
 * compiled into token-artifacts.ts):
 *   - fixed-supply  : whole supply minted to the deployer, no owner, immutable (default — safest)
 *   - mintable+owner: deployer keeps mint + ownership rights
 */
import { encodeDeployData, parseUnits, isAddress, type Abi, type Address } from "viem";
import { TOKEN_ARTIFACTS } from "./token-artifacts.js";

const SYMBOL_RE = /^[A-Za-z0-9]{1,11}$/;

export type TokenLaunchArgs = {
  name: string;
  symbol: string;
  totalSupply: string;   // human units (e.g. "1000000")
  decimals?: number;     // default 18
  mintable?: boolean;    // default false → fixed-supply
  owner?: string;        // deployer / recipient / owner (0x address)
};

export function prepareTokenLaunch(args: TokenLaunchArgs) {
  const name = (args.name ?? "").trim();
  const symbol = (args.symbol ?? "").trim();
  const decimals = args.decimals ?? 18;
  const mintable = Boolean(args.mintable);
  const owner = args.owner?.trim();

  if (!name) return { error: "Token name is required." };
  if (!SYMBOL_RE.test(symbol)) return { error: "Token symbol must be 1–11 letters or digits (no spaces)." };
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return { error: "Decimals must be a whole number from 0 to 18." };
  if (!owner || !isAddress(owner)) return { error: "Provide the owner/recipient wallet address (0x…) — connect your wallet or paste an address." };

  let supply: bigint;
  try { supply = parseUnits(args.totalSupply ?? "0", decimals); }
  catch { return { error: `Invalid total supply "${args.totalSupply}".` }; }
  if (supply <= 0n) return { error: "Total supply must be greater than 0." };

  const art = mintable ? TOKEN_ARTIFACTS.CeloMindMintableToken : TOKEN_ARTIFACTS.CeloMindFixedToken;
  const data = encodeDeployData({
    abi: art.abi as Abi,
    bytecode: art.bytecode,
    args: [name, symbol, decimals, supply, owner as Address],
  });

  return {
    type: "token_launch" as const,
    kind: mintable ? "mintable+ownable" : "fixed-supply",
    token: { name, symbol, decimals, totalSupply: args.totalSupply, owner },
    // Contract creation → no `to`. The wallet/frontend treats a null `to` as a deploy.
    transaction: { to: null as string | null, data, value: "0" },
    status: "prepared_for_review" as const,
    requires_confirmation: true,
    warning: mintable
      ? "Deploys a NEW token where YOU keep owner + mint rights (you can issue more later). Deploying costs gas and is irreversible — double-check name/symbol/supply before signing."
      : "Deploys a NEW fixed-supply token — the entire supply mints to you and no more can EVER be created. Deploying costs gas and is irreversible — double-check name/symbol/supply before signing.",
    note: "This only PREPARES the deployment. Sign it in your wallet to actually create the token on Celo mainnet.",
    source: "CeloMind token launcher",
  };
}
