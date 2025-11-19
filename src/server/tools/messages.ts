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

    // If broadcast is explicitly true, ensure 'to' is undefined (already validated in schema but safe to ensure)
    // If broadcast is false, but 'to' is undefined -> this is technically an error based on new logic,
    // but schema doesn't enforce it yet to avoid breaking changes.
    // For now, schema handles the validation: if broadcast=true && to!=undefined -> error.

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
      }
    }

    if (agent === undefined) {
      throw new Error('Agent required. Provide "agent" field or register with a.register first.');
    }

    const data = {
      agent,
      ...(parsedData.since !== undefined && { since: parsedData.since }),
      ...(parsedData.limit !== undefined && { limit: parsedData.limit }),
      ...(parsedData.type !== undefined && { type: parsedData.type }),
      ...(parsedData.types !== undefined && { types: parsedData.types }),
      ...(parsedData.topic !== undefined && { topic: parsedData.topic }),
      ...(parsedData.includeSelf !== undefined && { includeSelf: parsedData.includeSelf }),
    };

    // Validate agent ownership (agent field is the recipient)
    if (sessionId !== undefined) {
      state.validateAgentOwnership(data.agent, sessionId);
    }

    const messages = bus.pull(data);

    const totalTime = Date.now() - startTime;
    // Concise logging
    // Format: [m.pull] AgentName: N messages (Tms) [filters]
    // Only log if messages found or explicit debug request (not available yet, so just reduce noise)
    if (messages.length > 0) {
      const filters = [
        data.type !== undefined ? `type=${data.type}` : '',
        data.types !== undefined ? `types=[${data.types.length}]` : '',
        data.topic !== undefined ? `topic=${data.topic}` : '',
        data.since !== undefined ? `since=${data.since}` : '',
      ]
        .filter((f) => f !== '')
        .join(' ');

      console.log(
        `[m.pull] ${data.agent}: ${messages.length} messages (${totalTime}ms)${filters !== '' ? ` {${filters}}` : ''}`,
      );
    }

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
