/**
 * Base Zod schemas
 * Reusable enum schemas across all operations
 *
 * Note: Variant normalization is handled in individual schema transforms,
 * not via helpers, for simplicity and explicitness.
 *
 * ⚠️ ZOD_V4_MIGRATION: Currently using Zod v3 due to MCP SDK compatibility
 * When MCP SDK supports Zod v4 (see https://github.com/modelcontextprotocol/typescript-sdk/issues/906):
 * - Update package.json: zod@^4.0.0
 * - No changes needed in this file (enum syntax is identical in v3/v4)
 * - Benefits: 6.5x-14.7x faster validation, improved TypeScript performance
 */

import { z } from 'zod';

// ============================================================================
// Enum Schemas
// ============================================================================

export const ModeSchema = z
  .enum(['R', 'W', 'B', 'T'], {
    errorMap: () => ({
      message:
        'Invalid mode. Valid options: R=Read (read-only), W=Write (edit files), B=Build (compile/transform), T=Test (run tests)',
    }),
  })
  .describe('Access mode: R=Read, W=Write, B=Build, T=Test');

export const PrioritySchema = z
  .enum(['l', 'n', 'h', 'r'], {
    errorMap: () => ({
      message:
        'Invalid priority. Valid options: l=low, n=normal (default), h=high, r=required (critical)',
    }),
  })
  .describe('Priority level: l=low, n=normal, h=high, r=required');

export const VoteSchema = z
  .enum(['ack', 'nack'], {
    errorMap: () => ({
      message: 'Invalid vote. Valid options: ack=approve, nack=defer',
    }),
  })
  .describe('Vote decision: ack=approve, nack=defer');

export const CloseStatusSchema = z
  .enum(['ok', 'abort'], {
    errorMap: () => ({
      message: 'Invalid status. Valid options: ok=success, abort=cancelled/failed',
    }),
  })
  .describe('Completion status: ok=success, abort=cancelled');

export type Mode = z.infer<typeof ModeSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Vote = z.infer<typeof VoteSchema>;
export type CloseStatus = z.infer<typeof CloseStatusSchema>;
