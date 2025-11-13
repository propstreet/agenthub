# AgentHub

> **Lean MCP Orchestrator for Multi-Agent Coordination**

AgentHub is a lightweight, local-only MCP (Model Context Protocol) server that enables multiple coding agents (Claude Code, Cursor, VS Code, etc.) to coordinate edits, reviews, and escalations without file locking conflicts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)

## Features

- ✅ **Intent-Based Coordination** - Declare work intentions, detect conflicts automatically
- ✅ **Complete Review Lifecycle** - Request, claim, and complete code reviews
- ✅ **Multi-Agent Messaging** - Agents communicate via pub/sub message bus
- ✅ **Filesystem Monitoring** - Detects concurrent writes and rogue changes
- ✅ **Expert Escalation** - Optional Azure OpenAI (GPT-5 Pro) integration
- ✅ **Persistence** - JSON snapshots with TTL-aware state restoration
- ✅ **Terminal Dashboard** - Real-time monitoring with Ink v5 TUI
- ✅ **Self-Documenting API** - Built-in help system and field variants
- ✅ **Token Efficient** - Single multi-op tool, short field names, ≤1.6k tokens overhead

## Quick Start

### Prerequisites

- Node.js >=20.0.0 (Node 25 recommended)
- npm or yarn

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

The server will start on `http://localhost:3333` by default.

### Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Edit `.env` and configure:

```env
# Server Configuration
PORT=3333
HOST=localhost

# Logging (info = quiet, debug = verbose HTTP logs)
LOG_LEVEL=info

# Filesystem Watcher (optional)
WATCH_ROOT=/path/to/your/project

# Persistence (optional)
PERSISTENCE_ENABLED=true
PERSISTENCE_PATH=.agenthub/state.json
PERSISTENCE_INTERVAL=60000
PERSISTENCE_AUTO_RESTORE=true

# Azure OpenAI for Expert Escalation (optional)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_EXPERT_DEPLOYMENT=gpt-5-pro
```

### Connect MCP Clients

**Claude Code** - Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "agenthub": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

**VS Code** - Add to MCP settings:
```json
{
  "mcp.servers": [
    {
      "name": "agenthub",
      "url": "http://localhost:3333/mcp"
    }
  ]
}
```

## Terminal Dashboard

Monitor agents, intents, and messages in real-time:

```bash
npm run dashboard
```

The dashboard shows:
- Active agents and their status
- Current intents with TTL and conflicts
- Recent messages
- Review jobs
- System events

## Architecture

```
┌─────────────┐
│   Agents    │ (Claude Code, Cursor, VS Code, etc.)
└──────┬──────┘
       │ HTTP (Streamable MCP)
       ├─────────────────┐
       │   AgentHub      │
       │  ┌───────────┐  │
       │  │ hub_op    │  │ Multi-operation tool (14 ops)
       │  ├───────────┤  │
       │  │ Resources │  │ inbox://, state://
       │  └───────────┘  │
       │  ┌───────────┐  │
       │  │ Core      │  │ Bus, Coordinator, Watcher, Persistence
       │  └───────────┘  │
       └─────────────────┘
```

### Core Components

- **Message Bus** - Pub/sub for agent communication and events
- **State Cache** - In-memory state with optional JSON persistence
- **Coordinator** - Intent protocol with conflict detection (glob-based)
- **Filesystem Watcher** - Monitors changes, detects rogue writes
- **Expert Bridge** - Azure OpenAI Responses API integration
- **Persistence Manager** - Atomic writes, TTL-aware restoration

## Usage

### The `hub_op` Tool

All operations go through a single multi-operation tool:

```typescript
{
  "op": "<operation>",  // operation code
  "d": { ... }          // operation payload
}
```

Get help on available operations:

```json
{
  "op": "s.help",
  "d": {}
}
```

### Core Operations

#### Agent Registration

```json
{
  "op": "a.register",
  "d": {
    "agent": "my-agent",
    "role": ["developer", "reviewer"]
  }
}
```

**Note**: `agent` field is auto-generated if omitted.

#### Intent Operations

**Open Intent** (declare work):
```json
{
  "op": "i.open",
  "d": {
    "paths": ["src/server/**/*.ts"],
    "mode": "W",
    "priority": "n",
    "ttlMs": 120000
  }
}
```

**Vote on Intent**:
```json
{
  "op": "i.vote",
  "d": {
    "intentId": "intent_abc123",
    "vote": "approve"
  }
}
```

**Renew Intent** (heartbeat):
```json
{
  "op": "i.renew",
  "d": {
    "intentId": "intent_abc123",
    "ttlMs": 120000
  }
}
```

**Close Intent**:
```json
{
  "op": "i.close",
  "d": {
    "id": "intent_abc123",
    "status": "done",
    "note": "Changes complete"
  }
}
```

#### Message Operations

**Send Message**:
```json
{
  "op": "m.send",
  "d": {
    "to": "agent-2",
    "text": "Ready to review your changes",
    "topic": "review"
  }
}
```

**Pull Messages**:
```json
{
  "op": "m.pull",
  "d": {
    "since": 1731340000000,
    "limit": 50
  }
}
```

#### Review Operations

**Request Review**:
```json
{
  "op": "review.request",
  "d": {
    "scope": ["src/auth/**/*.ts"],
    "summary": "Please review authentication changes"
  }
}
```

**Claim Review** (requires `reviewer` role):
```json
{
  "op": "review.claim",
  "d": {
    "jobId": "rev_abc123"
  }
}
```

