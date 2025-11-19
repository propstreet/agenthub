/**
 * Documentation Resource Handler
 * Provides comprehensive API reference as an MCP resource
 */

/**
 * Handle docs://reference resource
 */
export function handleDocsResource(): string {
  const docs = {
    title: 'AgentHub API Reference',
    version: '1.0.0',
    description:
      'Complete reference for AgentHub MCP operations. AgentHub enables AI agents to coordinate edits, reviews, and escalations without file locking conflicts.',

    quickStart: {
      '1. Register': {
        op: 'a.register',
        example: { role: ['coder', 'reviewer'] },
        note: 'Agent name auto-generated if omitted',
      },
      '2. Open Intent': {
        op: 'i.open',
        example: { paths: ['src/**/*.ts'], mode: 'W', priority: 'h' },
        note: 'Declare work before editing files',
      },
      '3. Close Intent': {
        op: 'i.close',
        example: { id: 'intent_id', status: 'ok' },
        note: 'Mark work as complete',
      },
    },

    concepts: {
      intents: {
        description: 'Declare intention to work on files before editing',
        lifecycle: ['i.open → (work) → i.renew (if needed) → i.close'],
        conflictResolution:
          'When intents overlap, use i.vote to approve/defer. Priority determines automatic resolution.',
      },
      leases: {
        description: 'Advisory locks for coordination (softer than intents)',
        usage: 'Longer-running holds on resources (default 10 min vs 2 min for intents)',
      },
      messages: {
        description: 'Inter-agent communication',
        types: [
          'chat - General communication',
          'review.requested - Code review request',
          'review.claimed - Review job claimed',
          'review.completed - Review finished',
          'supervision.requested - Agent asking human for help',
          'supervision.announcement - Human broadcast to agents',
        ],
      },
      sessions: {
        description: 'MCP sessions automatically track agent identity',
        behavior: 'The "agent" field is auto-filled from session context when omitted',
      },
    },

    modes: {
      description: 'Access modes define how agents interact with files',
      values: {
        R: {
          name: 'Read',
          description: 'Read-only access - viewing, analyzing, searching files',
          icon: '📖',
          examples: ['Code analysis', 'Documentation reading', 'Search operations'],
        },
        W: {
          name: 'Write',
          description: 'Edit files - create, modify, or delete',
          icon: '✏',
          examples: ['Implementing features', 'Fixing bugs', 'Refactoring code'],
        },
        B: {
          name: 'Build',
          description: 'Compile, transform, or bundle files',
          icon: '🔨',
          examples: ['Running build scripts', 'Transpiling code', 'Generating assets'],
        },
        T: {
          name: 'Test',
          description: 'Run tests, validate, or check quality',
          icon: '🧪',
          examples: ['Running test suites', 'Linting', 'Type checking'],
        },
      },
    },

    priorities: {
      description: 'Priority levels for conflict resolution',
      values: {
        l: {
          name: 'low',
          description: 'Background tasks, non-urgent work',
          examples: ['Documentation updates', 'Code cleanup'],
        },
        n: {
          name: 'normal',
          description: 'Standard priority (default)',
          examples: ['Feature implementation', 'Bug fixes'],
        },
        h: {
          name: 'high',
          description: 'Important, time-sensitive work',
          examples: ['Critical bug fixes', 'Release blockers'],
        },
        r: {
          name: 'required',
          description: 'Critical/blocking work, highest priority',
          examples: ['Security patches', 'Production incidents'],
        },
      },
      resolution: 'r > h > n > l (required beats high beats normal beats low)',
    },

    operations: {
      'Agent Management': {
        'a.register': 'Register agent with roles',
      },
      'Intent Lifecycle': {
        'i.open': 'Declare work on files',
        'i.vote': 'Vote on conflicting intents',
        'i.renew': 'Extend intent TTL',
        'i.close': 'Mark work complete',
      },
      Leases: {
        'l.announce': 'Announce advisory lease',
      },
      Messaging: {
        'm.send': 'Send message or broadcast',
        'm.pull': 'Pull messages from inbox',
      },
      'Code Review': {
        'review.request': 'Request code review',
        'review.claim': 'Claim review job',
        'review.complete': 'Submit review findings',
      },
      'Expert Escalation': {
        'expert.request': 'Submit async expert request',
        'expert.status': 'Check request status',
        'expert.list': 'List active requests',
        'expert.cancel': 'Cancel pending request',
      },
      'State & Help': {
        's.get': 'Get current hub state',
        's.help': 'Get detailed operation docs',
      },
    },

    fieldVariants: {
      description: 'Multiple field names are supported for convenience',
      examples: {
        agent: ['agent', 'a', 'from', 'sender'],
        paths: ['paths', 'p', 'path'],
        mode: ['mode', 'm'],
        priority: ['priority', 'prio'],
        ttlMs: ['ttlMs', 'ttl'],
      },
      note: 'Canonical names (first in list) are preferred in documentation',
    },

    resources: {
      'state://live': {
        description: 'Complete state snapshot (agents, intents, leases, reviews)',
        format: 'application/json',
      },
      'inbox://{agent}': {
        description: 'Messages for specific agent',
        format: 'application/x-ndjson',
      },
      'messages://recent': {
        description: 'Auto-pulls recent messages for current agent',
        format: 'application/json',
      },
    },

    bestPractices: [
      'Always open an intent before editing files to prevent conflicts',
      'Use appropriate modes: R for reading, W for writing, B for building, T for testing',
      'Set priority based on urgency: l=background, n=standard, h=important, r=critical',
      'Renew intents if work takes longer than TTL (default 10 minutes)',
      'Close intents with status="ok" on success, status="abort" on failure',
      'Use message types to filter and route communications effectively',
      'Check for conflicts in i.open response and resolve with i.vote if needed',
      'Run s.help for detailed field-level documentation and examples',
    ],

    troubleshooting: {
      'Agent not found': 'Run a.register first to create agent session',
      'Invalid mode': 'Use R, W, B, or T (not "read", "write", etc.)',
      'Invalid priority': 'Use l, n, h, or r (lowercase single letters)',
      'Conflicts detected': 'Check response.d.conflicts and use i.vote to resolve',
      'TTL expired': 'Intent expired, close it and open a new one',
    },

    links: {
      repository: 'https://github.com/propstreet/agenthub',
      registry: 'https://registry.modelcontextprotocol.io/servers/io.github.propstreet/agenthub',
      npm: 'https://www.npmjs.com/package/@propstreet/agenthub',
    },
  };

  return JSON.stringify(docs, null, 2);
}
