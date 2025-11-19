/**
 * Intent operation schemas
 *
 * ⚠️ ZOD_V4_MIGRATION: Currently using Zod v3 due to MCP SDK compatibility
 * When MCP SDK supports Zod v4 (see https://github.com/modelcontextprotocol/typescript-sdk/issues/906):
 * - Update package.json: zod@^4.0.0
 * - In IntentCloseSchema: Chain .refine() after .transform() for temp_ ID check
 * - Benefits: Cleaner API, better error handling, faster performance
 */

import { z } from 'zod';
import { CloseStatusSchema, VoteSchema, ModeSchema, PrioritySchema } from './base.js';

// ============================================================================
// i.open - Open an intent
// ============================================================================

/** Raw schema - accepts variants */
const IntentOpenRawSchema = z.object({
  // Agent variants: agent (canonical), from (alias)
  agent: z.string().optional(),
  from: z.string().optional(),

  // Paths variants: paths, p
  paths: z.array(z.string()).optional(),
  p: z.array(z.string()).optional(),

  // Mode variants: mode, m
  mode: ModeSchema.optional(),
  m: ModeSchema.optional(),

  // Priority variants: priority, prio
  priority: PrioritySchema.optional(),
  prio: PrioritySchema.optional(),

  // TTL variants: ttlMs, ttl
  ttlMs: z.number().optional(),
  ttl: z.number().optional(),

  // Hunks (optional, no variants)
  hunks: z.array(z.string()).optional(),
});

/**
 * Normalized schema with validation and defaults
 *
 * ZOD_V4_MIGRATION: In v3, defaults are applied in transform.
 * In v4, use .prefault() for input-side defaults.
 *
 * NOTE: Agent resolution is session-aware and handled in the handler.
 * If agent is not provided in payload, handler will resolve from session context.
 */
export const IntentOpenSchema = IntentOpenRawSchema.transform((raw) => {
  // Normalize variants
  const agent = raw.agent ?? raw.from;
  const paths = raw.paths ?? raw.p;
  const mode = raw.mode ?? raw.m;
  const priority = raw.priority ?? raw.prio ?? 'n'; // Default: normal
  const ttlMs = raw.ttlMs ?? raw.ttl;
  const { hunks } = raw;

  // Validate required fields
  if (paths === undefined || paths.length === 0) {
    throw new Error('paths[] required. Example: {"paths": ["src/**/*.ts"]}');
  }
  if (mode === undefined) {
    throw new Error('mode required. Valid values: R (read), W (write), B (build), T (test)');
  }

  // Validate ttlMs is positive
  if (ttlMs !== undefined && ttlMs <= 0) {
    throw new Error('ttlMs must be positive');
  }

  return {
    ...(agent !== undefined && { agent }),
    paths,
    mode,
    priority,
    ...(ttlMs !== undefined && { ttlMs }),
    ...(hunks !== undefined && hunks.length > 0 && { hunks }),
  };
});

export type IntentOpenPayload = z.output<typeof IntentOpenSchema>;
// Inferred type: { agent?: string; paths: string[]; mode: Mode; priority: Priority; ttlMs?: number; hunks?: string[] }

// ============================================================================
// i.close - Close an intent
// ============================================================================

/** Raw schema - accepts variants */
const IntentCloseRawSchema = z.object({
  // ID variants: id, intentId, intent
  id: z.string().optional(),
  intentId: z.string().optional(),
  intent: z.string().optional(),

  // Status variants: status, s
  status: CloseStatusSchema.optional(),
  s: CloseStatusSchema.optional(),

  // Note variants: note, n
  note: z.string().optional(),
  n: z.string().optional(),
});

/**
 * Normalized schema with validation
 *
 * ZOD_V4_MIGRATION: In v3, we can't chain .refine() after .transform(),
 * so we handle all validation in the transform block.
 *
 * In v4, uncomment the chained .refine() below for better error reporting:
 * .refine(
 *   (data) => !data.id.startsWith('temp_'),
 *   { message: 'Cannot close temporary intents', path: ['id'] }
 * );
 */
