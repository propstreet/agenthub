# AgentHub

> **Lean MCP Orchestrator for Multi-Agent Coordination**

AgentHub is a lightweight, local-only MCP (Model Context Protocol) server that enables multiple coding agents (Claude Code, Codex CLI, VS Code, etc.) to coordinate edits, reviews, and escalations without hard file gates.

## Features

- ✅ **Soft Coordination** - Intent-based locking with two-phase protocol
- ✅ **Multi-Agent Support** - Works with any MCP client
- ✅ **Conflict Detection** - Filesystem watcher detects concurrent writes
- ✅ **Role-Agnostic Reviews** - Any agent with `role=reviewer` can review
- ✅ **Expert Escalation** - Optional Azure OpenAI (GPT-5 Pro) integration
- ✅ **Terminal Dashboard** - Real-time monitoring (coming in Phase 2)
- ✅ **Token Efficient** - Minimal overhead (≤1.6k tokens per client)

## Quick Start

### Prerequisites

- Node.js >=20.0.0 (Node 25 recommended)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/propstreet/agenthub.git
cd agenthub

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Edit `.env` and configure:

```env
PORT=3333
HOST=localhost
WATCH_ROOT=/path/to/your/project  # Optional filesystem watching
```

3. (Optional) Configure Azure OpenAI for expert escalation:

```env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_EXPERT_DEPLOYMENT=gpt-5-pro
```

### Connect MCP Clients

See `.mcp-config/` directory for client-specific setup:

- **Claude Code**: `.mcp-config/claude-code.md`
- **Codex CLI/IDE**: `.mcp-config/codex.toml`
- **VS Code**: `.mcp-config/vscode.json`

## Architecture

```
┌─────────────┐
│   Agents    │ (Claude Code, Codex, VS Code)
└──────┬──────┘
       │ HTTP (Streamable MCP)
       ├─────────────────┐
       │   AgentHub      │
       │  ┌───────────┐  │
       │  │ hub_op    │  │ Multi-operation tool
       │  ├───────────┤  │
       │  │ Resources │  │ inbox://, state://
       │  └───────────┘  │
       │  ┌───────────┐  │
       │  │ Core      │  │ Bus, Coordinator, Watcher
       │  └───────────┘  │
       └─────────────────┘
```

### Core Components

- **Message Bus** - Pub/sub for agent communication
- **State Cache** - In-memory state (agents, intents, leases)
- **Coordinator** - Two-phase intent protocol with conflict detection
- **Filesystem Watcher** - Monitors changes, detects rogue writes
- **Expert Bridge** - Azure OpenAI Responses API integration

## Usage

### The `hub_op` Tool

All operations go through a single multi-operation tool: `hub_op`

```typescript
{
  "op": "i.open",  // operation code
  "d": { ... }     // operation payload
}
```

### Available Operations

#### Intent Operations

**`i.open`** - Declare intent to edit/build/test

```json
{
  "op": "i.open",
  "d": {
    "a": "FE-Agent",
    "p": ["apps/web/**"],
    "m": "W",
    "prio": "n",
    "t": 120000
  }
}
```

**`i.vote`** - Vote on another agent's intent

```json
{
  "op": "i.vote",
  "d": {
    "id": "intent_abc123",
    "a": "BE-Agent",
    "v": "ack",
    "r": "no conflict"
  }
}
```

**`i.renew`** - Heartbeat to extend TTL

```json
{
  "op": "i.renew",
  "d": {
    "id": "intent_abc123",
    "t": 120000
  }
}
```

**`i.close`** - Close intent (commit or abort)

```json
{
  "op": "i.close",
  "d": {
    "id": "intent_abc123",
    "s": "ok",
    "note": "changes complete"
  }
}
```

#### Lease Operations

**`l.ann`** - Announce advisory lease (for testing/building)

```json
{
  "op": "l.ann",
  "d": {
    "a": "Test-Agent",
    "p": ["apps/api/**"],
    "m": "T",
    "t": 600000
  }
}
```

#### Message Operations

**`m.send`** - Send message to another agent

```json
{
  "op": "m.send",
  "d": {
    "from": "FE-Agent",
    "to": "BE-Agent",
    "topic": "COORDINATION",
    "text": "Please yield apps/shared by :45"
  }
}
```

**`m.pull`** - Pull messages for your agent

