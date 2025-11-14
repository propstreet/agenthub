/**
 * State operation schemas
 *
 * ⚠️ ZOD_V4_MIGRATION: Currently using Zod v3 due to MCP SDK compatibility
 * When MCP SDK supports Zod v4 (see https://github.com/modelcontextprotocol/typescript-sdk/issues/906):
 * - Update package.json: zod@^4.0.0
 * - No major changes needed (v3 syntax is forward-compatible)
 * - Benefits: Cleaner API, better error handling, faster performance
 */

import { z } from 'zod';

// ============================================================================
// s.get - Get state snapshot
// ============================================================================

/** Raw schema */
const StateGetRawSchema = z.object({
  // Since timestamp (optional)
  since: z.number().optional(),
});

/**
 * State get schema
 * All fields are optional, so this is essentially a passthrough with validation
 */
export const StateGetSchema = StateGetRawSchema.transform((raw) => {
  // Since is optional, pass through
  return {
    ...(raw.since !== undefined && { since: raw.since }),
  };
});

export type StateGetPayload = z.output<typeof StateGetSchema>;
// Inferred type: { since?: number }
