/**
 * Base handler for agent-friendly operations
 * Provides common utilities for auto-populating agent from session
 * and normalizing field name variants
 */

import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';

/**
 * Helper to resolve agent name from various sources
 * Supports multiple field name variants and auto-population from session
 */
export function resolveAgent(
  payload: any,
  state: StateCache,
): string | undefined {
  // Try multiple field names
  const agentFromPayload =
    payload.agent || payload.from || payload.sender || payload.a;

  if (agentFromPayload) return agentFromPayload;

  // Auto-populate from session if not provided
  const sessionId = getCurrentSessionId();
  if (sessionId !== undefined) {
    const sessionAgent = state.getAgentBySession(sessionId);
    if (sessionAgent !== undefined) {
      return sessionAgent.name;
    }
  }

  return undefined;
}

/**
 * Normalize common field variants in payload
 */
export function normalizePayload(raw: any): any {
  return {
    // Preserve original fields
    ...raw,
    // Normalize common field variants (these will override if present)
    ...(raw.from !== undefined && { agent: raw.from }),
    ...(raw.sender !== undefined && { agent: raw.sender }),
    ...(raw.a !== undefined && { agent: raw.a }),
    ...(raw.msg !== undefined && { text: raw.msg }),
    ...(raw.message !== undefined && { text: raw.message }),
    ...(raw.target !== undefined && { to: raw.target }),
    ...(raw.recipient !== undefined && { to: raw.recipient }),
    ...(raw.p !== undefined && { paths: raw.p }),
    ...(raw.m !== undefined && { mode: raw.m }),
    ...(raw.prio !== undefined && { priority: raw.prio }),
    ...(raw.t !== undefined && { ttlMs: raw.t }),
    ...(raw.v !== undefined && { vote: raw.v }),
    ...(raw.r !== undefined && { reason: raw.r }),
    ...(raw.s !== undefined && { status: raw.s }),
  };
}

/**
 * Apply defaults to common fields
 */
export function applyDefaults(payload: any): any {
  return {
    ...payload,
    // Apply sensible defaults only if field is undefined
    ...(payload.topic === undefined && { topic: 'general' }),
    ...(payload.priority === undefined && { priority: 'n' }),
    ...(payload.ttlMs === undefined && { ttlMs: 60000 }),
    ...(payload.mode === undefined && { mode: 'R' }),
  };
}

/**
 * Validate that agent is resolved, throw helpful error if not
 */
export function requireAgent(
  agent: string | undefined,
): asserts agent is string {
  if (agent === undefined) {
    throw new Error(
      'Agent required. Provide "agent" field or register with a.register first.',
    );
  }
}