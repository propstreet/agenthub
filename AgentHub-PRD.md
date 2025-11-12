
# AgentHub (Lean MCP Orchestrator) — Product Requirements Document (v1.0)

**Audience:** Engineering (TypeScript/Node), DevTools, QA  
**Owner:** CTO (Joakim)  
**Goal:** Ship a **lean, local-only** MCP server (“AgentHub”) that lets multiple coding agents (Claude Code, Codex CLI, other MCP clients incl. VS Code) coordinate edits, reviews, and escalations **without hard file gates**. Keep the MCP surface **small to reduce token overhead**, and allow *any* agent connecting with a `reviewer` role to perform code review. Include a simple **terminal dashboard** for human supervision.

---

## 1. Executive Summary

AgentHub is an **in-memory MCP server** exposing a tiny set of tools and resources so agents can:
- Announce **intentions/leases** (soft locks) for edits/builds/tests to avoid collisions.
- **Message** each other for negotiation and handoff.
- Route **review jobs** to whichever connected agent declares `role=reviewer` (no hardcoded Codex).
- **Escalate** tricky issues to GPT‑5‑Pro via Azure OpenAI (Responses API).
- Provide a **dashboard/TUI** for a human overseer to observe agents, intents, and conflicts in real time.

Transport is **Streamable HTTP** for broad client compatibility. The hub runs locally on a dev box and has no database; state is ephemeral.

---

## 2. Scope

### In scope
- A minimal MCP server with a **single multi-op tool** (`hub.op`) and **two resources** (`inbox://{agent}`, `state://live`).
- Soft coordination: **intents**, **leases**, and **conflict hints** from an FS watcher.
- **Role-agnostic review orchestration** (any connected agent with `role=reviewer` can accept/complete reviews).
- **Optional expert escalation** to Azure OpenAI Responses (GPT‑5‑Pro) with unified diff output.
- **Terminal dashboard** to monitor activity and intervene (pause, nudge, escalate).

### Out of scope (v1)
- Multi-machine orchestration; this PRD targets a **single workstation**.
- Hard file gating (no forced patch gate / worktrees).
- Persistent state beyond session logs.

---

## 3. Success Criteria (MVP)

- Agents (≥3 Claude Code + ≥1 other MCP client) connect and **collaborate** in one working tree.
- **Soft locks** prevent most collisions; conflicts resolve automatically or via review agent **without human** ≥80% of the time.
- A code review is **picked up by the first available `reviewer` agent**, posted back with structured findings.
- Azure escalation yields a **patch (unified diff) or plan** consumable by the editing agent.
- **Token footprint** from tool metadata ≤ **1.6k tokens per client**; typical op call ≤ **60 tokens** (payload only).
- TUI shows **active agents, intents, leases, conflicts, last reviews** with ≤ **300ms** refresh.

---

## 4. Users & Roles

- **FE Agent** (e.g., Claude Code): TS/Vue edits, vitest.
- **BE Agent** (Claude Code): .NET/.csproj edits, xUnit.
- **DB Agent** (Claude Code): schema/migrations.
- **Reviewer Agent** (any MCP client that advertises `role=reviewer`): runs review and posts findings.
- **Human Supervisor**: runs the dashboard to observe, pause, poke, escalate, or clean up.

> Notes: Any connected agent may declare multiple roles; “reviewer” is **not** bound to a specific product (e.g., Codex).

---

## 5. Non‑Functional Requirements

- **Local-only** by default; outbound network only for **Azure OpenAI escalation**.
- **Low overhead**: single Node process; RSS < 200MB under load (50 active intents).
- **Latency targets**: hub op p50 < 50ms; filesystem event → conflict hint < 300ms.
- **Token efficiency**: one **multi-op tool**, short field names, capped resource payloads.
- **Security**: allowlist-only HTTP origin (`localhost`), redact secrets from messages, opt-in escalation.

---

## 6. Architecture Overview

