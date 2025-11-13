/**
 * Expert Escalation Schema (expert.ask)
 *
 * Field Variants:
 * - question, q, prompt → prompt
 * - paths, p, files → files
 */

import { z } from 'zod';

/** Raw schema with field variants */
const ExpertAskRawSchema = z.object({
  // Question variants: question (canonical), q, prompt
  question: z.string().optional(),
  q: z.string().optional(),
  prompt: z.string().optional(),

  // Files variants: paths (canonical), p, files
  paths: z.array(z.string()).optional(),
  p: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),

  // Reasoning effort (optional)
  effort: z.enum(['minimal', 'medium', 'high']).optional(),

  // Verbosity (optional)
  verb: z.enum(['low', 'medium', 'high']).optional(),
});

/**
 * Normalized schema with validation
 *
 * Follows proven GPT-5-Pro consultation structure:
 * 1. Clear question
 * 2. Complete code context (full files with sections)
 * 3. Specific guidance request
 */
export const ExpertAskSchema = ExpertAskRawSchema.transform((raw) => {
  // Normalize question field (canonical: question)
  const prompt = raw.question ?? raw.q ?? raw.prompt;

  if (prompt === undefined || prompt.trim() === '') {
    throw new Error(
      'question required. Example: {"question": "How can I optimize this?", "paths": ["file.ts"]}'
    );
  }

  // Normalize files field (canonical: paths)
  const files = raw.paths ?? raw.p ?? raw.files;

  if (files === undefined || files.length === 0) {
    throw new Error('paths[] required. Example: {"paths": ["src/file.ts"]}');
  }

  return {
    prompt,
    files,
    effort: raw.effort ?? 'high', // Default: high reasoning effort
    verb: raw.verb ?? 'low', // Default: concise verbosity
  };
});

export type ExpertAskPayload = z.output<typeof ExpertAskSchema>;
// Inferred type: { prompt: string; files: string[]; effort: 'minimal' | 'medium' | 'high'; verb: 'low' | 'medium' | 'high' }
