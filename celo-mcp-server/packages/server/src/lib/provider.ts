import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo, celoAlfajores } from 'viem/chains';
import { config, rpcUrl } from '../config.js';

const chain = config.network === 'mainnet' ? celo : celoAlfajores;

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

export function getWalletClient() {
  if (!config.privateKey) throw new Error('PRIVATE_KEY not set in environment');
  const account = privateKeyToAccount(config.privateKey);
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}