**Components**
- **MCP Server (AgentHub)** — Node 18+, TypeScript, Streamable HTTP transport.  
  - **Bus**: lightweight message passing (`m.send`, `m.pull`).  
  - **Coordinator**: soft locking via **intents** (2-phase “declare→commit”) + **leases** (TTL/heartbeat).  
  - **FS Watcher**: watches project tree; emits **WRITE_EVENT**; flags concurrent writes & “rogue writes” (no intent).  
  - **Review Router**: emits a **REVIEW_JOB** to the bus; first `reviewer` to **claim** processes it and reports findings.  
  - **Expert Bridge**: optional Azure OpenAI **Responses API** call; returns unified diffs + notes.  
  - **State Cache**: in-memory tableau for dashboard queries.  
- **Dashboard/TUI**: `agentboard` CLI consuming `state://live` + subscriptions to bus events.  
- **Agents/Clients**: Claude Code, Codex CLI/IDE, VS Code MCP chat (or other MCP clients).

**Transport**: HTTP (streamable). STDIO launch is optional later if needed.

---

## 7. Token‑Lean MCP Surface

Expose **one** tool: `hub.op` (multi-op), and **two** resources.

### Tool: `hub.op`

**Input envelope**
```jsonc
{ "op": "<opcode>", "d": { /* payload */ } }
```

**Output envelope**
```jsonc
{ "ok": true, "d": { /* result */ }, "t": 1731350000 }
```

**Opcodes (v1)** — short namespaced names to minimize tokens while remaining clear:
- `m.send`  — send message (`from`, `to?`, `topic`, `text`, `att?`)
- `m.pull`  — pull messages for `agent` since `ts?`, `limit?`
- `i.open`  — open intent `{agent, paths[], mode:'R|W|B|T', priority:'l|n|h|r', ttlMs}` (returns `{id, conflicts[]}`)
- `i.vote`  — ACK/NACK `{id, agent, vote:'ack'|'nack', reason?}`
- `i.renew` — heartbeat TTL `{id, ttlMs}`
- `i.close` — close `{id, status:'ok'|'abort', note?}`
- `l.announce` — advisory lease `{agent, paths[], mode, ttlMs}` (no voting)
- `review.request` — request review for `{scope:paths[], summary?}` (emits REVIEW_JOB; not hardwired to any product)
- `expert.ask` — expert escalation `{prompt, files[], effort, verbosity}` → unified diff/plan
- `s.get`   — snapshot state `{since?}`

> **Modes**: `mode` is one of `R`(read), `W`(write), `B`(build), `T`(test). **Priorities**: `priority` is `l|n|h|r` (low|normal|high|review).
>
> **Design Decision (2025-11-12)**: We use a **hybrid approach** balancing token efficiency with agent comprehension:
> - **Terse opcodes** with clear namespaces (`i.open`, `l.announce`, `review.request`) — agents learn patterns quickly
> - **Self-documenting field names** (`agent`, `paths`, `mode`, `priority`, `ttlMs`) — no external documentation needed
> - **Token overhead**: ~30 chars per typical call (minimal cost for significant clarity gain)

### Resources
- `inbox://{agent}` — last N bus events (NDJSON lines, compact).  
- `state://live` — aggregate live state (agents, intents, leases, semaphores, recent findings).

**Server-side constraints to save tokens**
- Limit op **descriptions to ≤100 chars**; omit verbose examples from capability schema.
- Cap resource payloads (e.g., 64KB) and prefer **IDs** over embedding blobs.

---

## 8. Functional Behavior

### 8.1 Intents (Two‑Phase)
1. **i.open**: Agent declares an edit plan (paths/hunks optional). Hub returns `conflicts[]` and broadcasts.  
2. Peers send **i.vote** within `W=1200ms`. If any `nack` from equal/higher priority or owner, agent narrows scope or time-slices.  
3. Agent edits with its **own tools**; heartbeats via **i.renew**.  
4. **i.close** → hub posts **COMMIT** summary and emits **REVIEW_JOB** for a reviewer to claim.

### 8.2 Leases
- Quick advisory “I’m testing/building here” via **l.ann**; TTL with auto-expiry; writers try to avoid overlapping leases.

### 8.3 Conflict Hints
- FS watcher posts **WRITE_EVENT {file, ts, actor?}**.  
- If two active write-intents overlap within Δt, hub marks the latest as **needs_rebase** and pings both agents.  
- If write occurs without any intent, hub posts **rogue-write** hint.

