/**
 * AgentHub Data Models
 * Type-safe models for multi-agent coordination
 */

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
  /** Message topic/type */
  topic: string;
  /** Message content */
  text: string;
  /** Optional attachments (JSON data) */
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

/** m.send payload */
export interface MessageSendPayload {
  from: string;
  to?: string;
  topic: string;
  text: string;
  att?: Record<string, unknown>;
}

/** m.pull payload */
export interface MessagePullPayload {
  agent: string;
  since?: number;
  limit?: number;
}

/** i.open payload */
export interface IntentOpenPayload {
  agent: string;
  paths: string[];
  mode: Mode;
  priority: Priority;
  ttlMs: number;
  hunks?: string[];
}

/** i.vote payload */
export interface IntentVotePayload {
  id: string;
  agent: string;
  vote: Vote;
  reason?: string;
}

/** i.renew payload */
export interface IntentRenewPayload {
  id: string;
  ttlMs: number;
}

/** i.close payload */
export interface IntentClosePayload {
  id: string;
  status: CloseStatus;
  note?: string;
}

/** l.announce payload */
export interface LeaseAnnouncePayload {
  agent: string;
  paths: string[];
  mode: Mode;
  ttlMs: number;
}

/** g.review payload */
export interface ReviewRequestPayload {
  scope: string[];
  summary?: string;
}

/** x.ask payload */
export interface ExpertAskPayload {
  prompt: string;
  files: string[];
  effort?: 'minimal' | 'medium' | 'high';
  verb?: 'low' | 'medium' | 'high'; // verbosity
}

/** s.get payload */
export interface StateGetPayload {
  since?: number;
}

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
  | ExpertAskPayload
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

/** i.open response data */
export interface IntentOpenResponse {
  id: string;
  conflicts: string[];
}

/** State snapshot */
export interface StateSnapshot {
  agents: Agent[];
  intents: Intent[];
  leases: Lease[];
  reviewJobs: ReviewJob[];
  recentMessages: Msg[];
  recentEvents: Event[];
  semaphores?: Record<string, number>;
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
  azureOpenAI?: {
    endpoint: string;
    apiKey?: string;
    deployment: string;
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
  limits: {
    maxIntents: 50,
    maxLeases: 100,
    maxMessages: 1000,
    maxEvents: 500,
    resourcePayloadMaxBytes: 64 * 1024, // 64KB
  },
  timeouts: {
    intentVoteWindow: 1200, // 1.2s
    intentDefaultTTL: 120_000, // 2 minutes
    leaseDefaultTTL: 600_000, // 10 minutes
    fsWatcherConflictWindow: 300, // 300ms
  },
};
