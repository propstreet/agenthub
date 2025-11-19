# AgentHub Developer Guide

> **Lean MCP Orchestrator for Multi-Agent Coordination**

AgentHub is a lightweight, local-only MCP (Model Context Protocol) server designed to enable multiple coding agents (Gemini, Claude Code, Cursor, VS Code) to coordinate edits, reviews, and escalations without file locking conflicts.

## 1. Project Overview

*   **Purpose:** Orchestrate multi-agent coding sessions via intent-based coordination and conflict detection.
*   **Core Tech:** Node.js (>=22), TypeScript (5.9+), Express, Zod, Ink v5 (TUI), Vitest.
*   **Philosophy:** "Soft locking" via intents. Agents declare what they *intend* to do, and the hub coordinates conflicts.

## 2. Architecture

The system is built around a central **Express** server that speaks MCP.

### Core Components (`src/server/core/`)

*   **Message Bus (`bus.ts`):** A lightweight in-memory pub/sub system. Handles `m.send` and `m.pull` operations. It allows agents to communicate asynchronously.
*   **Coordinator (`coordinator.ts`):** The brain of the operation. Implements a **Two-Phase Commit Protocol** for intents:
    1.  **Phase 1 (Declare):** Agent calls `i.open`. Coordinator checks for conflicts using `micromatch`.
    2.  **Phase 2 (Vote/Execute):** Other agents can vote (`i.vote`). If approved, the agent executes.
    3.  **Phase 3 (Close):** Agent calls `i.close`.
    *   **Conflict Detection:** sophisticated glob matching logic. It ensures that `src/**/*.ts` conflicts with `src/server/index.ts` but not `dist/**/*.ts`.
*   **State Cache (`state-cache.ts`):** In-memory store for intents, leases, and agent sessions. Handles TTL (Time-To-Live) logic to auto-expire stale intents.
*   **Filesystem Watcher (`watcher.ts`):** Uses `chokidar` to monitor the disk. It detects "rogue writes" (changes made without an active intent) and alerts the system.
*   **Persistence Manager (`persistence.ts`):** atomic writes for state snapshots. Handles TTL-aware restoration to prevent loading expired intents.
*   **Expert Bridge (`expert-bridge.ts`):** Optional integration with Azure OpenAI (GPT-5 Pro) for complex tasks that local agents can't handle. Uses background processing (`ExpertWorker`) for long-running requests.

### MCP Implementation (`src/server/server.ts`, `src/server/tools/`)

*   **Single Tool (`hub_op`):** To save context tokens, all operations are multiplexed through a single MCP tool `hub_op`. The specific action is defined by the `op` field (e.g., `i.open`, `m.send`).
*   **Transport:** A crucial pattern is the **Per-Request Transport**. For every HTTP POST to `/mcp`, a new `StreamableHTTPServerTransport` is created. **DO NOT reuse transports across requests**, as it causes hangs.

### Dashboard (`src/dashboard/`)

*   **Ink v5:** The CLI dashboard is a React application rendered to the terminal.
*   **Layout:** 2-Column grid (Agents/Reviews | Intents/Expert) + Full-width Bottom (Events/Messages).
*   **Interaction:** Zoomable panels (keys 1-5) and cleanup command (key 'c').
*   **Components:** Located in `src/dashboard/components/`. They receive state via props and render UI boxes using a shared `Panel` wrapper. Logic like "time ago" is separated into utils.

## 3. Development Conventions

### TypeScript & Code Style

*   **Strictness:** We use `strict: true`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`.
    *   **Do not use `any`.**
    *   **Do not use `!`.** Use runtime checks: `if (val === undefined) throw ...`
    *   **Explicit Checks:** `if (val !== undefined)` instead of `if (val)`.
*   **Async/Await:** Tool handlers must be `async` to return Promises, even if they don't `await` anything (though `require-await` is disabled for tools).
*   **Imports:** Use `import type` for interfaces/types.
*   **Path Normalization:** **ALWAYS** normalize paths to POSIX (forward slashes `/`) using `.replace(/\/g, '/')`. This is critical for glob matching on Windows.

### Zod Validation Patterns

We use a strict **Raw -> Transform -> Validate** pattern for schemas in `src/server/schemas/`.

1.  **RawSchema:** Defines all possible inputs, including variants (e.g., `path`, `p`, `paths`).
2.  **Transform:** Normalizes variants into a canonical format and applies defaults (e.g., `priority: 'n'`).
    *   *Example:* `agent` field is often optional in input but required in output. The handler resolves it from the session if missing.
3.  **Validation:** The final schema ensures strict types.

```typescript
// Example pattern
const IntentOpenSchema = RawSchema.transform((raw) => {
  return {
    agent: raw.agent ?? raw.a, // Normalize
    priority: raw.priority ?? 'n', // Default
    // ...
  };
});
```

### Logging (Pino)
*   **Library:** `pino` (structured) + `pino-pretty` (dev mode).
*   **Usage:** `import { logger } from '../core/logger.js';`
*   **Pattern:** `logger.info({ key: value }, 'Message');` - Always pass the object first for structured context.
*   **Levels:** `debug`, `info`, `warn`, `error`. Configured via `LOG_LEVEL`.

## 4. Testing

*   **Framework:** Vitest.
*   **Location:** `__tests__` directories next to the source files (e.g., `src/server/core/__tests__/`).
*   **Philosophy:**
    *   **Unit Tests:** Focus on logic (conflict detection, validation).
    *   **Mocking:** Mock dependencies like `MessageBus` when testing `Coordinator`.
    *   **Scenarios:** Test both "happy paths" and edge cases (e.g., overlapping globs, expired TTLs).

## 5. Build & Run

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start server with `tsx watch` (auto-reload). |
| `npm run dashboard` | Start the TUI dashboard. |
| `npm run check` | Run typecheck, lint, and format. **Run this before committing.** |
| `npm test` | Run unit tests (interactive). |
| `npm run test:run` | Run unit tests once (non-interactive). Use for CI or to avoid hanging. |

## 6. Key File Layout

```
src/
├── dashboard/       # Ink TUI application
│   ├── components/  # React components (AgentPanel, etc.)
│   └── index.tsx    # Entry point
├── server/
│   ├── core/        # Business logic (Coordinator, Bus, Watcher)
│   ├── schemas/     # Zod schemas with validation logic
│   ├── tools/       # MCP tool handlers (intents, messages, etc.)
│   ├── resources/   # MCP resource handlers (inbox://, state://)
│   ├── transports/  # HTTP transport logic
│   ├── types/       # Shared TypeScript interfaces
│   ├── server.ts    # MCP server setup & tool registration
│   └── index.ts     # Express server entry point
```
