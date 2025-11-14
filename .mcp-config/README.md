# MCP Client Configuration Examples

This directory contains example configurations for connecting various MCP clients to AgentHub.

## Supported Clients

1. **Claude Code** - See `claude-code.md` for instructions
2. **Codex CLI/IDE** - See `codex.toml` for configuration snippet
3. **VS Code** - See `vscode.json` for workspace configuration

## Prerequisites

Before configuring any client, ensure AgentHub is running:

```bash
cd agenthub
npm run dev  # or npm start
```

The server should be accessible at `http://localhost:3333/mcp`

## General Setup Pattern

All MCP clients connect to AgentHub via **Streamable HTTP** transport at:

```
http://localhost:3333/mcp
```

## Security Note

AgentHub only accepts connections from `localhost` by default. If you need to connect from a different host, you'll need to modify the CORS settings in `src/server/transports/http.ts`.

## Testing Your Connection

After configuring your client, test the connection by:

1. Checking available tools (should see `hub_op`)
2. Checking available resources (should see `inbox://{agent}` and `state://live`)
3. Trying a simple operation like `s.get` to fetch current state

## Need Help?

- Check the main README.md for detailed documentation
- Review the AgentHub PRD for protocol details
- File an issue on GitHub: https://github.com/propstreet/agenthub/issues
