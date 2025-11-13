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

    // Require agent registration for expert escalation
    if (agentName === undefined || sessionId === undefined) {
      return {
        ok: false,
        error: 'Agent required. Register with a.register before using expert.ask',
        t: Date.now(),
      };
    }

    // Validate agent ownership
    state.validateAgentOwnership(agentName, sessionId);
    const origin = agentName;

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
    // Get agent name from session for error event (only if validation passed)
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;

    // Only emit error event if agent is registered (validation errors happen before registration check)
    if (agentName !== undefined) {
      bus.emit({
        type: 'ESCALATION_EVENT',
        agent: agentName,
        prompt: (payload as { prompt?: string }).prompt ?? 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        ts: Date.now(),
      });
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      t: Date.now(),
    };
  }
}
