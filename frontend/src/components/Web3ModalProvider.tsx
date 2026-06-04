'use client'

import React, { ReactNode } from 'react'
import { createAppKit } from '@reown/appkit/react'
import { celo } from '@reown/appkit/networks'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { State, WagmiProvider } from 'wagmi'
import { wagmiAdapter, projectId, networks } from '@/lib/wagmi'

const queryClient = new QueryClient()

const metadata = {
  name: 'CeloMind MCP',
  description: 'Autonomous Celo Agent Console',
  url: 'http://localhost:3000',
  icons: ['https://avatars.githubusercontent.com/u/37784886'],
}

// Reown AppKit (successor to @web3modal/wagmi). Initialized once at module load.
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: celo,
  metadata,
  themeMode: 'dark',
  features: { analytics: false },
  themeVariables: {
    '--w3m-accent': '#FBCC5C',
  },
})

export default function Web3ModalProvider({
  children,
  initialState,
}: {
  children: ReactNode
  initialState?: State
}) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
