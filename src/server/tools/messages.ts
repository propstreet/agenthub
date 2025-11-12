/**
 * Message operation handlers (m.send, m.pull)
 */

import type { MessageSendPayload, MessagePullPayload, HubOpResponse } from '../types/models.js';
import type { MessageBus } from '../core/bus.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';

export async function handleMessageSend(
  state: StateCache,
  bus: MessageBus,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Make the API more agent-friendly
    const rawData = payload as any;

    // Support both 'agent' and 'from' fields for sender
    const from = rawData.from || rawData.agent;

    // If no sender specified, try to get from session
    let sender = from;
    const sessionId = getCurrentSessionId();
    if (!sender && sessionId) {
      // Try to find the agent registered to this session
      const sessionAgent = state.getAgentBySession(sessionId);
      if (sessionAgent) {
        sender = sessionAgent.name;
      }
    }

    if (!sender) {
      throw new Error('Sender agent required. Use "from" or "agent" field, or register an agent first.');
    }

    // Support both 'msg' and 'text' fields for message content
    const text = rawData.text || rawData.msg;
    if (!text) {
      throw new Error('Message text required. Use "text" or "msg" field.');
    }

    // Make topic optional with a sensible default
    const topic = rawData.topic || 'general';

    // Construct the normalized payload
    const data: MessageSendPayload = {
      from: sender,
      to: rawData.to,
      topic,
      text,
      att: rawData.att,
    };

    // Validate agent ownership
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
    const data = payload as MessagePullPayload;
    console.log(`[m.pull] Payload parsed: agent=${data.agent}, since=${data.since}`);

    // Validate agent ownership (agent field is the recipient)
    const sessionId = getCurrentSessionId();
    console.log(`[m.pull] Session ID: ${sessionId?.substring(0, 8)}...`);

    if (sessionId !== undefined) {
      const validateStart = Date.now();
      state.validateAgentOwnership(data.agent, sessionId);
      console.log(`[m.pull] Validation took ${Date.now() - validateStart}ms`);
    }

    const pullStart = Date.now();
    const messages = bus.pull(data);
    console.log(`[m.pull] Pull took ${Date.now() - pullStart}ms, found ${messages.length} messages`);

    const totalTime = Date.now() - startTime;
    console.log(`[m.pull] Total time: ${totalTime}ms`);

    return {
      ok: true,
      d: { messages, count: messages.length },
      t: Date.now(),
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.log(`[m.pull] Error after ${totalTime}ms: ${error}`);

    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      t: Date.now(),
    };
  }
}
