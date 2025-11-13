/**
 * Lease operation handlers (l.announce)
 */

import type { HubOpResponse } from '../types/models.js';
import type { Coordinator } from '../core/coordinator.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';
import { resolveAgent, requireAgent } from './base-handler.js';
import { LeaseAnnounceSchema } from '../schemas/leases.js';

export async function handleLeaseAnnounce(
  state: StateCache,
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Use Zod schema for validation and normalization
    const normalized = LeaseAnnounceSchema.parse(payload);

    // Auto-populate agent if not provided (session-aware)
    const agent = normalized.agent ?? resolveAgent(normalized, state);
    requireAgent(agent);

    // Construct resolved payload with required agent field
    const data: {
      agent: string;
      paths: string[];
      mode: 'R' | 'W' | 'B' | 'T';
      ttlMs: number;
    } = {
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
