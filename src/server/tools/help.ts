/**
 * Help Operation Handler
 * Provides self-discovery of available operations and their schemas
 */

import type { HubOpResponse } from '../types/models.js';

export interface OperationHelp {
  op: string;
  description: string;
  fields: {
    name: string;
    type: string;
    required: boolean;
    variants?: string[];
    default?: string | number;
    description: string;
  }[];
  example: Record<string, unknown>;
}

/**
 * Handle help requests - provides operation documentation
 */
export async function handleHelp(): Promise<HubOpResponse> {
  const operations: OperationHelp[] = [
    {
      op: 'a.register',
      description: 'Register an agent with the hub',
      fields: [
        {
          name: 'agent',
          type: 'string',
          required: false,
          variants: ['name'],
          description: 'Agent name (auto-generated if omitted)',
        },
        {
          name: 'role',
          type: 'string[]',
          required: true,
          variants: ['r', 'roles'],
          description: 'Agent roles (e.g., ["planner", "coder"])',
        },
      ],
      example: {
        agent: 'my-agent',
        role: ['planner', 'coder'],
      },
    },
    {
      op: 'i.open',
      description: 'Open a new intent to declare work on files',
      fields: [
        {
          name: 'agent',
          type: 'string',
          required: false,
          variants: ['from'],
          description: 'Agent opening intent (auto-filled from session if omitted)',
        },
        {
          name: 'paths',
          type: 'string[]',
          required: true,
          variants: ['p', 'path'],
          description: 'File paths or glob patterns (e.g., ["src/**/*.ts"])',
        },
        {
          name: 'mode',
          type: 'R | W | B | T',
          required: true,
          variants: ['m'],
          description:
            'Access mode: R=Read (read-only), W=Write (edit files), B=Build (compile/transform), T=Test (run tests)',
        },
        {
          name: 'priority',
          type: 'l | n | h | r',
          required: false,
          default: 'n',
          variants: ['prio'],
          description: 'Priority: l=low, n=normal, h=high, r=required',
        },
        {
          name: 'ttlMs',
          type: 'number',
          required: false,
          default: 600000,
          variants: ['ttl'],
          description: 'Time to live in milliseconds',
        },
        {
          name: 'hunks',
          type: 'string[]',
          required: false,
          description: 'Optional unified diff hunks for precise intent',
        },
      ],
      example: {
        paths: ['src/server/**/*.ts'],
        mode: 'W',
        priority: 'h',
        ttlMs: 300000,
      },
    },
    {
      op: 'i.vote',
      description: 'Vote on a conflicting intent',
      fields: [
        {
          name: 'agent',
          type: 'string',
          required: false,
          variants: ['from'],
          description: 'Agent voting (auto-filled from session)',
        },
        {
          name: 'intentId',
          type: 'string',
          required: true,
          variants: ['id', 'intent'],
          description: 'ID of intent to vote on',
        },
        {
          name: 'vote',
          type: 'approve | defer',
          required: true,
          variants: ['v'],
          description: 'Vote: approve=allow, defer=wait',
        },
      ],
      example: {
        intentId: 'intent_abc123',
        vote: 'approve',
      },
    },
    {
      op: 'i.renew',
      description: 'Renew an intent to extend its TTL',
      fields: [
        {
          name: 'agent',
          type: 'string',
          required: false,
          description: 'Agent renewing (auto-filled from session)',
        },
        {
          name: 'intentId',
          type: 'string',
          required: true,
          variants: ['id', 'intent'],
          description: 'ID of intent to renew',
        },
        {
          name: 'ttlMs',
          type: 'number',
          required: false,
          default: 600000,
          variants: ['ttl'],
          description: 'New time to live in milliseconds',
        },
      ],
      example: {
        intentId: 'intent_abc123',
        ttlMs: 180000,
      },
    },
    {
      op: 'i.close',
      description: 'Close an intent after work is complete',
      fields: [
        {
          name: 'agent',
          type: 'string',
          required: false,
          description: 'Agent closing intent (auto-filled from session)',
        },
        {
          name: 'id',
          type: 'string',
          required: true,
          variants: ['intentId', 'intent'],
          description: 'ID of intent to close',
        },
        {
          name: 'status',
          type: 'ok | abort',
          required: true,
          variants: ['s'],
          description: 'Completion status',
        },
        {
          name: 'note',
          type: 'string',
          required: false,
          variants: ['n', 'message'],
          description: 'Optional completion note',
        },
      ],
      example: {
        id: 'intent_abc123',
        status: 'ok',
        note: 'Successfully implemented feature',
      },
    },
    {
      op: 'l.announce',
      description: 'Announce an advisory lease for coordination',
      fields: [
        {
          name: 'agent',
          type: 'string',
          required: false,
          variants: ['from'],
          description: 'Agent holding lease (auto-filled from session)',
        },
        {
          name: 'paths',
          type: 'string[]',
          required: true,
          variants: ['p', 'path'],
          description: 'File paths or patterns for lease',
        },
        {
          name: 'ttlMs',
          type: 'number',
          required: false,
          default: 600000,
          variants: ['ttl'],
          description: 'Lease duration in milliseconds',
        },
      ],
      example: {
        paths: ['src/database/**'],
        ttlMs: 600000,
      },
    },
    {
      op: 'm.send',
      description: 'Send a message to another agent or broadcast',
      fields: [
        {
          name: 'from',
          type: 'string',
          required: false,
          variants: ['agent'],
          description: 'Sending agent (auto-filled from session)',
        },
        {
          name: 'to',
          type: 'string',
          required: false,
          variants: ['target'],
          description: 'Target agent (omit for broadcast)',
        },
        {
          name: 'type',
          type: 'chat | review.requested | review.claimed | review.completed | supervision.requested | supervision.announcement',
          required: false,
          default: 'chat',
          description: 'Message type for filtering',
        },
        {
          name: 'text',
          type: 'string',
          required: true,
          variants: ['msg'],
          description: 'Message content',
        },
        {
          name: 'topic',
          type: 'string',
          required: false,
          default: 'general',
          description: 'Message topic (deprecated, use type)',
        },
        {
          name: 'data',
          type: 'unknown',
          required: false,
          description: 'Structured payload for programmatic access',
        },
      ],
      example: {
        to: 'agent-2',
        type: 'chat',
        text: 'Ready to review your changes',
      },
    },
    {
      op: 'm.pull',
      description: 'Pull messages from inbox',
      fields: [
        {
          name: 'agent',
          type: 'string',
          required: false,
          description: 'Agent pulling messages (auto-filled from session)',
        },
        {
          name: 'since',
          type: 'number',
          required: false,
          variants: ['after', 'from'],
          description: 'Unix timestamp - only get messages after this time',
        },
        {
          name: 'limit',
          type: 'number',
          required: false,
          default: 50,
          description: 'Maximum messages to retrieve',
        },
      ],
      example: {
        since: 1640000000000,
        limit: 20,
      },
    },
    {
      op: 'review.request',
      description: 'Request code review from another agent',
      fields: [
        {
          name: 'from',
          type: 'string',
          required: false,
          variants: ['agent'],
          description: 'Requesting agent (auto-filled from session)',
        },
        {
          name: 'scope',
          type: 'string[]',
          required: true,
          variants: ['paths', 'p'],
          description: 'File paths or patterns to review',
        },
        {
          name: 'summary',
          type: 'string',
          required: false,
          variants: ['note'],
          description: 'Review context and instructions',
        },
      ],
      example: {
        paths: ['src/auth/**/*.ts'],
        summary: 'Please review authentication changes for security issues',
      },
    },
    {
      op: 'review.claim',
      description: 'Claim a pending review job (requires reviewer role)',
      fields: [
        {
          name: 'jobId',
          type: 'string',
          required: true,
          variants: ['id', 'job'],
          description: 'ID of review job to claim',
        },
        {
          name: 'agent',
          type: 'string',
          required: false,
          variants: ['from'],
          description: 'Agent claiming job (auto-filled from session)',
        },
      ],
      example: {
        jobId: 'rev_abc123',
      },
    },
    {
      op: 'review.complete',
      description: 'Complete a claimed review job with findings',
      fields: [
        {
          name: 'jobId',
          type: 'string',
          required: true,
          variants: ['id', 'job'],
          description: 'ID of review job to complete',
        },
        {
          name: 'agent',
          type: 'string',
          required: false,
          variants: ['from'],
          description: 'Agent completing review (auto-filled from session)',
        },
        {
          name: 'severity',
          type: 'info | warning | error | critical',
          required: true,
          variants: ['sev'],
          description: 'Severity level of findings',
        },
        {
          name: 'notes',
          type: 'string',
          required: true,
          variants: ['note', 'message'],
          description: 'Review findings and recommendations',
        },
        {
          name: 'patch',
          type: 'string',
          required: false,
          description: 'Optional unified diff patch with suggested fixes',
        },
      ],
      example: {
        jobId: 'rev_abc123',
        severity: 'warning',
        notes: 'Consider adding error handling for edge cases in auth module',
        patch: '--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,6 +10,9 @@\n...',
      },
    },
    {
      op: 'expert.request',
      description: 'Submit async expert consultation (GPT-5 Pro, 10-20 min)',
      fields: [
        {
          name: 'question',
          type: 'string',
          required: true,
          variants: ['q', 'prompt'],
          description: 'Question for expert',
        },
        {
          name: 'paths',
          type: 'string[]',
          required: true,
          variants: ['p', 'files'],
          description: 'Files to analyze',
        },
        {
          name: 'effort',
          type: 'minimal | medium | high',
          required: false,
          default: 'high',
          description: 'Reasoning effort level',
        },
        {
          name: 'verb',
          type: 'low | medium | high',
          required: false,
          default: 'low',
          description: 'Response verbosity level',
        },
        {
          name: 'priority',
          type: 'l | n | h | r',
          required: false,
          default: 'n',
          variants: ['prio'],
          description: 'Request priority in queue',
        },
      ],
      example: {
        question: 'How can I optimize this for performance?',
        paths: ['src/complex-algorithm.ts'],
        priority: 'h',
      },
    },
    {
      op: 'expert.status',
      description: 'Check status of expert request',
      fields: [
        {
          name: 'requestId',
          type: 'string',
          required: true,
          variants: ['id'],
          description: 'Expert request ID',
        },
      ],
      example: {
        requestId: 'exp_abc123def456',
      },
    },
    {
      op: 'expert.cancel',
      description: 'Cancel pending expert request',
      fields: [
        {
          name: 'requestId',
          type: 'string',
          required: true,
          variants: ['id'],
          description: 'Expert request ID to cancel',
        },
      ],
      example: {
        requestId: 'exp_abc123def456',
      },
    },
    {
      op: 'expert.list',
      description: 'List expert requests for current agent',
      fields: [
        {
          name: 'status',
          type: 'pending | queued | in_progress | completed | failed | cancelled | incomplete',
          required: false,
          variants: ['s'],
          description: 'Filter by status',
        },
        {
          name: 'since',
          type: 'number',
          required: false,
          description: 'Filter by timestamp (Unix ms)',
        },
        {
          name: 'limit',
          type: 'number',
          required: false,
          default: 50,
          variants: ['l'],
          description: 'Maximum results to return',
        },
      ],
      example: {
        status: 'completed',
        limit: 10,
      },
    },
    {
      op: 's.get',
      description: 'Get current hub state snapshot',
      fields: [
        {
          name: 'filter',
          type: 'string',
          required: false,
          variants: ['f'],
          description: 'Optional filter: agents|intents|leases|messages|all',
        },
      ],
      example: {
        filter: 'intents',
      },
    },
    {
      op: 's.help',
      description: 'Get this help documentation',
      fields: [],
      example: {},
    },
  ];

  return {
    ok: true,
    d: {
      version: '1.0.0',
      operations,
      legend: {
        modes: {
          R: { name: 'Read', description: 'Read-only access to files (viewing, analyzing)' },
          W: { name: 'Write', description: 'Edit files (create, modify, delete)' },
          B: { name: 'Build', description: 'Compile, transform, or bundle files' },
          T: { name: 'Test', description: 'Run tests, validate, or check quality' },
        },
        priorities: {
          l: { name: 'low', description: 'Background tasks, non-urgent work' },
          n: { name: 'normal', description: 'Standard priority (default)' },
          h: { name: 'high', description: 'Important, time-sensitive work' },
          r: { name: 'required', description: 'Critical/blocking work, highest priority' },
        },
        priorityOrder: 'r > h > n > l (required beats high beats normal beats low)',
      },
      notes: [
        'Most operations auto-fill "agent" from your MCP session if omitted',
        'Field variants are supported (e.g., "agent" or "a" or "from")',
        'Canonical field names are preferred in examples and docs',
        'All timestamps are Unix milliseconds',
        'Message types: chat (default), review.requested, review.claimed, review.completed, supervision.requested, supervision.announcement',
        'supervision.requested: agent → human (asking for help), supervision.announcement: human → agents (broadcast)',
        'Filter messages by type: messages.filter(m => m.type === "review.requested")',
        'Review notifications come from requesting agent (not system)',
        'Use data field for structured message payloads (programmatic access)',
      ],
    },
    t: Date.now(),
  };
}
