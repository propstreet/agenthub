# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentHub is a **lean MCP (Model Context Protocol) orchestrator** that enables multiple AI coding agents to coordinate edits, reviews, and escalations on shared codebases without hard file gates. It uses an intent-based soft locking system with conflict detection.

**Key Philosophy**: Token-efficient, self-documenting API with a single multi-operation tool (`hub_op`) to minimize MCP overhead.

## Essential Commands

### Development
```bash
npm run dev          # Start with auto-reload (tsx watch)
npm run build        # Build TypeScript to dist/
npm start            # Start production server
npm run dashboard    # Launch terminal dashboard (TUI)
```

### Testing
```bash
npm test                     # Run all tests with vitest
npm run test:dashboard       # Run dashboard tests only
vitest src/path/to/test.ts   # Run single test file
```

### Code Quality
```bash
npm run check        # Run all checks (type + lint + format)
npm run typecheck    # TypeScript validation (no emit)
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format with Prettier
npm run format:check # Check formatting
```

## Architecture

### Core Components

**Message Bus** (`src/server/core/bus.ts`):
- Lightweight pub/sub for agent coordination
- Handles m.send, m.pull operations
- Event emission for real-time subscriptions
- In-memory with configurable limits

**Intent Coordinator** (`src/server/core/coordinator.ts`):
- Two-phase protocol: declare → vote → execute → close
- Conflict detection via glob pattern matching
- Priority-based resolution (r > h > n > l)
- Lease management for advisory locks

**State Cache** (`src/server/core/state-cache.ts`):
- In-memory state with TTL-based auto-cleanup
- Session-aware agent tracking
- Intent/lease lifecycle management
- Expiration monitoring

**Filesystem Watcher** (`src/server/core/watcher.ts`):
- Cross-platform path normalization (Windows/Unix)
- Detects rogue writes (no active intent)
- Conflict detection window (300ms default)
- Chokidar-based with optimized ignore patterns

**Expert Bridge** (`src/server/core/expert-bridge.ts`):
- Optional Azure OpenAI integration (GPT-5 Pro)
- Uses Responses API for structured output
- Returns unified diffs + minimal notes
- Fully optional (checks AZURE_OPENAI_ENDPOINT)

### MCP Surface

**Single Tool**: `hub_op` with 10 operations
- `a.register` - Register agent with roles
- `i.open/vote/renew/close` - Intent lifecycle
- `l.announce` - Advisory leases
- `m.send/pull` - Inter-agent messaging
- `review.request` - Code review routing
- `expert.ask` - Escalation to GPT-5 Pro
- `s.get` - State snapshot

**Resources**:
- `inbox://{agent}` - Agent message queue (NDJSON)
- `state://live` - Complete state snapshot (JSON)

### Transport Layer

**HTTP Transport** (`src/server/transports/http.ts`):
- Per-request transport instances (critical for avoiding ID collisions)
- New `StreamableHTTPServerTransport` for each POST to `/mcp`
- Express-based HTTP server on port 3333
- Session isolation via request-scoped transports

## Validation Architecture (Zod v3)

### Current State: Zod v3.25.76
We use **Zod v3** for MCP SDK compatibility. All schemas follow a consistent pattern:

**Pattern**: RawSchema → transform → validate → normalize
```typescript
const OperationRawSchema = z.object({
  field: z.string().optional(),
  f: z.string().optional(),  // Variant
});

export const OperationSchema = OperationRawSchema.transform((raw) => {
  const field = raw.field ?? raw.f;

  if (!field) {
    throw new Error('field required. Example: {"field": "value"}');
  }

  return { field };
});

export type OperationPayload = z.output<typeof OperationSchema>;
```

**Schema Organization**:
```
src/server/schemas/
├── base.ts           # Enum schemas (Mode, Priority, Vote, CloseStatus)
├── intents.ts        # Intent operations (i.open, i.close, i.renew, i.vote)
├── agents.ts         # Agent registration (a.register)
├── leases.ts         # Lease operations (l.announce)
├── messages.ts       # Message operations (m.send, m.pull)
├── state.ts          # State queries (s.get)
├── index.ts          # Single export point
└── __tests__/        # Comprehensive schema tests (100 tests)
```

### Validation Principles

1. **Variant Normalization**: Support multiple field names
   - `agent` | `a` | `from` | `sender`
   - `paths` | `p`
   - `mode` | `m`
   - `priority` | `prio`
   - `ttlMs` | `ttl`

2. **Session-Aware Resolution**: Handlers auto-populate `agent` from session context when not provided

3. **Defaults in Transform**: Apply defaults in `.transform()` (v3 pattern)
   - `priority`: 'n' (normal)
   - `ttlMs`: 120000 (2 minutes for intents)
   - `topic`: 'general' (messages)

