/**
 * AgentHub Data Models
 * Type-safe models for multi-agent coordination
 */

import type {
  IntentOpenPayload,
  IntentClosePayload,
  IntentRenewPayload,
  IntentVotePayload,
} from '../schemas/intents.js';
import type { StateGetPayload } from '../schemas/state.js';
import type { LeaseAnnouncePayload } from '../schemas/leases.js';
import type { MessageSendPayload, MessagePullPayload } from '../schemas/messages.js';
import type {
  ExpertRequestPayload,
  ExpertStatusPayload,
  ExpertCancelPayload,
  ExpertListPayload,
} from '../schemas/expert.js';

// ============================================================================
// Base Types
// ============================================================================

/** Agent mode: Read, Write, Build, Test */
export type Mode = 'R' | 'W' | 'B' | 'T';

/** Intent priority levels */
export type Priority = 'l' | 'n' | 'h' | 'r'; // low, normal, high, review

/** Intent vote response */
export type Vote = 'ack' | 'nack';

/** Intent status */
export type IntentStatus = 'active' | 'needs_rebase' | 'ended';

/** Intent close status */
export type CloseStatus = 'ok' | 'abort';

/** Agent role */
export type AgentRole = string;

/** Review job status */
export type ReviewStatus = 'pending' | 'claimed' | 'completed' | 'failed';

/** Severity levels for review findings */
export type Severity = 'info' | 'warning' | 'error' | 'critical';

/** Message type for filtering and routing */
export type MessageType =
  | 'chat' // Default user messages
  | 'review.requested' // Review needs claiming
  | 'review.claimed' // Review was claimed
  | 'review.completed' // Review finished
  | 'supervision.requested' // Agent → Human (asking for help)
  | 'supervision.announcement' // Human → Agents (broadcast)
  | 'expert.progress' // Expert request progress update
  | 'expert.completed' // Expert request completed successfully
  | 'expert.failed'; // Expert request failed

// ============================================================================
// Core Models
// ============================================================================

/** Agent representation */
export interface Agent {
  /** Unique agent identifier */
  name: string;
  /** Agent roles (editor, reviewer, tester, etc.) */
  role: AgentRole[];
  /** Last heartbeat timestamp */
  lastSeen: number;
  /** Agent version/metadata */
  version?: string;
  /** Connection status */
  status: 'active' | 'idle' | 'disconnected';
}

/** Intent for coordinated edits/builds/tests */
export interface Intent {
  /** Unique intent ID */
  id: string;
  /** Agent name */
  agent: string;
  /** Path patterns (glob) */
  paths: string[];
  /** Mode: R/W/B/T */
  mode: Mode;
  /** Priority: l/n/h/r */
  priority: Priority;
  /** Creation timestamp */
  createdAt: number;
  /** TTL in milliseconds */
  ttlMs: number;
  /** Last heartbeat */
  lastBeat: number;
  /** Current status */
  status: IntentStatus;
  /** Conflicting intent IDs */
  conflicts?: string[];
  /** Optional hunks/scope details */
  hunks?: string[];
}

/** Lease for advisory locking */
export interface Lease {
  /** Unique lease ID */
  id: string;
  /** Agent name */
  agent: string;
  /** Path patterns */
  paths: string[];
  /** Mode */
  mode: Mode;
  /** Expiration timestamp */
  exp: number;
}

/** Message between agents */
export interface Msg {
  /** Message ID */
  id: string;
  /** Timestamp */
  ts: number;
  /** Sender agent */
  from: string;
  /** Recipient agent (undefined = broadcast) */
  to?: string;
  /** Message type for filtering */
  type: MessageType;
  /** Message topic (deprecated, use type) */
  topic: string;
  /** Message content */
  text: string;
  /** Structured payload for programmatic access */
  data?: unknown;
  /** Optional attachments (deprecated, use data) */
  att?: Record<string, unknown>;
}

