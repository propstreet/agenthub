/**
 * Agent operation schemas
 *
 * ⚠️ ZOD_V4_MIGRATION: Currently using Zod v3 due to MCP SDK compatibility
 * When MCP SDK supports Zod v4 (see https://github.com/modelcontextprotocol/typescript-sdk/issues/906):
 * - Update package.json: zod@^4.0.0
 * - No major changes needed (v3 syntax is forward-compatible)
 * - Benefits: Cleaner API, better error handling, faster performance
 */

import { z } from 'zod';

// ============================================================================
// a.register - Register an agent
// ============================================================================

/** Raw schema - accepts variants */
const AgentRegisterRawSchema = z.object({
  // Name (optional - will be generated if not provided)
  name: z.string().optional(),

  // Role variants: role, r
  role: z.array(z.string()).optional(),
  r: z.array(z.string()).optional(),

  // Version (optional)
  version: z.string().optional(),
  v: z.string().optional(),
});

/**
 * Normalized schema with validation
 *
 * ZOD_V4_MIGRATION: In v3, we handle all validation in transform.
 * In v4, consider using .check() for multi-issue validation.
 */
export const AgentRegisterSchema = AgentRegisterRawSchema.transform((raw) => {
  // Normalize variants
  const { name } = raw;
  const role = raw.role ?? raw.r;
  const version = raw.version ?? raw.v;

  // Validate required fields
  if (role === undefined || role.length === 0) {
    throw new Error('role[] required. Provide at least one role for the agent.');
  }

  return {
    ...(name !== undefined && { name }),
    role,
    ...(version !== undefined && { version }),
  };
});

export type AgentRegisterPayload = z.output<typeof AgentRegisterSchema>;
// Inferred type: { name?: string; role: string[]; version?: string }
