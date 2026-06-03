# @celo/mcp-server

Core MCP server package. See root README for full docs.

## Install (once published)
\\\ash
npm install -g @celo/mcp-server
\\\

## Claude Desktop config
\\\json
{
  "mcpServers": {
    "celo": {
      "command": "celo-mcp",
      "env": {
        "PRIVATE_KEY":    "0x...",
        "CELO_NETWORK":   "mainnet"
      }
    }
  }
}
\\\
"@

# ── 3. packages/demo-dashboard ────────────────────────────────
Write-Host "[3/7] Scaffolding packages/demo-dashboard..." -ForegroundColor Cyan

 = "packages/demo-dashboard"

New-File "/package.json" @"
{
  "name": "@celo/mcp-demo-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev":   "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next":    "^14.0.0",
    "react":   "^18.0.0",
    "react-dom":"^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "typescript":   "^5.4.0",
    "tailwindcss":  "^3.0.0"
  }
}