4. **Type Derivation**: Use `z.output<typeof Schema>` for payload types

### Zod v4 Migration

**When to migrate**: After MCP SDK adds v4 support (issue #906)

**All migration points marked with**: `ZOD_V4_MIGRATION` comments

**Key change**: Move refinements from `.transform()` to chainable `.refine()`
```typescript
// v3 (current)
.transform((raw) => {
  if (id.startsWith('temp_')) throw new Error('...');
  return { id };
})

// v4 (future)
.transform((raw) => ({ id }))
.refine((data) => !data.id.startsWith('temp_'), {
  message: '...',
  path: ['id']
})
```

**Performance gains**: 6.5x-14.7x faster parsing

**See**: `ZOD-V3-TO-V4-UPGRADE.md` for complete migration guide

## TypeScript Configuration

### Strictest Possible Settings
```json
{
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "noPropertyAccessFromIndexSignature": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "verbatimModuleSyntax": true
}
```

### Modern Patterns (Node 25 + TypeScript 5.9)

**Optional Properties** (exactOptionalPropertyTypes):
```typescript
// ✅ Modern - omit undefined properties
const intent: Intent = {
  id: nanoid(12),
  agent: payload.agent,
  ...(payload.hunks !== undefined && { hunks: payload.hunks }),
};

// ❌ Old - setting to undefined
const intent = { id: nanoid(), hunks: payload.hunks ?? undefined };
```

**Explicit Boolean Checks**:
```typescript
// ✅ Explicit checks
if (listeners !== undefined) { /* ... */ }
if (value !== null && value !== undefined) { /* ... */ }

// ❌ Truthy checks
if (listeners) { /* ... */ }
```

**No Non-Null Assertions**:
```typescript
// ✅ Runtime checks
const value = map.get(key);
if (value === undefined) throw new Error(`Key not found: ${key}`);

// ❌ Compile-only assertion
const value = map.get(key)!;
```

**Error Handling**:
```typescript
// ✅ Unknown catch
try { /* ... */ } catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
}

// ❌ Assumed Error type
catch (error: Error) { /* ... */ }
```

## ESLint Configuration

### Strictest Rules Applied
- `strictTypeChecked` + `stylisticTypeChecked`
- `strict-boolean-expressions` (no truthy checks)
- `no-unsafe-assignment/call/member-access/return`
- `prefer-nullish-coalescing` + `prefer-optional-chain`

### Pattern-Specific Overrides
```javascript
// MCP tool handlers must be async (for promise rejection)
{
  files: ['src/server/tools/*.ts', 'src/server/resources/*.ts'],
  rules: {
    '@typescript-eslint/require-await': 'off',
  }
}
```

## Critical Implementation Details

### MCP Server Setup
```typescript
// Correct import path
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Tool registration uses plain Zod schemas (NOT ZodObject wrappers)
server.tool('hub_op', inputSchema, async (params) => { /* ... */ });
```

### Per-Request Transport (CRITICAL)
```typescript
// ✅ Create new transport for EACH request
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport('/mcp', res);
  await server.connect(transport);
  // ...cleanup on close
});

// ❌ Reusing transport causes ID collisions and hangs
```

### Cross-Platform Path Handling
```typescript
// Always normalize paths (Windows → POSIX)
const relativePath = relative(watchRoot, absolutePath).replace(/\\/g, '/');

// Use for glob matching and intent conflict detection
```

### Glob Overlap Detection
Uses micromatch for accurate pattern matching:
1. Extract base paths with `micromatch.scan()`
2. Generate test paths combining both bases
3. Create matchers and test for actual overlap
4. Conservative fallback for wide patterns (`**`, `**/*`)

## Testing Strategy

### Test Organization
```
src/server/
├── core/__tests__/
│   ├── coordinator.test.ts  # 17 tests (conflict detection)
│   └── watcher.test.ts      # 9 tests (path normalization)
├── schemas/__tests__/
│   ├── base.test.ts         # 8 tests (enums)
│   ├── intents.test.ts      # 31 tests (intent schemas)
│   ├── agents.test.ts       # 8 tests (agent registration)
│   ├── leases.test.ts       # 16 tests (lease operations)
│   ├── state.test.ts        # 4 tests (state queries)
│   └── messages.test.ts     # (not yet implemented)
└── dashboard/__tests__/
    └── Dashboard.test.tsx   # 9 tests (TUI components)
```

### Test Patterns
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ComponentName', () => {
  let instance: ComponentType;

  beforeEach(() => {
    instance = new ComponentType();
  });

  afterEach(() => {
    instance.cleanup();
  });

  it('should do something specific', () => {
    const result = instance.method();
    expect(result).toBe(expected);
  });
});
```

### Coverage Targets
- 80% lines/functions/branches/statements
- Focus on critical paths (validation, conflict detection, path normalization)

## Dashboard (Ink v5)

### Technology Stack
- **Ink v5**: React for terminal UIs (32.7k stars, actively maintained)
- **React 19**: Modern component patterns with hooks
- **vitest + ink-testing-library**: Component testing

### Components
```typescript
// src/dashboard/components/
├── AgentsPanel.tsx      # Active agents with status
├── IntentsPanel.tsx     # Current intents with TTL
├── MessagesPanel.tsx    # Recent messages
└── StatusBar.tsx        # Overall system status
```

### Why Ink?
- Used by Claude Code, GitHub Copilot CLI, Gemini CLI (proven in production)
- Full TypeScript support with official types
- Testable with vitest via ink-testing-library v4.0
- Rich ecosystem (100+ community components)

### Testing Dashboard Components
```typescript
import { render } from 'ink-testing-library';

