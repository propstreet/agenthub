/**
 * Lease operation schemas
 *
 * ⚠️ ZOD_V4_MIGRATION: Currently using Zod v3 due to MCP SDK compatibility
 * When MCP SDK supports Zod v4 (see https://github.com/modelcontextprotocol/typescript-sdk/issues/906):
 * - Update package.json: zod@^4.0.0
 * - Consider using .prefault() for defaults that run through validation
 * - Benefits: Cleaner API, better error handling, faster performance
 */

import { z } from 'zod';
import { ModeSchema } from './base.js';

// ============================================================================
// l.announce - Announce a lease
// ============================================================================

/** Raw schema - accepts variants */
const LeaseAnnounceRawSchema = z.object({
  // Agent variants: agent (canonical), from (alias)
  agent: z.string().optional(),
  from: z.string().optional(),

  // Paths variants: paths, p
  paths: z.array(z.string()).optional(),
  p: z.array(z.string()).optional(),

  // Mode variants: mode, m
  mode: ModeSchema.optional(),
  m: ModeSchema.optional(),

  // TTL variants: ttlMs, ttl
  ttlMs: z.number().optional(),
  ttl: z.number().optional(),
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
export const LeaseAnnounceSchema = LeaseAnnounceRawSchema.transform((raw) => {
  // Normalize variants
  const agent = raw.agent ?? raw.from;
  const paths = raw.paths ?? raw.p;
  const mode = raw.mode ?? raw.m ?? 'R'; // Default: Read
  const ttlMs = raw.ttlMs ?? raw.ttl ?? 600000; // Default: 10 minutes

  // Validate required fields
  if (paths === undefined || paths.length === 0) {
    throw new Error('paths[] required. Example: {"paths": ["src/**/*.ts"]}');
  }

  // Validate ttlMs is positive
  if (ttlMs <= 0) {
    throw new Error('ttlMs must be positive');
  }

  return {
    ...(agent !== undefined && { agent }),
    paths,
    mode,
    ttlMs,
  };
});

export type LeaseAnnouncePayload = z.output<typeof LeaseAnnounceSchema>;
// Inferred type: { agent?: string; paths: string[]; mode: Mode; ttlMs: number }
