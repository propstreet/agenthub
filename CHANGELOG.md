# Changelog

All notable changes to AgentHub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-13

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

### Initial Development

This release represents the culmination of iterative development:
- Core MCP orchestrator with all 14 operations
- Complete review lifecycle (request, claim, complete)
- Persistence system with atomic writes
- Terminal dashboard with real-time monitoring
- Self-documenting help system
- Comprehensive schema validation

---

[1.0.0]: https://github.com/propstreet/agenthub/releases/tag/v1.0.0
