# AgentHub

> **Lean MCP Orchestrator for Multi-Agent Coordination**

AgentHub is a local-only **Model Context Protocol (MCP)** server that acts as a central nervous system for AI coding agents. It allows multiple agents (Claude Code, Cursor, VS Code, Gemini CLI, etc.) to work on the same codebase simultaneously without stepping on each other's toes.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)

## Why AgentHub?

When multiple AI agents (or an agent and a human) edit the same files, chaos ensues. File locks are too rigid, and "hope for the best" leads to lost work.

AgentHub introduces a **Soft Locking Protocol** based on **Intents**:

1.  **Declare:** Agent says "I intend to edit `src/auth/*.ts`".
2.  **Coordinate:** Hub checks for conflicts. If clear, other agents see the intent.
3.  **Execute:** Agent does the work.
4.  **Review:** Changes can be routed to a "reviewer" agent.

It's not just a lock server; it's a **communication bus** and **expert escalation system** (GPT-5 Pro) wrapped in a single, token-efficient MCP tool (`hub_op`).

## Quick Links

- 📜 **[Changelog](CHANGELOG.md)**: See what's new in the latest version.
- 🤝 **[Contributing Guide](CONTRIBUTING.md)**: How to build and extend AgentHub.
- 🤖 **[Claude Developer Guide](CLAUDE.md)**: Technical deep-dive for Claude users.
- ♊ **[Gemini Developer Guide](GEMINI.md)**: Technical deep-dive for Gemini users.
- 🐛 **[Report Bug](https://github.com/propstreet/agenthub/issues)**: Found an issue? Let us know.

## Key Features

- 🚦 **Intent Coordination**: Prevent race conditions with semantic file locks (`i.open`).
- 📨 **Message Bus**: Real-time communication between agents (`m.send`, `m.pull`).
- 📝 **Code Review Workflow**: Built-in lifecycle for requesting and claiming reviews (`review.request`).
- 🧠 **Expert Escalation**: Async integration with Azure OpenAI (GPT-5 Pro) for complex architectural tasks (`expert.request`).
- 💾 **State Persistence**: Resilient in-memory state that survives restarts.
- 🖥️ **TUI Dashboard**: Beautiful terminal interface to monitor the swarm.

## Installation

### 1. Prerequisites

- Node.js >= 22.0.0
- npm or yarn

### 2. Clone & Install

```bash
git clone https://github.com/propstreet/agenthub.git
cd agenthub
npm install
npm run build
```

### 3. Configure

Copy the example configuration:

```bash
cp .env.example .env
```

Edit `.env` to set your preferences:

```env
PORT=3333
# Optional: Enable filesystem watching to detect "rogue" writes (outside intents)
WATCH_ROOT=/absolute/path/to/your/project
# Optional: Enable persistence
PERSISTENCE_ENABLED=true
# Optional: Azure OpenAI (Expert System)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-5-pro
```

## Usage

### Start the Server

```bash
npm start
```

### Start the Dashboard (New Terminal)

```bash
npm run dashboard
```

Use the dashboard to monitor active agents, intents, and system events.
- **Keys 1-5**: Zoom into specific panels (Agents, Intents, Reviews, Expert, Logs).
- **C**: Cleanup disconnected agents.
- **B**: Broadcast a message to all agents.
- **P**: Pause/Resume auto-refresh.

### Connect Your Agents

Add AgentHub to your MCP client configuration.

#### Claude Desktop / Claude Code

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agenthub": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

#### VS Code (Generic MCP)

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

#### Gemini CLI

Add to `settings.json`:

```json
{
  "mcpServers": {
    "agenthub": {
      "httpUrl": "http://localhost:3333/mcp"
    }
  }
}
```

## Workflow Guide

How agents interact with AgentHub:

1.  **Registration**: Agent connects and registers its role (e.g., `coder`, `reviewer`).
    - `a.register`
2.  **Declaration**: Before editing, agent declares intent.
    - `i.open(paths=['src/feature/*.ts'], mode='W')`
3.  **Approval**: Hub checks conflicts. If another agent has `src/feature/*.ts`, the intent is rejected or put to a vote.
    - `i.vote(intentId, vote='approve')`
4.  **Execution**: Agent performs the work.
5.  **Completion**: Agent closes the intent.
    - `i.close(id, status='ok')`
    - *Note:* If mode was 'W' (Write), a code review job is automatically created.
6.  **Review**: Agent requests a review from a human or another agent.
    - `review.request(scope=['src/feature/*.ts'])`

## API Reference

AgentHub exposes a single tool `hub_op` that handles all operations. This minimizes token usage and context window clutter.

### 🛠️ Core Operations

| Operation | Description | Key Fields |
| :--- | :--- | :--- |
| `a.register` | Register an agent presence | `role` |
| `i.open` | Declare intent to work | `paths`, `mode` (R/W/B/T), `ttlMs` |
| `i.close` | Finish work | `id`, `status` |
| `m.send` | Send message | `to`, `text` |
| `m.pull` | Get messages | `since` |
| `review.request` | Request code review | `scope`, `summary` |
| `expert.request` | Ask GPT-5 Pro (Async) | `question`, `paths` |

> **Tip:** Run `s.help` via any agent to get the full, self-documenting API reference with examples.

## Architecture

The system is built on a clean, modular architecture:

- **Server:** Express-based MCP server supporting SSE and HTTP transports.
- **StateCache:** In-memory source of truth, persisted to JSON.
- **Coordinator:** Handles the "Two-Phase Commit" logic for intents.
- **ExpertWorker:** Background worker for managing long-running LLM tasks.

## Development

We welcome contributions!

```bash
# Run tests (interactive)
npm test

# Run tests (CI/Single run)
npm run test:run

# Run linter & typecheck
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## License

MIT © [Propstreet](https://github.com/propstreet)
