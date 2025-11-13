/**
 * Message operation schemas
 * ⚠️ ZOD_V4_MIGRATION: Using Zod v3 for MCP SDK compatibility
 */

import { z } from 'zod';

// m.send
const MessageSendRawSchema = z.object({
  // From variants: from (canonical), agent (alias)
  from: z.string().optional(),
  agent: z.string().optional(),
  // To variants: to (canonical), target (alias)
  to: z.string().optional(),
  target: z.string().optional(),
  // Type: message type for filtering
  type: z
    .enum(['chat', 'review.requested', 'review.claimed', 'review.completed', 'supervision.requested'])
    .optional(),
  // Topic (deprecated, use type)
  topic: z.string().optional(),
  // Text variants: text (canonical), msg (alias)
  text: z.string().optional(),
  msg: z.string().optional(),
  // Data: structured payload for programmatic access
  data: z.unknown().optional(),
  // Attachments (deprecated, use data)
  att: z.record(z.unknown()).optional(),
});

export const MessageSendSchema = MessageSendRawSchema.transform((raw) => {
  const from = raw.from ?? raw.agent;
  const to = raw.to ?? raw.target;
  const type = raw.type ?? 'chat';
  const topic = raw.topic ?? 'general';
  const text = raw.text ?? raw.msg;
  const { data, att } = raw;

  if (text === undefined) {
    throw new Error('text required. Provide message content.');
  }

  return {
    ...(from !== undefined && { from }),
    ...(to !== undefined && { to }),
    type,
    topic,
    text,
    ...(data !== undefined && { data }),
    ...(att !== undefined && { att }),
  };
});

export type MessageSendPayload = z.output<typeof MessageSendSchema>;

// m.pull
const MessagePullRawSchema = z.object({
  agent: z.string().optional(),
  since: z.number().optional(),
  limit: z.number().optional(),
});

export const MessagePullSchema = MessagePullRawSchema.transform((raw) => {
  const { agent } = raw;
  const { since } = raw;
  const { limit } = raw;

  if (agent === undefined) {
    throw new Error('agent required. Specify which agent to pull messages for.');
  }

  return {
    agent,
    ...(since !== undefined && { since }),
    ...(limit !== undefined && { limit }),
  };
});

export type MessagePullPayload = z.output<typeof MessagePullSchema>;
