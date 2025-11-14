/**
 * Review operation schemas
 *
 * ⚠️ ZOD_V4_MIGRATION: Currently using Zod v3 due to MCP SDK compatibility
 * When MCP SDK supports Zod v4 (see https://github.com/modelcontextprotocol/typescript-sdk/issues/906):
 * - Update package.json: zod@^4.0.0
 * - No major changes needed (v3 syntax is forward-compatible)
 * - Benefits: Cleaner API, better error handling, faster performance
 */

import { z } from 'zod';

// ============================================================================
// review.request - Request a code review
// ============================================================================

/** Raw schema - accepts variants */
const ReviewRequestRawSchema = z.object({
  // Scope variants: scope (canonical), paths (alias)
  scope: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  p: z.array(z.string()).optional(),

  // Summary variants: summary (canonical), note (alias)
  summary: z.string().optional(),
  note: z.string().optional(),

  // From (optional - auto-filled from session)
  from: z.string().optional(),
  agent: z.string().optional(),
});

/**
 * Normalized schema with validation
 *
 * NOTE: Agent resolution is session-aware and handled in the handler.
 */
export const ReviewRequestSchema = ReviewRequestRawSchema.transform((raw) => {
  // Normalize variants
  const scope = raw.scope ?? raw.paths ?? raw.p;
  const summary = raw.summary ?? raw.note;
  const from = raw.from ?? raw.agent;

  // Validate required fields
  if (scope === undefined || scope.length === 0) {
    throw new Error('scope required. Provide file paths or patterns to review.');
  }

  return {
    scope,
    ...(summary !== undefined && { summary }),
    ...(from !== undefined && { from }),
  };
});

export type ReviewRequestPayload = z.output<typeof ReviewRequestSchema>;
// Inferred type: { scope: string[]; summary?: string; from?: string }

// ============================================================================
// review.claim - Claim a pending review job
// ============================================================================

/** Raw schema - accepts variants */
const ReviewClaimRawSchema = z.object({
  // Job ID variants: jobId (canonical), id (alias), job (alias)
  jobId: z.string().optional(),
  id: z.string().optional(),
  job: z.string().optional(),

  // Agent (optional - auto-filled from session)
  agent: z.string().optional(),
  from: z.string().optional(),
});

/**
 * Normalized schema with validation
 *
 * NOTE: Agent resolution is session-aware and handled in the handler.
 * If agent is not provided in payload, handler will resolve from session context.
 */
export const ReviewClaimSchema = ReviewClaimRawSchema.transform((raw) => {
  // Normalize variants
  const jobId = raw.jobId ?? raw.id ?? raw.job;
  const agent = raw.agent ?? raw.from;

  // Validate required fields
  if (jobId === undefined) {
    throw new Error('jobId required. Provide the review job ID to claim.');
  }

  return {
    jobId,
    ...(agent !== undefined && { agent }),
  };
});

export type ReviewClaimPayload = z.output<typeof ReviewClaimSchema>;
// Inferred type: { jobId: string; agent?: string }

// ============================================================================
// review.complete - Complete a claimed review job with findings
// ============================================================================

/** Severity enum schema */
const SeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);

/** Raw schema - accepts variants */
const ReviewCompleteRawSchema = z.object({
  // Job ID variants: jobId (canonical), id (alias), job (alias)
  jobId: z.string().optional(),
  id: z.string().optional(),
  job: z.string().optional(),

  // Agent (optional - auto-filled from session)
  agent: z.string().optional(),
  from: z.string().optional(),

  // Severity variants: severity (canonical), sev (alias)
  severity: SeveritySchema.optional(),
  sev: SeveritySchema.optional(),

  // Notes variants: notes (canonical), note (alias), message (alias)
  notes: z.string().optional(),
  note: z.string().optional(),
  message: z.string().optional(),

  // Patch (optional, no variants)
  patch: z.string().optional(),
});

/**
 * Normalized schema with validation
 *
 * NOTE: Agent resolution is session-aware and handled in the handler.
 * If agent is not provided in payload, handler will resolve from session context.
 */
export const ReviewCompleteSchema = ReviewCompleteRawSchema.transform((raw) => {
  // Normalize variants
  const jobId = raw.jobId ?? raw.id ?? raw.job;
  const agent = raw.agent ?? raw.from;
  const severity = raw.severity ?? raw.sev;
  const notes = raw.notes ?? raw.note ?? raw.message;
  const { patch } = raw;

  // Validate required fields
  if (jobId === undefined) {
    throw new Error('jobId required. Provide the review job ID to complete.');
  }
  if (severity === undefined) {
    throw new Error('severity required. Valid values: info, warning, error, critical');
  }
  if (notes === undefined || notes.trim() === '') {
    throw new Error('notes required. Provide review findings and recommendations.');
  }

  return {
    jobId,
    ...(agent !== undefined && { agent }),
    severity,
    notes: notes.trim(),
    ...(patch !== undefined && patch.trim() !== '' && { patch: patch.trim() }),
  };
});

export type ReviewCompletePayload = z.output<typeof ReviewCompleteSchema>;
// Inferred type: { jobId: string; agent?: string; severity: 'info'|'warning'|'error'|'critical'; notes: string; patch?: string }