### 8.4 Review (Role‑agnostic)
- Hub **does not** run a specific reviewer. Instead, **review.request** enqueues a job on the bus.
- Any agent declaring `role=reviewer` may **claim** the job, run its own analysis (/review, LLM, linters), then send back `FINDINGS {sev, notes, patch?}` to the originator + state cache.
- If severity `critical` or repeated failures, the reviewer **may** call `expert.ask` for expert help.

### 8.5 Expert Escalation (Azure OpenAI Responses)
- Minimal, copy‑pastable response: **unified diffs + short notes** for the editing agent.
- Config via env: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` or AAD token; `AZURE_GPT5PRO_DEPLOYMENT`.

---

## 9. Dashboard / TUI (“agentboard”)

**Purpose:** Human supervises multi-agent activity from a shell (no browser).

**Features**
- **Panels:** Agents (name/role/status), Intents/Leases (TTL, overlap), Recent Writes, Open Review Jobs, Last Findings, Escalations.
- **Hotkeys:**  
  - `r` refresh, `p` pause/resume FS watcher hints, `e` escalate selected thread, `n` nudge (DM), `q` quit.  
- **Details:** Select an item to see the message thread and latest diffs/notes.
- **Implementation:** Node + `blessed` (or `neo-blessed`). Poll `s.get` every 500ms; stream updates via inbox.

**Run**
```bash
npm run agentboard   # or: npx agenthub-board
```

---

## 10. Client Installation & Configuration

> The hub exposes **HTTP (Streamable)** MCP at: `http://localhost:3333/mcp`

### 10.1 Claude Code
- Use built‑in CLI to add an HTTP MCP server:  
  ```bash
  claude mcp add --transport http agenthub http://localhost:3333/mcp
  ```
- Manage per‑project versus user scope as needed. See Claude Code’s MCP docs for options (HTTP, stdio, scopes, auth).

### 10.2 Codex CLI / IDE
- Add the hub as a **Streamable HTTP** server in `~/.codex/config.toml`:
  ```toml
  [mcp_servers.agenthub]
  url = "http://localhost:3333/mcp"

  [features]
  rmcp_client = true
  ```
- Verify in the Codex TUI with `/mcp`. The same config is used by the IDE extension.

### 10.3 Visual Studio Code (MCP in Copilot Chat)
- Add to `.vscode/mcp.json` in your workspace:
  ```json
  {
    "servers": {
      "agenthub": { "type": "http", "url": "http://localhost:3333/mcp" }
    }
  }
  ```
- VS Code can also add MCP servers from the UI and autodiscover from other apps.

> Security note: Only add trusted servers; review prompts and capabilities before enabling.

---

## 11. API Contracts (Lean Mode)

### 11.1 `hub.op` input
```json
{ "op": "i.open|i.vote|i.renew|i.close|l.announce|m.send|m.pull|review.request|expert.ask|s.get", "d": { } }
```

**Payload Examples** (self-documenting field names)
- **Intents**
  - `i.open`: `{ "agent":"FE-1", "paths":["apps/web/**"], "mode":"W", "priority":"n", "ttlMs":120000 }`
  - `i.vote`: `{ "id":"i_abc", "agent":"BE-1", "vote":"ack", "reason":"no-overlap" }`
  - `i.renew`: `{ "id":"i_abc", "ttlMs":120000 }`
  - `i.close`: `{ "id":"i_abc", "status":"ok", "note":"tests pass" }`
- **Leases**
  - `l.announce`: `{ "agent":"BE-1", "paths":["apps/api/**"], "mode":"T", "ttlMs":600000 }`
- **Bus**
  - `m.send`: `{ "from":"FE-1", "to":"DB-1", "topic":"PREEMPT_REQUEST", "text":"yield by :45" }`
  - `m.pull`: `{ "agent":"FE-1", "since":1731340000, "limit":50 }`
- **Review**
  - `review.request`: `{ "scope":["apps/web/src/**"], "summary":"add validation" }`
- **Expert**
  - `expert.ask`: `{ "prompt":"explain failing tests + patch", "files":["apps/web/src/Foo.ts"], "effort":"high", "verbosity":"low" }`
- **State**
  - `s.get`: `{ "since":1731340000 }`

### 11.2 Resources
- `inbox://{agent}` → NDJSON of recent events/messages for the agent.  
- `state://live` → summary JSON (agents, intents, leases, semaphores, findings).