```json
{
  "op": "m.pull",
  "d": {
    "agent": "FE-Agent",
    "since": 1731340000,
    "limit": 50
  }
}
```

#### Review Operations

**`g.review`** - Request code review

```json
{
  "op": "g.review",
  "d": {
    "scope": ["apps/web/src/**"],
    "summary": "Added user authentication"
  }
}
```

#### Expert Escalation

**`x.ask`** - Escalate to GPT-5 Pro

```json
{
  "op": "x.ask",
  "d": {
    "prompt": "Explain these test failures and provide a fix",
    "files": ["apps/web/src/auth.test.ts"],
    "effort": "high",
    "verb": "low"
  }
}
```

#### State Query

**`s.get`** - Get current state snapshot

```json
{
  "op": "s.get",
  "d": {
    "since": 1731340000
  }
}
```

### Resources

**`inbox://{agent}`** - Recent messages for an agent (NDJSON format)

**`state://live`** - Complete state snapshot (JSON)

## Coordination Protocol

### Two-Phase Intent Protocol

1. **Phase 1 - Declare**
   - Agent calls `i.open` with paths and mode
   - Hub checks for conflicts
   - Returns intent ID and conflicts
   - Broadcasts to other agents for voting (1.2s window)

2. **Phase 2 - Execute**
   - Agent waits for votes or proceeds if no conflicts
   - If NACK received, agent narrows scope or waits
   - Agent performs work using **its own tools**
   - Heartbeats via `i.renew` every 60-90s

3. **Phase 3 - Close**
   - Agent calls `i.close` when done
   - Hub posts COMMIT summary
   - If mode was WRITE, emits REVIEW_JOB for reviewers

### Conflict Resolution

- **Path Overlap Detection** - Uses glob pattern matching
- **Priority Ordering** - `r` (review) > `h` (high) > `n` (normal) > `l` (low)
- **Automatic Rebase** - Agents notified via `NEEDS_REBASE` message
- **Rogue Write Detection** - FS watcher flags writes without active intent

## Development

### Scripts

```bash
npm run dev          # Start with auto-reload
npm run build        # Build TypeScript
npm start            # Start production server
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
npm run format       # Format code with Prettier
npm run typecheck    # Type check without emitting
npm run check        # Run all checks (type + lint + format)
```

### Project Structure

```
agenthub/
├── src/
│   ├── server/
│   │   ├── core/            # Core logic (bus, coordinator, watcher)
│   │   ├── tools/           # hub_op operation handlers
│   │   ├── resources/       # MCP resource handlers
│   │   ├── transports/      # HTTP transport
│   │   ├── types/           # TypeScript models
│   │   ├── server.ts        # MCP server setup
│   │   └── index.ts         # Entry point
│   └── dashboard/           # TUI (Phase 2)
├── .mcp-config/             # Client configuration examples
├── .env.example             # Environment template
└── README.md
```

## Token Optimization

AgentHub is designed to minimize token overhead:

- **Single multi-op tool** instead of 10 separate tools
- **Short field names** (`a` vs `agent`, `p` vs `paths`)
- **Compact descriptions** (≤100 chars per tool/resource)
- **Capped payloads** (64KB limit on resources)
- **NDJSON format** for efficient message streaming

**Targets:**
- Tool metadata: ≤1.6k tokens per client
- Typical operation: ≤60 tokens payload only

## Roadmap

### Phase 1 (Current)

- ✅ Core MCP server with HTTP transport
- ✅ Intent coordinator & conflict detection
- ✅ Filesystem watcher
- ✅ Message bus
- ✅ Azure OpenAI expert bridge
- ✅ Sample client configs

### Phase 2 (Next)

- ⏳ Terminal dashboard (TUI with `neo-blessed`)
- ⏳ Review router (role-agnostic)
- ⏳ Resource implementations (full inbox & state)
- ⏳ Integration tests

### Future

- SQLite audit log (optional persistence)
- Multi-workspace support
- Enhanced conflict resolution
- Dashboard hotkeys (pause, escalate, nudge)

## Contributing

This is an internal PropStreet project. For issues or contributions, please contact the team.

## License

MIT © PropStreet

## References

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [Azure OpenAI Responses API](https://learn.microsoft.com/azure/ai-foundry/openai/how-to/responses)
- [AgentHub PRD](./AgentHub-PRD.md)
