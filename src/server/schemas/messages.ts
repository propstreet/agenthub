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
  // Topic (no variants)
  topic: z.string().optional(),
  // Text variants: text (canonical), msg (alias)
  text: z.string().optional(),
  msg: z.string().optional(),
  // Attachments (no variants)
  att: z.record(z.unknown()).optional(),
});

export const MessageSendSchema = MessageSendRawSchema.transform((raw) => {
  const from = raw.from ?? raw.agent;
  const to = raw.to ?? raw.target;
  const topic = raw.topic ?? 'general';
  const text = raw.text ?? raw.msg;
  const { att } = raw;

  if (text === undefined) {
    throw new Error('text required. Provide message content.');
  }

  return {
    ...(from !== undefined && { from }),
    ...(to !== undefined && { to }),
    topic,
    text,
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