---

## 12. Data Model

- **Agent**: `{ name, role[], lastSeen, version }`
- **Intent**: `{ id, agent, paths[], mode, priority, createdAt, ttlMs, lastBeat, status:'active'|'needs_rebase'|'ended' }`
- **Lease**: `{ id, agent, paths[], mode, expiresAt }`
- **Msg**: `{ id, ts, from, to?, topic, text, att? }`
- **ReviewJob**: `{ id, scope[], origin, claimedBy?, status, findings? }`
- **Event**: `WRITE_EVENT | INTENT_EVENT | REVIEW_EVENT | ESCALATION_EVENT`

---

## 13. Azure OpenAI (Responses API) Integration (optional)

**SDK**: official `openai` Node SDK; use Azure base URL; `model` is **deployment name**.  
**Auth**: API key or Entra ID token provider.  
**Contract**: return unified diffs + minimal notes.

```ts
import OpenAI from "openai";

const azure = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,                              // or use AAD token provider
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/v1/`,            // e.g., https://<resource>.openai.azure.com/openai/v1/
});

export async function askExpert(prompt: string, files: Record<string,string>) {
  const res = await azure.responses.create({
    model: process.env.AZURE_GPT5PRO_DEPLOYMENT!,   // deployment name
    reasoning: { effort: "high" },
    verbosity: "low",
    input: [
      { role: "user", content: [{ type: "text", text: "Return unified diffs + minimal notes." }] },
      { role: "user", content: [{ type: "text", text: prompt }] },
      { role: "user", content: [{ type: "input_text", text: JSON.stringify(files) }] }
    ],
    max_output_tokens: 2000
  });
  return res.output_text;
}
```

**Config**
```
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=...
AZURE_GPT5PRO_DEPLOYMENT=gpt5-pro-dev
```

---

## 14. Operational Rules (short prompts shipped from server)

- Declare `i.open` before any **WRITE/BUILD/TEST** in overlapping paths.  
- If **NACK**, narrow `p[]` or time-slice.  
- Heartbeat `i.renew` every 60–90s; `i.close` promptly.  
- Respect **leases** during long TEST/BUILD windows.  
- On **needs_rebase** or **rogue-write**, rebase local changes, then proceed.  
- Reviews are **role-based**: the first `reviewer` to claim a job owns it.

---

## 15. Dev Deliverables

- **`/server`**: TypeScript MCP server with Streamable HTTP transport.  
- **`/dashboard`**: TUI (`blessed`) using `state://live` + inbox polling.  
- **Scripts**: `npm run dev`, `npm run build`, `npm start`, `npm run agentboard`.  
- **Sample configs** for Claude Code, Codex, and VS Code MCP.  
- **Integration tests**: intents, conflict detection, review routing, Azure stubbed escalation.  
- **Docs**: README with install steps, env vars, minimal examples.

---

## 16. Acceptance Tests

1. Three Claude Code agents (FE/BE/DB) + one reviewer agent connect; each can message via `m.send` and see `inbox`.  
2. FE and BE open overlapping `i.open`; FE receives **NACK** or split suggestion; conflict resolved without human.  
3. Closing an intent enqueues **REVIEW_JOB**; reviewer claims and posts findings.  
4. Azure escalation returns a diff; editing agent applies it and test passes.  
5. TUI shows live intents/leases/messages and can pause FS hints or trigger escalation.

---

## 17. Implementation Plan (2 weeks)

- **Day 1–3**: MCP scaffold, `hub.op`, bus, intents/leases, FS watcher.  
- **Day 4–6**: Review router (role-agnostic), state cache, resources.  
- **Day 7–9**: Dashboard/TUI, sample configs, docs.  
- **Day 10–12**: Azure bridge, env/config, test fixtures.  
- **Day 13–14**: Hardening, perf tests, token audit, release.

---

## 18. References

- **Claude Code MCP** (how to connect HTTP servers & scopes): https://code.claude.com/docs/en/mcp  
- **Codex MCP configuration** (CLI & `config.toml` incl. HTTP URLs): https://developers.openai.com/codex/mcp/  
- **VS Code MCP** (workspace `.vscode/mcp.json`, user profile, discovery): https://code.visualstudio.com/docs/copilot/customization/mcp-servers  
- **MCP TypeScript SDK** (servers, streamable HTTP): https://github.com/modelcontextprotocol/typescript-sdk  
- **Azure OpenAI Responses API** (Node usage, v1 endpoint): https://learn.microsoft.com/azure/ai-foundry/openai/how-to/responses

