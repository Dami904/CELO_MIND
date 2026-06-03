# Claude Desktop Setup

## macOS
Edit \~/Library/Application Support/Claude/claude_desktop_config.json\

## Windows
Edit \%APPDATA%\Claude\claude_desktop_config.json\

## Config
\\\json
{
  "mcpServers": {
    "celo": {
      "command": "node",
      "args": ["/absolute/path/to/celo-mcp-server/packages/server/dist/index.js"],
      "env": {
        "PRIVATE_KEY":  "0x_your_key",
        "CELO_NETWORK": "mainnet"
      }
    }
  }
}
\\\

Restart Claude Desktop. You should see Celo tools in the tools menu.