export const IntentCloseSchema = IntentCloseRawSchema.transform((raw) => {
  // Normalize variants
  const id = raw.id ?? raw.intentId ?? raw.intent;
  const status = raw.status ?? raw.s;
  const note = raw.note ?? raw.n;

  // Validate required fields
  if (id === undefined) {
    throw new Error('id required. Provide the intent ID to close.');
  }
  if (status === undefined) {
    throw new Error('status required. Valid values: ok, abort');
  }

  // v3: Handle refinement validation in transform (v4 would use chained .refine())
  if (id.startsWith('temp_')) {
    throw new Error('Cannot close temporary intents');
  }

  return {
    id,
    status,
    ...(note !== undefined && { note }),
  };
});

export type IntentClosePayload = z.output<typeof IntentCloseSchema>;
// Inferred type: { id: string; status: 'ok' | 'abort'; note?: string }

// ============================================================================
// i.renew - Renew an intent's TTL
// ============================================================================

/** Raw schema - accepts variants */
const IntentRenewRawSchema = z.object({
  // ID variants: id, intentId, intent
  id: z.string().optional(),
  intentId: z.string().optional(),
  intent: z.string().optional(),

  // TTL variants: ttlMs, ttl
  ttlMs: z.number().optional(),
  ttl: z.number().optional(),
});

/**
 * Normalized schema with validation and defaults
 *
 * ZOD_V4_MIGRATION: In v3, defaults are applied in transform.
 * In v4, use .prefault() for input-side defaults that run through validation.
 */
export const IntentRenewSchema = IntentRenewRawSchema.transform((raw) => {
  // Normalize variants
  const id = raw.id ?? raw.intentId ?? raw.intent;
  const ttlMs = raw.ttlMs ?? raw.ttl;

  // Validate required fields
  if (id === undefined) {
    throw new Error('id required. Provide the intent ID to renew.');
  }

  // Validate ttlMs is positive
  if (ttlMs !== undefined && ttlMs <= 0) {
    throw new Error('ttlMs must be positive');
  }

  return {
    id,
    ...(ttlMs !== undefined && { ttlMs }),
  };
});

export type IntentRenewPayload = z.output<typeof IntentRenewSchema>;
// Inferred type: { id: string; ttlMs?: number }

// ============================================================================
// i.vote - Vote on an intent
// ============================================================================

/** Raw schema - accepts variants */
const IntentVoteRawSchema = z.object({
  // ID variants: id, intentId, intent
  id: z.string().optional(),
  intentId: z.string().optional(),
  intent: z.string().optional(),

  // Agent variants: agent (canonical), from (alias)
  agent: z.string().optional(),
  from: z.string().optional(),

  // Vote variants: vote, v
  // Allow string for alias normalization (approve->ack, defer->nack)
  vote: z.string().optional(),
  v: z.string().optional(),

  // Reason variants: reason, r
  reason: z.string().optional(),
  r: z.string().optional(),
});

/**
 * Normalized schema with validation
 *
 * ZOD_V4_MIGRATION: In v3, we handle all validation in transform.
 * In v4, consider using .check() for better error messages.
 */
/**
 * NOTE: Agent resolution is session-aware and handled in the handler.
 * If agent is not provided in payload, handler will resolve from session context.
 */
export const IntentVoteSchema = IntentVoteRawSchema.transform((raw) => {
  // Normalize variants
  const id = raw.id ?? raw.intentId ?? raw.intent;
  const agent = raw.agent ?? raw.from;
  const reason = raw.reason ?? raw.r;

  // Normalize vote aliases
  let voteStr = raw.vote ?? raw.v;
  if (voteStr === 'approve') voteStr = 'ack';
  if (voteStr === 'defer') voteStr = 'nack';

  // Validate required fields
  if (id === undefined) {
    throw new Error('id required. Provide the intent ID to vote on.');
  }
  if (voteStr === undefined) {
    throw new Error('vote required. Valid values: ack (approve), nack (defer)');
  }

  // Validate vote enum
  const vote = VoteSchema.parse(voteStr);

  return {
    id,
    ...(agent !== undefined && { agent }),
    vote,
    ...(reason !== undefined && { reason }),
  };
});

export type IntentVotePayload = z.output<typeof IntentVoteSchema>;
// Inferred type: { id: string; agent?: string; vote: 'ack' | 'nack'; reason?: string }