/** Review job */
export interface ReviewJob {
  /** Job ID */
  id: string;
  /** Paths to review */
  scope: string[];
  /** Originating agent */
  origin: string;
  /** Agent that claimed this job */
  claimedBy?: string;
  /** Job status */
  status: ReviewStatus;
  /** Review findings */
  findings?: ReviewFindings;
  /** Creation timestamp */
  createdAt: number;
  /** Optional summary */
  summary?: string;
  /** Timestamp when claimed */
  claimedAt?: number;
  /** Timestamp when claim expires */
  claimExpiresAt?: number;
}

/** Review findings */
export interface ReviewFindings {
  /** Severity level */
  sev: Severity;
  /** Findings notes */
  notes: string;
  /** Optional patch (unified diff) */
  patch?: string;
  /** Timestamp */
  ts: number;
}

/** Expert request status */
export type ExpertRequestStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'incomplete';

/** Expert request for async GPT-5 Pro consultation */
export interface ExpertRequest {
  /** Request ID (exp_abc123) */
  id: string;
  /** Requesting agent */
  agent: string;
  /** Question for expert */
  question: string;
  /** File paths to analyze */
  files: string[];
  /** Request priority (for queue ordering) */
  priority: Priority;

  /** Current status */
  status: ExpertRequestStatus;

  /** Azure response ID (for polling/retrieval) */
  responseId?: string;

  /** Previous response ID for follow-up questions (enables conversation context) */
  previousResponseId?: string;

  /** Final output_text from Azure */
  result?: string;
  /** Error message if failed */
  error?: string;
  /** Incomplete reason from Azure incomplete_details */
  incompleteReason?: string;

  /** Request creation timestamp */
  createdAt: number;
  /** When worker started processing */
  startedAt?: number;
  /** When request completed/failed */
  completedAt?: number;

  /** Agent who requested (for message delivery) */
  requestedBy: string;
  /** Retry attempt counter (0-based) */
  attempt: number;

  /** Token usage from Azure response */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
  };
}

/** Expert worker configuration */
export interface ExpertWorkerConfig {
  /** Enable expert worker */
  enabled: boolean;
  /** Max concurrent Azure requests */
  maxConcurrent: number;
  /** Poll queue every N ms */
  pollingInterval: number;
  /** Poll Azure retrieve every N ms */
  retrieveInterval: number;
  /** Send progress message every N ms */
  progressInterval: number;
  /** Max retry attempts */
  retryAttempts: number;
  /** Keep completed requests N ms */
  requestTTL: number;
  /** Max pending requests per agent */
  maxPendingPerAgent: number;
}

// ============================================================================
// Events
// ============================================================================

/** Base event interface */
export interface BaseEvent {
  type: string;
  ts: number;
}

/** Filesystem write event */
export interface WriteEvent extends BaseEvent {
  type: 'WRITE_EVENT';
  subtype: 'tracked' | 'rogue-write' | 'conflict';
  file: string;
  intent?: string;
  intents?: string[];
  actor?: string;
}

/** Intent lifecycle event */
export interface IntentEvent extends BaseEvent {
  type: 'INTENT_EVENT';
  action: 'open' | 'vote' | 'renew' | 'close';
  intentId: string;
  agent: string;
  data?: Record<string, unknown>;
}

/** Review event */
export interface ReviewEvent extends BaseEvent {
  type: 'REVIEW_EVENT';
  action: 'requested' | 'claimed' | 'completed';
  jobId: string;
  agent: string;
  findings?: ReviewFindings;
}

/** Escalation event */
export interface EscalationEvent extends BaseEvent {
  type: 'ESCALATION_EVENT';
  agent: string;
  prompt: string;
  result?: string;
  error?: string;
}

/** Union of all event types */
export type Event = WriteEvent | IntentEvent | ReviewEvent | EscalationEvent;

// ============================================================================
// Operation Payloads (hub_op)
// ============================================================================

/** m.send payload (from Zod schema) */
export type { MessageSendPayload };

