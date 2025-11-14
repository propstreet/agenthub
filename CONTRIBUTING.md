# Contributing to AgentHub

Thank you for your interest in contributing to AgentHub! We welcome contributions from the community to help improve this MCP orchestrator for multi-agent coordination.

## Ways to Contribute

### 🐛 Report Issues

Found a bug? Please open a GitHub Issue with:

- **Clear description** of the problem
- **Reproduction steps** (minimal example if possible)
- **Environment details**:
  - AgentHub version
  - Node.js version
  - Operating system
  - MCP client(s) being used
- **Expected vs actual behavior**
- **Relevant logs** (with `LOG_LEVEL=debug` if helpful)

### 💡 Suggest Features

Have an idea for a new feature? We'd love to hear it! Please:

1. **Check existing issues** to avoid duplicates
2. **Open a GitHub Discussion** or Issue with:
   - Use case and motivation
   - Proposed API or behavior
   - How it improves agent coordination
   - Any backward compatibility concerns

### 🔧 Submit Code Contributions

We follow a standard fork-and-pull-request workflow:

1. **Fork the repository** to your GitHub account
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/agenthub.git
   cd agenthub
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes** following our [Code Standards](#code-standards)
5. **Test thoroughly** using `npm test` and `npm run check`
6. **Commit with clear messages** using [Conventional Commits](#commit-messages)
7. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
8. **Open a Pull Request** with:
   - Description of changes
   - Motivation and context
   - Testing performed
   - Screenshots (if UI changes)
   - Link to related issue(s)

## Code Standards

### TypeScript

- **Strictest settings**: All code must pass TypeScript's strict mode checks
- **No `any`**: Use `unknown` and type guards instead
- **Explicit types**: Always specify return types for functions
- **Modern patterns**: Use optional chaining (`?.`), nullish coalescing (`??`)
- **No non-null assertions**: Use runtime checks instead of `!`

Example:
```typescript
// ✅ Good
export async function handleOperation(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  const data = OperationSchema.parse(payload);
  const result = state.getData(data.id);
  if (result === undefined) {
    throw new Error(`Not found: ${data.id}`);
  }
  return { ok: true, d: result, t: Date.now() };
}

// ❌ Bad
async function handleOperation(state, payload) {
  const data = payload as any;
  return { ok: true, d: state.getData(data.id)! };
}
```

### ESLint

All code must pass our strict ESLint configuration:

```bash
npm run lint
npm run lint:fix  # Auto-fix where possible
```

Key rules:
- `@typescript-eslint/strict-type-checked`
- `@typescript-eslint/no-unsafe-*` (no unsafe operations)
- `@typescript-eslint/strict-boolean-expressions` (explicit boolean checks)
- `@typescript-eslint/prefer-nullish-coalescing`

### Prettier

Code must be formatted with Prettier:

```bash
npm run format
npm run format:check  # Verify formatting
```

### Documentation

- **JSDoc comments** for public APIs
- **Inline comments** for complex logic
- **README updates** for new features
- **CHANGELOG updates** following [Keep a Changelog](https://keepachangelog.com/)

Example:
```typescript
/**
 * Opens a new intent for path-based coordination.
 *
 * @param payload - Intent parameters (paths, mode, priority, ttl)
 * @returns Intent with ID, conflicts, and voting status
 * @throws {ZodError} If payload validation fails
 */
export async function handleIntentOpen(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  // ...
}
```

## Testing

### Running Tests

```bash
npm test                     # Run all tests
npm run test:dashboard       # Dashboard tests only
vitest src/path/to/test.ts   # Single test file
```

### Writing Tests

- **Unit tests** for all core logic (coordinator, watcher, schemas)
- **Integration tests** for end-to-end workflows
- **Test organization**: Place tests in `__tests__/` directories
- **Coverage target**: Aim for 80%+ coverage on new code

Example:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Coordinator } from './coordinator.js';

describe('Coordinator - Conflict Detection', () => {
  let coordinator: Coordinator;

  beforeEach(() => {
    coordinator = new Coordinator(bus, state, config);
  });

  it('should detect overlapping glob patterns', () => {
    const intent1 = coordinator.openIntent({
      agent: 'agent-1',
      paths: ['src/**/*.ts'],
      mode: 'W',
      priority: 'n',
      ttlMs: 120000,
    });

    const intent2 = coordinator.openIntent({
      agent: 'agent-2',
      paths: ['src/server/**'],
      mode: 'W',
      priority: 'n',
      ttlMs: 120000,
    });

    expect(intent2.conflicts).toContain(intent1.id);
  });
});
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear changelog generation:

**Format**: `<type>(<scope>): <description>`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code restructuring without behavior change
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, etc.

**Examples**:
```bash
feat(coordinator): add glob-to-glob overlap detection
fix(watcher): normalize Windows path separators to POSIX
docs(readme): update persistence configuration examples
test(schemas): add validation tests for intent operations
```

## Development Workflow

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server** (auto-reload):
   ```bash
   npm run dev
   ```

3. **Run checks before committing**:
   ```bash
   npm run check  # typecheck + lint + format
   npm test       # run tests
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

### Testing Your Changes

Test your changes with real MCP clients:

1. **Build the project**: `npm run build`
2. **Configure MCP client** (e.g., Claude Code):
   ```json
   {
     "mcpServers": {
       "agenthub-dev": {
         "url": "http://localhost:3333/mcp"
       }
     }
   }
   ```
3. **Start the server**: `npm start` or `npm run dev`
4. **Test operations** via your MCP client
5. **Check logs** with `LOG_LEVEL=debug` for debugging

## Pull Request Process

1. **Update documentation** if you've changed:
   - Public APIs
   - Configuration options
   - Operation behavior

2. **Update CHANGELOG.md** under `[Unreleased]` section

3. **Ensure all checks pass**:
   - ✅ TypeScript compilation
   - ✅ ESLint
   - ✅ Prettier formatting
   - ✅ All tests passing

4. **Request review** from maintainers

5. **Address feedback** and iterate

6. **Squash commits** if requested (we may squash on merge)

## Project Structure

Understanding the codebase:

```
agenthub/
├── src/
│   ├── server/
│   │   ├── core/              # Core logic (bus, coordinator, watcher, persistence)
│   │   ├── tools/             # hub_op operation handlers
│   │   ├── resources/         # MCP resource handlers
│   │   ├── schemas/           # Zod validation schemas
│   │   ├── transports/        # HTTP transport layer
│   │   ├── types/             # TypeScript models and types
│   │   ├── server.ts          # MCP server setup
│   │   ├── index.ts           # Entry point
│   │   └── session-context.ts # Session context management
│   └── dashboard/             # Terminal UI (Ink-based)
├── .mcp-config/               # Client configuration examples
├── .github/                   # GitHub templates and workflows
├── .env.example               # Environment template
├── CLAUDE.md                  # Development guide for AI assistants
├── CONTRIBUTING.md            # This file
├── CHANGELOG.md               # Version history
├── LICENSE                    # MIT license
└── README.md                  # Main documentation
```

## Code of Conduct

### Our Standards

- **Be respectful** and considerate in all interactions
- **Be collaborative** and help others learn
- **Be patient** with newcomers
- **Accept constructive criticism** gracefully
- **Focus on what's best** for the project and community

### Unacceptable Behavior

- Harassment, discrimination, or personal attacks
- Trolling, insulting comments, or political derailment
- Publishing others' private information
- Inappropriate use of sexual language or imagery
- Other conduct reasonably considered unprofessional

## Questions?

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For general questions and ideas
- **Email**: For private inquiries, contact the Propstreet team

## License

By contributing to AgentHub, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to AgentHub! 🚀
