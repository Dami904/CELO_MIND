import { cookieStorage, createStorage } from 'wagmi'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { celo, type AppKitNetwork } from '@reown/appkit/networks'

// CeloMind is mainnet-only (chainId 42220). No testnet networks are configured.
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'a30d5b51a0293049b49bcf5c36dfc2e5'

// createAppKit / WagmiAdapter expect a non-empty tuple of networks.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [celo]

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  ssr: true,
  // @ts-ignore - wagmi createStorage vs adapter Storage type mismatch (runtime-compatible)
  storage: createStorage({
    storage: cookieStorage,
  }),
})

// wagmi config consumed by WagmiProvider and the read/write hooks.
export const config = wagmiAdapter.wagmiConfig