/** m.pull payload (from Zod schema) */
export type { MessagePullPayload };

/** i.open payload (from Zod schema) */
export type { IntentOpenPayload };

/** i.vote payload (from Zod schema) */
export type { IntentVotePayload };

/** i.renew payload (from Zod schema) */
export type { IntentRenewPayload };

/** i.close payload (from Zod schema) */
export type { IntentClosePayload };

/** l.announce payload (from Zod schema) */
export type { LeaseAnnouncePayload };

/** g.review payload */
export interface ReviewRequestPayload {
  scope: string[];
  summary?: string;
}

/** expert.request payload (from Zod schema) */
export type { ExpertRequestPayload };

/** expert.status/cancel payload (from Zod schema) */
export type { ExpertStatusPayload, ExpertCancelPayload };

/** expert.list payload (from Zod schema) */
export type { ExpertListPayload };

/** s.get payload (from Zod schema) */
export type { StateGetPayload };

/** Union of all operation payloads */
export type OpPayload =
  | MessageSendPayload
  | MessagePullPayload
  | IntentOpenPayload
  | IntentVotePayload
  | IntentRenewPayload
  | IntentClosePayload
  | LeaseAnnouncePayload
  | ReviewRequestPayload
  | ExpertRequestPayload
  | ExpertStatusPayload
  | ExpertListPayload
  | StateGetPayload;

// ============================================================================
// API Response Types
// ============================================================================

/** Standard hub_op response envelope */
export interface HubOpResponse<T = Record<string, unknown>> {
  ok: boolean;
  d?: T;
  t: number;
  error?: string;
}

/** TTL Warning */
export interface TTLWarning {
  expiresIn: number;
  expiresAt: number;
  message: string;
}

/** i.open response data */
export interface IntentOpenResponse {
  id: string;
  conflicts: string[];
  ttlWarning?: TTLWarning;
}

/** State snapshot */
export interface StateSnapshot {
  agents: Agent[];
  intents: Intent[];
  leases: Lease[];
  reviewJobs: ReviewJob[];
  expertRequests: ExpertRequest[];
  recentMessages: Msg[];
  recentEvents: Event[];
  semaphores?: Record<string, number>;
  config?: Partial<ServerConfig>;
  expertAvailable?: boolean;
  ts: number;
}

// ============================================================================
// Configuration
// ============================================================================

/** Server configuration */
export interface ServerConfig {
  port: number;
  host: string;
  watchRoot?: string;
  logLevel: 'info' | 'debug';
  azureOpenAI?: {
    endpoint: string;
    apiKey?: string;
    deployment: string;
    effort?: 'minimal' | 'medium' | 'high';
    verbosity?: 'low' | 'medium' | 'high';
  };
  expertWorker?: ExpertWorkerConfig;
  persistence?: {
    enabled: boolean;
    snapshotPath: string;
    intervalMs: number;
    autoRestore: boolean;
  };
  limits: {
    maxIntents: number;
    maxLeases: number;
    maxMessages: number;
    maxEvents: number;
    resourcePayloadMaxBytes: number;
  };
  timeouts: {
    intentVoteWindow: number;
    intentDefaultTTL: number;
    leaseDefaultTTL: number;
    fsWatcherConflictWindow: number;
  };
}

/** Default server configuration */
export const DEFAULT_CONFIG: ServerConfig = {
  port: 3333,
  host: 'localhost',
  logLevel: 'info',
  limits: {
    maxIntents: 50,
    maxLeases: 100,
    maxMessages: 1000,
    maxEvents: 500,
    resourcePayloadMaxBytes: 64 * 1024, // 64KB
  },
  timeouts: {
    intentVoteWindow: 1200, // 1.2s
    intentDefaultTTL: 600_000, // 10 minutes
    leaseDefaultTTL: 600_000, // 10 minutes
    fsWatcherConflictWindow: 300, // 300ms
  },
};
