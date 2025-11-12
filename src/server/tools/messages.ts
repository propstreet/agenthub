/**
 * Message operation handlers (m.send, m.pull)
 */

import type { MessageSendPayload, MessagePullPayload, HubOpResponse } from '../types/models.js';
import type { MessageBus } from '../core/bus.js';

export async function handleMessageSend(bus: MessageBus, payload: unknown): Promise<HubOpResponse> {
  try {
    const data = payload as MessageSendPayload;
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

export async function handleMessagePull(bus: MessageBus, payload: unknown): Promise<HubOpResponse> {
  try {
    const data = payload as MessagePullPayload;
    const messages = bus.pull(data);

    return {
      ok: true,
      d: { messages, count: messages.length },
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
