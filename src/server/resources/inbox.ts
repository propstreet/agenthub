/**
 * Inbox resource handler - inbox://{agent}
 * Returns recent messages for a specific agent in NDJSON format
 */

import type { MessageBus } from '../core/bus.js';

export function handleInboxResource(bus: MessageBus, agent: string): string {
  const messages = bus.getMessagesForAgent(agent, 50);

  // Return as NDJSON (newline-delimited JSON)
  const ndjson = messages.map((msg) => JSON.stringify(msg)).join('\n');

  return ndjson;
}