---

## 19. Phase 1 Implementation Notes (2025-11-12)

### 19.1 Completed Components

**Core Server** (Phase 1 MVP):
- ✅ MCP server using `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- ✅ Streamable HTTP transport with per-request isolation (prevents ID collisions)
- ✅ Single `hub.op` multi-operation tool with all 10 opcodes
- ✅ Two resources: `inbox://{agent}` and `state://live`
- ✅ Message bus with pub/sub for agent coordination
- ✅ Intent coordinator with two-phase protocol (declare → vote → execute → close)
- ✅ State cache with TTL-based auto-cleanup
- ✅ Filesystem watcher using chokidar for conflict detection
- ✅ Expert bridge for Azure OpenAI Responses API integration
- ✅ All tool handlers: intents, leases, messages, review, expert, state

**Project Setup**:
- ✅ Node 25 with npm (not pnpm)
- ✅ TypeScript with strictest possible configuration
- ✅ ESLint 9 flat config with all strict rules enabled
- ✅ Prettier with modern 2025 standards
- ✅ Complete type definitions with modern patterns

### 19.2 TypeScript Configuration (Ultra-Strict)

Applied **strictest possible TypeScript** settings for Node 25:
- `strict: true` + `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`
- `noPropertyAccessFromIndexSignature: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `noUnusedLocals: true` + `noUnusedParameters: true`
- `verbatimModuleSyntax: true`
- `target: "ES2023"` with `module: "NodeNext"`

### 19.3 Modern TypeScript Patterns Applied

**Optional Properties** (exactOptionalPropertyTypes compliance):
```typescript
// ✅ Modern 2025 pattern - omit undefined properties
const intent: Intent = {
  id: nanoid(12),
  a: payload.a,
  p: payload.p,
  // ... required fields
  ...(payload.hunks !== undefined && { hunks: payload.hunks }),
  ...(payload.conflicts !== undefined && { conflicts: payload.conflicts }),
};

// ❌ Old code smell - setting to undefined
const intent = { id: nanoid(), hunks: payload.hunks ?? undefined };
```

**Strict Boolean Expressions**:
```typescript
// ✅ Modern explicit checks
if (listeners !== undefined) { /* ... */ }
if (value !== null && value !== undefined) { /* ... */ }

// ❌ Old truthy checks
if (listeners) { /* ... */ }
if (value) { /* ... */ }
```

**No Non-Null Assertions**:
```typescript
// ✅ Explicit runtime checks
const value = map.get(key);
if (value === undefined) {
  throw new Error(`Key not found: ${key}`);
}
// Now TypeScript knows value is defined

// ❌ Compile-only assertion (no runtime safety)
const value = map.get(key)!;
```

**Error Handling**:
```typescript
// ✅ Modern unknown catch
try {
  // ...
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
}

// ❌ Old Error type
catch (error: Error) { /* assumes Error type */ }
```

### 19.4 ESLint Configuration (Strictest Rules)

Applied **typescript-eslint strictest presets**:
- `strictTypeChecked` + `stylisticTypeChecked`
- `strict-boolean-expressions` (no truthy checks)
- `no-unsafe-assignment/call/member-access/return`
- `no-unnecessary-condition`
- `prefer-nullish-coalescing` + `prefer-optional-chain`
- `require-await` + `no-floating-promises`

**Intentional Pattern Overrides**:
```javascript
// MCP tool handlers must be async even without await (for promise rejection)
{
  files: ['src/server/tools/*.ts', 'src/server/resources/*.ts'],
  rules: {
    '@typescript-eslint/require-await': 'off',
  }
}
```

### 19.5 Key Implementation Decisions

**MCP Server Setup**:
- Correct import: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'`
- Tool registration uses plain Zod schemas (not wrapped in `ZodObject`)
- Tool handlers must be async for MCP API (promise rejection = error response)