**Complete Review**:
```json
{
  "op": "review.complete",
  "d": {
    "jobId": "rev_abc123",
    "severity": "warning",
    "notes": "Consider adding error handling for edge cases",
    "patch": "--- a/src/auth.ts\n+++ b/src/auth.ts\n..."
  }
}
```

#### Expert Escalation

**Ask Expert** (requires Azure OpenAI configuration):
```json
{
  "op": "expert.ask",
  "d": {
    "paths": ["src/complex-algorithm.ts"],
    "question": "How can I optimize this for performance?"
  }
}
```

#### State Query

**Get State**:
```json
{
  "op": "s.get",
  "d": {
    "filter": "intents"
  }
}
```

### Resources

**`inbox://{agent}`** - Agent message queue (NDJSON format)

**`state://live`** - Complete state snapshot (JSON)

### Field Variants & Auto-Population

AgentHub supports field name variants for flexibility:

| Canonical | Variants |
|-----------|----------|
| `agent` | `from` |
| `paths` | `p` |
| `mode` | `m` |
| `priority` | `prio` |
| `ttlMs` | `ttl` |
| `text` | `msg` |
| `to` | `target` |

The `agent` field is **auto-populated** from your MCP session context when omitted.

### Mode Values

- `R` - Read (viewing files only)
- `W` - Write (editing files)
- `B` - Build (compiling project)
- `T` - Test (running tests)

### Priority Levels

- `l` - Low (can be preempted)
- `n` - Normal (default)
- `h` - High (important task)
- `r` - Review (code review priority)

**Resolution order**: `r` > `h` > `n` > `l`

## Coordination Protocol

### Two-Phase Intent Protocol

1. **Phase 1 - Declare**
   - Agent calls `i.open` with paths and mode
   - Hub checks for conflicts with glob matching
   - Returns intent ID and conflicts
   - Broadcasts to other agents for voting (1.2s window)

2. **Phase 2 - Execute**
   - Agent waits for votes or proceeds if no conflicts
   - If NACK received, agent narrows scope or waits
   - Agent performs work using its own tools
   - Sends heartbeats via `i.renew` every 60-90s

3. **Phase 3 - Close**
   - Agent calls `i.close` when done
   - Hub logs completion
   - If mode was WRITE, may trigger review request

### Conflict Resolution

- **Path Overlap Detection** - Uses micromatch for glob pattern matching
- **Priority Ordering** - Higher priority intents take precedence
- **Voting System** - Agents can approve/defer conflicting intents
- **Rogue Write Detection** - FS watcher flags writes without active intent

## Development

### Scripts

```bash
# Development
npm run dev          # Start with auto-reload (tsx watch)
npm run dashboard    # Launch terminal dashboard

# Build
npm run build        # Build TypeScript to dist/

# Quality
npm run typecheck    # Type check without emitting
npm run lint         # Lint code with ESLint
npm run lint:fix     # Fix linting issues
npm run format       # Format code with Prettier
npm run check        # Run all checks (type + lint + format)

# Testing
npm test             # Run all tests with vitest
```

### Project Structure

```
agenthub/
├── src/
│   ├── server/
│   │   ├── core/            # Core logic (bus, coordinator, watcher, persistence)
│   │   ├── tools/           # hub_op operation handlers
│   │   ├── resources/       # MCP resource handlers
│   │   ├── schemas/         # Zod validation schemas
│   │   ├── transports/      # HTTP transport layer
│   │   ├── types/           # TypeScript models
│   │   ├── server.ts        # MCP server setup
│   │   └── index.ts         # Entry point
│   └── dashboard/           # Terminal UI (Ink v5)
├── .agenthub/               # State snapshots (gitignored)
├── .mcp-config/             # Client configuration examples
├── .env.example             # Environment template
├── CHANGELOG.md             # Version history
├── CONTRIBUTING.md          # Contribution guidelines
├── LICENSE                  # MIT license
└── README.md                # This file
```

## Token Optimization

AgentHub is designed to minimize token overhead:

- **Single multi-op tool** instead of 14 separate tools
- **Short field names** with canonical variants
- **Compact descriptions** (tool metadata ≤1.6k tokens per client)
- **Capped payloads** (64KB limit on resources)
- **NDJSON format** for efficient message streaming
- **Auto-population** reduces required fields

**Typical operation**: ≤60 tokens (payload only)


## Contributing

We welcome contributions from the community! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick Contribution Steps:**
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `npm run check` to verify
5. Submit a pull request

## Security

For security issues, please see [SECURITY.md](SECURITY.md) for our security policy and how to report vulnerabilities.

## License

MIT © Propstreet

## References

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code Documentation](https://code.claude.com/docs)
- [Azure OpenAI Responses API](https://learn.microsoft.com/azure/ai-foundry/openai/how-to/responses)
- [Changelog](CHANGELOG.md)

## Acknowledgments

Built with:
- [Express](https://expressjs.com/) - HTTP server
- [Zod](https://zod.dev/) - Schema validation
- [Ink](https://github.com/vadimdemedes/ink) - Terminal UI
- [Chokidar](https://github.com/paulmillr/chokidar) - Filesystem watching
- [Micromatch](https://github.com/micromatch/micromatch) - Glob pattern matching

---

**Made with ❤️ by Propstreet** | [GitHub](https://github.com/propstreet/agenthub) | [Issues](https://github.com/propstreet/agenthub/issues)
