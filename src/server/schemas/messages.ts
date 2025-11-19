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
    .enum([
      'chat',
      'review.requested',
      'review.claimed',
      'review.completed',
      'supervision.requested',
      'supervision.announcement',
    ])
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
  // Broadcast flag (explicit broadcast)
  broadcast: z.boolean().optional(),
});

export const MessageSendSchema = MessageSendRawSchema.transform((raw) => {
  const from = raw.from ?? raw.agent;
  const to = raw.to ?? raw.target;
  const type = raw.type ?? 'chat';
  const topic = raw.topic ?? 'general';
  const text = raw.text ?? raw.msg;
  const { data, att, broadcast } = raw;

  if (text === undefined) {
    throw new Error('text required. Provide message content.');
  }

  // Validation for broadcast
  if (broadcast === true && to !== undefined) {
    throw new Error('Cannot specify both broadcast=true and to field');
  }

  // Implicit broadcast deprecation check (optional: could log warning)
  // if (broadcast === undefined && to === undefined) { ... }

  return {
    ...(from !== undefined && { from }),
    ...(to !== undefined && { to }),
    type,
    topic,
    text,
    ...(data !== undefined && { data }),
    ...(att !== undefined && { att }),
    // We don't pass broadcast flag to payload, it just controls 'to' validation
    // If broadcast=true, 'to' remains undefined (which means broadcast in Bus)
  };
});

export type MessageSendPayload = z.output<typeof MessageSendSchema>;

// m.pull
const MessagePullRawSchema = z.object({
  agent: z.string().optional(),
  since: z.number().optional(),
  limit: z.number().optional(),
  // Filtering
  type: z.string().optional(),
  types: z.array(z.string()).optional(),
  topic: z.string().optional(),
  // Options
  includeSelf: z.boolean().optional(),
});

export const MessagePullSchema = MessagePullRawSchema.transform((raw) => {
  const { agent, since, limit, type, types, topic, includeSelf } = raw;

  // Agent is now optional - will be auto-populated from session in handler
  return {
    ...(agent !== undefined && { agent }),
    ...(since !== undefined && { since }),
    ...(limit !== undefined && { limit }),
    ...(type !== undefined && { type }),
    ...(types !== undefined && { types }),
    ...(topic !== undefined && { topic }),
    ...(includeSelf !== undefined && { includeSelf }),
  };
});

export type MessagePullPayload = z.output<typeof MessagePullSchema>;
