/**
 * Intent operation handlers (i.open, i.vote, i.renew, i.close)
 */

import type {
  IntentOpenPayload,
  IntentVotePayload,
  IntentRenewPayload,
  IntentClosePayload,
  HubOpResponse,
  IntentOpenResponse,
} from '../types/models.js';
import type { Coordinator } from '../core/coordinator.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';
import {
  resolveAgent,
  normalizePayload,
  applyDefaults,
  requireAgent,
} from './base-handler.js';

export async function handleIntentOpen(
  state: StateCache,
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse<IntentOpenResponse>> {
  try {
    // Normalize field variants and apply defaults
    const normalized = applyDefaults(normalizePayload(payload));

    // Auto-populate agent if not provided
    const agent = resolveAgent(normalized, state);
    requireAgent(agent);

    const data: IntentOpenPayload = {
      agent,
      paths: normalized.paths,
      mode: normalized.mode,
      priority: normalized.priority,
      ttlMs: normalized.ttlMs,
      ...(normalized.hunks !== undefined && { hunks: normalized.hunks }),
    };

    // Validate agent ownership (requires registration)
    const sessionId = getCurrentSessionId();
    if (sessionId !== undefined) {
      state.validateAgentOwnership(data.agent, sessionId);
    }

    const result = coordinator.openIntent(data);

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

export async function handleIntentVote(
  state: StateCache,
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Normalize field variants
    const normalized = normalizePayload(payload);

    // Auto-populate agent if not provided
    const agent = resolveAgent(normalized, state);
    requireAgent(agent);

    const data: IntentVotePayload = {
      id: normalized.id,
      agent,
      vote: normalized.vote,
      ...(normalized.reason !== undefined && { reason: normalized.reason }),
    };

    // Validate agent ownership
    const sessionId = getCurrentSessionId();
    if (sessionId !== undefined) {
      state.validateAgentOwnership(data.agent, sessionId);
    }

    const result = coordinator.voteIntent(data);

    return {
      ok: result.ok,
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

export async function handleIntentRenew(
  state: StateCache,
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Normalize field variants and apply defaults
    const normalized = applyDefaults(normalizePayload(payload));

    const data: IntentRenewPayload = {
      id: normalized.id,
      ttlMs: normalized.ttlMs,
    };

    // Validate agent ownership by looking up the intent
    const sessionId = getCurrentSessionId();
    if (sessionId !== undefined) {
      const intent = state.getIntent(data.id);
      if (intent !== undefined) {
        state.validateAgentOwnership(intent.agent, sessionId);
      }
    }

    const result = coordinator.renewIntent(data);

    return {
      ok: result.ok,
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

export async function handleIntentClose(
  state: StateCache,
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Normalize field variants
    const normalized = normalizePayload(payload);

    const data: IntentClosePayload = {
      id: normalized.id,
      status: normalized.status,
      ...(normalized.note !== undefined && { note: normalized.note }),
    };

    // Validate agent ownership by looking up the intent
    const sessionId = getCurrentSessionId();
    if (sessionId !== undefined) {
      const intent = state.getIntent(data.id);
      if (intent !== undefined) {
        state.validateAgentOwnership(intent.agent, sessionId);
      }
    }

    const result = coordinator.closeIntent(data);

    return {
      ok: result.ok,
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