**HTTP Transport**:
- **Per-request transport instances** (critical for avoiding ID collisions)
- New `StreamableHTTPServerTransport` for each POST to `/mcp`
- Cleanup on connection close

**Conflict Detection**:
- Chokidar with optimized ignore patterns
- `awaitWriteFinish` for debouncing
- Tracks recent writes within configurable conflict window (default 2000ms)

**Optional Dependencies**:
- Azure OpenAI is fully optional (checks `AZURE_OPENAI_ENDPOINT` presence)
- All optional config uses spreading pattern for clean omission

### 19.6 Project Structure

```
agenthub/
├── src/
│   └── server/
│       ├── index.ts              # Main entry point
│       ├── server.ts             # MCP server setup
│       ├── core/
│       │   ├── bus.ts            # Message bus (pub/sub)
│       │   ├── state-cache.ts    # In-memory state with TTL
│       │   ├── coordinator.ts    # Intent coordination
│       │   ├── watcher.ts        # Filesystem monitoring
│       │   └── expert-bridge.ts  # Azure OpenAI integration
│       ├── tools/
│       │   ├── intents.ts        # Intent operations
│       │   ├── leases.ts         # Lease operations
│       │   ├── messages.ts       # Bus messaging
│       │   ├── review.ts         # Review routing
│       │   ├── expert.ts         # Expert escalation
│       │   └── state.ts          # State queries
│       ├── resources/
│       │   ├── inbox.ts          # Agent inbox (NDJSON)
│       │   └── state.ts          # Live state (JSON)
│       ├── transports/
│       │   └── http.ts           # Streamable HTTP transport
│       └── types/
│           └── models.ts         # All type definitions
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc.json
└── AgentHub-PRD.md
```

### 19.7 API Design Decision: Self-Documenting Fields (2025-11-12)

**Problem**: Initial implementation used terse field names (`a`, `p`, `m`, `prio`, `t`) to minimize token overhead, but this created comprehension barriers for agents without extensive documentation.

**Solution**: Adopted a **hybrid approach** balancing token efficiency with agent comprehension:

**Terse Opcodes** (namespaced for clarity):
- ✅ `i.open`, `i.vote`, `i.close` — intent operations
- ✅ `l.announce` (was `l.ann`) — lease operations
- ✅ `m.send`, `m.pull` — message bus
- ✅ `review.request` (was `g.review`) — review routing
- ✅ `expert.ask` (was `x.ask`) — escalation
- ✅ `s.get` — state queries

**Self-Documenting Field Names**:
- ✅ `agent` (was `a`) — 94+ occurrences updated
- ✅ `paths` (was `p`) — array of glob patterns
- ✅ `mode` (was `m`) — R|W|B|T
- ✅ `priority` (was `prio`) — l|n|h|r
- ✅ `ttlMs` (was `t`) — time-to-live in milliseconds
- ✅ `vote` (was `v`), `reason` (was `r`), `status` (was `s`)

**Token Overhead Analysis**:
```json
// Before (terse): 48 chars
{"a":"FE-1","p":["src/**"],"m":"W","prio":"n","t":120000}

// After (self-documenting): 78 chars
{"agent":"FE-1","paths":["src/**"],"mode":"W","priority":"n","ttlMs":120000}

// Overhead: ~30 chars per typical call (~0.01% of Claude's 200k context)
```

**Benefits**:
- Agents understand API without external documentation
- Tool descriptions can be concise (within 100-char limit)
- Pattern recognition: agents learn opcodes quickly (10-15 examples)
- Minimal token cost for significant clarity gain

**Files Updated**:
- `src/server/types/models.ts` — all type definitions
- `src/server/core/coordinator.ts` — 118 lines changed
- `src/server/core/state-cache.ts` — agent field access
- `src/server/core/watcher.ts` — agent field access
- `src/server/server.ts` — tool registration + enhanced description
- `src/server/core/*.test.ts` — all test data updated

### 19.8 Critical Bug Fixes (P1/P2)

**Bug #1: Glob Overlap Detection Failures (P1)**

*Problem*: Wide glob patterns like `**/*.ts` vs `src/**` with base `.` were not detected as overlapping because the implementation only checked if bases were directory prefixes, missing cases where patterns with different bases could match the same files.

