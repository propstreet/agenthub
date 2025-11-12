/**
 * Expert escalation handler (x.ask)
 */

import type { ExpertAskPayload, HubOpResponse } from '../types/models.js';
import type { ExpertBridge } from '../core/expert-bridge.js';
import type { MessageBus } from '../core/bus.js';

export async function handleExpertAsk(
  expert: ExpertBridge,
  bus: MessageBus,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = payload as ExpertAskPayload;

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
      agent: 'unknown', // TODO: get from context
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
    // Emit error event
    bus.emit({
      type: 'ESCALATION_EVENT',
      agent: 'unknown',
      prompt: (payload as ExpertAskPayload).prompt,
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
