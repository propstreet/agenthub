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

export const ModeSchema = z.enum(['R', 'W', 'B', 'T']);
export const PrioritySchema = z.enum(['l', 'n', 'h', 'r']);
export const VoteSchema = z.enum(['ack', 'nack']);
export const CloseStatusSchema = z.enum(['ok', 'abort']);

export type Mode = z.infer<typeof ModeSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Vote = z.infer<typeof VoteSchema>;
export type CloseStatus = z.infer<typeof CloseStatusSchema>;
