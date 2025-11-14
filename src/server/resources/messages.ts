/**
 * Messages resource handler (messages://recent)
 * Convenience resource for pulling recent messages with zero configuration
 */

import type { StateCache } from '../core/state-cache.js';
import type { MessageBus } from '../core/bus.js';
import { getCurrentSessionId } from '../session-context.js';

export async function handleMessagesResource(state: StateCache, bus: MessageBus): Promise<string> {
  // Auto-populate agent from session
  const sessionId = getCurrentSessionId();
  let agent: string | undefined;

  if (sessionId !== undefined) {
    const sessionAgent = state.getAgentBySession(sessionId);
    if (sessionAgent !== undefined) {
      agent = sessionAgent.name;
    }
  }

  if (agent === undefined) {
    const error = {
      error: 'Agent required. Register with a.register before accessing messages://recent',
      hint: 'Try: hub_op({op: "a.register", d: {role: ["assistant"]}})',
    };
    return JSON.stringify(error, null, 2);
  }

  // Pull messages for agent (last 20 by default)
  const messages = bus.pull({ agent, limit: 20 });

  const response = {
    agent,
    messages,
    count: messages.length,
    resource: 'messages://recent',
    ts: Date.now(),
  };

  return JSON.stringify(response, null, 2);
}
