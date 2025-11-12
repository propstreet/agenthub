# Claude Code Configuration

To connect Claude Code to AgentHub, use the built-in CLI to add the HTTP MCP server:

## Step 1: Ensure AgentHub is running

```bash
# In the agenthub directory
npm run dev
# or for production
npm start
```

Verify it's running by visiting: http://localhost:3333/health

## Step 2: Add AgentHub as an MCP server

```bash
claude mcp add --transport http agenthub http://localhost:3333/mcp
```

## Step 3: Verify the connection

```bash
claude mcp list
```

You should see `agenthub` in the list of configured MCP servers.

## Step 4: Test the connection

Start a Claude Code session and try using the `hub.op` tool:

```
Can you use the hub.op tool to get the current state? Use op: "s.get" with an empty payload.
```

## Scope Configuration

You can configure AgentHub per-project or user-wide:

**User scope (all projects):**
```bash
claude mcp add --transport http --scope user agenthub http://localhost:3333/mcp
```

**Project scope (current directory only):**
```bash
claude mcp add --transport http --scope project agenthub http://localhost:3333/mcp
```

## Removing AgentHub

```bash
claude mcp remove agenthub
```

## See Also

- Claude Code MCP docs: https://code.claude.com/docs/en/mcp
- AgentHub README for detailed usage