it('renders agent status', () => {
  const { lastFrame } = render(<AgentsPanel agents={mockAgents} />);
  expect(lastFrame()).toContain('Agent1');
});
```

## Common Development Tasks

### Adding a New Operation

1. **Define Schema** (`src/server/schemas/operations.ts`):
```typescript
export const NewOpSchema = RawSchema.transform((raw) => {
  // Normalize variants
  // Validate required fields
  // Apply defaults
  return normalizedData;
});

export type NewOpPayload = z.output<typeof NewOpSchema>;
```

2. **Create Handler** (`src/server/tools/new-op.ts`):
```typescript
export async function handleNewOp(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = NewOpSchema.parse(payload);
    // Handle operation
    return { ok: true, d: result, t: Date.now() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      t: Date.now(),
    };
  }
}
```

3. **Register in Server** (`src/server/server.ts`):
```typescript
case 'new.op':
  return await handleNewOp(state, validated.d);
```

4. **Add Tests** (`src/server/schemas/__tests__/operations.test.ts`):
```typescript
describe('NewOpSchema', () => {
  it('accepts valid payload', () => { /* ... */ });
  it('normalizes variants', () => { /* ... */ });
  it('throws on missing required fields', () => { /* ... */ });
});
```

### Debugging Techniques

**Log Intent Conflicts**:
```typescript
console.log(`[Coordinator] Conflicts detected: ${conflicts.join(', ')}`);
```

**Trace Glob Matching**:
```typescript
console.log(`[Glob] Pattern1: ${p1}, Pattern2: ${p2}, Overlap: ${result}`);
```

**Monitor Transport Lifecycle**:
```typescript
console.log(`[Transport] Created for request ${req.id}`);
transport.onclose = () => console.log(`[Transport] Closed for ${req.id}`);
```

**State Inspection**:
```bash
curl http://localhost:3333/resources/state://live | jq .
```

## Environment Configuration

```bash
# Required
PORT=3333
HOST=localhost

# Optional
WATCH_ROOT=/path/to/project           # Enable filesystem watching
AZURE_OPENAI_ENDPOINT=https://...     # Enable expert escalation
AZURE_OPENAI_API_KEY=...
AZURE_EXPERT_DEPLOYMENT=gpt-5-pro
```

## Known Issues & Patterns

### Issue: Transport Hangs (FIXED)
**Problem**: MCP requests hung indefinitely due to transport reuse.
**Solution**: Create new transport per HTTP request (not per session).

### Issue: Windows Path Separators (FIXED)
**Problem**: Backslashes broke glob matching on Windows.
**Solution**: Normalize all paths to POSIX format (`replace(/\\/g, '/')`).

### Issue: False Positive Conflicts (FIXED)
**Problem**: `apps/web` matched `apps/webhooks` as prefix.
**Solution**: Check directory boundaries (`path2.startsWith(path1 + '/')`).

### Pattern: Session-Aware Agent Resolution
```typescript
// Handlers auto-populate agent from session if not provided
const agent = payload.agent ?? resolveAgent(payload, state);
requireAgent(agent);  // Throws if still undefined
```

### Pattern: Resolved Payloads
```typescript
// Schema outputs have optional agent (for session resolution)
export type IntentOpenPayload = { agent?: string; /* ... */ };

// Core methods require resolved agent
export interface ResolvedIntentOpenPayload = { agent: string; /* ... */ };
```

## References

- **MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Claude Code MCP Docs**: https://code.claude.com/docs/en/mcp
- **Ink Documentation**: https://github.com/vadimdemedes/ink
- **Zod v3 Docs**: https://zod.dev
- **AgentHub PRD**: `AgentHub-PRD.md` (comprehensive design document)
- **Zod Migration**: `ZOD-V3-TO-V4-UPGRADE.md`