*Fix*:
- Rewrote `globsOverlap()` to use `micromatch.matcher()` with test paths
- Extract base paths using `micromatch.scan()`
- Generate sample test paths combining both bases + common extensions
- Create matchers for both patterns and test for actual overlap
- Conservative fallback: assume overlap for very wide patterns (`**`, `**/*`, `**/**`)

*Test Coverage*: 13 tests in `coordinator.test.ts` covering:
- Overlapping patterns (should detect conflicts)
- Non-overlapping patterns (should NOT detect conflicts)
- File path matching against glob patterns

**Bug #2: False Positive Prefix Matches (P2)**

*Problem*: Directory prefix check `path2.startsWith(path1)` would incorrectly match `apps/web` as a prefix of `apps/webhooks`, causing false positive conflicts.

*Fix*:
```typescript
// Before (incorrect)
return path2.startsWith(path1);

// After (correct - directory boundary checking)
return path2.startsWith(`${path1}/`);
```

*Result*: Proper directory boundary checking prevents false positives.

**Bug #3: Windows Path Separator Normalization (P1)**

*Problem*: Filesystem watcher on Windows would emit paths with backslashes (`src\server\index.ts`), but glob patterns use POSIX forward slashes (`src/**/*.ts`). This caused intent matching to fail completely on Windows.

*Fix*:
```typescript
// Added to normalizePath() in watcher.ts
return relative(this.watchRoot, absolutePath).replace(/\\/g, '/');
```

*Test Coverage*: 9 tests in `watcher.test.ts` covering:
- Unix absolute path normalization
- Windows backslash normalization
- Mixed separator normalization
- Deeply nested paths
- Rogue write detection with normalized paths
- Tracked write detection with normalized paths

### 19.9 Test Coverage (Vitest v4.0.8)

**Test Configuration**:
- Modern vitest v4.0.8 with v8 coverage provider
- Strictest TypeScript patterns (no truthy checks, explicit optionals)
- Coverage thresholds: 80% lines/functions/branches/statements

**Test Suites**:
- ✅ `coordinator.test.ts` — 13 tests (glob overlap detection, intent lifecycle)
- ✅ `watcher.test.ts` — 9 tests (path normalization, conflict detection)

**Total**: 22 tests passing, 0 failures

**Modern Test Patterns Used**:
- Explicit imports (no globals)
- Type-safe mocking with vitest
- Setup/teardown hooks for cleanup
- Strict assertions with `expect().toBe()`, `expect().toHaveLength()`
- Private method testing via type assertions (documented pattern)

**Coverage Focus**:
- Critical path normalization logic (Windows + Unix)
- Glob overlap detection (all edge cases)
- Intent conflict detection
- Filesystem watcher event handling

### 19.10 Verification Status

All checks passing as of 2025-11-12:
- ✅ `npm run typecheck` — 0 errors (strictest TypeScript)
- ✅ `npm run lint` — 0 errors (strictest ESLint)
- ✅ `npm run format:check` — All files formatted
- ✅ `npm test` — 22 tests passing (coordinator + watcher)
- ✅ `npm run build` — Clean compilation to dist/

**Phase 1 Status: COMPLETE** ✅
- Core MCP server with all 10 operations
- Self-documenting API (hybrid approach)
- All P1/P2 bugs fixed with comprehensive test coverage
- Cross-platform path handling (Windows + Unix)
- Accurate glob overlap detection
- Modern TypeScript patterns throughout

### 19.11 Remaining Work (Phase 2)

**Not Yet Implemented**:
- ❌ Dashboard/TUI (`agentboard`) — planned using `blessed`
- ❌ Integration tests for intents, conflicts, review routing
- ❌ Sample MCP client configurations
- ❌ Documentation (README.md)
- ❌ Performance benchmarks
- ❌ Token usage audit

**Phase 2 Priority**:
1. Basic integration tests (intents + conflicts)
2. Simple dashboard/TUI for monitoring
3. Documentation with setup instructions
4. Sample client configs for Claude Code, Codex, VS Code

---

## 20. Open Questions

- Should we add **AST‑hunk** intent granularity in v1, or start with path‑based only?  
- Do we need **owner tables** (path→role) to auto‑prioritize ACK/NACK in hot folders?  
- Would a small persistent log (SQLite) add enough value for audits to justify footprint?

