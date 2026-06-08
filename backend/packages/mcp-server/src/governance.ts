/**
 * Celo Governance & Staking tools — on-chain reads via viem public client.
 * Governance contract: 0xD533Ca259b330c7A88f74E000a3FaEa2d63B7972
 * LockedGold contract: 0x6cC083Aed9e3ebe302A6336dBC7c921C9f03349
 * Election contract:   0x8D6677192144292870907E3Fa8A5527fE55A7ff6
 */
import { cached } from "@celomind/shared";
import { getPublicClient } from "./celo-client.js";
import type { Network } from "@celomind/shared";

async function fetchCGPMeta(proposalId: string): Promise<{ title?: string; description?: string; cgpUrl: string } | null> {
  const num = proposalId.padStart(4, "0");
  const url = `https://raw.githubusercontent.com/celo-org/governance/main/CGPs/cgp-${num}.md`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const text = await res.text();
    const title = text.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
    const description = text.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
    return { title, description, cgpUrl: `https://github.com/celo-org/governance/blob/main/CGPs/cgp-${num}.md` };
  } catch {
    return null;
  }
}

const CONTRACTS = {
  governance: "0xD533Ca259b330c7A88f74E000a3FaEa2d63B7972" as `0x${string}`,
  lockedGold: "0x6cC083Aed9e3ebe302A6336dBC7c921C9f03349E" as `0x${string}`,
  election:   "0x8D6677192144292870907E3Fa8A5527fE55A7ff6" as `0x${string}`,
  validators: "0xaEb865bCa93DdC8F47b8e29F40C5399cE34d0C58" as `0x${string}`,
};

const GOVERNANCE_ABI = [
  { name: "getQueue",         type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256[]" }, { type: "uint256[]" }] },
  { name: "getDequeue",       type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256[]" }] },
  { name: "getProposal",      type: "function", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "string" }] },
  { name: "isQueued",         type: "function", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "isApproved",       type: "function", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "getVoteTotals",    type: "function", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
] as const;

const LOCKED_GOLD_ABI = [
  { name: "getAccountTotalLockedGold",      type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getAccountNonvotingLockedGold",  type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getTotalLockedGold",             type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getPendingWithdrawals",          type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256[]" }, { type: "uint256[]" }] },
] as const;

const ELECTION_ABI = [
  { name: "getGroupsVotedForByAccount",    type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "address[]" }] },
  { name: "getTotalVotesByAccount",        type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getPendingVotesForGroupByAccount", type: "function", stateMutability: "view", inputs: [{ name: "group", type: "address" }, { name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getActiveVotesForGroupByAccount",  type: "function", stateMutability: "view", inputs: [{ name: "group", type: "address" }, { name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getTotalVotes",                 type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getEligibleValidatorGroups",    type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }, { type: "uint256[]" }] },
] as const;

