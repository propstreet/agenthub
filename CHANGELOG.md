# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2025-11-19

### Fixed
- **MCP Registry Publishing**: Updated server.json version fields to match package.json
- **Conflict Messages**: Changed "Review conflict" to "Intent conflict detected" for clarity

### Added
- **Release Checklist**: Comprehensive RELEASE_CHECKLIST.md to prevent future release issues

## [1.1.0] - 2025-11-19

### Added
- **Async Expert System**: Replaced synchronous `expert.ask` with a robust async job queue (`expert.request`, `expert.status`, `expert.list`, `expert.cancel`).
- **Background Worker**: Dedicated `ExpertWorker` manages Azure OpenAI rate limits, retries, and polling independently of the main event loop.
- **Structured Logging**: Replaced `console.log` with `pino` for high-performance JSON logging. Pretty-printing enabled in development.
- **Dashboard v2**:
  - **Zoomable Grid Layout**: 2-column split view that allows focusing on any panel (Agents, Intents, Reviews, Expert, Logs) with number keys `1-5`.
  - **Expert Panel**: Live monitoring of active and completed expert requests.
  - **Reviews Panel**: Dedicated view for code review lifecycle status.
  - **Persistence Indicator**: Visual status of state persistence in the header.
  - **Interactive Cleanup**: Press `c` to purge disconnected agents and orphaned artifacts.
- **Orphaned Artifact Cleanup**: Automatic removal of "zombie" intents, reviews, and leases when their owning agent is purged.
- **Configurable Expert Limits**: New env vars `EXPERT_MAX_PENDING`, `EXPERT_MAX_CONCURRENT`, `EXPERT_REQUEST_TTL`.

### Changed
- **Intent TTL**: Default intent TTL increased from 2 minutes to **10 minutes** (600s) for better developer experience.
- **Dashboard Performance**: Improved rendering logic to prevent "full reload" flickering during interactions.
- **Watch Mode**: Switch to `node --watch` for dashboard development to fix stdin interaction issues.
- **Security**: Enforced strict ownership checks for expert requests (only the requester can view status or cancel).

### Fixed
- **Memory Leak**: Fixed concurrency leak where resumed expert jobs were not correctly removed from the active set.
- **Zombie Reviews**: Completed reviews are now properly cleaned up if their originating agent disconnects.
- **Input Handling**: Fixed `Q` (quit) command not working in dashboard watch mode.
- **Type Safety**: Improved Zod schemas to properly handle optional TTLs and defaults.
- **State Verbosity**: `s.get` now strictly adheres to filters, preventing massive JSON dumps.
- **Agent UX**: `a.register` now implicitly respects existing session bindings, allowing role updates without re-specifying agent name.
- **Queue Reporting**: `expert.request` now correctly reports global queue position.
- **Notifications**: Added conflict warnings and expert completion summaries to agent inbox.
- **Schema Compatibility**: `i.renew`, `i.vote`, and `i.close` now accept `intentId` alias and `approve`/`defer` aliases for better CLI compatibility.

## [1.0.0] - 2025-11-15

### Added
- Initial release of AgentHub
- Intent-based coordination protocol (`i.open`, `i.vote`, `i.close`)
- Filesystem watcher for rogue write detection
- In-memory state with optional persistence
- Basic terminal dashboard
- Message bus for agent communication
- Azure OpenAI integration (synchronous)