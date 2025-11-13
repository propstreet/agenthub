/**
 * Message operation handlers (m.send, m.pull)
 */

import type { HubOpResponse } from '../types/models.js';
import type { MessageBus } from '../core/bus.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';
import { MessageSendSchema, MessagePullSchema } from '../schemas/messages.js';

export async function handleMessageSend(
  state: StateCache,
  bus: MessageBus,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const normalized = MessageSendSchema.parse(payload);

    let sender = normalized.from;
    const sessionId = getCurrentSessionId();
    if (sender === undefined && sessionId !== undefined) {
      const sessionAgent = state.getAgentBySession(sessionId);
      if (sessionAgent !== undefined) {
        sender = sessionAgent.name;
      }
    }

    if (sender === undefined) {
      throw new Error(
        'Sender agent required. Use "from" or "agent" field, or register an agent first.',
      );
    }

    // Construct resolved payload with required fields
    const data: {
      from: string;
      to?: string;
      type: import('../types/models.js').MessageType;
      topic: string;
      text: string;
      data?: unknown;
      att?: Record<string, unknown>;
    } = {
      from: sender,
      type: normalized.type,
      topic: normalized.topic,
      text: normalized.text,
      ...(normalized.to !== undefined && { to: normalized.to }),
      ...(normalized.data !== undefined && { data: normalized.data }),
      ...(normalized.att !== undefined && { att: normalized.att }),
    };

    if (sessionId !== undefined) {
      state.validateAgentOwnership(data.from, sessionId);
    }

    const message = bus.send(data);

    return {
      ok: true,
      d: { id: message.id, ts: message.ts },
      t: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      t: Date.now(),
    };
  }
}

export async function handleMessagePull(
  state: StateCache,
  bus: MessageBus,
  payload: unknown,
): Promise<HubOpResponse> {
  const startTime = Date.now();
  console.log(`[m.pull] Starting at ${startTime}`);

  try {
    // Parse payload (agent field is optional now)
    const parsedData = MessagePullSchema.parse(payload);

    // Auto-populate agent from session if not provided
    let { agent } = parsedData;
    const sessionId = getCurrentSessionId();

    if (agent === undefined && sessionId !== undefined) {
      const sessionAgent = state.getAgentBySession(sessionId);
      if (sessionAgent !== undefined) {
        agent = sessionAgent.name;
        console.log(`[m.pull] Auto-populated agent from session: ${agent}`);
      }
    }

    if (agent === undefined) {
      throw new Error('Agent required. Provide "agent" field or register with a.register first.');
    }

    const data: { agent: string; since?: number; limit?: number } = {
      agent,
      ...(parsedData.since !== undefined && { since: parsedData.since }),
      ...(parsedData.limit !== undefined && { limit: parsedData.limit }),
    };

    console.log(
      `[m.pull] Pulling messages for agent=${data.agent}, since=${data.since ?? 'undefined'}`,
    );
    console.log(
      `[m.pull] Session ID: ${sessionId !== undefined ? sessionId.substring(0, 8) : 'none'}...`,
    );

    // Validate agent ownership (agent field is the recipient)
    if (sessionId !== undefined) {
      const validateStart = Date.now();
      state.validateAgentOwnership(data.agent, sessionId);
      console.log(`[m.pull] Validation took ${Date.now() - validateStart}ms`);
    }

    const pullStart = Date.now();
    const messages = bus.pull(data);
    console.log(
      `[m.pull] Pull took ${Date.now() - pullStart}ms, found ${messages.length} messages`,
    );

    const totalTime = Date.now() - startTime;
    console.log(`[m.pull] Total time: ${totalTime}ms`);

    return {
      ok: true,
      d: { messages, count: messages.length },
      t: Date.now(),
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`[m.pull] Error after ${totalTime}ms: ${errorMessage}`);

    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      t: Date.now(),
    };
  }
}