const VALIDATORS_ABI = [
  { name: "getValidatorGroup", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "address[]" }, { type: "uint256[]" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256[]" }, { type: "uint256" }, { type: "uint256" }] },
  { name: "getValidatorGroupSize", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export async function getGovernanceProposals(network: Network) {
  return await cached("gov:proposals", 120, async () => {
    const client = getPublicClient(network);
    try {
      const [queue, dequeue] = await Promise.all([
        client.readContract({ address: CONTRACTS.governance, abi: GOVERNANCE_ABI, functionName: "getQueue" }),
        client.readContract({ address: CONTRACTS.governance, abi: GOVERNANCE_ABI, functionName: "getDequeue" }),
      ]);
      const queueIds = (queue[0] as bigint[]).slice(0, 10);
      const dequeueIds = (dequeue as bigint[]).slice(0, 10);
      const allIds = [...new Set([...queueIds, ...dequeueIds])];

      const proposals = await Promise.all(
        allIds.map(async (id) => {
          try {
            const [p, approved] = await Promise.all([
              client.readContract({ address: CONTRACTS.governance, abi: GOVERNANCE_ABI, functionName: "getProposal", args: [id] }),
              client.readContract({ address: CONTRACTS.governance, abi: GOVERNANCE_ABI, functionName: "isApproved", args: [id] }).catch(() => false),
            ]);
            const [proposer, deposit, ts, txCount, descUrl] = p as [string, bigint, bigint, bigint, string];
            const cgp = await fetchCGPMeta(id.toString()).catch(() => null);
            return {
              id: id.toString(),
              proposer,
              depositCELO: (Number(deposit) / 1e18).toFixed(2),
              timestamp: new Date(Number(ts) * 1000).toISOString(),
              transactionCount: Number(txCount),
              descriptionUrl: descUrl,
              isApproved: approved,
              inQueue: queueIds.includes(id),
              inDequeue: dequeueIds.includes(id),
              ...(cgp ?? {}),
            };
          } catch {
            return { id: id.toString(), error: "Could not fetch proposal details" };
          }
        })
      );
      return { proposals, governanceContract: CONTRACTS.governance, source: "Celo on-chain" };
    } catch (e) {
      return { proposals: [], error: String(e), note: "See https://celo.stake.id for governance UI" };
    }
  });
}

export async function getGovernanceProposalDetails(proposalId: string, network: Network) {
  const client = getPublicClient(network);
  const id = BigInt(proposalId);
  try {
    const [p, approved, votes] = await Promise.all([
      client.readContract({ address: CONTRACTS.governance, abi: GOVERNANCE_ABI, functionName: "getProposal", args: [id] }),
      client.readContract({ address: CONTRACTS.governance, abi: GOVERNANCE_ABI, functionName: "isApproved", args: [id] }).catch(() => false),
      client.readContract({ address: CONTRACTS.governance, abi: GOVERNANCE_ABI, functionName: "getVoteTotals", args: [id] }).catch(() => null),
    ]);
    const [proposer, deposit, ts, txCount, descUrl] = p as [string, bigint, bigint, bigint, string];
    const voteTotals = votes as [bigint, bigint, bigint] | null;
    const cgp = await fetchCGPMeta(proposalId).catch(() => null);
    return {
      id: proposalId,
      proposer,
      depositCELO: (Number(deposit) / 1e18).toFixed(2),
      timestamp: new Date(Number(ts) * 1000).toISOString(),
      transactionCount: Number(txCount),
      descriptionUrl: descUrl,
      isApproved: approved,
      ...(cgp ?? {}),
      votes: voteTotals ? {
        yes:     (Number(voteTotals[0]) / 1e18).toFixed(2),
        no:      (Number(voteTotals[1]) / 1e18).toFixed(2),
        abstain: (Number(voteTotals[2]) / 1e18).toFixed(2),
      } : null,
    };
  } catch (e) {
    return { id: proposalId, error: String(e) };
  }
}

export async function getStakingBalances(address: string, network: Network) {
  const client = getPublicClient(network);
  const addr = address as `0x${string}`;
  try {
    const [total, nonvoting, groups, totalVotes, withdrawals] = await Promise.all([
      client.readContract({ address: CONTRACTS.lockedGold, abi: LOCKED_GOLD_ABI, functionName: "getAccountTotalLockedGold",     args: [addr] }),
      client.readContract({ address: CONTRACTS.lockedGold, abi: LOCKED_GOLD_ABI, functionName: "getAccountNonvotingLockedGold", args: [addr] }),
      client.readContract({ address: CONTRACTS.election,   abi: ELECTION_ABI,    functionName: "getGroupsVotedForByAccount",    args: [addr] }).catch(() => [] as `0x${string}`[]),
      client.readContract({ address: CONTRACTS.election,   abi: ELECTION_ABI,    functionName: "getTotalVotesByAccount",        args: [addr] }).catch(() => 0n),
      client.readContract({ address: CONTRACTS.lockedGold, abi: LOCKED_GOLD_ABI, functionName: "getPendingWithdrawals",         args: [addr] }).catch(() => [[], []] as [bigint[], bigint[]]),
    ]);
    const [wAmounts, wTs] = withdrawals as [bigint[], bigint[]];
    return {
      address,
      totalLockedCELO:      (Number(total as bigint) / 1e18).toFixed(4),
      nonvotingLockedCELO:  (Number(nonvoting as bigint) / 1e18).toFixed(4),
      votingLockedCELO:     ((Number(total as bigint) - Number(nonvoting as bigint)) / 1e18).toFixed(4),
      totalVotesCELO:       (Number(totalVotes as bigint) / 1e18).toFixed(4),
      validatorGroupsVotedFor: (groups as `0x${string}`[]).length,
      pendingWithdrawals:   wAmounts.map((amt, i) => ({
        amountCELO: (Number(amt) / 1e18).toFixed(4),
        availableAt: new Date(Number(wTs[i]) * 1000).toISOString(),
      })),
    };
  } catch (e) {
    return { address, error: String(e) };
  }
}

export async function getActivatableStakes(address: string, network: Network) {
  const client = getPublicClient(network);
  const addr = address as `0x${string}`;
  try {
    const groups = await client.readContract({ address: CONTRACTS.election, abi: ELECTION_ABI, functionName: "getGroupsVotedForByAccount", args: [addr] }).catch(() => [] as `0x${string}`[]);
    const stakes = await Promise.all(
      (groups as `0x${string}`[]).map(async (group) => {
        const [pending, active] = await Promise.all([
          client.readContract({ address: CONTRACTS.election, abi: ELECTION_ABI, functionName: "getPendingVotesForGroupByAccount", args: [group, addr] }).catch(() => 0n),
          client.readContract({ address: CONTRACTS.election, abi: ELECTION_ABI, functionName: "getActiveVotesForGroupByAccount",  args: [group, addr] }).catch(() => 0n),
        ]);
        return { group, pendingCELO: (Number(pending as bigint) / 1e18).toFixed(4), activeCELO: (Number(active as bigint) / 1e18).toFixed(4), canActivate: (pending as bigint) > 0n };
      })
    );
    return { address, stakes, hasActivatable: stakes.some(s => s.canActivate) };
  } catch (e) {
    return { address, stakes: [], error: String(e) };
  }
}

export async function getValidatorGroups(network: Network) {
  return await cached("gov:validator-groups", 300, async () => {
    const client = getPublicClient(network);
    try {
      const [groups, votes] = await client.readContract({ address: CONTRACTS.election, abi: ELECTION_ABI, functionName: "getEligibleValidatorGroups" }) as [`0x${string}`[], bigint[]];
      const top = groups.slice(0, 20).map((addr, i) => ({
        address: addr,
        totalVotesCELO: (Number(votes[i]) / 1e18).toFixed(2),
        rank: i + 1,
      }));
      return { validatorGroups: top, total: groups.length, source: "Celo on-chain" };
    } catch (e) {
      return { validatorGroups: [], error: String(e) };
    }
  });
}

export async function getValidatorGroupDetails(groupAddress: string, network: Network) {
  const client = getPublicClient(network);
  const addr = groupAddress as `0x${string}`;
  try {
    const [size, totalVotes] = await Promise.all([
      client.readContract({ address: CONTRACTS.validators, abi: VALIDATORS_ABI, functionName: "getValidatorGroupSize", args: [addr] }).catch(() => null),
      client.readContract({ address: CONTRACTS.election,   abi: ELECTION_ABI,   functionName: "getTotalVotes" }).catch(() => null),
    ]);
    return {
      groupAddress,
      validatorCount: size !== null ? Number(size as bigint) : null,
      networkTotalVotesCELO: totalVotes !== null ? (Number(totalVotes as bigint) / 1e18).toFixed(2) : null,
      source: "Celo on-chain",
      explorerUrl: `https://explorer.celo.org/mainnet/address/${groupAddress}`,
    };
  } catch (e) {
    return { groupAddress, error: String(e) };
  }
}

export async function getTotalStakingInfo(network: Network) {
  return await cached("gov:staking-info", 120, async () => {
    const client = getPublicClient(network);
    try {
      const [totalLocked, totalVotes, groups] = await Promise.all([
        client.readContract({ address: CONTRACTS.lockedGold, abi: LOCKED_GOLD_ABI, functionName: "getTotalLockedGold" }),
        client.readContract({ address: CONTRACTS.election,   abi: ELECTION_ABI,    functionName: "getTotalVotes" }),
        client.readContract({ address: CONTRACTS.election,   abi: ELECTION_ABI,    functionName: "getEligibleValidatorGroups" }),
      ]);
      const [groupAddrs] = groups as [`0x${string}`[], bigint[]];
      return {
        totalLockedCELO:      (Number(totalLocked as bigint) / 1e18).toFixed(2),
        totalVotingCELO:      (Number(totalVotes as bigint) / 1e18).toFixed(2),
        eligibleValidatorGroups: groupAddrs.length,
        lockedGoldContract:   CONTRACTS.lockedGold,
        electionContract:     CONTRACTS.election,
        source: "Celo on-chain",
      };
    } catch (e) {
      return { error: String(e) };
    }
  });
}
