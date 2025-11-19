/**
 * Async Expert Operations Schema
 *
 * Field Variants:
 * - question, q, prompt → question
 * - paths, p, files → paths
 * - priority, prio → priority
 */

import { z } from 'zod';

// ============================================================================
// Async Expert Operations (v1.1+)
// ============================================================================

/**
 * expert.request - Submit async expert consultation
 *
 * Field Variants:
 * - question, q, prompt → question
 * - paths, p, files → paths
 * - priority, prio → priority
 */
const ExpertRequestRawSchema = z.object({
  // Question variants
  question: z.string().optional(),
  q: z.string().optional(),
  prompt: z.string().optional(),

  // Paths variants
  paths: z.array(z.string()).optional(),
  p: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),

  // Priority (optional)
  priority: z.enum(['l', 'n', 'h', 'r']).optional(),
  prio: z.enum(['l', 'n', 'h', 'r']).optional(),

  // Previous response ID for follow-up questions (optional)
  previousResponseId: z.string().optional(),
  prevId: z.string().optional(),
});

export const ExpertRequestSchema = ExpertRequestRawSchema.transform((raw) => {
  const question = raw.question ?? raw.q ?? raw.prompt;
  const paths = raw.paths ?? raw.p ?? raw.files;
  const previousResponseId = raw.previousResponseId ?? raw.prevId;

  if (question === undefined || question.trim() === '') {
    throw new Error(
      'question required. Example: {"question": "How to optimize?", "paths": ["file.ts"]}',
    );
  }

  if (paths === undefined || paths.length === 0) {
    throw new Error('paths required. Example: {"question": "...", "paths": ["src/file.ts"]}');
  }

  return {
    question,
    paths,
    priority: raw.priority ?? raw.prio ?? 'n',
    ...(previousResponseId !== undefined && { previousResponseId }),
  };
});

export type ExpertRequestPayload = z.output<typeof ExpertRequestSchema>;

/**
 * expert.status - Check request status
 *
 * Field Variants:
 * - requestId, id → requestId
 */
const ExpertStatusRawSchema = z.object({
  requestId: z.string().optional(),
  id: z.string().optional(),
});

export const ExpertStatusSchema = ExpertStatusRawSchema.transform((raw) => {
  const requestId = raw.requestId ?? raw.id;

  if (requestId === undefined || requestId.trim() === '') {
    throw new Error('requestId required. Example: {"requestId": "exp_abc123"}');
  }

  return { requestId };
});

export type ExpertStatusPayload = z.output<typeof ExpertStatusSchema>;

/**
 * expert.cancel - Cancel pending request
 */
export const ExpertCancelSchema = ExpertStatusSchema; // Same as status
export type ExpertCancelPayload = ExpertStatusPayload;

/**
 * expert.list - List expert requests for agent
 *
 * Field Variants:
 * - status, s → status (optional)
 * - since → since (optional timestamp)
 * - limit, l → limit (optional)
 */
const ExpertListRawSchema = z.object({
  status: z
    .enum(['pending', 'queued', 'in_progress', 'completed', 'failed', 'cancelled', 'incomplete'])
    .optional(),
  s: z
    .enum(['pending', 'queued', 'in_progress', 'completed', 'failed', 'cancelled', 'incomplete'])
    .optional(),

  since: z.number().optional(),

  limit: z.number().optional(),
  l: z.number().optional(),
});

export const ExpertListSchema = ExpertListRawSchema.transform((raw) => {
  const status = raw.status ?? raw.s;
  const limit = raw.limit ?? raw.l ?? 50;

  return {
    ...(status !== undefined && { status }),
    ...(raw.since !== undefined && { since: raw.since }),
    limit,
  };
});

export type ExpertListPayload = z.output<typeof ExpertListSchema>;
