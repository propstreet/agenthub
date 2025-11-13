# Changelog

All notable changes to AgentHub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-11-13

### Added

**Persistence System**
- JSON snapshot persistence with atomic writes (temp + rename pattern)
- TTL-aware state restoration (filters expired intents/leases on load)
- Custom Map serialization for JSON.stringify/parse
- Auto-save with configurable interval (default: 60s)
- Graceful shutdown with final snapshot save
- Environment configuration: `PERSISTENCE_ENABLED`, `PERSISTENCE_PATH`, `PERSISTENCE_INTERVAL`, `PERSISTENCE_AUTO_RESTORE`

**Logging Configuration**
- Configurable log levels via `LOG_LEVEL` environment variable
- `info` mode (default): Quiet operation with essential logs only
- `debug` mode: Verbose HTTP request/response tracking
- Per-request UUID tracking for debugging
- Response lifecycle monitoring (send, finish, close events)

**Schema Validation System**
- Comprehensive Zod v3 validation schemas for all operations
- Field variant support (agent/from, paths/p, mode/m, priority/prio, ttlMs/t)
- Session-aware auto-population of agent field
- Organized by domain (intents, agents, leases, messages, state, review)
- 100+ schema tests with validation coverage
- Type-safe payload definitions using `z.output<typeof Schema>`

**Documentation**
- Added comprehensive CLAUDE.md with development guide
- TypeScript strict configuration documentation
- ESLint configuration and patterns
- Testing strategy and patterns
- Common development tasks guide

**Infrastructure**
- Created `.agenthub/` directory for state snapshots (gitignored)
- Added coordinator cleanup methods (`clearVoteTimers`)
- Added state cache cleanup methods (`stopCleanupTimers`)
- Enhanced test coverage (146 tests total, all passing)

### Changed

- Updated `ServerConfig` to include `logLevel` and `persistence` options
- Enhanced shutdown handler with cleanup sequence
- Improved error handling with explicit `unknown` catch types
- Updated test configurations to include `logLevel` field

### Fixed

- VS Code ESLint language server cache issue (resolved with window reload)
- Type narrowing in persistence snapshot validation
- Intent expiration calculation using `createdAt + ttlMs` instead of `exp` field
- Test data to match actual Intent type structure

## [0.0.2] - 2025-11-12

### Added

**Messaging System**
- Message bus implementation with pub/sub pattern
- Inter-agent messaging via `m.send` and `m.pull` operations
- Topic-based message routing
- Message history with configurable limits
- NDJSON format for efficient message streaming

**Dashboard Integration**
- Terminal UI (TUI) with Ink v5
- Real-time state monitoring
- Agent status panel
- Intent tracking panel
- Message history panel
- Event log panel

### Changed

- Improved MCP tool descriptions
- Enhanced state cache with message storage
- Updated HTTP transport with message broadcast endpoint

## [0.0.1] - 2025-11-12

### Added

**Core MCP Orchestrator**
- Intent-based coordination with two-phase protocol (declare → vote → execute → close)
- Conflict detection via glob pattern matching (micromatch)
- Priority-based resolution (r > h > n > l)
- Session-aware agent tracking
- Multi-operation tool (`hub_op`) with 10 operations:
  - `a.register` - Agent registration
  - `i.open/vote/renew/close` - Intent lifecycle
  - `l.announce` - Advisory leases
  - `m.send/pull` - Inter-agent messaging
  - `review.request` - Code review routing
  - `expert.ask` - Escalation to GPT-5 Pro
  - `s.get` - State snapshot

**Filesystem Watcher**
- Cross-platform path normalization (Windows/Unix)
- Detects rogue writes (writes without active intent)
- Conflict detection window (2s default)
- Chokidar-based with optimized ignore patterns

**Expert Bridge**
- Optional Azure OpenAI integration (GPT-5 Pro)
- Uses Responses API for structured output
- Returns unified diffs with minimal notes
- Fully optional (checks `AZURE_OPENAI_ENDPOINT`)

**HTTP Transport**
- Per-request transport instances (critical for session isolation)
- Express-based server on configurable port (default: 3333)
- Streamable HTTP with SSE support
- Health check endpoint
- State resource endpoint for dashboard

**MCP Resources**
- `inbox://{agent}` - Agent message queue (NDJSON)
- `state://live` - Complete state snapshot (JSON)

**Testing**
- Vitest test framework
- Unit tests for coordinator (glob overlap detection)
- Unit tests for filesystem watcher (path normalization)
- Dashboard component tests with ink-testing-library

**Configuration**
- Environment-based configuration via `.env`
- Configurable limits (intents, leases, messages, events)
- Configurable timeouts (intent TTL, lease TTL, vote window)
- Optional filesystem watching via `WATCH_ROOT`
- Optional Azure OpenAI integration

**Documentation**
- Comprehensive README with quick start guide
- Architecture diagrams
- Operation examples for all hub_op operations
- Coordination protocol documentation
- Token optimization guidelines
- Sample MCP client configurations

### Technical Details

- **Language**: TypeScript 5.9+ with strictest possible settings
- **Runtime**: Node.js 20+ (Node 25 recommended)
- **Dependencies**: Express 5, Zod 3, MCP SDK 1.21, Chokidar 4, Micromatch 4
- **Transport**: HTTP with Streamable MCP protocol
- **Architecture**: Modular design with message bus, state cache, coordinator, watcher
- **Code Quality**: ESLint strict type-checked, Prettier formatting, 100% explicit typing

---

[0.1.0]: https://github.com/propstreet/agenthub/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/propstreet/agenthub/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/propstreet/agenthub/releases/tag/v0.0.1
