/**
 * Expert escalation handler (expert.ask)
 */

import type { HubOpResponse } from '../types/models.js';
import type { ExpertBridge } from '../core/expert-bridge.js';
import type { MessageBus } from '../core/bus.js';
import type { StateCache } from '../core/state-cache.js';
import { ExpertAskSchema } from '../schemas/expert.js';
import { getCurrentSessionId } from '../session-context.js';

export async function handleExpertAsk(
  expert: ExpertBridge,
  state: StateCache,
  bus: MessageBus,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Validate and normalize payload with schema
    const data = ExpertAskSchema.parse(payload);

    // Get agent name from session
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;
    const origin = agentName ?? 'unknown';

    // Validate agent ownership if session exists
    if (sessionId !== undefined && agentName !== undefined) {
      state.validateAgentOwnership(agentName, sessionId);
    }

    if (!expert.isAvailable()) {
      return {
        ok: false,
        error: 'Expert bridge is not configured',
        t: Date.now(),
      };
    }

    const result = await expert.ask(data);

    // Emit escalation event
    bus.emit({
      type: 'ESCALATION_EVENT',
      agent: origin,
      prompt: data.prompt,
      result,
      ts: Date.now(),
    });

    return {
      ok: true,
      d: { result },
      t: Date.now(),
    };
  } catch (error) {
    // Get agent name from session for error event
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;
    const origin = agentName ?? 'unknown';

    // Emit error event
    bus.emit({
      type: 'ESCALATION_EVENT',
      agent: origin,
      prompt: (payload as { prompt?: string }).prompt ?? 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
      ts: Date.now(),
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      t: Date.now(),
    };
  }
}
