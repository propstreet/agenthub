/**
 * Intent operation handlers (i.open, i.vote, i.renew, i.close)
 */

import type { HubOpResponse, IntentOpenResponse } from '../types/models.js';
import type { Coordinator } from '../core/coordinator.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';
import { resolveAgent, requireAgent } from './base-handler.js';
import {
  IntentOpenSchema,
  IntentCloseSchema,
  IntentRenewSchema,
  IntentVoteSchema,
} from '../schemas/intents.js';

export async function handleIntentOpen(
  state: StateCache,
  coordinator: Coordinator,
  payload: unknown,
  defaultTTL: number,
): Promise<HubOpResponse<IntentOpenResponse>> {
  try {
    // Use Zod schema for validation and normalization
    const normalized = IntentOpenSchema.parse(payload);

    // Auto-populate agent if not provided (session-aware)
    const agent = normalized.agent ?? resolveAgent(normalized, state);
    requireAgent(agent);

    // Construct resolved payload with required agent field
    const data: {
      agent: string;
      paths: string[];
      mode: 'R' | 'W' | 'B' | 'T';
      priority: 'l' | 'n' | 'h' | 'r';
      ttlMs: number;
      hunks?: string[];
    } = {
      agent,
      paths: normalized.paths,
      mode: normalized.mode,
      priority: normalized.priority,
      ttlMs: normalized.ttlMs ?? defaultTTL,
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
    // Use Zod schema for validation and normalization
    const normalized = IntentVoteSchema.parse(payload);

    // Auto-populate agent if not provided (session-aware)
    const agent = normalized.agent ?? resolveAgent(normalized, state);
    requireAgent(agent);

    // Construct resolved payload with required agent field
    const data: {
      id: string;
      agent: string;
      vote: 'ack' | 'nack';
      reason?: string;
    } = {
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
  defaultTTL: number,
): Promise<HubOpResponse> {
  try {
    // Use Zod schema for validation and normalization
    const data = IntentRenewSchema.parse(payload);

    // Apply default TTL if not provided
    const ttlMs = data.ttlMs ?? defaultTTL;

    // Validate agent ownership by looking up the intent
    const sessionId = getCurrentSessionId();
    if (sessionId !== undefined) {
      const intent = state.getIntent(data.id);
      if (intent !== undefined) {
        state.validateAgentOwnership(intent.agent, sessionId);
      }
    }

    const result = coordinator.renewIntent({ id: data.id, ttlMs });

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
    // NEW: Use Zod schema for validation and normalization
    const data = IntentCloseSchema.parse(payload);

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
