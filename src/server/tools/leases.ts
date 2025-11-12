/**
 * Lease operation handlers (l.ann)
 */

import type { LeaseAnnouncePayload, HubOpResponse } from '../types/models.js';
import type { Coordinator } from '../core/coordinator.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';
import {
  resolveAgent,
  normalizePayload,
  applyDefaults,
  requireAgent,
} from './base-handler.js';

export async function handleLeaseAnnounce(
  state: StateCache,
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Normalize field variants and apply defaults
    const normalized = applyDefaults(normalizePayload(payload));

    // Auto-populate agent if not provided
    const agent = resolveAgent(normalized, state);
    requireAgent(agent);

    const data: LeaseAnnouncePayload = {
      agent,
      paths: normalized.paths,
      mode: normalized.mode,
      ttlMs: normalized.ttlMs,
    };

    // Validate agent ownership
    const sessionId = getCurrentSessionId();
    if (sessionId !== undefined) {
      state.validateAgentOwnership(data.agent, sessionId);
    }

    const result = coordinator.announceLease(data);

    return {
      ok: true,
      d: result,
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
