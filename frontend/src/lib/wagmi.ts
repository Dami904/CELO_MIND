import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
import { cookieStorage, createStorage } from 'wagmi'
// @ts-ignore
import { celo } from 'viem/chains'

// CeloMind is mainnet-only (chainId 42220). No testnet chains are configured.
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'a30d5b51a0293049b49bcf5c36dfc2e5'

const metadata = {
  name: 'CeloMind MCP',
  description: 'Autonomous Celo Agent Console',
  url: 'http://localhost:3000',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

export const config = defaultWagmiConfig({
  chains: [celo] as const,
  projectId,
  metadata,
  ssr: true,
  // @ts-ignore - Storage type compatibility
  storage: createStorage({
    storage: cookieStorage,
  }),
})
